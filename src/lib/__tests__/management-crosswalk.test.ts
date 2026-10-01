import { describe, expect, it } from "vitest";
import {
  CROSSWALK_HEADERS,
  CrosswalkFormatError,
  cisByControl,
  cisForControl,
  crosswalkTemplateCsv,
  parseCrosswalkCsv,
} from "../compliance/management/crosswalk";

// Safeguard ids below are synthetic placeholders (41 and above), not CIS content.

const ISO = "iso-27001-2022";
const NIS2 = "nis2-2022-2555";
const HEADER = "iso27001_control,nis2_measure,cis_safeguard,notes";

describe("crosswalk template", () => {
  const template = crosswalkTemplateCsv();
  const lines = template.split("\n");

  it("starts with the fixed headers and parses to an empty crosswalk", () => {
    expect(lines[0]).toBe(CROSSWALK_HEADERS.join(","));
    expect(parseCrosswalkCsv(template)).toEqual({ rows: [], issues: [] });
  });

  it("contains no safeguard identifiers", () => {
    for (const line of lines) {
      if (!/cis|safeguard/i.test(line)) continue;
      if (line.startsWith("# Example:")) {
        const cisField = line.slice("# Example:".length).trim().split(",")[2];
        expect(cisField).not.toMatch(/\d/);
        continue;
      }
      expect(line).not.toMatch(/\b\d{1,2}\.\d{1,2}\b/);
    }
    expect(template).toContain("<safeguard id>");
    expect(template).toMatch(/memory only/);
  });
});

describe("parseCrosswalkCsv format handling", () => {
  it("strips a UTF-8 BOM", () => {
    const result = parseCrosswalkCsv(`﻿${HEADER}\n8.1,,99.1,\n`);
    expect(result.rows).toEqual([{ iso: "8.1", cis: "99.1" }]);
  });

  it("detects the semicolon delimiter and splits CIS on commas there", () => {
    const result = parseCrosswalkCsv(
      "iso27001_control;nis2_measure;cis_safeguard;notes\r\nA8.1;;99.1,99.2;a, b\r\n",
    );
    expect(result.issues).toEqual([]);
    expect(result.rows).toEqual([
      { iso: "8.1", cis: "99.1", notes: "a, b" },
      { iso: "8.1", cis: "99.2", notes: "a, b" },
    ]);
  });

  it("handles quoted commas, escaped quotes and quoted newlines", () => {
    const result = parseCrosswalkCsv(
      `${HEADER}\n8.1,,"99.1+99.2","say ""hi"", then\nmore"\n8.5,,99.3,\n`,
    );
    expect(result.rows).toEqual([
      { iso: "8.1", cis: "99.1", notes: 'say "hi", then\nmore' },
      { iso: "8.1", cis: "99.2", notes: 'say "hi", then\nmore' },
      { iso: "8.5", cis: "99.3" },
    ]);
  });

  it("accepts headers in any case and order without notes", () => {
    const result = parseCrosswalkCsv(
      " CIS_Safeguard , ISO27001_Control \n99.1,8.7\n",
    );
    expect(result.rows).toEqual([{ iso: "8.7", cis: "99.1" }]);
  });

  it("skips comments and blank lines", () => {
    const result = parseCrosswalkCsv(
      `# leading comment\n\n${HEADER}\n# 8.1,,99.9,\n\n,,,\n8.1,,99.1,\n`,
    );
    expect(result).toEqual({ rows: [{ iso: "8.1", cis: "99.1" }], issues: [] });
  });

  it("throws on a missing required header", () => {
    expect(() => parseCrosswalkCsv("iso27001_control,notes\n8.1,x\n")).toThrow(
      CrosswalkFormatError,
    );
    expect(() => parseCrosswalkCsv("cis_safeguard,notes\n99.1,x\n")).toThrow(
      CrosswalkFormatError,
    );
    expect(() => parseCrosswalkCsv("\n# only comments\n")).toThrow(
      CrosswalkFormatError,
    );
  });

  it("throws on oversized input", () => {
    expect(() => parseCrosswalkCsv(`${HEADER}\n${"x".repeat(1_000_001)}`)).toThrow(
      CrosswalkFormatError,
    );
    const rows = Array.from({ length: 5001 }, () => "8.1,,99.1,").join("\n");
    expect(() => parseCrosswalkCsv(`${HEADER}\n${rows}\n`)).toThrow(
      CrosswalkFormatError,
    );
    const atCap = Array.from({ length: 5000 }, () => "8.1,,99.1,").join("\n");
    expect(parseCrosswalkCsv(`${HEADER}\n${atCap}\n`).rows).toHaveLength(1);
  });
});

describe("parseCrosswalkCsv values", () => {
  it("splits plus-joined and pipe-joined CIS lists and deduplicates", () => {
    const result = parseCrosswalkCsv(
      `${HEADER}\nA8.1,,99.1+99.6+98.1|99.1,\nA.8.1,,99.6,\n`,
    );
    expect(result.rows.map((row) => row.cis)).toEqual(["99.1", "99.6", "98.1"]);
    expect(result.rows.every((row) => row.iso === "8.1")).toBe(true);
  });

  it("normalizes NIS2 codes", () => {
    const cases: [string, string][] = [
      ["21.2.j", "21.2.j"],
      ["21(2)(j)", "21.2.j"],
      ["j", "21.2.j"],
      ["(B)", "21.2.b"],
      ["9B", "21.2.i"],
      ["1A", "21.2.a"],
      ["10A", "21.2.j"],
      ["Nr. 10", "21.2.j"],
    ];
    const csv = [
      "nis2_measure,cis_safeguard",
      ...cases.map(([code]) => `${code},99.1`),
    ].join("\n");
    const result = parseCrosswalkCsv(csv);
    expect(result.issues).toEqual([]);
    expect(result.rows.map((row) => row.nis2)).toEqual([
      ...new Set(cases.map(([, id]) => id)),
    ]);
  });

  it("expands several NIS2 codes in one cell", () => {
    const result = parseCrosswalkCsv(
      `${HEADER}\n8.1,9B|10A + 2A,99.1+99.2,\n`,
    );
    expect(result.issues).toEqual([]);
    expect(result.rows).toHaveLength(6);
    expect(new Set(result.rows.map((row) => row.nis2))).toEqual(
      new Set(["21.2.i", "21.2.j", "21.2.b"]),
    );
    expect(result.rows.every((row) => row.iso === "8.1")).toBe(true);
  });

  it("reports bad rows as issues with their line numbers", () => {
    const csv = [
      "# comment", // 1
      HEADER, // 2
      "8.1,,99.1,", // 3
      "", // 4
      'Z9.9,,99.1,"multi', // 5
      'line"', // 6
      "8.2,,not-an-id,", // 7
      "8.3,11A,99.4+bad,", // 8
      ",,99.5,", // 9
    ].join("\n");
    const result = parseCrosswalkCsv(csv);
    expect(result.issues.map((issue) => issue.line)).toEqual([5, 7, 8, 9]);
    expect(result.rows).toEqual([
      { iso: "8.1", cis: "99.1" },
      { iso: "8.3", cis: "99.4" },
    ]);
  });
});

describe("cisForControl", () => {
  const crosswalk = parseCrosswalkCsv(
    [
      HEADER,
      "8.1,10A,50.1+41.10+41.1,",
      "A8.1,,41.2|41.1,",
      "8.5,9B,47.3,",
    ].join("\n"),
  );

  it("joins on ISO controls and sorts numerically", () => {
    expect(cisForControl(crosswalk, ISO, "8.1")).toEqual([
      "41.1",
      "41.2",
      "41.10",
      "50.1",
    ]);
    expect(cisForControl(crosswalk, ISO, "5.1")).toEqual([]);
  });

  it("joins on NIS2 measures", () => {
    expect(cisForControl(crosswalk, NIS2, "21.2.j")).toEqual([
      "41.1",
      "41.10",
      "50.1",
    ]);
    expect(cisForControl(crosswalk, NIS2, "21.2.i")).toEqual(["47.3"]);
  });

  it("returns nothing for other frameworks", () => {
    expect(cisForControl(crosswalk, "nist-800-53-r5", "8.1")).toEqual([]);
  });

  it("maps several controls and omits empty ones", () => {
    expect(cisByControl(crosswalk, ISO, ["8.1", "8.5", "8.9"])).toEqual({
      "8.1": ["41.1", "41.2", "41.10", "50.1"],
      "8.5": ["47.3"],
    });
  });
});
