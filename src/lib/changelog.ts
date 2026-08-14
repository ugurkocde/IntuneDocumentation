export const CHANGELOG_API_URL =
  "https://changelog.ugurlabs.com/api/changelog/intunedocumentation?limit=20";
export const CHANGELOG_ARCHIVE_URL = "https://changelog.ugurlabs.com";
export const CHANGELOG_SEEN_STORAGE_KEY =
  "ugurlabs:changelog:last-seen:intunedocumentation";

const CACHE_DURATION_MS = 5 * 60 * 1000;

export type ChangelogEntryType = "new" | "improved" | "fixed" | "maintenance";

export interface ChangelogEntry {
  id: string;
  title: string;
  summary: string;
  type: ChangelogEntryType;
  publishedOn: string;
  sourceUrl?: string;
}

export interface ChangelogFeed {
  product: {
    id: string;
    name: string;
    websiteUrl: string;
  };
  entries: ChangelogEntry[];
}

let cachedFeed: ChangelogFeed | null = null;
let cacheExpiresAt = 0;
let pendingRequest: Promise<ChangelogFeed> | null = null;

const changelogDateFormatter = new Intl.DateTimeFormat("en-US", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isEntryType(value: unknown): value is ChangelogEntryType {
  return (
    value === "new" ||
    value === "improved" ||
    value === "fixed" ||
    value === "maintenance"
  );
}

function parsePublicUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function parseEntry(value: unknown): ChangelogEntry {
  if (!isRecord(value)) {
    throw new Error("The changelog service returned an invalid entry.");
  }

  const { id, title, summary, type, publishedOn, sourceUrl } = value;
  if (
    typeof id !== "string" ||
    typeof title !== "string" ||
    typeof summary !== "string" ||
    !isEntryType(type) ||
    typeof publishedOn !== "string"
  ) {
    throw new Error("The changelog service returned an invalid entry.");
  }

  return {
    id,
    title,
    summary,
    type,
    publishedOn,
    sourceUrl: parsePublicUrl(sourceUrl),
  };
}

function parseFeed(value: unknown): ChangelogFeed {
  if (!isRecord(value) || !isRecord(value.product)) {
    throw new Error("The changelog service returned an invalid response.");
  }

  const { id, name, websiteUrl } = value.product;
  if (
    id !== "intunedocumentation" ||
    typeof name !== "string" ||
    typeof websiteUrl !== "string" ||
    !Array.isArray(value.entries)
  ) {
    throw new Error("The changelog service returned an invalid response.");
  }

  return {
    product: { id, name, websiteUrl },
    entries: value.entries.map(parseEntry),
  };
}

export function formatChangelogDate(publishedOn: string): string {
  const date = new Date(`${publishedOn}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? publishedOn
    : changelogDateFormatter.format(date);
}

export function fetchLatestChangelog(
  fetcher: typeof fetch = fetch,
): Promise<ChangelogFeed> {
  const now = Date.now();
  if (cachedFeed && now < cacheExpiresAt) {
    return Promise.resolve(cachedFeed);
  }

  if (pendingRequest) return pendingRequest;

  pendingRequest = fetcher(CHANGELOG_API_URL, {
    headers: { Accept: "application/json" },
  })
    .then(async (response) => {
      if (!response.ok) {
        throw new Error(
          `Changelog request failed with status ${response.status}.`,
        );
      }

      return parseFeed(await response.json());
    })
    .then((feed) => {
      cachedFeed = feed;
      cacheExpiresAt = Date.now() + CACHE_DURATION_MS;
      return feed;
    })
    .finally(() => {
      pendingRequest = null;
    });

  return pendingRequest;
}

export function resetChangelogCacheForTests(): void {
  cachedFeed = null;
  cacheExpiresAt = 0;
  pendingRequest = null;
}
