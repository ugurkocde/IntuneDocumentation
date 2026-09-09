import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
const path = (value: string) => fileURLToPath(new URL(value, import.meta.url));
export default defineConfig({
  root: path("./"),
  esbuild: { jsx: "automatic" },
  plugins: [
    {
      name: "isolated-enterprise-ui-contracts",
      enforce: "pre",
      resolveId(source, importer) {
        if (
          source === "./session" &&
          importer?.endsWith("/components/enterprise/app.tsx")
        )
          return path("./session.ts");
      },
    },
  ],
  resolve: {
    alias: { "~": path("../../src"), "next/link": path("./link.tsx") },
  },
  server: { host: "127.0.0.1", port: 4178, strictPort: true },
  define: { "process.env.NODE_ENV": JSON.stringify("test") },
});
