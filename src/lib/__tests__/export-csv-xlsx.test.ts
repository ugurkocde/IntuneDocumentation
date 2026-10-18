import { describe, expect, it } from "vitest";
import {
  buildXlsx,
  columnName,
  csvField,
  neutraliseFormula,
  stripIllegalXml,
  toCsv,
} from "../compliance/export";
import {
  parseCsv,
  parseXml,
  quotePrefixStyles,
  sheetCellStyles,
  sheetCells,
} from "./helpers/export-sheet";
import { extractZipEntry } from "./helpers/zip";

describe("neutraliseFormula", () => {
  it.each([
    ["=SUM(A1:A2)", "'=SUM(A1:A2)"],
    ["+1", "'+1"],
    ["-2", "'-2"],
    ["@cmd", "'@cmd"],
    ["|calc", "'|calc"],
    ["%PATH%", "'%PATH%"],
    ["\tTab", "'\tTab"],
    ["\rReturn", "'\rReturn"],
    ["\nLine", "'\nLine"],
    ['   =HYPERLINK("x")', '\'   =HYPERLINK("x")'],
    ["Windows - BitLocker", "Windows - BitLocker"],
    ["a=b", "a=b"],
    ["", ""],
  ])("%j becomes %j", (input, expected) => {
    expect(neutraliseFormula(input)).toBe(expected);
  });
});

describe("toCsv", () => {
  it("quotes fields with comma, quote, CR or LF and ends records with CRLF", () => {
    expect(csvField("plain")).toBe("plain");
    expect(csvField("a,b")).toBe('"a,b"');
    expect(csvField('say "hi"')).toBe('"say ""hi"""');
    expect(csvField("one\ntwo")).toBe('"one\ntwo"');
    expect(csvField("one\rtwo")).toBe('"one\rtwo"');
    expect(csvField(null)).toBe("");
    expect(csvField(3)).toBe("3");
    expect(
      toCsv([
        ["a", "b"],
        ["c", "d"],
      ]),
    ).toBe("a,b\r\nc,d\r\n");
  });

  it("adds a byte order mark on request and neutralises every text cell", () => {
    const csv = toCsv(
      [
        ["Policy", "Count"],
        ["=cmd|' /C calc'!A0", -1],
      ],
      { bom: true },
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(parseCsv(csv)).toEqual([
      ["Policy", "Count"],
      ["'=cmd|' /C calc'!A0", "-1"],
    ]);
  });
});

describe("buildXlsx", () => {
  const tricky = [
    "a & b <c> \"d\" 'e'",
    "line one\nline two",
    "=1+1",
    "bad\u0001control",
    "emoji \uD83D\uDE00 kept",
    "lone \uD800 surrogate",
  ];

  it("writes every required part and every XML part parses", async () => {
    const bytes = await buildXlsx([
      { name: "Checks", rows: [["Header"], ...tricky.map((value) => [value])] },
      { name: "About: x", rows: [["Field", "Value"]], autoFilter: false },
    ]);
    const parts = [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      "xl/worksheets/sheet1.xml",
      "xl/worksheets/sheet2.xml",
    ];
    for (const part of parts)
      expect(() => parseXml(extractZipEntry(bytes, part)), part).not.toThrow();
    const workbook = extractZipEntry(bytes, "xl/workbook.xml");
    expect(workbook).toContain('name="Checks"');
    expect(workbook).toContain('name="About  x"');
    expect(workbook).toContain("_xlnm._FilterDatabase");
    const sheet = extractZipEntry(bytes, "xl/worksheets/sheet1.xml");
    expect(sheet).toContain('state="frozen"');
    expect(sheet).toContain('<autoFilter ref="A1:A7"/>');
    expect(sheet).toContain('t="inlineStr"');
    expect(extractZipEntry(bytes, "xl/worksheets/sheet2.xml")).not.toContain(
      "autoFilter",
    );
  });

  it("round-trips cell text with escaping, neutralisation and illegal characters removed", async () => {
    const bytes = await buildXlsx([
      {
        name: "Data",
        rows: [
          ["Text", "Number", "Flag"],
          ...tricky.map((value) => [value, 7, true]),
        ],
      },
    ]);
    const xml = extractZipEntry(bytes, "xl/worksheets/sheet1.xml");
    const cells = sheetCells(xml);
    expect(cells.A1).toBe("Text");
    expect(cells.A2).toBe(tricky[0]);
    expect(cells.A3).toBe("line one\nline two");
    // Formula-like text keeps its value under a quote prefix style, not a
    // visible apostrophe; plain text keeps the ordinary body style.
    expect(cells.A4).toBe("=1+1");
    const quoted = quotePrefixStyles(extractZipEntry(bytes, "xl/styles.xml"));
    const styles = sheetCellStyles(xml);
    expect(quoted[Number(styles.A4)]).toBe(true);
    expect(quoted[Number(styles.A2)]).toBe(false);
    expect(quoted[Number(styles.A1)]).toBe(false);
    expect(cells.A5).toBe("badcontrol");
    expect(cells.A6).toBe("emoji \uD83D\uDE00 kept");
    expect(cells.A7).toBe("lone  surrogate");
    expect(cells.B2).toBe("7");
    expect(cells.C2).toBe("1");
  });

  it("names columns and strips characters that XML 1.0 forbids", () => {
    expect(columnName(0)).toBe("A");
    expect(columnName(25)).toBe("Z");
    expect(columnName(26)).toBe("AA");
    expect(columnName(701)).toBe("ZZ");
    expect(columnName(702)).toBe("AAA");
    expect(stripIllegalXml("a\u0000b\u000Bc\uFFFEd\te")).toBe("abcd\te");
  });

  it("keeps duplicate sheet names unique", async () => {
    const bytes = await buildXlsx([
      { name: "Data", rows: [["a"]] },
      { name: "data", rows: [["b"]] },
    ]);
    const workbook = extractZipEntry(bytes, "xl/workbook.xml");
    expect(workbook).toContain('name="Data"');
    expect(workbook).toContain('name="data 2"');
  });
});
