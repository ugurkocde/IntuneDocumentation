import type { ConfigurationSectionData } from "../../../../src/lib/configuration-sections";
import { flattenItemSettings } from "../../../../src/lib/settings-flatten";
import type {
  SectionItemsResult,
  SettingSearchHit,
  SettingsSearchFacet,
  SettingsSearchRequest,
  SettingsSearchResult,
} from "../shared/ipc-types";

// Searches the settings of the collection main holds. Only matching rows
// cross IPC; the full collection never does.

export const DEFAULT_SEARCH_LIMIT = 200;
export const MAX_SEARCH_LIMIT = 1000;
// Long values (certificates, XML, script like payloads) are searchable in
// full but returned shortened.
const MAX_VALUE_CHARS = 1000;

interface IndexedPolicy {
  sectionKey: string;
  sectionLabel: string;
  familyKey: string;
  policyId: string;
  policyName: string;
  platforms: string[];
  assignmentCount: number | null;
  assignedToAllUsers: boolean;
  assignedToAllDevices: boolean;
}

interface IndexedRow {
  policy: IndexedPolicy;
  name: string;
  value: string;
  definitionId: string | null;
  path: string[];
  category: string | null;
  nameLower: string;
  idLower: string;
  // Setting name, value, technical id, path and policy name, lower case.
  haystack: string;
}

export interface SettingsIndex {
  rows: IndexedRow[];
}

// Display metadata of a section as the renderer sees it (getSectionItems),
// so families and labels match the sidebar.
type Summarize = (
  section: ConfigurationSectionData,
) => Pick<SectionItemsResult, "familyKey" | "label" | "items">;

const PLATFORM_LABELS: Record<string, string> = {
  windows: "Windows",
  windows10: "Windows",
  windows81: "Windows",
  windows10x: "Windows",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  androidenterprise: "Android",
  androidforwork: "Android",
  androidworkprofile: "Android",
  aosp: "Android",
  linux: "Linux",
};

// Most template resources carry their platform in the type name instead.
const TYPE_PLATFORMS: Array<[RegExp, string]> = [
  [/^(windows|win32|windows10|windows81|sharedpc|editionupgrade)/i, "Windows"],
  [/^macos/i, "macOS"],
  [/^(ios|iosipad)/i, "iOS"],
  [/^(android|aosp)/i, "Android"],
  [/^linux/i, "Linux"],
];

export function platformLabels(
  platforms: string | null,
  odataType: string | null,
): string[] {
  const labels = new Set<string>();
  for (const part of (platforms ?? "").split(/[,\s]+/)) {
    const token = part.trim();
    if (!token || token.toLowerCase() === "none") continue;
    labels.add(PLATFORM_LABELS[token.toLowerCase()] ?? token);
  }
  if (labels.size === 0 && odataType) {
    const raw = odataType.replace(/^#?microsoft\.graph\./, "");
    const match = TYPE_PLATFORMS.find(([pattern]) => pattern.test(raw));
    if (match) labels.add(match[1]);
  }
  return [...labels];
}

export function buildSettingsIndex(
  sections: ConfigurationSectionData[],
  summarize: Summarize,
): SettingsIndex {
  const rows: IndexedRow[] = [];
  for (const section of sections) {
    if (section.items.length === 0) continue;
    const display = summarize(section);
    section.items.forEach((item, index) => {
      const summary = display.items[index];
      if (!summary) return;
      const policy: IndexedPolicy = {
        sectionKey: section.key,
        sectionLabel: display.label,
        familyKey: summary.familyKey ?? display.familyKey,
        policyId: summary.id,
        policyName: summary.displayName,
        platforms: platformLabels(summary.platforms, summary.odataType),
        assignmentCount: summary.assignmentCount,
        assignedToAllUsers: summary.assignedToAllUsers,
        assignedToAllDevices: summary.assignedToAllDevices,
      };
      const policyLower = policy.policyName.toLowerCase();
      for (const setting of flattenItemSettings(section.key, item)) {
        const definitionId = setting.definitionId ?? null;
        const nameLower = setting.name.toLowerCase();
        const idLower = definitionId?.toLowerCase() ?? "";
        rows.push({
          policy,
          name: setting.name,
          value: setting.value,
          definitionId,
          path: setting.path,
          category: setting.category ?? null,
          nameLower,
          idLower,
          haystack: [
            nameLower,
            setting.value.toLowerCase(),
            idLower,
            setting.path.join(" ").toLowerCase(),
            policyLower,
          ].join("\n"),
        });
      }
    });
  }
  return { rows };
}

export function queryWords(query: string): string[] {
  return [
    ...new Set(
      query
        .toLowerCase()
        .split(/\s+/)
        .filter((word) => word.length > 0),
    ),
  ];
}

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_SEARCH_LIMIT;
  }
  return Math.min(MAX_SEARCH_LIMIT, Math.max(1, Math.floor(limit)));
}

// Lower ranks first: an exact setting name or technical id, then a name that
// starts with the query, then names holding every word, then the rest.
function rank(row: IndexedRow, phrase: string, words: string[]): number {
  if (row.nameLower === phrase || row.idLower === phrase) return 0;
  if (row.nameLower.startsWith(phrase)) return 1;
  if (words.every((word) => row.nameLower.includes(word))) return 2;
  if (words.every((word) => row.idLower.includes(word))) return 3;
  return 4;
}

function facetList(counts: Map<string, number>): SettingsSearchFacet[] {
  return [...counts]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

function toHit(row: IndexedRow): SettingSearchHit {
  return {
    ...row.policy,
    name: row.name,
    value:
      row.value.length > MAX_VALUE_CHARS
        ? `${row.value.slice(0, MAX_VALUE_CHARS)}...`
        : row.value,
    definitionId: row.definitionId,
    path: row.path,
    category: row.category,
  };
}

export function searchSettingsIndex(
  index: SettingsIndex,
  request: SettingsSearchRequest,
): SettingsSearchResult {
  const query = request.query.trim();
  const words = queryWords(query);
  const limit = clampLimit(request.limit);
  const families = new Set(request.families ?? []);
  const platforms = new Set(request.platforms ?? []);
  const familyCounts = new Map<string, number>();
  const platformCounts = new Map<string, number>();
  const buckets: IndexedRow[][] = [[], [], [], [], []];
  let total = 0;

  if (words.length > 0) {
    const phrase = words.join(" ");
    for (const row of index.rows) {
      const haystack = row.haystack;
      let matched = true;
      for (const word of words) {
        if (!haystack.includes(word)) {
          matched = false;
          break;
        }
      }
      if (!matched) continue;
      const { familyKey, platforms: rowPlatforms } = row.policy;
      familyCounts.set(familyKey, (familyCounts.get(familyKey) ?? 0) + 1);
      for (const platform of rowPlatforms) {
        platformCounts.set(platform, (platformCounts.get(platform) ?? 0) + 1);
      }
      if (families.size > 0 && !families.has(familyKey)) continue;
      if (
        platforms.size > 0 &&
        !rowPlatforms.some((platform) => platforms.has(platform))
      ) {
        continue;
      }
      total += 1;
      buckets[rank(row, phrase, words)]!.push(row);
    }
  }

  const hits: SettingSearchHit[] = [];
  for (const bucket of buckets) {
    for (const row of bucket) {
      if (hits.length >= limit) break;
      hits.push(toHit(row));
    }
    if (hits.length >= limit) break;
  }

  return {
    query,
    total,
    hits,
    families: facetList(familyCounts),
    platforms: facetList(platformCounts),
    indexedSettings: index.rows.length,
  };
}

// One index per collection object. A new collection is a new object, and a
// cleared one is no longer referenced, so its index is released with it.
const indexes = new WeakMap<object, SettingsIndex>();

export function settingsIndexFor(
  collection: { sections: ConfigurationSectionData[] },
  summarize: Summarize,
): SettingsIndex {
  let index = indexes.get(collection);
  if (!index) {
    index = buildSettingsIndex(collection.sections, summarize);
    indexes.set(collection, index);
  }
  return index;
}
