import JSZip from "jszip";
import { isFormulaLike, type CellValue } from "./csv";

// Minimal SpreadsheetML (ECMA-376) writer: inline strings, one bold header
// style and one wrapping body style, each with a quote prefix variant. No
// shared strings, formulas or dates, so the output never depends on the host
// locale.

export interface XlsxSheet {
  name: string;
  /** The first row is the header: bold, frozen and filterable. */
  rows: readonly (readonly CellValue[])[];
  /** Widths in characters; computed from the content when omitted. */
  columnWidths?: readonly number[];
  /** Defaults to true. Off for key and value sheets such as an About page. */
  autoFilter?: boolean;
  /** Further zero-based row indexes set in bold, such as block headings. */
  boldRows?: readonly number[];
}

const MAX_CELL_LENGTH = 32767;
const MIN_WIDTH = 8;
const MAX_WIDTH = 60;

// Characters outside the XML 1.0 Char production, and lone surrogates.
const ILLEGAL_XML =
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function stripIllegalXml(value: string): string {
  return value.replace(ILLEGAL_XML, "");
}

export function escapeXml(value: string): string {
  return stripIllegalXml(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

/** Column letters for a zero-based index: 0 is A, 26 is AA. */
export function columnName(index: number): string {
  let name = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26))
    name = String.fromCharCode(65 + ((rest - 1) % 26)) + name;
  return name;
}

/** Excel sheet names: at most 31 characters, no []:*?/\ and unique. */
function sheetNames(sheets: readonly XlsxSheet[]): string[] {
  const used = new Set<string>();
  return sheets.map((sheet, index) => {
    const base =
      stripIllegalXml(sheet.name)
        .replace(/[[\]:*?/\\]/g, " ")
        .replace(/^'+|'+$/g, "")
        .trim()
        .slice(0, 31) || `Sheet${index + 1}`;
    let name = base;
    for (let suffix = 2; used.has(name.toLowerCase()); suffix += 1)
      name = `${base.slice(0, 31 - String(suffix).length - 1)} ${suffix}`;
    used.add(name.toLowerCase());
    return name;
  });
}

/** Style index of the quote prefix variant of a header or body style. */
const QUOTE_PREFIX_OFFSET = 2;

function cellXml(value: CellValue, ref: string, style: number): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number")
    return Number.isFinite(value)
      ? `<c r="${ref}" s="${style}"><v>${value}</v></c>`
      : "";
  if (typeof value === "boolean")
    return `<c r="${ref}" s="${style}" t="b"><v>${value ? 1 : 0}</v></c>`;
  const plain = stripIllegalXml(value).slice(0, MAX_CELL_LENGTH);
  // Formula-like text keeps its value and gets the quote prefix style, the
  // cell form of a leading apostrophe: Excel shows it literally and keeps it
  // text when the cell is edited. CSV has no styles and keeps the apostrophe.
  const cellStyle = isFormulaLike(plain) ? style + QUOTE_PREFIX_OFFSET : style;
  return `<c r="${ref}" s="${cellStyle}" t="inlineStr"><is><t xml:space="preserve">${escapeXml(plain)}</t></is></c>`;
}

function widths(sheet: XlsxSheet, columns: number): number[] {
  return Array.from({ length: columns }, (_, column) => {
    const preset = sheet.columnWidths?.[column];
    if (preset !== undefined) return preset;
    const longest = sheet.rows.reduce((max, row) => {
      const value = row[column];
      const text = value === null || value === undefined ? "" : String(value);
      const line = text
        .split(/\r?\n/)
        .reduce((width, part) => Math.max(width, part.length), 0);
      return Math.max(max, line);
    }, 0);
    return Math.min(Math.max(longest + 2, MIN_WIDTH), MAX_WIDTH);
  });
}

function worksheetXml(sheet: XlsxSheet): string {
  const columns = sheet.rows.reduce((max, row) => Math.max(max, row.length), 0);
  const rowCount = sheet.rows.length;
  const lastRef = `${columnName(Math.max(columns - 1, 0))}${Math.max(rowCount, 1)}`;
  const bold = new Set([0, ...(sheet.boldRows ?? [])]);
  const rows = sheet.rows
    .map((row, rowIndex) => {
      const cells = row
        .map((value, column) =>
          cellXml(
            value,
            `${columnName(column)}${rowIndex + 1}`,
            bold.has(rowIndex) ? 1 : 2,
          ),
        )
        .join("");
      return `<row r="${rowIndex + 1}">${cells}</row>`;
    })
    .join("");
  const cols = columns
    ? `<cols>${widths(sheet, columns)
        .map(
          (width, column) =>
            `<col min="${column + 1}" max="${column + 1}" width="${width}" customWidth="1"/>`,
        )
        .join("")}</cols>`
    : "";
  const hasHeader = rowCount > 0 && columns > 0;
  const filtered = hasHeader && sheet.autoFilter !== false;
  const view = hasHeader
    ? `<sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A2" sqref="A2"/></sheetView>`
    : `<sheetView workbookViewId="0"/>`;
  return (
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
    `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    `<dimension ref="A1:${lastRef}"/>` +
    `<sheetViews>${view}</sheetViews>` +
    `<sheetFormatPr defaultRowHeight="15"/>` +
    cols +
    `<sheetData>${rows}</sheetData>` +
    (filtered ? `<autoFilter ref="A1:${lastRef}"/>` : "") +
    `</worksheet>`
  );
}

const STYLES_XML =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="2"><font><sz val="11"/><name val="Calibri"/><family val="2"/></font><font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font></fonts>` +
  `<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>` +
  `<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>` +
  `<cellXfs count="5">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1" quotePrefix="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1" quotePrefix="1"><alignment vertical="top" wrapText="1"/></xf>` +
  `</cellXfs>` +
  `<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>` +
  `</styleSheet>`;

function quotedSheetName(name: string): string {
  return `'${name.replaceAll("'", "''")}'`;
}

/** A workbook with one worksheet per entry, as the bytes of an .xlsx file. */
export async function buildXlsx(
  sheets: readonly XlsxSheet[],
): Promise<Uint8Array> {
  if (!sheets.length) throw new Error("A workbook needs at least one sheet.");
  const names = sheetNames(sheets);
  const zip = new JSZip();
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
      `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
      `<Default Extension="xml" ContentType="application/xml"/>` +
      `<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>` +
      `<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>` +
      sheets
        .map(
          (_, index) =>
            `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
        )
        .join("") +
      `</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>` +
      `</Relationships>`,
  );
  // Excel records an autofilter range as a hidden defined name per sheet.
  const filterNames = sheets
    .map((sheet, index) => {
      const columns = sheet.rows.reduce(
        (max, row) => Math.max(max, row.length),
        0,
      );
      if (!sheet.rows.length || !columns || sheet.autoFilter === false)
        return "";
      const range = `$A$1:$${columnName(columns - 1)}$${sheet.rows.length}`;
      return `<definedName name="_xlnm._FilterDatabase" localSheetId="${index}" hidden="1">${escapeXml(quotedSheetName(names[index]!))}!${range}</definedName>`;
    })
    .join("");
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<sheets>${names
        .map(
          (name, index) =>
            `<sheet name="${escapeXml(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
        )
        .join("")}</sheets>` +
      (filterNames ? `<definedNames>${filterNames}</definedNames>` : "") +
      `</workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
      sheets
        .map(
          (_, index) =>
            `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
        )
        .join("") +
      `<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
      `</Relationships>`,
  );
  zip.file("xl/styles.xml", STYLES_XML);
  sheets.forEach((sheet, index) =>
    zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet)),
  );
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
