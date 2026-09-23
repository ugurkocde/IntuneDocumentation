// Generates the packaging icons from the website mark (public/logo.svg).
// Run from apps/desktop on macOS: npx electron scripts/generate-icons.cjs
// Needs iconutil (Xcode command line tools). Outputs build/icon.icns (macOS),
// build/icon.ico (Windows) and build/icon.png.
const { app, BrowserWindow } = require("electron");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const root = path.join(__dirname, "..");
const buildDir = path.join(root, "build");
const logo = fs.readFileSync(path.join(root, "../../public/logo.svg"), "utf8");
const artwork = logo
  .replace(/^[\s\S]*?<svg[^>]*>/, "")
  .replace(/<\/svg>\s*$/, "");

// macOS icon grid: an 824 px tile centred on a 1024 px canvas with a soft
// drop shadow, matching the proportions of the system app icons.
const macSvg = `<svg width="1024" height="1024" viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
  <defs><filter id="shadow" x="-10%" y="-10%" width="120%" height="125%">
    <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#082f36" flood-opacity="0.32"/>
  </filter></defs>
  <g filter="url(#shadow)" transform="translate(100 100) scale(${824 / 512})">${artwork}</g>
</svg>`;

// Renders an SVG once at 1024 px in an offscreen window; smaller sizes are
// downscaled from that master.
// One window is reused: later offscreen windows fail to load in Electron 44.
let renderer = null;

async function master(svg) {
  renderer ??= new BrowserWindow({
    show: false,
    width: 1024,
    height: 1024,
    transparent: true,
    frame: false,
    webPreferences: { offscreen: true },
  });
  const win = renderer;
  const file = path.join(os.tmpdir(), `intunedoc-icon-${Date.now()}.html`);
  const sized = svg.replace(
    /<svg([^>]*)width="\d+" height="\d+"/,
    '<svg$1width="1024" height="1024"',
  );
  fs.writeFileSync(
    file,
    `<html><body style="margin:0;background:transparent;overflow:hidden">${sized}</body></html>`,
  );
  await win.loadFile(file);
  await new Promise((resolve) => setTimeout(resolve, 300));
  const image = await win.webContents.capturePage();
  fs.rmSync(file, { force: true });
  return image.resize({ width: 1024, height: 1024, quality: "best" });
}

function png(image, size) {
  return image.resize({ width: size, height: size, quality: "best" }).toPNG();
}

// ICO with embedded PNG images (supported since Windows Vista).
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...images.map((image) => image.png)]);
}

app.disableHardwareAcceleration();
app.whenReady().then(async () => {
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "intunedoc-icons-"));
  try {
    const iconset = path.join(work, "icon.iconset");
    fs.mkdirSync(iconset);
    const mac = await master(macSvg);
    const win = await master(logo);
    for (const size of [16, 32, 128, 256, 512]) {
      fs.writeFileSync(
        path.join(iconset, `icon_${size}x${size}.png`),
        png(mac, size),
      );
      fs.writeFileSync(
        path.join(iconset, `icon_${size}x${size}@2x.png`),
        png(mac, size * 2),
      );
    }
    execFileSync("iconutil", [
      "-c",
      "icns",
      iconset,
      "-o",
      path.join(buildDir, "icon.icns"),
    ]);
    const winImages = [];
    for (const size of [16, 24, 32, 48, 64, 128, 256]) {
      winImages.push({ size, png: png(win, size) });
    }
    fs.writeFileSync(path.join(buildDir, "icon.ico"), ico(winImages));
    fs.writeFileSync(path.join(buildDir, "icon.png"), png(mac, 1024));
    console.log("Wrote build/icon.icns, build/icon.ico, build/icon.png");
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
    app.quit();
  }
});
