/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withPlausibleProxy } from "next-plausible";

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  poweredByHeader: false,
  // Pin the tracing root so standalone output lands at .next/standalone/server.js
  // even when a lockfile exists in a parent directory.
  outputFileTracingRoot: import.meta.dirname,
  async headers() {
    const contentSecurityPolicy = [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "form-action 'self' https://login.microsoftonline.com",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://plausible.io",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://login.microsoftonline.com https://graph.microsoft.com https://*.supabase.co https://plausible.io https://changelog.ugurlabs.com",
      "frame-src 'self' https://login.microsoftonline.com",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "upgrade-insecure-requests",
    ].join("; ");

    return [
      {
        source: "/(.*)",
        headers: [
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"
  ? withPlausibleProxy()(config)
  : config;
