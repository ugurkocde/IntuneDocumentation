// Contract for CIS Benchmark content delivered by the licensed content
// service (/api/cis/v1). Ported from TenuVault (cis-content.ts,
// cis-recommendation-schema.ts and the list validator in cis-manual.ts) and
// kept strict: unknown fields, wrong types, oversized lists and identity
// mismatches are rejected with a plain message naming the first problem.
// Content arrives only at runtime from the gated service and is never
// bundled, stored or logged. Pure TS, no imports, so main, the engine and
// tests can all use it.
//
// Stable API (the engine in src/lib/benchmarks imports it):
// - parseCatalog(value): BenchmarkCatalog, for /catalog. Levels are sorted.
// - parsePack(value, expected): BenchmarkPack, for /packs/{benchmark}/{version}/{level}.
//   The pack must match the requested identity. policies stay unknown[]:
//   they are Settings Catalog policy objects the engine parses itself.
// - parseRecommendationList(value, expected?): RecommendationList, for
//   /lists/{benchmark}/{version}: every recommendation of the benchmark,
//   automated or manual, the denominator for full benchmark coverage.
// - parseBenchmarkIdentity(value): BenchmarkIdentity, for a request coming
//   from the renderer, checked before anything is fetched.
// - parsePackRecommendations(value, label): the optional recommendations of a pack.
// Every parser takes an already decoded JSON value and throws an Error.

export type BenchmarkLevel = 1 | 2;

export interface BenchmarkCatalogEntry {
  id: string;
  name: string;
  version: string;
  levels: BenchmarkLevel[];
}

export interface BenchmarkCatalog {
  benchmarks: BenchmarkCatalogEntry[];
}

// One recommendation a pack carries, with the setting definitions that implement it.
export interface PackRecommendation {
  id: string;
  title: string;
  level: BenchmarkLevel;
  settings: string[];
}

export interface BenchmarkPack {
  benchmark: string;
  version: string;
  level: BenchmarkLevel;
  policies: unknown[];
  recommendations?: PackRecommendation[];
}

export interface BenchmarkIdentity {
  benchmark: string;
  version: string;
  level: BenchmarkLevel;
}

export interface RecommendationListItem {
  identifier: string;
  level: BenchmarkLevel;
  automated: boolean;
  title?: string;
  description?: string;
  impact?: string;
  audit?: string;
  remediation?: string;
}

export interface RecommendationList {
  benchmark: string;
  version: string;
  items: RecommendationListItem[];
}

export const MAX_BENCHMARKS = 50;
export const MAX_PACK_POLICIES = 64;
export const MAX_BENCHMARK_NAME_LENGTH = 200;
export const MAX_BENCHMARK_ID_LENGTH = 100;
export const MAX_PACK_RECOMMENDATIONS = 2000;
export const MAX_RECOMMENDATION_TITLE_LENGTH = 300;
export const MAX_RECOMMENDATION_SETTINGS = 200;

export const BENCHMARK_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const RECOMMENDATION_ID_PATTERN = /^\d{1,4}(?:\.\d{1,4}){1,9}$/;

const CATALOG_FIELDS = new Set(["benchmarks"]);
const BENCHMARK_FIELDS = new Set(["id", "name", "version", "levels"]);
const PACK_FIELDS = new Set([
  "benchmark",
  "version",
  "level",
  "policies",
  "recommendations",
]);
const RECOMMENDATION_FIELDS = new Set(["id", "title", "level", "settings"]);
const LIST_TEXT_FIELDS = [
  "title",
  "description",
  "impact",
  "audit",
  "remediation",
] as const;
const LIST_ITEM_FIELDS = new Set([
  "identifier",
  "level",
  "automated",
  ...LIST_TEXT_FIELDS,
]);
const LIST_FIELDS = new Set(["benchmark", "version", "items"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateBenchmarkId(value: unknown, label: string): string {
  if (
    typeof value !== "string" ||
    !BENCHMARK_ID_PATTERN.test(value) ||
    value.length > MAX_BENCHMARK_ID_LENGTH
  ) {
    throw new Error(
      `${label}: id must use lowercase letters, numbers and hyphens.`,
    );
  }
  return value;
}

function validateVersion(value: unknown, label: string): string {
  if (typeof value !== "string" || !VERSION_PATTERN.test(value)) {
    throw new Error(`${label}: version must use the form 1.2.3.`);
  }
  return value;
}

function validateLevels(value: unknown, label: string): BenchmarkLevel[] {
  if (!Array.isArray(value) || !value.length) {
    throw new Error(`${label}: levels must contain at least one level.`);
  }
  const seen = new Set<number>();
  for (const entry of value) {
    if (entry !== 1 && entry !== 2) {
      throw new Error(`${label}: levels must contain only 1 or 2.`);
    }
    if (seen.has(entry)) {
      throw new Error(`${label}: levels must not repeat a level.`);
    }
    seen.add(entry);
  }
  return [...seen].sort((a, b) => a - b) as BenchmarkLevel[];
}

// A benchmark, version and level asked for by the renderer. Anything that
// could leave the URL path segment it is placed in is refused.
export function parseBenchmarkIdentity(value: unknown): BenchmarkIdentity {
  const input = isRecord(value) ? value : {};
  const { benchmark, version, level } = input;
  if (
    typeof benchmark !== "string" ||
    benchmark.length > MAX_BENCHMARK_ID_LENGTH ||
    !BENCHMARK_ID_PATTERN.test(benchmark) ||
    typeof version !== "string" ||
    !VERSION_PATTERN.test(version) ||
    (level !== 1 && level !== 2)
  ) {
    throw new Error("Select a benchmark, version and level.");
  }
  return { benchmark, version, level };
}

// Validates a pack's recommendation list strictly: known fields only, dotted
// numeric ids, bounded titles and settings, no repeated id.
export function parsePackRecommendations(
  input: unknown,
  label = "Recommendations",
): PackRecommendation[] {
  if (!Array.isArray(input)) throw new Error(`${label} must be an array.`);
  if (input.length > MAX_PACK_RECOMMENDATIONS) {
    throw new Error(
      `${label} must contain at most ${MAX_PACK_RECOMMENDATIONS} entries.`,
    );
  }
  const seen = new Set<string>();
  return input.map((entry, index) => {
    const at = `${label} entry ${index + 1}`;
    if (!isRecord(entry)) {
      throw new Error(
        `${at}: expected an object with id, title, level and settings.`,
      );
    }
    for (const key of Object.keys(entry)) {
      if (!RECOMMENDATION_FIELDS.has(key)) {
        throw new Error(
          `${at}: unknown field: ${key}. Expected id, title, level and settings.`,
        );
      }
    }
    if (
      typeof entry.id !== "string" ||
      !RECOMMENDATION_ID_PATTERN.test(entry.id)
    ) {
      throw new Error(
        `${at}: id must be a dotted numeric identifier such as 1.2.3.`,
      );
    }
    if (seen.has(entry.id)) {
      throw new Error(`${at}: duplicate recommendation ${entry.id}.`);
    }
    seen.add(entry.id);
    if (
      typeof entry.title !== "string" ||
      !entry.title.trim() ||
      entry.title.length > MAX_RECOMMENDATION_TITLE_LENGTH
    ) {
      throw new Error(
        `${at}: title must be a non-empty string of at most ${MAX_RECOMMENDATION_TITLE_LENGTH} characters.`,
      );
    }
    if (entry.level !== 1 && entry.level !== 2) {
      throw new Error(`${at}: level must be 1 or 2.`);
    }
    if (
      !Array.isArray(entry.settings) ||
      !entry.settings.length ||
      entry.settings.length > MAX_RECOMMENDATION_SETTINGS ||
      entry.settings.some(
        (setting) =>
          typeof setting !== "string" || !setting || setting.length > 500,
      )
    ) {
      throw new Error(
        `${at}: settings must list between 1 and ${MAX_RECOMMENDATION_SETTINGS} setting definition IDs.`,
      );
    }
    const settings = entry.settings as string[];
    const repeated = settings.find(
      (setting, position, all) => all.indexOf(setting) !== position,
    );
    if (repeated) {
      throw new Error(
        `${at}: setting ${repeated} is listed twice. List each setting definition once.`,
      );
    }
    return {
      id: entry.id,
      title: entry.title.trim(),
      level: entry.level,
      settings: [...settings],
    };
  });
}

// Validates one decoded catalog value. Returns the catalog with levels sorted.
export function parseCatalog(input: unknown): BenchmarkCatalog {
  if (!isRecord(input)) {
    throw new Error("The CIS catalog must be a JSON object with benchmarks.");
  }
  for (const key of Object.keys(input)) {
    if (!CATALOG_FIELDS.has(key)) {
      throw new Error(
        `The CIS catalog has an unknown field: ${key}. Expected benchmarks.`,
      );
    }
  }
  if (!Array.isArray(input.benchmarks)) {
    throw new Error("The CIS catalog benchmarks must be an array.");
  }
  if (input.benchmarks.length > MAX_BENCHMARKS) {
    throw new Error(
      `The CIS catalog must contain at most ${MAX_BENCHMARKS} benchmarks.`,
    );
  }
  const seen = new Set<string>();
  const benchmarks = input.benchmarks.map(
    (entry: unknown, index): BenchmarkCatalogEntry => {
      const label = `CIS catalog benchmark ${index + 1}`;
      if (!isRecord(entry)) {
        throw new Error(
          `${label}: expected an object with id, name, version and levels.`,
        );
      }
      for (const key of Object.keys(entry)) {
        if (!BENCHMARK_FIELDS.has(key)) {
          throw new Error(
            `${label}: unknown field: ${key}. Expected id, name, version and levels.`,
          );
        }
      }
      const id = validateBenchmarkId(entry.id, label);
      if (
        typeof entry.name !== "string" ||
        !entry.name.trim() ||
        entry.name.trim().length > MAX_BENCHMARK_NAME_LENGTH
      ) {
        throw new Error(
          `${label}: name must be a non-empty string of at most ${MAX_BENCHMARK_NAME_LENGTH} characters.`,
        );
      }
      const version = validateVersion(entry.version, label);
      const levels = validateLevels(entry.levels, label);
      const key = `${id}@${version}`;
      if (seen.has(key)) {
        throw new Error(`${label}: duplicate benchmark ${id} ${version}.`);
      }
      seen.add(key);
      return { id, name: entry.name.trim(), version, levels };
    },
  );
  return { benchmarks };
}

// Validates one decoded pack value against the requested identity.
export function parsePack(
  input: unknown,
  expected: BenchmarkIdentity,
): BenchmarkPack {
  if (!isRecord(input)) {
    throw new Error(
      "The CIS pack must be a JSON object with benchmark, version, level and policies.",
    );
  }
  for (const key of Object.keys(input)) {
    if (!PACK_FIELDS.has(key)) {
      throw new Error(
        `The CIS pack has an unknown field: ${key}. Expected benchmark, version, level and policies.`,
      );
    }
  }
  const benchmark = validateBenchmarkId(input.benchmark, "CIS pack");
  const version = validateVersion(input.version, "CIS pack");
  if (input.level !== 1 && input.level !== 2) {
    throw new Error("CIS pack: level must be 1 or 2.");
  }
  const level: BenchmarkLevel = input.level;
  if (
    benchmark !== expected.benchmark ||
    version !== expected.version ||
    level !== expected.level
  ) {
    throw new Error(
      "The CIS pack does not match the requested benchmark, version and level.",
    );
  }
  if (!Array.isArray(input.policies)) {
    throw new Error("The CIS pack policies must be an array.");
  }
  if (!input.policies.length) {
    throw new Error("The CIS pack policies must contain at least one policy.");
  }
  if (input.policies.length > MAX_PACK_POLICIES) {
    throw new Error(
      `The CIS pack must contain at most ${MAX_PACK_POLICIES} policies.`,
    );
  }
  const recommendations =
    input.recommendations === undefined
      ? undefined
      : parsePackRecommendations(
          input.recommendations,
          "CIS pack recommendations",
        );
  return {
    benchmark,
    version,
    level,
    policies: input.policies,
    ...(recommendations ? { recommendations } : {}),
  };
}

// Validates one decoded recommendation list value, naming the first problem.
// With expected, the list must belong to the requested benchmark and version.
export function parseRecommendationList(
  value: unknown,
  expected?: { benchmark: string; version: string },
): RecommendationList {
  if (!isRecord(value)) {
    throw new Error(
      "The recommendation list must be a JSON object with benchmark, version and items.",
    );
  }
  for (const key of Object.keys(value)) {
    if (!LIST_FIELDS.has(key)) {
      throw new Error(
        `The recommendation list has an unknown field: ${key}. Expected benchmark, version and items.`,
      );
    }
  }
  const benchmarkValue = value.benchmark;
  if (
    typeof benchmarkValue !== "string" ||
    !/^[a-z0-9-]+$/.test(benchmarkValue.trim()) ||
    !benchmarkValue.trim()
  ) {
    throw new Error(
      "The recommendation list benchmark must be a benchmark id using lowercase letters, numbers and hyphens.",
    );
  }
  if (typeof value.version !== "string" || !value.version.trim()) {
    throw new Error(
      "The recommendation list version must be a non-empty string.",
    );
  }
  if (!Array.isArray(value.items)) {
    throw new Error("The recommendation list items must be an array.");
  }
  if (!value.items.length) {
    throw new Error(
      "The recommendation list items must contain at least one item.",
    );
  }
  const seen = new Set<string>();
  const items = value.items.map(
    (entry: unknown, index): RecommendationListItem => {
      const label = `Recommendation list item ${index + 1}`;
      if (!isRecord(entry)) {
        throw new Error(
          `${label}: expected an object with identifier, level and automated.`,
        );
      }
      for (const key of Object.keys(entry)) {
        if (!LIST_ITEM_FIELDS.has(key)) {
          throw new Error(
            `${label}: unknown field: ${key}. Expected identifier, level, automated and optional title, description, impact, audit and remediation.`,
          );
        }
      }
      if (
        typeof entry.identifier !== "string" ||
        !entry.identifier.trim() ||
        /\s/.test(entry.identifier.trim())
      ) {
        throw new Error(
          `${label}: identifier must be a non-empty string without spaces.`,
        );
      }
      if (entry.level !== 1 && entry.level !== 2) {
        throw new Error(`${label}: level must be 1 or 2.`);
      }
      if (typeof entry.automated !== "boolean") {
        throw new Error(`${label}: automated must be true or false.`);
      }
      const item: RecommendationListItem = {
        identifier: entry.identifier.trim(),
        level: entry.level,
        automated: entry.automated,
      };
      for (const field of LIST_TEXT_FIELDS) {
        const fieldValue = entry[field];
        if (fieldValue === undefined) continue;
        if (typeof fieldValue !== "string") {
          throw new Error(`${label}: ${field} must be a string when present.`);
        }
        if (fieldValue.trim()) item[field] = fieldValue.trim();
      }
      const key = `${item.level}:${item.identifier}`;
      if (seen.has(key)) {
        throw new Error(
          `${label}: duplicate identifier ${item.identifier} for Level ${item.level}.`,
        );
      }
      seen.add(key);
      return item;
    },
  );
  const list = {
    benchmark: benchmarkValue.trim(),
    version: value.version.trim(),
    items,
  };
  if (
    expected &&
    (list.benchmark !== expected.benchmark || list.version !== expected.version)
  ) {
    throw new Error(
      "The recommendation list does not match the requested benchmark and version.",
    );
  }
  return list;
}
