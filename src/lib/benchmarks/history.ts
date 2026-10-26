/**
 * The stored form of one benchmark run, for history, trend and portfolio.
 * It keeps identifiers and result codes only: the benchmark id, version,
 * Level, time, a digest of the delivered pack and, per result, its id, its
 * result code and its open setting ids. No titles, no pack policy names, no
 * values; titles are fetched again with entitlement when a run is shown.
 */
import type {
  BenchmarkAssessment,
  BenchmarkLevel,
  ResultCounts,
  ResultState,
} from "./assessment";
import { assessmentResults, headlineRate } from "./assessment";

export type ResultCode = "pass" | "fail" | "review" | "notAssessed";

export const RESULT_CODES: Readonly<Record<ResultState, ResultCode>> = {
  Pass: "pass",
  Fail: "fail",
  Review: "review",
  "Not assessed": "notAssessed",
};

/** [recommendation id or setting id, result code, open setting ids]. */
export type StoredResult = [string, ResultCode, string[]];

export interface StoredBenchmarkRun {
  benchmark: string;
  version: string;
  level: BenchmarkLevel;
  assessedAt: string;
  /** "sha256:" and the hex digest of the delivered pack. */
  packDigest: string;
  basis: "recommendations" | "settings";
  results: StoredResult[];
}

/**
 * The stored runs of one assessment, one per Level the assessment shows:
 * the series is the benchmark, version and recommendation Level, so a Level 2
 * pack holding Level 1 and Level 2 recommendations stores two runs whose
 * headlines are the two live Level cards. A Level judged by settings stores
 * the settings of its pack. Each run takes its Level's basis
 * (assessmentResults), so Levels compared together store the same runs as
 * Levels compared alone; packDigest names the pack of each Level.
 */
export function summarizeRuns(
  assessment: BenchmarkAssessment,
  packDigest: string | ((level: BenchmarkLevel) => string),
): StoredBenchmarkRun[] {
  const results = assessmentResults(assessment);
  return assessment.levels.map(({ level, headline }) => ({
    benchmark: assessment.benchmark,
    version: assessment.version,
    level,
    assessedAt: assessment.assessedAt,
    packDigest: typeof packDigest === "string" ? packDigest : packDigest(level),
    basis: headline.basis,
    results: results
      .filter((item) => item.level === level)
      .map((item): StoredResult => [
        item.id,
        RESULT_CODES[item.result],
        item.kind === "recommendation"
          ? [...item.recommendation.openSettingIds]
          : item.result === "Pass"
            ? []
            : [item.id],
      ]),
  }));
}

const RUN_FIELDS = new Set([
  "benchmark",
  "version",
  "level",
  "assessedAt",
  "packDigest",
  "basis",
  "results",
]);
const CODES = new Set<string>(Object.values(RESULT_CODES));
// Recommendation ids are dotted numbers, as the pack validates them.
const RECOMMENDATION_ID_PATTERN = /^\d{1,4}(?:\.\d{1,4}){1,9}$/;
// Setting definition ids are free form in Graph: Apple ids hold spaces,
// parentheses and $, for example
// com.apple.mcx_com.apple.energysaver.desktop.acpower_display sleep timer.
// Refused are control and format characters (zero width characters,
// bidirectional controls, tags), line and paragraph separators, lone
// surrogates, other invisible fillers and surrounding white space.
const UNSAFE_ID_CHARACTERS =
  /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\u034f\u115f\u1160\u17b4\u17b5\u180e\u3164\ufe00-\ufe0f\uffa0]/u;
const MAX_ID_LENGTH = 500;
const SETTING_ID_RULE = `is empty, longer than ${MAX_ID_LENGTH} characters, starts or ends with white space or holds a control or invisible character`;

/** True when value can be stored as a setting definition id. */
function isStorableSettingId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_ID_LENGTH &&
    value.trim() === value &&
    !UNSAFE_ID_CHARACTERS.test(value)
  );
}
const BENCHMARK_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
export const MAX_STORED_RESULTS = 5000;

/**
 * Validates one stored run strictly. Unknown fields and free text are
 * rejected, so a stored run can never carry titles or values.
 */
export function validateStoredRun(input: unknown): StoredBenchmarkRun {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("A stored benchmark run must be an object.");
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(value))
    if (!RUN_FIELDS.has(key))
      throw new Error(`The stored benchmark run has an unknown field: ${key}.`);
  if (
    typeof value.benchmark !== "string" ||
    !BENCHMARK_PATTERN.test(value.benchmark) ||
    value.benchmark.length > 100
  )
    throw new Error("The stored benchmark run has an invalid benchmark id.");
  if (typeof value.version !== "string" || !VERSION_PATTERN.test(value.version))
    throw new Error("The stored benchmark run has an invalid version.");
  if (value.level !== 1 && value.level !== 2)
    throw new Error("The stored benchmark run has an invalid level.");
  if (
    typeof value.assessedAt !== "string" ||
    !ISO_INSTANT.test(value.assessedAt) ||
    !Number.isFinite(Date.parse(value.assessedAt))
  )
    throw new Error("The stored benchmark run has an invalid time.");
  if (
    typeof value.packDigest !== "string" ||
    !DIGEST_PATTERN.test(value.packDigest)
  )
    throw new Error("The stored benchmark run has an invalid pack digest.");
  if (value.basis !== "recommendations" && value.basis !== "settings")
    throw new Error("The stored benchmark run has an invalid basis.");
  if (!Array.isArray(value.results))
    throw new Error("The stored benchmark run has invalid results.");
  if (value.results.length > MAX_STORED_RESULTS)
    throw new Error(
      `The stored benchmark run holds more than ${MAX_STORED_RESULTS} results.`,
    );
  // A recommendations run names recommendations, so a title never passes
  // as a result id there; a settings run names settings.
  const byRecommendation = value.basis === "recommendations";
  const resultId = byRecommendation
    ? (id: unknown) =>
        typeof id === "string" && RECOMMENDATION_ID_PATTERN.test(id)
    : isStorableSettingId;
  const results = value.results.map((entry, index): StoredResult => {
    if (
      !Array.isArray(entry) ||
      entry.length !== 3 ||
      typeof entry[1] !== "string" ||
      !CODES.has(entry[1]) ||
      !Array.isArray(entry[2])
    )
      throw new Error(
        `The stored benchmark run has an invalid result ${index + 1}.`,
      );
    if (!resultId(entry[0]) || !entry[2].every(isStorableSettingId))
      throw new Error(
        `The stored benchmark run has an invalid result ${index + 1}: ${
          resultId(entry[0])
            ? `a setting id ${SETTING_ID_RULE}`
            : byRecommendation
              ? "its id is not a recommendation id such as 1.2.3"
              : `its setting id ${SETTING_ID_RULE}`
        }.`,
      );
    return [entry[0], entry[1] as ResultCode, [...entry[2]]];
  });
  return {
    benchmark: value.benchmark,
    version: value.version,
    level: value.level,
    assessedAt: value.assessedAt,
    packDigest: value.packDigest,
    basis: value.basis,
    results,
  };
}

/** Counts and headline rate of a stored run, the same rule as the live assessment. */
export function storedRunHeadline(run: Pick<StoredBenchmarkRun, "results">): {
  counts: ResultCounts;
  rate: number | null;
} {
  const count = (code: ResultCode) =>
    run.results.filter((entry) => entry[1] === code).length;
  const counts = {
    pass: count("pass"),
    fail: count("fail"),
    review: count("review"),
    notAssessed: count("notAssessed"),
  };
  return { counts, rate: headlineRate(counts) };
}

/** A value with object keys sorted at every depth; array order is kept. */
export function canonicalJson(value: unknown): string {
  const canonical = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(canonical);
    if (item === null || typeof item !== "object") return item;
    return Object.fromEntries(
      Object.keys(item)
        .sort()
        .map((key) => [key, canonical((item as Record<string, unknown>)[key])]),
    );
  };
  return JSON.stringify(canonical(value));
}

/**
 * The digest of a delivered pack: of its bytes when given bytes or the
 * response text, otherwise of its canonical JSON. Web Crypto, so it runs in
 * the main process, the renderer and tests alike.
 */
export async function packDigest(
  pack: Uint8Array | string | object,
): Promise<string> {
  const bytes =
    pack instanceof Uint8Array
      ? pack
      : new TextEncoder().encode(
          typeof pack === "string" ? pack : canonicalJson(pack),
        );
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(bytes),
  );
  return `sha256:${[...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
