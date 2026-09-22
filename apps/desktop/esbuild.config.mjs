import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import path from "node:path";

const bufferPath = path.join(
  import.meta.dirname,
  "node_modules",
  "buffer",
  "index.js",
);

const nodePolyfill = {
  name: "node-polyfill",
  setup(build) {
    build.onResolve({ filter: /^(node:)?buffer$/ }, () => ({
      path: bufferPath,
    }));
  },
};

const shared = {
  bundle: true,
  sourcemap: true,
  logLevel: "info",
  nodePaths: [path.join(import.meta.dirname, "node_modules")],
  define: { "process.env.NODE_ENV": '"production"', global: "globalThis" },
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
  plugins: [nodePolyfill],
  inject: [path.join(import.meta.dirname, "src/renderer/buffer-shim.ts")],
  entryPoints: ["src/renderer/main.tsx"],
  outfile: "dist/renderer/renderer.js",
  platform: "browser",
  target: "chrome120",
  format: "iife",
  jsx: "automatic",
});

await mkdir("dist/renderer", { recursive: true });
await cp("src/renderer/index.html", "dist/renderer/index.html");
await cp("../../public/logo.png", "dist/renderer/logo.png");

execSync(
  "npx --no-install @tailwindcss/cli -i src/renderer/index.css -o dist/renderer/index.css --minify",
  { stdio: "inherit" },
);
