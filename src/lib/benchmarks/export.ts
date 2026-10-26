/**
 * Exports of one benchmark assessment: the readiness PDF, a CSV and a JSON
 * summary of ids, result codes, labels, reasons and counts, and a ZIP of
 * unassigned draft policies. CSV and JSON carry no titles and no pack policy
 * names; nothing here writes to a tenant.
 */
import type { BrandingOptions } from "~/types/branding";
import { dateParts } from "../compliance/pdf-kit";
import { toCsv, type CellValue } from "../compliance/export/csv";
import type { BenchmarkAssessment, ResultState } from "./assessment";
import {
  READINESS_DISCLAIMER,
  REASON_LABELS,
  RESULT_LABELS,
  SETTING_STATUS_LABELS,
  coverageStatement,
  ratePercent,
} from "./display";
import { buildBenchmarkDraftsZip, generateBenchmarkDrafts } from "./drafts";
import type { BenchmarkException } from "./exceptions";
import { RESULT_CODES } from "./history";
import type { BenchmarkPack } from "./pack";
import { renderReadinessPdf } from "./readiness-pdf";

export type BenchmarkExportFormat = "pdf" | "csv" | "json" | "drafts";

export interface BenchmarkExportOptions {
  /** Shortened tenant label; it names the file and the PDF tenant. */
  tenantLabel?: string;
  /** Fixed render time for the PDF and the file name: same input, same bytes. */
  renderDate?: Date;
  branding?: BrandingOptions;
  /** Benchmark name from the delivered catalog, for the PDF title. */
  benchmarkName?: string;
  /** Stored exceptions, listed in the PDF. */
  exceptions?: readonly BenchmarkException[];
  /** The delivered pack the assessment was made from; drafts need it. */
  pack?: BenchmarkPack;
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
] as const;

/** One row per result: recommendations, or settings when the pack has none. */
export function benchmarkCsv(assessment: BenchmarkAssessment): string {
  const base = [
    assessment.benchmark,
    assessment.version,
    assessment.level,
  ] as const;
  const row = (
    level: number,
    kind: string,
    id: string,
    result: ResultState,
    reason: keyof typeof REASON_LABELS | undefined,
    open: readonly string[],
  ): CellValue[] => [
    ...base,
    level,
    kind,
    id,
    RESULT_CODES[result],
    RESULT_LABELS[result],
    reason ?? "",
    reason ? REASON_LABELS[reason] : "",
    // Setting ids may hold spaces (Apple ids do), so they are joined with "; ".
    open.join("; "),
  ];
  const rows =
    assessment.basis === "recommendations"
      ? assessment.recommendations.map((item) =>
          row(
            item.level,
            "Recommendation",
            item.id,
            item.result,
            item.reason,
            item.openSettingIds,
          ),
        )
      : assessment.settings.map((finding) =>
          row(
            assessment.level,
            "Setting",
            finding.settingId,
            finding.result,
            finding.reason,
            finding.result === "Pass" ? [] : [finding.settingId],
          ),
        );
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

/** The assessment summary: ids, codes, labels, reasons and counts, no titles or pack policy names. */
export function benchmarkSummary(assessment: BenchmarkAssessment) {
  const reason = (code: keyof typeof REASON_LABELS | undefined) =>
    code ? { reasonCode: code, reason: REASON_LABELS[code] } : {};
  return {
    kind: "benchmarkReadinessSummary",
    schemaVersion: 1,
    disclaimer: READINESS_DISCLAIMER,
    benchmark: assessment.benchmark,
    version: assessment.version,
    level: assessment.level,
    assessedAt: assessment.assessedAt,
    basis: assessment.basis,
    collection: {
      collectedAt: assessment.collection.collectedAt,
      complete: assessment.collection.complete,
      gaps: [...assessment.collection.gaps],
    },
    levels: assessment.levels.map((level) => ({
      level: level.level,
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
    results:
      assessment.basis === "recommendations"
        ? assessment.recommendations.map((item) => ({
            id: item.id,
            level: item.level,
            resultCode: RESULT_CODES[item.result],
            result: RESULT_LABELS[item.result],
            ...reason(item.reason),
            openSettingIds: [...item.openSettingIds],
            settings: item.settings.map((setting) => ({
              id: setting.id,
              status: SETTING_STATUS_LABELS[setting.status],
              resultCode: RESULT_CODES[setting.result],
              ...reason(setting.reason),
            })),
          }))
        : assessment.settings.map((finding) => ({
            id: finding.settingId,
            level: assessment.level,
            resultCode: RESULT_CODES[finding.result],
            result: RESULT_LABELS[finding.result],
            ...reason(finding.reason),
            openSettingIds:
              finding.result === "Pass" ? [] : [finding.settingId],
            settings: [
              {
                id: finding.settingId,
                status: SETTING_STATUS_LABELS[finding.status],
                resultCode: RESULT_CODES[finding.result],
                ...reason(finding.reason),
              },
            ],
          })),
    manualNote: assessment.manualNote,
    notice: { text: assessment.notice.text, url: assessment.notice.url },
  };
}

export function benchmarkJson(assessment: BenchmarkAssessment): string {
  return `${JSON.stringify(sortKeys(benchmarkSummary(assessment)), null, 2)}\n`;
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
      return { fileName, bytes: text(benchmarkJson(assessment)) };
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
