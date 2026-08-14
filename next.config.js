/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withPlausibleProxy } from "next-plausible";

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  // Pin the tracing root so standalone output lands at .next/standalone/server.js
  // even when a lockfile exists in a parent directory.
  outputFileTracingRoot: import.meta.dirname,
};

export default process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === "true"
  ? withPlausibleProxy()(config)
  : config;
