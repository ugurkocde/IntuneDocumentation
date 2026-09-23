// Update feed for the desktop app. Installers live on GitHub Releases under
// desktop-v* tags, next to the web app's own v* releases. electron-updater's
// GitHub provider always reads the repository's "latest" release, which is a
// web app release, so the app reads a generic feed from this site instead and
// every file request is redirected to the matching asset of the newest
// desktop release.

const REPOSITORY = "ugurkocde/IntuneDocumentation";
const TAG_PREFIX = "desktop-v";

// Stable names for download links on the website.
const ALIASES = new Map<string, RegExp>([
  ["mac-arm64", /-arm64\.dmg$/],
  ["mac-x64", /-x64\.dmg$/],
  ["windows", /\.exe$/],
]);

// GitHub returns at most 100 releases per page, newest first.
const PER_PAGE = 100;
const MAX_PAGES = 10;

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface Release {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: ReleaseAsset[];
}

// Receives the pinned tag so a fetcher can keep paging until it appears.
export type FetchReleases = (pinnedTag?: string) => Promise<Release[]>;

function version(tag: string): number[] | null {
  const match = /^desktop-v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
  return match ? match.slice(1).map(Number) : null;
}

function newer(a: number[], b: number[]): boolean {
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index]! > b[index]!;
  }
  return false;
}

// The newest published desktop release, or the one named by pinnedTag. A
// pinned tag rolls every installation back to (or holds it at) that release.
export function selectRelease(
  releases: Release[],
  pinnedTag?: string,
): Release | null {
  let best: { release: Release; version: number[] } | null = null;
  for (const release of releases) {
    if (release.draft || release.prerelease) continue;
    if (!release.tag_name.startsWith(TAG_PREFIX)) continue;
    if (pinnedTag) {
      if (release.tag_name === pinnedTag) return release;
      continue;
    }
    const parsed = version(release.tag_name);
    if (parsed && (!best || newer(parsed, best.version))) {
      best = { release, version: parsed };
    }
  }
  return best?.release ?? null;
}

// Resolves a feed file name (latest.yml, an installer, a blockmap) or a
// download alias to the asset URL on GitHub. Only names that exist on the
// selected release resolve, so the redirect target is always a GitHub asset.
export async function resolveDesktopAsset(
  file: string,
  fetchReleases: FetchReleases,
  pinnedTag?: string,
): Promise<string | null> {
  const release = selectRelease(await fetchReleases(pinnedTag), pinnedTag);
  if (!release) return null;
  const alias = ALIASES.get(file);
  const asset = release.assets.find((candidate) =>
    alias ? alias.test(candidate.name) : candidate.name === file,
  );
  return asset?.browser_download_url.startsWith("https://github.com/")
    ? asset.browser_download_url
    : null;
}

export function githubReleases(token?: string): FetchReleases {
  const fetchPage = async (page: number) => {
    const response = await fetch(
      `https://api.github.com/repos/${REPOSITORY}/releases?per_page=${PER_PAGE}&page=${page}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        // Cached for five minutes so update checks do not hit GitHub's
        // unauthenticated rate limit.
        next: { revalidate: 300 },
      } as RequestInit,
    );
    if (!response.ok) {
      throw new Error(`GitHub releases request failed: ${response.status}`);
    }
    return (await response.json()) as Release[];
  };
  // Stops at the first page that yields a matching release, so a pinned
  // older tag is still found once newer releases push it off page one.
  return async (pinnedTag) => {
    const releases: Release[] = [];
    for (let page = 1; page <= MAX_PAGES; page++) {
      const batch = await fetchPage(page);
      releases.push(...batch);
      if (batch.length < PER_PAGE || selectRelease(releases, pinnedTag)) break;
    }
    return releases;
  };
}
