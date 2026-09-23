import type { DetailedExportData } from "./configuration-analyzer";
import {
  extractSettingValue,
  parseDeviceConfiguration,
  parseDocumentableProperties,
} from "./configuration-parser";
import type { ConfigurationSetting } from "./intune-detailed-client";

/** Exports above this many estimated pages deserve a warning before generation. */
export const LARGE_PDF_PAGE_THRESHOLD = 300;

export interface PdfPageEstimate {
  /** Rough page count of the detailed PDF export. */
  pages: number;
  policies: number;
  settings: number;
  /** True when `pages` reaches LARGE_PDF_PAGE_THRESHOLD. */
  isLarge: boolean;
}

// Layout figures of the detailed A4 export, calibrated against generated
// documents including a real 853 item tenant. Table text is 8 pt, so a
// setting name wraps after roughly 30 characters and a value or description
// after roughly 42.
const PAGE_CAPACITY_MM = 225;
const POLICY_HEADER_MM = 30;
const CATEGORY_HEADER_MM = 6.5;
const TABLE_HEADER_MM = 8;
const EMPTY_TABLE_MM = 6;
const TABLE_LINE_MM = 4;
const MIN_ROW_MM = 8;
const NAME_COLUMN_CHARS = 30;
const TEXT_COLUMN_CHARS = 42;
const DESCRIPTION_LINE_CHARS = 95;
const FIXED_PAGES = 4; // cover, contents, tenant overview and inventory
const COMPACT_FIXED_PAGES = 1; // a compact scoped export has only the cover
const COMPLIANCE_PREVIEW_PAGES = 3;

interface TableRow {
  name: string;
  value: unknown;
  description?: string;
}

const METADATA_KEYS = new Set([
  "@odata.type",
  "id",
  "name",
  "displayName",
  "description",
  "createdDateTime",
  "lastModifiedDateTime",
  "modifiedDateTime",
  "assignments",
  "roleScopeTagIds",
  "version",
  "configType",
  "collectionStatus",
  "settingCount",
  "platforms",
  "technologies",
  "templateReference",
]);

// Number of documented settings, as the summary reports it.
function settingCount(policy: unknown): number {
  if (!policy || typeof policy !== "object") return 0;
  const record = policy as Record<string, unknown>;
  const list = Array.isArray(record.settings)
    ? record.settings
    : Array.isArray(record.definitionValues)
      ? record.definitionValues
      : undefined;
  if (list) return list.length;
  return Object.entries(record).filter(
    ([key, value]) =>
      !METADATA_KEYS.has(key) && value !== null && value !== undefined,
  ).length;
}

function wrappedLines(text: unknown, charsPerLine: number): number {
  if (text === null || text === undefined || text === "") return 1;
  const value =
    typeof text === "string" ? text : (JSON.stringify(text) ?? "");
  return value
    .split("\n")
    .reduce(
      (lines, part) =>
        lines + Math.max(1, Math.ceil(part.length / charsPerLine)),
      0,
    );
}

function tableMm(rows: readonly TableRow[]): number {
  if (rows.length === 0) return EMPTY_TABLE_MM;
  let mm = TABLE_HEADER_MM;
  for (const row of rows) {
    const lines = Math.max(
      wrappedLines(row.name, NAME_COLUMN_CHARS),
      wrappedLines(row.value, TEXT_COLUMN_CHARS),
      row.description ? wrappedLines(row.description, TEXT_COLUMN_CHARS) : 1,
    );
    mm += Math.max(MIN_ROW_MM, lines * TABLE_LINE_MM + TABLE_LINE_MM);
  }
  return mm;
}

// Settings catalog rows as the generator lays them out: configured settings
// followed by their nested children.
function catalogRows(policy: Record<string, unknown>): TableRow[] {
  if (!Array.isArray(policy.settings)) return [];
  const rows: TableRow[] = [];
  for (const setting of policy.settings) {
    const extracted = extractSettingValue(setting as ConfigurationSetting);
    if (extracted.value === "Not configured") continue;
    rows.push(extracted);
    if (extracted.nestedSettings) rows.push(...extracted.nestedSettings);
  }
  return rows;
}

type Layout = "catalog" | "deviceConfiguration" | "properties";

function policyMm(policy: unknown, layout: Layout): number {
  if (!policy || typeof policy !== "object") return POLICY_HEADER_MM;
  const record = policy as Record<string, unknown>;
  const header =
    POLICY_HEADER_MM +
    (typeof record.description === "string" && record.description
      ? wrappedLines(record.description, DESCRIPTION_LINE_CHARS) *
          TABLE_LINE_MM +
        2
      : 0);
  if (layout === "catalog") return header + tableMm(catalogRows(record));
  if (layout === "deviceConfiguration") {
    return (
      header +
      parseDeviceConfiguration(record)
        .filter((category) => category.settings.length > 0)
        .reduce(
          (mm, category) =>
            mm + CATEGORY_HEADER_MM + tableMm(category.settings),
          0,
        )
    );
  }
  return header + tableMm(parseDocumentableProperties(record));
}

/**
 * Roughly estimates the page count of the detailed PDF export from the
 * collected data, so a UI can warn before generating a very large document.
 * Each non-empty section starts on a new page; policies then fill pages with
 * table rows whose height follows the wrapped length of their text.
 */
export function estimatePdfPageCount(
  data: DetailedExportData,
): PdfPageEstimate {
  const sections: Array<{ items: unknown[]; layout: Layout }> = [
    { items: data.settingsCatalog, layout: "catalog" as const },
    { items: data.deviceConfigurations, layout: "deviceConfiguration" as const },
    ...[
      data.administrativeTemplates,
      data.compliancePolicies,
      data.appProtectionPolicies ?? [],
      data.securityBaselines,
      [...data.scripts.windows, ...data.scripts.macOS],
      data.appConfigurations ?? [],
      data.windowsUpdatePolicies ?? [],
      data.conditionalAccessPolicies ?? [],
      data.enrollmentConfigurations ?? [],
      ...(data.sections ?? [])
        .filter((section) => section.selectionPrefix.startsWith("additional-"))
        .map((section) => section.items),
    ].map((items) => ({ items, layout: "properties" as const })),
  ].filter((section) => section.items.length > 0);

  let policies = 0;
  let settings = 0;
  let contentMm = 0;
  for (const section of sections) {
    for (const item of section.items) {
      policies += 1;
      settings += settingCount(item);
      contentMm += policyMm(item, section.layout);
    }
  }

  const fixedPages =
    (data.documentScope?.compact ? COMPACT_FIXED_PAGES : FIXED_PAGES) +
    (data.includeComplianceEvidence === false ? 0 : COMPLIANCE_PREVIEW_PAGES);
  // A section starts on a fresh page, leaving on average half a page unused.
  const pages = Math.round(
    fixedPages + sections.length * 0.5 + contentMm / PAGE_CAPACITY_MM,
  );

  return {
    pages,
    policies,
    settings,
    isLarge: pages >= LARGE_PDF_PAGE_THRESHOLD,
  };
}
