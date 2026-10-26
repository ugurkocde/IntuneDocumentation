/**
 * Exports of one benchmark assessment: the readiness PDF, a CSV and a JSON
 * summary of ids, result codes, labels, reasons and counts, and a ZIP of
 * unassigned draft policies. CSV and JSON carry no titles and no pack policy
 * names; nothing here writes to a tenant.
 */
import type { BrandingOptions } from "~/types/branding";
import { dateParts } from "../compliance/pdf-kit";
import { toCsv, type CellValue } from "../compliance/export/csv";
import {
  assessmentResults,
  type BenchmarkAssessment,
  type RecommendationSettingResult,
} from "./assessment";
import {
  READINESS_DISCLAIMER,
  REASON_LABELS,
  SETTING_STATUS_LABELS,
  absentValueText,
  coverageStatement,
  rateIsHero,
  ratePercent,
  resultLabel,
  resultSettingDetails,
  type ResultSettingDetail,
} from "./display";
import { buildBenchmarkDraftsZip, generateBenchmarkDrafts } from "./drafts";
import { buildFixPlan, nextStepText, type FixPlan } from "./fix-plan";
import { NOT_READABLE } from "./values";
import type { BenchmarkException } from "./exceptions";
import { RESULT_CODES } from "./history";
import type { BenchmarkPack } from "./pack";
import { renderReadinessPdf } from "./readiness-pdf";

export type BenchmarkExportFormat = "pdf" | "csv" | "json" | "drafts";

export interface BenchmarkExportOptions {
  /**
   * The tenant's display name when known, otherwise its shortened id; it
   * names the file, the PDF tenant and the JSON tenant.
   */
  tenantLabel?: string;
  /** Fixed render time for the PDF and the file name: same input, same bytes. */
  renderDate?: Date;
  branding?: BrandingOptions;
  /** Benchmark name from the delivered catalog, for the PDF title. */
  benchmarkName?: string;
  /** Stored exceptions, listed in the PDF. */
  exceptions?: readonly BenchmarkException[];
  /**
   * The delivered pack or packs the assessment was made from (Level 1 and
   * Level 2 when Level 2 was compared); drafts need them.
   */
  pack?: BenchmarkPack | readonly BenchmarkPack[];
}

export interface BenchmarkExport {
  fileName: string;
  bytes: Uint8Array;
}

const EXTENSIONS: Readonly<Record<BenchmarkExportFormat, string>> = {
  pdf: "pdf",
  csv: "csv",
  json: "json",
  drafts: "zip",
};

function slug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 64);
}

/**
 * CIS-Readiness-<benchmark>-<version>-L<level>-<tenant>-<yyyy-mm-dd-hhmm>.<ext>,
 * in local time; the tenant part is left out without a label. Only the
 * benchmark id and version name the benchmark.
 */
export function benchmarkExportFileName(
  assessment: Pick<BenchmarkAssessment, "benchmark" | "version" | "level">,
  format: BenchmarkExportFormat,
  options: { tenantLabel?: string; date?: Date } = {},
): string {
  const { year, month, day, hours, minutes } = dateParts(
    options.date ?? new Date(),
  );
  const tenant = options.tenantLabel ? slug(options.tenantLabel) : "";
  return [
    "CIS-Readiness",
    slug(assessment.benchmark) || "benchmark",
    slug(assessment.version) || "version",
    `L${assessment.level}`,
    ...(tenant ? [tenant] : []),
    `${year}-${month}-${day}-${hours}${minutes}`,
  ]
    .join("-")
    .concat(`.${EXTENSIONS[format]}`);
}

const CSV_HEADER = [
  "Benchmark",
  "Version",
  "Level",
  "Item level",
  "Item",
  "ID",
  "Result code",
  "Result",
  "Reason code",
  "Reason",
  "Open setting IDs",
  "Setting names",
  "Holding policies",
  "Assignment",
  "Current value",
  "Recommended value",
  "Next action",
] as const;

/**
 * The value columns of one result: per setting, the policies holding it,
 * their assignment, their current value and the recommended value. A
 * result with several settings prefixes each part with the setting name.
 */
function detailCells(
  details: readonly ResultSettingDetail[],
): [string, string, string, string, string] {
  const several = details.length > 1;
  const part = (detail: ResultSettingDetail, text: string) =>
    several ? `${detail.name}: ${text}` : text;
  const join = (values: string[]) => [...new Set(values)].join("; ");
  return [
    join(details.map((detail) => detail.name)),
    join(details.flatMap((detail) => detail.holders.map((holder) => holder.policyName))),
    join(
      details.flatMap((detail) =>
        detail.holders.map((holder) => `${holder.policyName}: ${holder.assignedTo}`),
      ),
    ),
    join(
      details.map((detail) =>
        part(
          detail,
          detail.status === "Unmapped"
            ? ""
            : detail.holders.length
            ? detail.holders
                .map((holder) => `${holder.policyName}: ${holder.current.text}`)
                .join(", ")
            : absentValueText(detail.status),
        ),
      ),
    ),
    join(
      details.map((detail) =>
        part(
          detail,
          detail.status === "Unmapped"
            ? ""
            : detail.recommended.join(", ") || NOT_READABLE,
        ),
      ),
    ),
  ];
}

/**
 * One row per result of every Level shown (assessmentResults): its ids and
 * codes, then the setting names, the tenant policies holding its settings
 * with their assignment and current value, the recommended value and the
 * next step from the fix plan. No titles and no pack policy names.
 */
export function benchmarkCsv(
  assessment: BenchmarkAssessment,
  plan: FixPlan = buildFixPlan(assessment),
): string {
  const rows = assessmentResults(assessment).map((item): CellValue[] => [
    assessment.benchmark,
    assessment.version,
    assessment.level,
    item.level,
    item.kind === "recommendation" ? "Recommendation" : "Setting",
    item.id,
    RESULT_CODES[item.result],
    item.kind === "recommendation"
      ? resultLabel(item.recommendation)
      : resultLabel(item.finding),
    item.reason ?? "",
    item.reason ? REASON_LABELS[item.reason] : "",
    // Setting ids may hold spaces (Apple ids do), so they are joined with "; ".
    (item.kind === "recommendation"
      ? item.recommendation.openSettingIds
      : item.result === "Pass"
        ? []
        : [item.id]
    ).join("; "),
    ...detailCells(resultSettingDetails(assessment, item)),
    nextStepText(plan, item),
  ]);
  return toCsv([[...CSV_HEADER], ...rows], { bom: true });
}

/** Sorts object keys at every depth, so the JSON text is deterministic. */
function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
  );
}

/**
 * The assessment summary: ids, codes, labels, reasons, counts, setting
 * names, values and the tenant policies holding them, and the fix plan. No
 * titles or pack policy names.
 */
export function benchmarkSummary(
  assessment: BenchmarkAssessment,
  options: { tenantName?: string; plan?: FixPlan } = {},
) {
  const plan = options.plan ?? buildFixPlan(assessment);
  const reason = (code: keyof typeof REASON_LABELS | undefined) =>
    code ? { reasonCode: code, reason: REASON_LABELS[code] } : {};
  return {
    kind: "benchmarkReadinessSummary",
    schemaVersion: 2,
    disclaimer: READINESS_DISCLAIMER,
    benchmark: assessment.benchmark,
    version: assessment.version,
    level: assessment.level,
    ...(options.tenantName ? { tenant: options.tenantName } : {}),
    assessedAt: assessment.assessedAt,
    basis: assessment.basis,
    collection: {
      collectedAt: assessment.collection.collectedAt,
      complete: assessment.collection.complete,
      gaps: [...assessment.collection.gaps],
    },
    levels: assessment.levels.map((level) => ({
      level: level.level,
      basis: level.headline.basis,
      headline: {
        rate: level.headline.rate,
        ratePercent: ratePercent(level.headline.rate),
        // The base of the rate: Matches plus Differs, and Needs review
        // beside it.
        assessed: level.headline.counts.pass + level.headline.counts.fail,
        needsReview: level.headline.counts.review,
        adjusted: level.headline.adjusted,
        exceptionIds: [...level.headline.exceptionIds],
        counts: {
          pass: level.headline.counts.pass,
          fail: level.headline.counts.fail,
          review: level.headline.counts.review,
          notAssessed: level.headline.counts.notAssessed,
        },
        states: { ...level.headline.states },
        rateIsHero: rateIsHero(level.headline.states),
      },
      coverage: {
        source: level.coverage.source,
        numerator: level.coverage.numerator,
        denominator: level.coverage.denominator,
        coverage: level.coverage.coverage,
        statement: coverageStatement(level),
      },
      manualIdentifiers: level.manual.map((item) => item.identifier),
    })),
    results: assessmentResults(assessment).map((item) => {
      const details = resultSettingDetails(assessment, item);
      const own: ReadonlyArray<{
        id: string;
        status: RecommendationSettingResult["status"];
        result: RecommendationSettingResult["result"];
        reason?: RecommendationSettingResult["reason"];
      }> =
        item.kind === "recommendation"
          ? item.recommendation.settings
          : [
              withReasonOf(
                {
                  id: item.finding.settingId,
                  status: item.finding.status,
                  result: item.finding.result,
                },
                item.finding.reason,
              ),
            ];
      return {
        id: item.id,
        level: item.level,
        kind: item.kind,
        resultCode: RESULT_CODES[item.result],
        result:
          item.kind === "recommendation"
            ? resultLabel(item.recommendation)
            : resultLabel(item.finding),
        ...reason(item.reason),
        openSettingIds:
          item.kind === "recommendation"
            ? [...item.recommendation.openSettingIds]
            : item.result === "Pass"
              ? []
              : [item.id],
        settings: own.map((setting, index) => ({
          id: setting.id,
          name: details[index]!.name,
          status: SETTING_STATUS_LABELS[setting.status],
          resultCode: RESULT_CODES[setting.result],
          ...reason(setting.reason),
          recommendedValue: details[index]!.recommended,
          policies: details[index]!.holders.map((holder) => ({
            id: holder.policyId,
            name: holder.policyName,
            assignment: holder.assignment,
            assignedTo: holder.assignedTo,
            comparison: holder.label,
            currentValue: holder.current.text,
            ...(holder.current.cause ? { unreadableCause: holder.current.cause } : {}),
          })),
        })),
        actionIds: [...(plan.byResult[item.key] ?? [])],
        nextAction: nextStepText(plan, item),
      };
    }),
    fixPlan: plan.actions.map((action) => ({
      id: action.id,
      kind: action.kind,
      text: action.text,
      ...(action.reason ? { reasonCode: action.reason } : {}),
      ...(action.policy
        ? {
            policy: {
              id: action.policy.id,
              name: action.policy.name,
              assignment: action.policy.assignment,
            },
          }
        : {}),
      ...(action.unlocks ? { unlocks: { ...action.unlocks } } : {}),
      settings: action.settings.map((setting) => ({
        id: setting.settingId,
        name: setting.name,
        level: setting.packLevel,
        currentValue: setting.current,
        recommendedValue: setting.recommended,
        ...(setting.draft ? { draft: setting.draft } : {}),
        text: setting.text,
      })),
      results: action.results.map((result) => ({
        level: result.level,
        kind: result.kind,
        id: result.id,
      })),
    })),
    manualNote: assessment.manualNote,
    notice: { text: assessment.notice.text, url: assessment.notice.url },
  };
}

const withReasonOf = <T extends object>(
  value: T,
  code: keyof typeof REASON_LABELS | undefined,
) => (code ? { ...value, reason: code } : value);

export function benchmarkJson(
  assessment: BenchmarkAssessment,
  options: { tenantName?: string; plan?: FixPlan } = {},
): string {
  return `${JSON.stringify(sortKeys(benchmarkSummary(assessment, options)), null, 2)}\n`;
}

/** One export of an assessment as a file name and its bytes. */
export async function exportBenchmark(
  assessment: BenchmarkAssessment,
  format: BenchmarkExportFormat,
  options: BenchmarkExportOptions = {},
): Promise<BenchmarkExport> {
  const fileName = benchmarkExportFileName(assessment, format, {
    ...(options.tenantLabel ? { tenantLabel: options.tenantLabel } : {}),
    ...(options.renderDate ? { date: options.renderDate } : {}),
  });
  const text = (value: string) => new TextEncoder().encode(value);
  switch (format) {
    case "pdf":
      return {
        fileName,
        bytes: renderReadinessPdf(assessment, {
          ...(options.benchmarkName
            ? { benchmarkName: options.benchmarkName }
            : {}),
          ...(options.tenantLabel ? { tenantLabel: options.tenantLabel } : {}),
          ...(options.renderDate ? { renderDate: options.renderDate } : {}),
          ...(options.branding ? { branding: options.branding } : {}),
          ...(options.exceptions ? { exceptions: options.exceptions } : {}),
        }),
      };
    case "csv":
      return { fileName, bytes: text(benchmarkCsv(assessment)) };
    case "json":
      return {
        fileName,
        bytes: text(
          benchmarkJson(
            assessment,
            options.tenantLabel ? { tenantName: options.tenantLabel } : {},
          ),
        ),
      };
    case "drafts": {
      if (!options.pack)
        throw new Error(
          "Draft policies need the delivered pack the assessment was made from.",
        );
      const drafts = generateBenchmarkDrafts(assessment, options.pack);
      return {
        fileName,
        bytes: await buildBenchmarkDraftsZip(drafts, assessment),
      };
    }
    default:
      throw new Error(`Unknown benchmark export format: ${String(format)}.`);
  }
}
