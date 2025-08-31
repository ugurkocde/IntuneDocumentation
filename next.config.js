/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";
import { withPlausibleProxy } from "next-plausible";

/** @type {import("next").NextConfig} */
const config = {};

export default withPlausibleProxy()(config);
