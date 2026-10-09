import { createMDX } from 'fumadocs-mdx/next';
import { fileURLToPath } from 'node:url';

const withMDX = createMDX();

// This app is deployed on its own (Vercel root directory apps/docs). Pin the
// project root so Next does not walk up to the repository root and pick up
// the main site's lockfile, middleware or sources.
const root = fileURLToPath(new URL('.', import.meta.url));

/** @type {import('next').NextConfig} */
const config = {
  reactStrictMode: true,
  outputFileTracingRoot: root,
  turbopack: {
    root,
  },
};

export default withMDX(config);
