import { build } from "esbuild";
import { cp, mkdir } from "node:fs/promises";
import { execSync } from "node:child_process";
import { createPublicKey } from "node:crypto";
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

// Licensing endpoints and the token verification key are fixed at build time.
// The public key below is a placeholder whose private half was discarded, so
// no token verifies against it. Release builds must set
// INTUNEDOC_LICENSE_PUBLIC_KEY (see scripts/generate-license-keypair.mjs).
const PLACEHOLDER_LICENSE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAg8aFPBHy954TzU50g38/6CGK5QQ+bLV7QKPUU0lt3jo=
-----END PUBLIC KEY-----`;
const license = {
  apiBase:
    process.env.INTUNEDOC_LICENSE_API_BASE ?? "https://intunedocumentation.com",
  // CI secrets and env files often carry the PEM with escaped newlines.
  publicKey: (
    process.env.INTUNEDOC_LICENSE_PUBLIC_KEY ?? PLACEHOLDER_LICENSE_PUBLIC_KEY
  ).replace(/\\n/g, "\n"),
  buyUrl:
    process.env.INTUNEDOC_LICENSE_BUY_URL ?? "https://intunedocumentation.com",
  portalUrl:
    process.env.INTUNEDOC_LICENSE_PORTAL_URL ??
    "https://sandbox.polar.sh/ugurlabs-sandbox/portal",
};
// The app parses this key at startup, so refuse to build with one that would
// crash it.
if (createPublicKey(license.publicKey).asymmetricKeyType !== "ed25519") {
  throw new Error(
    "INTUNEDOC_LICENSE_PUBLIC_KEY must be an Ed25519 public key.",
  );
}
if (license.publicKey === PLACEHOLDER_LICENSE_PUBLIC_KEY) {
  console.warn(
    "Using the placeholder license public key; set INTUNEDOC_LICENSE_PUBLIC_KEY.",
  );
}

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
  define: {
    ...shared.define,
    __LICENSE_API_BASE__: JSON.stringify(license.apiBase),
    __LICENSE_PUBLIC_KEY__: JSON.stringify(license.publicKey),
    __LICENSE_BUY_URL__: JSON.stringify(license.buyUrl),
    __LICENSE_PORTAL_URL__: JSON.stringify(license.portalUrl),
  },
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
