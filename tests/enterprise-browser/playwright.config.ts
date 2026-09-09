import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: ".",
  testMatch: "**/*.pw.ts",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4178",
    viewport: { width: 1440, height: 1050 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --config vite.config.ts",
    url: "http://127.0.0.1:4178",
    reuseExistingServer: !process.env.CI,
  },
  outputDir: "../../output/enterprise-ui",
});
