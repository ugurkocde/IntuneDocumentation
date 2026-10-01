import { compareControlIds } from "../engine";
import { sha256 } from "../manifest";
import type { ControlStatus } from "../types";
import {
  BASELINE_SCHEMA,
  type BaselineDelta,
  type BaselineFile,
  type BaselineRejection,
  type ManagementMetrics,
  type ManagementSummary,
} from "./types";

// Baseline files let a tenant owner compare this month's evidence coverage with
// a previous run. The file holds identifiers, statuses and counts only. The
// checksum detects accidental edits and corruption; it is not proof of origin.

export const BASELINE_MAX_BYTES = 512 * 1024;

export const BASELINE_REJECTION_MESSAGES: Record<
  BaselineRejection,
  { en: string; de: string }
> = {
  schema: {
    en: "This file is not a valid IntuneDoc baseline.",
    de: "Diese Datei ist keine gültige IntuneDoc-Baseline.",
  },
  checksum: {
    en: "This baseline was changed or damaged after it was saved.",
    de: "Diese Baseline wurde nach dem Speichern verändert oder beschädigt.",
  },
  tenant: {
    en: "This baseline belongs to a different tenant.",
    de: "Diese Baseline gehört zu einem anderen Mandanten.",
  },
  framework: {
    en: "This baseline was created for a different framework.",
    de: "Diese Baseline wurde für ein anderes Framework erstellt.",
  },
  scope: {
    en: "This baseline was created with a different assessment scope.",
    de: "Diese Baseline wurde mit einem anderen Bewertungsumfang erstellt.",
  },
  future: {
    en: "This baseline is newer than the current assessment.",
    de: "Diese Baseline ist neuer als die aktuelle Bewertung.",
  },
};

const CONTROL_STATUSES: ReadonlySet<string> = new Set<ControlStatus>([
  "evidenceFound",
  "partialEvidence",
  "noEvidence",
  "notApplicable",
  "notAssessed",
  "conflictingEvidence",
]);

const METRIC_KEYS: Record<keyof ManagementMetrics, "number" | "nullable"> = {
  assessable: "number",
  withEvidence: "number",
  coveragePct: "nullable",
  withoutEvidence: "number",
  conflicting: "number",
  unassignedConfigs: "number",
  outsideIntuneScope: "nullable",
  dataGaps: "number",
};

const FILE_KEYS = new Set<keyof BaselineFile>([
  "schema",
  "frameworkId",
  "frameworkVersion",
  "rulesetVersion",
  "scopeKey",
  "generatedAt",
  "tenant",
  "controls",
  "metrics",
  "checksum",
]);

const ISO_DATE =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;

type BaselineBody = Omit<BaselineFile, "checksum">;

export async function createBaseline(
  summary: ManagementSummary,
  tenant: { id: string; label?: string },
): Promise<BaselineFile> {
  const body: BaselineBody = {
    schema: BASELINE_SCHEMA,
    frameworkId: summary.frameworkId,
    frameworkVersion: summary.frameworkVersion,
    rulesetVersion: summary.rulesetVersion,
    scopeKey: summary.scopeKey,
    generatedAt: summary.generatedAt,
    tenant:
      tenant.label === undefined
        ? { id: tenant.id }
        : { id: tenant.id, label: tenant.label },
    controls: { ...summary.controls },
    metrics: { ...summary.metrics },
  };
  return {
    ...body,
    checksum: { algorithm: "sha-256", value: await sha256(body) },
  };
}

export function serializeBaseline(file: BaselineFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function baselineFileName(
  summary: Pick<ManagementSummary, "frameworkId">,
  date: Date,
): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const framework =
    summary.frameworkId.toLowerCase().replace(/[^a-z0-9._-]+/g, "-") ||
    "framework";
  return `intunedoc-baseline-${framework}-${day}.json`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isString = (value: unknown): value is string => typeof value === "string";

const isCount = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value);

function isValidDate(value: unknown): value is string {
  return (
    isString(value) && ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))
  );
}

function isBaselineFile(value: unknown): value is BaselineFile {
  if (!isRecord(value)) return false;
  if (Object.keys(value).some((key) => !FILE_KEYS.has(key as never)))
    return false;
  const { tenant, controls, metrics, checksum } = value;
  if (value.schema !== BASELINE_SCHEMA) return false;
  if (
    ![
      value.frameworkId,
      value.frameworkVersion,
      value.rulesetVersion,
      value.scopeKey,
    ].every(isString) ||
    !(value.frameworkId as string).length
  )
    return false;
  if (!isValidDate(value.generatedAt)) return false;
  if (
    !isRecord(tenant) ||
    Object.keys(tenant).some((key) => key !== "id" && key !== "label") ||
    !isString(tenant.id) ||
    !tenant.id.trim() ||
    (tenant.label !== undefined && !isString(tenant.label))
  )
    return false;
  if (
    !isRecord(controls) ||
    Object.entries(controls).some(
      ([id, status]) =>
        !id || !isString(status) || !CONTROL_STATUSES.has(status),
    )
  )
    return false;
  if (!isRecord(metrics)) return false;
  for (const [key, kind] of Object.entries(METRIC_KEYS)) {
    const metric = metrics[key];
    if (!isCount(metric) && !(kind === "nullable" && metric === null))
      return false;
  }
  // Tolerate metrics added in later versions, as long as they stay counts.
  if (
    Object.values(metrics).some((metric) => metric !== null && !isCount(metric))
  )
    return false;
  return (
    isRecord(checksum) &&
    Object.keys(checksum).length === 2 &&
    checksum.algorithm === "sha-256" &&
    isString(checksum.value) &&
    /^[0-9a-f]{64}$/.test(checksum.value)
  );
}

export async function parseBaseline(
  text: string,
): Promise<
  { ok: true; file: BaselineFile } | { ok: false; reason: BaselineRejection }
> {
  try {
    if (
      typeof text !== "string" ||
      text.length > BASELINE_MAX_BYTES ||
      new TextEncoder().encode(text).length > BASELINE_MAX_BYTES
    )
      return { ok: false, reason: "schema" };
    const parsed: unknown = JSON.parse(text.replace(/^﻿/, ""));
    if (!isBaselineFile(parsed)) return { ok: false, reason: "schema" };
    const { checksum, ...body } = parsed;
    if ((await sha256(body)) !== checksum.value)
      return { ok: false, reason: "checksum" };
    return { ok: true, file: parsed };
  } catch {
    return { ok: false, reason: "schema" };
  }
}

const hasEvidence = (status: ControlStatus | undefined) =>
  status === "evidenceFound" || status === "partialEvidence";

/**
 * Compares the current summary with a parsed baseline. A control counts as
 * newly evidenced when it lacked evidence in the baseline (any status other
 * than evidenceFound or partialEvidence, including notAssessed) and has it
 * now; a regression is the reverse. Controls present on one side only are
 * reported as added or removed and are never counted as movement.
 */
export function compareBaseline(
  current: ManagementSummary,
  currentTenantId: string,
  file: BaselineFile,
):
  | { ok: true; delta: BaselineDelta }
  | { ok: false; reason: BaselineRejection } {
  if (
    currentTenantId.trim().toLowerCase() !== file.tenant.id.trim().toLowerCase()
  )
    return { ok: false, reason: "tenant" };
  if (current.frameworkId !== file.frameworkId)
    return { ok: false, reason: "framework" };
  if (current.scopeKey !== file.scopeKey) return { ok: false, reason: "scope" };
  if (Date.parse(file.generatedAt) > Date.parse(current.generatedAt))
    return { ok: false, reason: "future" };

  const has = (record: Record<string, ControlStatus>, id: string) =>
    Object.prototype.hasOwnProperty.call(record, id);
  const before = file.controls;
  const after = current.controls;
  const newlyEvidenced: string[] = [];
  const regressions: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const id of Object.keys(after)) {
    if (!has(before, id)) {
      added.push(id);
      continue;
    }
    const was = hasEvidence(before[id]);
    const now = hasEvidence(after[id]);
    if (!was && now) newlyEvidenced.push(id);
    if (was && !now) regressions.push(id);
  }
  for (const id of Object.keys(before)) if (!has(after, id)) removed.push(id);

  const currentPct = current.metrics.coveragePct;
  const baselinePct = file.metrics.coveragePct;
  return {
    ok: true,
    delta: {
      coverageDeltaPoints:
        currentPct === null || baselinePct === null
          ? null
          : currentPct - baselinePct,
      newlyEvidenced: newlyEvidenced.sort(compareControlIds),
      regressions: regressions.sort(compareControlIds),
      added: added.sort(compareControlIds),
      removed: removed.sort(compareControlIds),
      rulesetChanged: current.rulesetVersion !== file.rulesetVersion,
      baselineDate: file.generatedAt,
    },
  };
}
