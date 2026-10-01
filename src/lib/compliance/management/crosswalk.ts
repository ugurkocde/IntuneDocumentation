import { nis2MeasureFromCode as normalizeNis2 } from "../frameworks/nis2";
import type { Crosswalk, CrosswalkIssue, CrosswalkRow } from "./types";

// Customer-supplied crosswalk from ISO/IEC 27001:2022 Annex A controls and
// NIS2 Article 21(2) measures to CIS Controls safeguard identifiers. The
// product ships no CIS content: the template only names the columns, and every
// safeguard identifier comes from the customer's file. Parsing is pure; the
// caller decides where the result lives (the desktop app keeps it in memory).

export const CROSSWALK_HEADERS = [
  "iso27001_control",
  "nis2_measure",
  "cis_safeguard",
  "notes",
] as const;

type CrosswalkHeader = (typeof CROSSWALK_HEADERS)[number];

export const CROSSWALK_MAX_BYTES = 1_000_000;
export const CROSSWALK_MAX_ROWS = 5000;

const ISO_FRAMEWORK_ID = "iso-27001-2022";
const NIS2_FRAMEWORK_ID = "nis2-2022-2555";

const CIS_ID = /^\d{1,2}\.\d{1,2}$/;
const ISO_ANNEX_A = /^[5-8]\.\d{1,2}$/;

export class CrosswalkFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CrosswalkFormatError";
  }
}

export function crosswalkTemplateCsv(): string {
  return [
    CROSSWALK_HEADERS.join(","),
    "# Crosswalk template. You fill in this file from your own licensed sources; the app ships no CIS Controls content.",
    "# The app reads the file into memory only and never stores it on disk.",
    "# Lines starting with # and blank lines are ignored. Comma or semicolon separated files both work.",
    "# iso27001_control: one ISO/IEC 27001:2022 Annex A control such as 8.1 or A8.1.",
    "# nis2_measure: NIS2 Article 21(2) measure such as 21.2.j or j or a national code such as 10A. Separate several with | or +.",
    "# cis_safeguard: the CIS Controls safeguard ids from your licensed copy. Separate several with + or |.",
    "# notes: optional free text.",
    "# Fill in iso27001_control or nis2_measure (or both) plus cis_safeguard on every row.",
    "# Example: A8.1,10A,<safeguard id>+<safeguard id>,Endpoint devices",
    "",
  ].join("\n");
}

/** Normalizes ISO input such as "A8.1", "A.8.1" or "8.1" to "8.1". */
function normalizeIso(value: string): string | null {
  const id = value.trim().replace(/^A\.?\s*/i, "");
  return ISO_ANNEX_A.test(id) ? id : null;
}

interface CsvRecord {
  line: number;
  fields: string[];
}

function detectDelimiter(text: string): "," | ";" {
  for (const raw of text.split(/\r\n|\n|\r/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let commas = 0;
    let semicolons = 0;
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (!quoted && char === ",") commas++;
      else if (!quoted && char === ";") semicolons++;
    }
    return semicolons > commas ? ";" : ",";
  }
  return ",";
}

/**
 * RFC 4180 records with the one-based line each record starts on. Blank lines
 * and lines starting with "#" outside quotes are skipped.
 */
function parseRecords(text: string, delimiter: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let line = 1;
  let i = 0;
  const atLineEnd = () =>
    i >= text.length || text[i] === "\n" || text[i] === "\r";
  const consumeLineEnd = () => {
    if (text[i] === "\r" && text[i + 1] === "\n") i++;
    i++;
    line++;
  };

  while (i < text.length) {
    if (text[i] === "#") {
      while (!atLineEnd()) i++;
      if (i < text.length) consumeLineEnd();
      continue;
    }
    const start = line;
    const fields: string[] = [];
    let field = "";
    let quoted = false;
    for (;;) {
      if (i >= text.length) {
        fields.push(field);
        break;
      }
      const char = text[i];
      if (quoted) {
        if (char === '"') {
          if (text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            quoted = false;
            i++;
          }
        } else {
          if (char === "\n" || (char === "\r" && text[i + 1] !== "\n")) line++;
          field += char;
          i++;
        }
      } else if (char === '"' && field.trim() === "") {
        field = "";
        quoted = true;
        i++;
      } else if (char === delimiter) {
        fields.push(field);
        field = "";
        i++;
      } else if (char === "\n" || char === "\r") {
        fields.push(field);
        consumeLineEnd();
        break;
      } else {
        field += char;
        i++;
      }
    }
    if (fields.some((value) => value.trim() !== "")) {
      records.push({ line: start, fields });
    }
  }
  return records;
}

function splitList(value: string, separators: RegExp): string[] {
  return value
    .split(separators)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** NIS2 cells may hold several codes; "Nr. 10" contains a space, so try each part whole first. */
function parseNis2Cell(value: string, extra: string): { ids: string[]; invalid: string[] } {
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const part of splitList(value, new RegExp(`[|+${extra}]`))) {
    const whole = normalizeNis2(part);
    if (whole) {
      ids.push(whole);
      continue;
    }
    for (const token of splitList(part, /\s+/)) {
      const id = normalizeNis2(token);
      if (id) ids.push(id);
      else invalid.push(token);
    }
  }
  return { ids: [...new Set(ids)], invalid };
}

export function parseCrosswalkCsv(text: string): Crosswalk {
  if (
    text.length > CROSSWALK_MAX_BYTES ||
    new TextEncoder().encode(text).length > CROSSWALK_MAX_BYTES
  ) {
    throw new CrosswalkFormatError("The crosswalk file is larger than 1 MB.");
  }
  const source = text.replace(/^﻿/, "");
  const delimiter = detectDelimiter(source);
  const [header, ...data] = parseRecords(source, delimiter);
  if (!header) {
    throw new CrosswalkFormatError("The crosswalk file has no header line.");
  }

  const columns = new Map<CrosswalkHeader, number>();
  header.fields.forEach((name, index) => {
    const key = name.trim().toLowerCase() as CrosswalkHeader;
    if (CROSSWALK_HEADERS.includes(key) && !columns.has(key)) {
      columns.set(key, index);
    }
  });
  if (
    !columns.has("cis_safeguard") ||
    (!columns.has("iso27001_control") && !columns.has("nis2_measure"))
  ) {
    throw new CrosswalkFormatError(
      "The header must contain cis_safeguard and at least one of iso27001_control or nis2_measure.",
    );
  }
  if (data.length > CROSSWALK_MAX_ROWS) {
    throw new CrosswalkFormatError(
      `The crosswalk file has more than ${CROSSWALK_MAX_ROWS} rows.`,
    );
  }

  const cell = (record: CsvRecord, key: CrosswalkHeader) => {
    const index = columns.get(key);
    return index === undefined ? "" : (record.fields[index] ?? "").trim();
  };
  const extra = delimiter === ";" ? "," : "";
  const cisSeparators = new RegExp(`[+|${extra}\\s]+`);

  const rows: CrosswalkRow[] = [];
  const issues: CrosswalkIssue[] = [];
  const seen = new Set<string>();

  for (const record of data) {
    const problems: string[] = [];
    const isoCell = cell(record, "iso27001_control");
    const iso = isoCell ? normalizeIso(isoCell) : null;
    if (isoCell && !iso) problems.push(`unrecognized ISO control "${isoCell}"`);

    const nis2Cell = cell(record, "nis2_measure");
    const nis2 = parseNis2Cell(nis2Cell, extra);
    if (nis2.invalid.length > 0) {
      problems.push(`unrecognized NIS2 measure "${nis2.invalid.join(" ")}"`);
    }

    const cisTokens = splitList(cell(record, "cis_safeguard"), cisSeparators);
    const cis = [...new Set(cisTokens.filter((id) => CIS_ID.test(id)))];
    const badCis = cisTokens.filter((id) => !CIS_ID.test(id));
    if (badCis.length > 0) {
      problems.push(`unrecognized safeguard id "${badCis.join(" ")}"`);
    }

    if (!iso && nis2.ids.length === 0) {
      problems.push("no valid ISO control or NIS2 measure");
    }
    if (cis.length === 0) problems.push("no valid safeguard id");
    if (problems.length > 0) {
      issues.push({ line: record.line, message: problems.join("; ") });
    }
    if ((!iso && nis2.ids.length === 0) || cis.length === 0) continue;

    const notes = cell(record, "notes");
    const measures: (string | undefined)[] =
      nis2.ids.length > 0 ? nis2.ids : [undefined];
    for (const measure of measures) {
      for (const id of cis) {
        const key = `${iso ?? ""}|${measure ?? ""}|${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          ...(iso ? { iso } : {}),
          ...(measure ? { nis2: measure } : {}),
          cis: id,
          ...(notes ? { notes } : {}),
        });
      }
    }
  }
  return { rows, issues };
}

function compareCisIds(a: string, b: string): number {
  const [aMajor = 0, aMinor = 0] = a.split(".").map(Number);
  const [bMajor = 0, bMinor = 0] = b.split(".").map(Number);
  return aMajor - bMajor || aMinor - bMinor;
}

export function cisForControl(
  crosswalk: Crosswalk,
  frameworkId: string,
  controlId: string,
): string[] {
  let matches: (row: CrosswalkRow) => boolean;
  if (frameworkId === ISO_FRAMEWORK_ID) {
    const iso = normalizeIso(controlId);
    matches = (row) => iso !== null && row.iso === iso;
  } else if (frameworkId === NIS2_FRAMEWORK_ID) {
    const nis2 = normalizeNis2(controlId);
    matches = (row) => nis2 !== null && row.nis2 === nis2;
  } else {
    return [];
  }
  const ids = new Set(crosswalk.rows.filter(matches).map((row) => row.cis));
  return [...ids].sort(compareCisIds);
}

export function cisByControl(
  crosswalk: Crosswalk,
  frameworkId: string,
  controlIds: readonly string[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const controlId of controlIds) {
    const ids = cisForControl(crosswalk, frameworkId, controlId);
    if (ids.length > 0) result[controlId] = ids;
  }
  return result;
}
