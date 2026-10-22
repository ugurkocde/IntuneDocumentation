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
import { headlineRate } from "./assessment";

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
 * headlines are the two live Level cards. A pack without recommendations is
 * judged by settings and stores one run at its own Level.
 */
export function summarizeRuns(
  assessment: BenchmarkAssessment,
  packDigest: string,
): StoredBenchmarkRun[] {
  const run = (
    level: BenchmarkLevel,
    results: StoredResult[],
  ): StoredBenchmarkRun => ({
    benchmark: assessment.benchmark,
    version: assessment.version,
    level,
    assessedAt: assessment.assessedAt,
    packDigest,
    basis: assessment.basis,
    results,
  });
  if (assessment.basis === "settings")
    return [
      run(
        assessment.level,
        assessment.settings.map((finding) => [
          finding.settingId,
          RESULT_CODES[finding.result],
          finding.result === "Pass" ? [] : [finding.settingId],
        ]),
      ),
    ];
  return assessment.levels.map(({ level }) =>
    run(
      level,
      assessment.recommendations
        .filter((item) => item.level === level)
        .map((item) => [
          item.id,
          RESULT_CODES[item.result],
          [...item.openSettingIds],
        ]),
    ),
  );
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
const ID_PATTERN = /^[A-Za-z0-9_.{}~\-]{1,500}$/;
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
  const results = value.results.map((entry, index): StoredResult => {
    const storable = (id: unknown) =>
      typeof id === "string" && ID_PATTERN.test(id);
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
    if (!storable(entry[0]) || !entry[2].every(storable))
      throw new Error(
        `The stored benchmark run has an invalid result ${index + 1}: an id is not 1 to 500 letters, digits or _ . { } ~ -.`,
      );
    return [entry[0], entry[1] as ResultCode, [...(entry[2] as string[])]];
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
