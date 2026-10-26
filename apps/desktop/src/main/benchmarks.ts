import type { IpcMainInvokeEvent } from "electron";
import {
  assessBenchmark,
  combineLevelAssessments,
  unnamedSettingIds,
  withSettingNames,
  type BenchmarkAssessment,
} from "../../../../src/lib/benchmarks/assessment";
import { generateBenchmarkDrafts } from "../../../../src/lib/benchmarks/drafts";
import { exportBenchmark } from "../../../../src/lib/benchmarks/export";
import { buildFixPlan } from "../../../../src/lib/benchmarks/fix-plan";
import {
  packDigest,
  summarizeRuns,
  validateStoredRun,
  type StoredBenchmarkRun,
} from "../../../../src/lib/benchmarks/history";
import type { BenchmarkCollection, SettingNames } from "../../../../src/lib/benchmarks/tenant-settings";
import {
  parseBenchmarkIdentity,
  parseCatalog,
  parsePack,
  parseRecommendationList,
  type BenchmarkCatalog,
  type BenchmarkIdentity,
  type BenchmarkPack,
  type RecommendationList,
} from "../../../../src/lib/benchmarks/pack";
import {
  BENCHMARKS_COMING_SOON,
  type BenchmarkAssessmentView,
  type BenchmarkAvailability,
  type BenchmarkDraftsPreview,
  type BenchmarkException,
  type BenchmarkExceptionsRequest,
  type BenchmarkExportFormat,
  type BenchmarkHistoryRequest,
  type BenchmarkHistoryView,
  type BenchmarkPortfolioRequest,
  type BenchmarkPortfolioView,
  type BenchmarkRunRecord,
} from "../shared/ipc-types";
import { answerExceptions, type BenchmarkExceptionStore } from "./benchmark-exceptions";
import type { LicenseService } from "./license";

// CIS Benchmarks handlers, internal only until the CIS agreement covers this
// app. requireBenchmarks() runs first in every handler but availability and
// refuses unless the signed in tenant's valid activation carries the signed
// cis claim, before any licence refresh, sign-in or Graph work. Content
// comes from the licensed content service with the entitlement token as
// bearer and stays in this process's memory: never written to disk or logs,
// and purged on sign out, account change, deactivation, loss of the claim
// (checked on every use) and quit.

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;
type LogDetail = Record<string, string | number | boolean | null | undefined>;

// A part of the work this build does not have, as a full sentence with
// the next step; the handlers run only after the gate.
export const notAvailableMessage = (part: string) =>
  `${part} not available in this version of the app. Update the app, then try again.`;
export const BENCHMARK_NO_PACK =
  "No benchmark pack was delivered for this Level, so nothing could be compared. Load the benchmark again or choose another Level.";
export const BENCHMARK_ENTITLEMENT_REQUIRED =
  "CIS benchmark delivery requires a current license entitlement for this tenant.";
export const BENCHMARK_ACCOUNT_CHANGED = "The signed in account changed while this was running. Try again.";
export const BENCHMARK_ASSESS_FIRST = "Compare with a benchmark first.";
export const BENCHMARK_CONFIRM_DRAFTS = "Confirm the draft policy warnings before saving.";
export const CONTENT_TIMEOUT_MS = 15_000;
// The same caps as the content service (src/lib/cis-content/service.ts).
export const CATALOG_MAX_BYTES = 1_000_000;
export const LIST_MAX_BYTES = 8_000_000;
export const PACK_MAX_BYTES = 16_000_000;
// Packs and lists held at once; the oldest goes first.
export const MAX_CACHED_CONTENT = 16;

const UNREACHABLE = "The CIS content service could not be reached.";
const INVALID_RESPONSE = "The CIS content service returned an invalid response.";
const INVALID_BASE = "The CIS content service address is invalid.";
const EXPORT_FORMATS: readonly BenchmarkExportFormat[] = ["pdf", "csv", "json", "drafts"];

export class BenchmarkContentError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

// The engine (src/lib/benchmarks/index.ts), the exports and the exceptions
// store. A handler whose part is missing answers notAvailableMessage.
export interface BenchmarkWork {
  // Compares the owner's last collection with the packs, one per Level in
  // Level order (Level 1 and Level 2 when Level 2 is compared), as one view.
  assessBenchmark(input: {
    owner: string;
    tenantId: string;
    packs: BenchmarkPack[];
    list: RecommendationList | null;
  }): Promise<BenchmarkAssessmentView>;
  // The draft policies an assessment and its packs would give, counted.
  draftsPreview(input: { assessment: BenchmarkAssessmentView; packs: BenchmarkPack[] }): Promise<BenchmarkDraftsPreview>;
  // Readiness PDF, CSV, JSON or draft policies of an assessment, with the
  // packs it was made from and, for the PDF, the delivered benchmark name.
  exportBenchmark(input: {
    owner: string;
    tenantId: string;
    assessment: BenchmarkAssessmentView;
    packs: BenchmarkPack[];
    benchmarkName: string | null;
    format: BenchmarkExportFormat;
  }): Promise<{ fileName: string; bytes: Uint8Array }>;
  benchmarkExceptions(input: {
    owner: string;
    tenantId: string;
    request: BenchmarkExceptionsRequest;
  }): Promise<BenchmarkException[]>;
  // Trend and drift of the stored runs, and the runs of one series.
  benchmarkHistory(input: {
    owner: string;
    tenantId: string;
    request: BenchmarkHistoryRequest | null;
  }): Promise<BenchmarkHistoryView>;
  // Stored headlines per tenant; checks the MSP plan itself.
  benchmarkPortfolio(input: {
    owner: string;
    tenantId: string;
    request: BenchmarkPortfolioRequest | null;
  }): Promise<BenchmarkPortfolioView>;
  // Drops what the work holds for the signed in account (the tenant name).
  reset?(): void;
}

// What the work needs from main.
export interface BenchmarkWorkDeps {
  // The owner's last collection; null without one or when another owner
  // collected it.
  collectionFor(owner: string): (BenchmarkCollection & { collectedAt?: string }) | null;
  exceptions: Pick<BenchmarkExceptionStore, "list" | "set" | "remove">;
  // Still the account that asked; exception writes are dropped otherwise.
  isCurrent(owner: string, tenantId: string): boolean;
  // Adds the stored runs (one per Level) to the snapshot of the collection
  // they assessed in one write, once that snapshot is saved; false when they
  // are not stored (history off).
  recordRuns(owner: string, tenantId: string, collectedAt: string, runs: StoredBenchmarkRun[]): Promise<boolean>;
  history: {
    benchmarkHistory(
      owner: string,
      tenantId: string,
      request: BenchmarkHistoryRequest | null,
    ): Promise<BenchmarkHistoryView>;
    benchmarkPortfolio(
      owner: string,
      tenantId: string,
      request: BenchmarkPortfolioRequest | null,
    ): Promise<BenchmarkPortfolioView>;
  };
  // The shortened tenant id, for exports when no display name is known.
  tenantLabel(tenantId: string): string | undefined;
  // The tenant's display name (Graph /organization); undefined when unknown.
  tenantName?(tenantId: string): Promise<string | undefined>;
  // Display names of setting definitions the collection does not name
  // (Graph definition lookup); ids it cannot name are left out.
  settingNames?(ids: readonly string[]): Promise<SettingNames>;
  // Drops cached Graph answers on sign out and account change.
  resetGraph?(): void;
  log(level: "info" | "warn", message: string, detail?: LogDetail): void;
}

/**
 * The exceptions one part of a comparison applies: those of its own Level,
 * and, when Level 2 is compared together with Level 1, the exceptions
 * recorded at the compared Level for settings of the Level 1 pack, unless
 * the Level 1 pack has its own for that setting. An exception recorded while
 * comparing Level 2 so covers what that view shows.
 */
export function exceptionsForLevel(
  all: readonly BenchmarkException[],
  partLevel: number,
  comparedLevel: number,
): BenchmarkException[] {
  const own = all.filter((entry) => entry.level === partLevel);
  if (partLevel === comparedLevel) return own;
  const covered = new Set(own.map((entry) => entry.settingId));
  return [
    ...own,
    ...all
      .filter((entry) => entry.level === comparedLevel && !covered.has(entry.settingId))
      .map((entry) => ({ ...entry, level: partLevel as BenchmarkException["level"] })),
  ];
}

const errorText = (error: unknown) => (error instanceof Error ? error.message : "unknown");

// Why the runs of a comparison were not recorded, shown with the history.
export const RUN_NOT_TIMED = "This comparison is not stored in history: the collection has no completion time.";
export const RUN_NOT_KEPT =
  "This comparison is not stored in history: Keep history is off, or the snapshot of this collection was not saved.";
export const RUN_NOT_STORED = "This comparison could not be stored in history.";

// The engine, the exports, the exceptions store and history behind the
// handlers. The assessment applies the tenant's exceptions to the adjusted
// headline (without them when they cannot be read) and, with history on,
// its stored runs (one per Level shown) go onto the snapshot of the assessed
// collection. A run that cannot be stored leaves the assessment as it is,
// and the view says it was not recorded and why. Only reasons are logged,
// never content.
export function benchmarkWork(deps: BenchmarkWorkDeps): BenchmarkWork {
  const exceptionsOf = (tenantId: string, purpose: string) =>
    deps.exceptions.list(tenantId).catch((error: unknown) => {
      deps.log("warn", "benchmark exceptions not read", { purpose, message: errorText(error) });
      return [];
    });
  // All runs of an assessment are checked against the stored schema first
  // and written together, so either every Level is recorded or the view says
  // why none was.
  async function record(
    owner: string,
    tenantId: string,
    collectedAt: string | undefined,
    parts: ReadonlyArray<{ assessment: BenchmarkAssessment; pack: BenchmarkPack }>,
  ): Promise<BenchmarkRunRecord> {
    if (!collectedAt) return { recorded: false, reason: RUN_NOT_TIMED };
    let runs: StoredBenchmarkRun[];
    try {
      // The strict stored schema (validateStoredRun) caps results and ids.
      // Each Level's run carries the digest of the pack it came from.
      runs = [];
      for (const { assessment, pack } of parts)
        runs.push(...summarizeRuns(assessment, await packDigest(pack)).map((run) => validateStoredRun(run)));
    } catch (error) {
      deps.log("warn", "benchmark run not stored", { message: errorText(error) });
      return { recorded: false, reason: `This comparison is not stored in history. ${errorText(error)}` };
    }
    try {
      return (await deps.recordRuns(owner, tenantId, collectedAt, runs))
        ? { recorded: true, reason: null }
        : { recorded: false, reason: RUN_NOT_KEPT };
    } catch (error) {
      deps.log("warn", "benchmark run not stored", { message: errorText(error) });
      return { recorded: false, reason: RUN_NOT_STORED };
    }
  }
  return {
    async assessBenchmark({ owner, tenantId, packs, list }) {
      const collection = deps.collectionFor(owner);
      if (!collection) throw new Error("Collect tenant data first.");
      if (!packs.length) throw new Error(BENCHMARK_NO_PACK);
      const exceptions = await exceptionsOf(tenantId, "assess");
      const compared = Math.max(...packs.map((pack) => pack.level));
      const now = new Date();
      const parts = packs.map((pack) => ({
        pack,
        assessment: assessBenchmark(collection, pack, {
          ...(list ? { list } : {}),
          exceptions: exceptionsForLevel(exceptions, pack.level, compared),
          now,
        }),
      }));
      let assessment = combineLevelAssessments(parts.map((part) => part.assessment));
      // Settings the tenant does not hold are named through Graph; names
      // never change a verdict, so a failed lookup only leaves ids.
      const unnamed = unnamedSettingIds(assessment);
      if (unnamed.length && deps.settingNames) {
        try {
          assessment = withSettingNames(assessment, await deps.settingNames(unnamed));
        } catch (error) {
          deps.log("warn", "benchmark setting names not read", { message: errorText(error) });
        }
      }
      const tenantName = await deps.tenantName?.(tenantId).catch(() => undefined);
      return {
        ...assessment,
        history: await record(owner, tenantId, collection.collectedAt, parts),
        fixPlan: buildFixPlan(assessment),
        ...(tenantName ? { tenantName } : {}),
      };
    },
    // The drafts export makes the same call, so the counts are the ZIP's.
    async draftsPreview({ assessment, packs }) {
      const { drafts, notGenerated } = generateBenchmarkDrafts(assessment, packs, assessment.fixPlan);
      return {
        draftPolicies: drafts.length,
        draftSettings: drafts.reduce((sum, draft) => sum + draft.settingIds.length, 0),
        notGenerated,
      };
    },
    // Exactly what was assessed: the same pack, and the stored exceptions of
    // the assessed benchmark, version and level (the PDF lists them).
    async exportBenchmark({ tenantId, assessment, packs, benchmarkName, format }) {
      const exceptions = (await exceptionsOf(tenantId, "export")).filter(
        (entry) =>
          entry.benchmark === assessment.benchmark &&
          entry.version === assessment.version &&
          assessment.levels.some((level) => level.level === entry.level),
      );
      // The tenant's display name when Graph returned it, else the short id.
      const tenantLabel = assessment.tenantName ?? deps.tenantLabel(tenantId);
      return exportBenchmark(assessment, format, {
        ...(tenantLabel ? { tenantLabel } : {}),
        ...(benchmarkName ? { benchmarkName } : {}),
        pack: packs,
        exceptions,
      });
    },
    benchmarkExceptions: ({ owner, tenantId, request }) =>
      answerExceptions(deps.exceptions, tenantId, request, () => deps.isCurrent(owner, tenantId)),
    benchmarkHistory: ({ owner, tenantId, request }) => deps.history.benchmarkHistory(owner, tenantId, request),
    benchmarkPortfolio: ({ owner, tenantId, request }) => deps.history.benchmarkPortfolio(owner, tenantId, request),
    reset: () => deps.resetGraph?.(),
  };
}

export interface BenchmarksDeps {
  // Registers a handler behind the trusted sender check.
  handle(channel: string, listener: Listener): void;
  // The signed in account with a usable token; throws otherwise.
  requireOwner(): Promise<string>;
  // The entitlement of the signed in tenant; may refresh the licence.
  requireLicense(): Promise<void>;
  signedInTenant(): string | null;
  license: Pick<LicenseService, "cisInternal" | "entitlementToken">;
  // Electron's net.fetch in the app.
  fetch: Fetcher;
  // LICENSE_API_BASE; content is under /api/cis/v1.
  apiBase: string;
  // Counts the work as running, so a sign-in waits for it.
  track<T>(work: () => Promise<T>): Promise<T>;
  saveFile(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  log(level: "info" | "warn", message: string, detail?: LogDetail): void;
  work?: Partial<BenchmarkWork>;
}

// The content service origin without a trailing slash: https, or plain http
// for a local development server, never with credentials, query or fragment.
export function contentBaseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw.trim());
  } catch {
    throw new BenchmarkContentError(INVALID_BASE, 400);
  }
  const local = parsed.protocol === "http:" && (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1");
  if (parsed.username || parsed.password || parsed.search || parsed.hash || (parsed.protocol !== "https:" && !local)) {
    throw new BenchmarkContentError(INVALID_BASE, 400);
  }
  return raw.trim().replace(/\/+$/, "");
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

function tooLarge(maxBytes: number): BenchmarkContentError {
  return new BenchmarkContentError(`The CIS content service response exceeds the ${maxBytes} byte limit.`);
}

// Reads at most maxBytes; a declared or streamed body beyond that is refused.
async function readCapped(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? NaN);
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge(maxBytes);
  if (!response.body) {
    const text = await response.text().catch((error: unknown) => {
      throw new BenchmarkContentError(isTimeout(error) ? UNREACHABLE : INVALID_RESPONSE);
    });
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw tooLarge(maxBytes);
    return text;
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge(maxBytes);
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof BenchmarkContentError) throw error;
    throw new BenchmarkContentError(isTimeout(error) ? UNREACHABLE : INVALID_RESPONSE);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

type ContentKind = "catalog" | "pack" | "list";

// Client for /api/cis/v1. The entitlement token is the only credential;
// redirects are refused, every request times out and every body is capped.
// A list the service does not have (404) is null: coverage is then not shown.
// Any other failure, of the list too, is an error (the service answers 502
// when its storage fails), so an outage never reads as not published.
export function contentClient(options: {
  fetch: Fetcher;
  apiBase: string;
  log: BenchmarksDeps["log"];
}) {
  async function get(kind: ContentKind, path: string, maxBytes: number, token: string): Promise<unknown> {
    const url = `${contentBaseUrl(options.apiBase)}/api/cis/v1/${path}`;
    let response: Response;
    try {
      response = await options.fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(CONTENT_TIMEOUT_MS),
      });
    } catch (error) {
      options.log("warn", "benchmark content unreachable", { kind, timeout: isTimeout(error) });
      throw new BenchmarkContentError(UNREACHABLE);
    }
    if (kind === "list" && response.status === 404) {
      options.log("info", "benchmark content", { kind, status: 404 });
      return null;
    }
    if (!response.ok) {
      options.log("warn", "benchmark content refused", { kind, status: response.status });
      throw new BenchmarkContentError(`The CIS content service returned ${response.status}.`, response.status);
    }
    const text = await readCapped(response, maxBytes);
    try {
      const value: unknown = JSON.parse(text);
      options.log("info", "benchmark content", { kind, status: response.status });
      return value;
    } catch {
      throw new BenchmarkContentError(INVALID_RESPONSE);
    }
  }
  // Validation failures name the first problem, never the content.
  const validated = <T>(parse: () => T): T => {
    try {
      return parse();
    } catch (error) {
      throw error instanceof BenchmarkContentError ? error : new BenchmarkContentError(errorMessage(error));
    }
  };
  const segment = encodeURIComponent;
  return {
    async catalog(token: string): Promise<BenchmarkCatalog> {
      const value = await get("catalog", "catalog", CATALOG_MAX_BYTES, token);
      return validated(() => parseCatalog(value));
    },
    async pack(identity: BenchmarkIdentity, token: string): Promise<BenchmarkPack> {
      const expected = parseBenchmarkIdentity(identity);
      const path = `packs/${segment(expected.benchmark)}/${segment(expected.version)}/${expected.level}`;
      const value = await get("pack", path, PACK_MAX_BYTES, token);
      return validated(() => parsePack(value, expected));
    },
    async list(identity: BenchmarkIdentity, token: string): Promise<RecommendationList | null> {
      const expected = parseBenchmarkIdentity(identity);
      const path = `lists/${segment(expected.benchmark)}/${segment(expected.version)}`;
      const value = await get("list", path, LIST_MAX_BYTES, token);
      return value === null ? null : validated(() => parseRecommendationList(value, expected));
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : INVALID_RESPONSE;
}

function parseExport(input: unknown): { format: BenchmarkExportFormat; confirmed: boolean } {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const format = EXPORT_FORMATS.find((entry) => entry === raw.format);
  if (!format) throw new Error("Choose an export format.");
  return { format, confirmed: raw.confirmed === true };
}

function text(value: unknown, field: string, max: number): string {
  if (typeof value !== "string" || !value.trim() || value.length > max) {
    throw new Error(`Enter the exception ${field} (at most ${max} characters).`);
  }
  return value.trim();
}

// No request means none: every series of the tenant, or the default one.
export function parseHistoryRequest(input: unknown): BenchmarkHistoryRequest | null {
  return input === undefined || input === null ? null : parseBenchmarkIdentity(input);
}

export function parsePortfolioRequest(input: unknown): BenchmarkPortfolioRequest | null {
  if (input === undefined || input === null) return null;
  const raw = typeof input === "object" ? (input as Record<string, unknown>) : {};
  const { benchmark, version } = parseBenchmarkIdentity({ benchmark: raw.benchmark, version: raw.version, level: 1 });
  return { benchmark, version };
}

export function parseExceptionsRequest(input: unknown): BenchmarkExceptionsRequest {
  const raw = typeof input === "object" && input !== null ? (input as Record<string, unknown>) : {};
  const identity = parseBenchmarkIdentity(raw);
  if (raw.action === "list") return { action: "list", ...identity };
  if (raw.action !== "set" && raw.action !== "remove") throw new Error("Unknown exception action.");
  const settingId = text(raw.settingId, "setting", 500);
  if (raw.action === "remove") return { action: "remove", ...identity, settingId };
  const expiresOn = text(raw.expiresOn, "expiry date", 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) throw new Error("Enter the expiry date as YYYY-MM-DD.");
  return {
    action: "set",
    ...identity,
    settingId,
    owner: text(raw.owner, "owner", 100),
    reason: text(raw.reason, "reason", 500),
    expiresOn,
  };
}

const notAvailable = (part: string): never => {
  throw new Error(notAvailableMessage(part));
};

export function registerBenchmarksIpc(deps: BenchmarksDeps) {
  const client = contentClient(deps);
  // Packs and lists by tenant, benchmark, version (and level for packs).
  const content = new Map<string, BenchmarkPack | RecommendationList>();
  let last: { tenant: string; owner: string; view: BenchmarkAssessmentView; packs: BenchmarkPack[] } | null = null;
  // Bumped by every purge, so a fetch that was running is never cached or
  // returned after it.
  let generation = 0;

  function purge(): void {
    generation += 1;
    content.clear();
    last = null;
    deps.work?.reset?.();
  }

  async function entitled(tenant: string | null): Promise<boolean> {
    try {
      return await deps.license.cisInternal(tenant);
    } catch {
      return false;
    }
  }

  // The gate. Reads the cached activation only. Losing the claim purges
  // everything held. Returns the signed in tenant.
  async function requireBenchmarks(): Promise<string> {
    const tenant = deps.signedInTenant()?.toLowerCase() ?? null;
    if (!tenant || !(await entitled(tenant))) {
      purge();
      throw new Error(BENCHMARKS_COMING_SOON);
    }
    return tenant;
  }

  // Before every use of content: still entitled, still the same tenant.
  async function stillFor(tenant: string): Promise<void> {
    if ((await requireBenchmarks()) !== tenant) {
      purge();
      throw new Error(BENCHMARK_ACCOUNT_CHANGED);
    }
  }

  async function fetched<T>(tenant: string, load: (token: string) => Promise<T>): Promise<T> {
    const started = generation;
    const token = await deps.license.entitlementToken(tenant);
    if (!token) {
      purge();
      throw new BenchmarkContentError(BENCHMARK_ENTITLEMENT_REQUIRED, 401);
    }
    const value = await load(token);
    if (generation !== started) throw new Error(BENCHMARK_ACCOUNT_CHANGED);
    await stillFor(tenant);
    return value;
  }

  async function cached<T extends BenchmarkPack | RecommendationList | null>(
    tenant: string,
    key: string,
    load: (token: string) => Promise<T>,
  ): Promise<T> {
    await stillFor(tenant);
    const fullKey = `${tenant}|${key}`;
    if (content.has(fullKey)) return content.get(fullKey) as T;
    const value = await fetched(tenant, load);
    // A list that is not published (null) is asked for again at the next
    // compare, so a list published later is used; failures are never held.
    if (value === null) return value;
    content.set(fullKey, value);
    while (content.size > MAX_CACHED_CONTENT) content.delete(content.keys().next().value!);
    return value;
  }

  const pack = (tenant: string, identity: BenchmarkIdentity) =>
    cached(tenant, `pack|${identity.benchmark}|${identity.version}|${identity.level}`, (token) =>
      client.pack(identity, token),
    );
  // The packs a Level is compared with. Level 2 packs add to Level 1, so
  // Level 2 brings the Level 1 pack too, unless the Level 2 pack holds Level 1
  // recommendations itself or the service has no Level 1 pack (404).
  async function packsFor(tenant: string, identity: BenchmarkIdentity): Promise<BenchmarkPack[]> {
    const delivered = await pack(tenant, identity);
    if (identity.level === 1 || (delivered.recommendations ?? []).some((item) => item.level === 1)) return [delivered];
    try {
      return [await pack(tenant, { ...identity, level: 1 }), delivered];
    } catch (error) {
      if (error instanceof BenchmarkContentError && error.status === 404) return [delivered];
      throw error;
    }
  }
  const list = (tenant: string, identity: BenchmarkIdentity) =>
    cached(tenant, `list|${identity.benchmark}|${identity.version}`, (token) => client.list(identity, token));

  // The delivered catalog name for the readiness PDF title; the PDF names the
  // benchmark by its id when the catalog cannot be read.
  async function benchmarkName(tenant: string, identity: BenchmarkIdentity): Promise<string | null> {
    try {
      const catalog = await fetched(tenant, (token) => client.catalog(token));
      return (
        catalog.benchmarks.find((entry) => entry.id === identity.benchmark && entry.version === identity.version)
          ?.name ?? null
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === BENCHMARKS_COMING_SOON || message === BENCHMARK_ACCOUNT_CHANGED) throw error;
      return null;
    }
  }

  // After the gate: the sign in and the licence, as for the fix pack. A
  // licence refresh may drop the claim, so the gate is checked again.
  async function licensed(tenant: string): Promise<string> {
    const owner = await deps.requireOwner();
    await deps.requireLicense();
    await stillFor(tenant);
    return owner;
  }

  // Work that finishes after a purge, or for another tenant, is discarded.
  async function current<T>(tenant: string, work: () => Promise<T>): Promise<T> {
    const started = generation;
    const result = await work();
    if (generation !== started) throw new Error(BENCHMARK_ACCOUNT_CHANGED);
    await stillFor(tenant);
    return result;
  }

  deps.handle("benchmarks:availability", async (): Promise<BenchmarkAvailability> => {
    const tenant = deps.signedInTenant()?.toLowerCase() ?? null;
    if (tenant && (await entitled(tenant))) return { state: "internal" };
    purge();
    return { state: "comingSoon" };
  });

  deps.handle("benchmarks:catalog", async (): Promise<BenchmarkCatalog> => {
    const tenant = await requireBenchmarks();
    await licensed(tenant);
    return fetched(tenant, (token) => client.catalog(token));
  });

  deps.handle("benchmarks:assess", async (_event, input): Promise<BenchmarkAssessmentView> => {
    const tenant = await requireBenchmarks();
    const identity = parseBenchmarkIdentity(input);
    const owner = await licensed(tenant);
    const assessBenchmark = deps.work?.assessBenchmark ?? notAvailable("Comparing with a benchmark is");
    return deps.track(async () => {
      const packs = await packsFor(tenant, identity);
      const view = await current(tenant, async () =>
        assessBenchmark({ owner, tenantId: tenant, packs, list: await list(tenant, identity) }),
      );
      last = { tenant, owner, view, packs };
      return view;
    });
  });

  // The last assessment of this tenant and owner, with the pack it used.
  function held(tenant: string, owner: string) {
    if (!last || last.tenant !== tenant || last.owner !== owner) throw new Error(BENCHMARK_ASSESS_FIRST);
    return last;
  }

  deps.handle("benchmarks:previewDrafts", async (): Promise<BenchmarkDraftsPreview> => {
    const tenant = await requireBenchmarks();
    const owner = await licensed(tenant);
    const draftsPreview = deps.work?.draftsPreview ?? notAvailable("Draft policies are");
    const { view: assessment, packs } = held(tenant, owner);
    return current(tenant, () => draftsPreview({ assessment, packs }));
  });

  deps.handle("benchmarks:export", async (_event, input): Promise<string | null> => {
    const tenant = await requireBenchmarks();
    const { format, confirmed } = parseExport(input);
    const owner = await licensed(tenant);
    const exportBenchmark = deps.work?.exportBenchmark ?? notAvailable("Exporting a benchmark comparison is");
    const { view: assessment, packs } = held(tenant, owner);
    if (format === "drafts" && !confirmed) throw new Error(BENCHMARK_CONFIRM_DRAFTS);
    const file = await deps.track(() =>
      current(tenant, async () =>
        exportBenchmark({
          owner,
          tenantId: tenant,
          assessment,
          packs,
          benchmarkName: format === "pdf" ? await benchmarkName(tenant, assessment) : null,
          format,
        }),
      ),
    );
    deps.log("info", "benchmark export", { format });
    return deps.saveFile(file.fileName, file.bytes);
  });

  deps.handle("benchmarks:exceptions", async (_event, input): Promise<BenchmarkException[]> => {
    const tenant = await requireBenchmarks();
    const request = parseExceptionsRequest(input);
    const owner = await licensed(tenant);
    const benchmarkExceptions = deps.work?.benchmarkExceptions ?? notAvailable("Benchmark exceptions are");
    return current(tenant, () => benchmarkExceptions({ owner, tenantId: tenant, request }));
  });

  deps.handle("benchmarks:history", async (_event, input): Promise<BenchmarkHistoryView> => {
    const tenant = await requireBenchmarks();
    const request = parseHistoryRequest(input);
    const owner = await licensed(tenant);
    const benchmarkHistory = deps.work?.benchmarkHistory ?? notAvailable("Benchmark history is");
    return deps.track(() => current(tenant, () => benchmarkHistory({ owner, tenantId: tenant, request })));
  });

  deps.handle("benchmarks:portfolio", async (_event, input): Promise<BenchmarkPortfolioView> => {
    const tenant = await requireBenchmarks();
    const request = parsePortfolioRequest(input);
    const owner = await licensed(tenant);
    const benchmarkPortfolio = deps.work?.benchmarkPortfolio ?? notAvailable("The benchmark portfolio is");
    return deps.track(() => current(tenant, () => benchmarkPortfolio({ owner, tenantId: tenant, request })));
  });

  return {
    requireBenchmarks,
    // Sign out, account change, licence deactivation and quit.
    reset: purge,
    // After a licence change: drops everything once the claim is gone.
    async revalidate(): Promise<void> {
      if (!(await entitled(deps.signedInTenant()?.toLowerCase() ?? null))) purge();
    },
    // For tests: how many packs and lists are held.
    cachedCount: () => content.size,
  };
}
