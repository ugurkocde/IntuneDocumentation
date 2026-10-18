import { DOMParser } from "@xmldom/xmldom";

const SHEET_NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

export function parseXml(xml: string) {
  return new DOMParser({
    onError: (level, message) => {
      throw new Error(`${level}: ${message}`);
    },
  }).parseFromString(xml, "application/xml");
}

/** Cell values of a worksheet by reference, e.g. { A1: "Name" }. */
export function sheetCells(xml: string): Record<string, string> {
  const cells: Record<string, string> = {};
  const nodes = parseXml(xml).getElementsByTagNameNS(SHEET_NS, "c");
  for (let index = 0; index < nodes.length; index += 1) {
    const cell = nodes.item(index)!;
    cells[cell.getAttribute("r")!] = cell.textContent ?? "";
  }
  return cells;
}

/** Style index (the s attribute) of every cell by reference. */
export function sheetCellStyles(xml: string): Record<string, string> {
  const styles: Record<string, string> = {};
  const nodes = parseXml(xml).getElementsByTagNameNS(SHEET_NS, "c");
  for (let index = 0; index < nodes.length; index += 1) {
    const cell = nodes.item(index)!;
    styles[cell.getAttribute("r")!] = cell.getAttribute("s") ?? "";
  }
  return styles;
}

/** Cell formats (cellXfs) of styles.xml, with their quotePrefix flag. */
export function quotePrefixStyles(xml: string): boolean[] {
  const cellXfs = parseXml(xml).getElementsByTagNameNS(SHEET_NS, "cellXfs");
  const formats = cellXfs.item(0)!.getElementsByTagNameNS(SHEET_NS, "xf");
  return Array.from(
    { length: formats.length },
    (_, index) => formats.item(index)!.getAttribute("quotePrefix") === "1",
  );
}

/** Minimal RFC 4180 reader for assertions. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const body = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index]!;
    if (quoted) {
      if (char === '"' && body[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r" && body[index + 1] === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      index += 1;
    } else field += char;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}
