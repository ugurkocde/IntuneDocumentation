import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import path from "node:path";

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  nodePaths: [path.join(import.meta.dirname, "node_modules")],
};

await build({
  ...shared,
  entryPoints: ["src/main/main.ts"],
  outfile: "dist/main/main.cjs",
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron"],
});

await build({
  ...shared,
  entryPoints: ["src/preload/preload.ts"],
  outfile: "dist/preload/preload.cjs",
  platform: "node",
  target: "node20",
  format: "cjs",
  external: ["electron"],
});

await build({
  ...shared,
  entryPoints: ["src/renderer/renderer.ts"],
  outfile: "dist/renderer/renderer.js",
  platform: "browser",
  target: "chrome120",
  format: "iife",
});

await mkdir("dist/renderer", { recursive: true });
await cp("src/renderer/index.html", "dist/renderer/index.html");
