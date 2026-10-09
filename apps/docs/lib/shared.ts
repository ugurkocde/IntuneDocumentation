import { createGetUrl } from 'fumadocs-core/source';

export const appName = 'Intune Documentation';
export const siteName = 'Intune Documentation Docs';
export const siteUrl = 'https://docs.intunedocumentation.com';
export const siteDescription =
  'Guides for Intune Documentation: export your Microsoft Intune configuration with the web app or the desktop app, map it to compliance frameworks and share the results.';

export const ogImage = {
  url: '/og-image.png',
  width: 1200,
  height: 630,
  alt: 'Intune Documentation',
};

/** Docs are served from the site root, e.g. /desktop/install */
export const docsRoute = '/';
export const docsContentRoute = '/llms.mdx';

export const links = {
  website: 'https://intunedocumentation.com',
  desktop: 'https://intunedocumentation.com/desktop',
  github: 'https://github.com/ugurkocde/IntuneDocumentation',
};

export const gitConfig = {
  user: 'ugurkocde',
  repo: 'IntuneDocumentation',
  branch: 'main',
  contentDir: 'apps/docs/content/docs',
};

const getContentUrl = createGetUrl(docsContentRoute);

export function getPageMarkdownUrl(page: { slugs: string[]; locale?: string }) {
  const segments = [...page.slugs, 'content.md'];

  return { segments, url: getContentUrl(segments, page.locale) };
}

export function absoluteUrl(path: string) {
  return new URL(path, siteUrl).toString();
}
