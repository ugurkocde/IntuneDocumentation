export type CellValue = string | number | boolean | null | undefined;

const CONTROL_PREFIX = /^[\t\r\n]/;
const FORMULA_PREFIX = /^[=+\-@|%]/;

/**
 * Spreadsheet applications evaluate cells that start with = + - @ | % (also
 * after leading spaces) or with a tab, CR or LF as formulas or commands.
 * Policy names and values come from the tenant, so such text cells get a
 * leading single quote that keeps them literal.
 */
export function neutraliseFormula(value: string): string {
  return CONTROL_PREFIX.test(value) || FORMULA_PREFIX.test(value.trimStart())
    ? `'${value}`
    : value;
}

/** Text form of a cell. Only strings are neutralised; numbers stay numeric. */
export function cellText(value: CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return neutraliseFormula(value);
  if (typeof value === "number")
    return Number.isFinite(value) ? String(value) : "";
  return value ? "TRUE" : "FALSE";
}

/** One RFC 4180 field, quoted when it holds a comma, quote, CR or LF. */
export function csvField(value: CellValue): string {
  const text = cellText(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export interface CsvOptions {
  /** Prepends a UTF-8 byte order mark so Excel detects the encoding. */
  bom?: boolean;
}

/** RFC 4180 text with CRLF line endings, including after the last record. */
export function toCsv(
  rows: readonly (readonly CellValue[])[],
  options: CsvOptions = {},
): string {
  const body = rows.map((row) => row.map(csvField).join(",") + "\r\n").join("");
  return options.bom ? `\uFEFF${body}` : body;
}
