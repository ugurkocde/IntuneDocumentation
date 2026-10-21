import jsPDF from "jspdf";
import { describe, expect, it } from "vitest";
import {
  applyTheme,
  brandingTheme,
  drawCoverHeadline,
  drawCoverMasthead,
  drawDocumentControlGrid,
  drawRunningChrome,
  drawToc,
  layoutToc,
  pageFrame,
  tableHeaderLines,
  type TocItem,
} from "../compliance/pdf-chrome";
import {
  PALETTE,
  dateParts,
  fontFamily,
  hexToRgb,
  mixColor,
  pdfUtcDate,
  setFont,
  setFontFamily,
  textWidth,
} from "../compliance/pdf-kit";
import { readPdfPageTexts } from "./helpers/pdf-outline";

const newDoc = () =>
  new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

const bytes = (doc: jsPDF) => new Uint8Array(doc.output("arraybuffer"));

/** jsPDF 3 method missing from the bundled type declarations. */
const currentFont = (doc: jsPDF) =>
  (
    doc as unknown as { getFont(): { fontName: string; fontStyle: string } }
  ).getFont();

describe("pdf kit helpers", () => {
  it("parses hex colours and mixes towards a target", () => {
    expect(hexToRgb("#00a652", PALETTE.navy)).toEqual([0, 166, 82]);
    expect(hexToRgb("abc", PALETTE.navy)).toEqual(PALETTE.navy);
    expect(hexToRgb(undefined, PALETTE.blue)).toEqual(PALETTE.blue);
    expect(mixColor([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
  });

  it("formats fixed dates in UTC", () => {
    const date = new Date("2026-10-08T23:30:05Z");
    expect(dateParts(date, true)).toMatchObject({
      year: "2026",
      month: "10",
      day: "08",
      hours: "23",
      minutes: "30",
      seconds: "05",
    });
    expect(pdfUtcDate(date)).toBe("D:20261008233005+00'00'");
  });

  it("uses Helvetica unless a document registers another family", () => {
    const doc = newDoc();
    const other = newDoc();
    setFont(doc, 9);
    expect(currentFont(doc).fontName).toBe("helvetica");
    const helveticaWidth = textWidth(doc, "Configuration", 9);
    setFontFamily(doc, "times");
    expect(fontFamily(doc)).toBe("times");
    setFont(doc, 9, "bold");
    expect(currentFont(doc).fontName).toBe("times");
    expect(currentFont(doc).fontStyle).toBe("bold");
    expect(textWidth(doc, "Configuration", 9)).not.toBe(helveticaWidth);
    setFont(other, 9);
    expect(currentFont(other).fontName).toBe("helvetica");
    setFontFamily(doc, undefined);
    expect(fontFamily(doc)).toBe("helvetica");
  });
});

describe("pdf chrome", () => {
  it("resolves branding colours and registers the theme font", () => {
    expect(brandingTheme(undefined)).toEqual({
      primary: PALETTE.navy,
      secondary: PALETTE.blue,
      accent: PALETTE.green,
      text: PALETTE.ink,
    });
    const theme = brandingTheme(
      {
        colors: {
          primary: "#112233",
          secondary: "#445566",
          accent: "#778899",
          text: "#000000",
        },
      },
      "courier",
    );
    expect(theme).toEqual({
      primary: [17, 34, 51],
      secondary: [68, 85, 102],
      accent: [119, 136, 153],
      text: [0, 0, 0],
      fontFamily: "courier",
    });
    const doc = newDoc();
    applyTheme(doc, theme);
    expect(fontFamily(doc)).toBe("courier");
  });

  it("describes the A4 grid", () => {
    const frame = pageFrame(newDoc());
    expect(frame.margin).toBe(15);
    expect(frame.right).toBeCloseTo(195, 2);
    expect(frame.contentWidth).toBeCloseTo(180, 2);
    expect(frame.contentTop).toBe(21);
    expect(frame.contentBottom).toBe(276);
  });

  it("leaves out document control cells without a value", () => {
    const doc = newDoc();
    const frame = pageFrame(doc);
    const bottom = drawDocumentControlGrid(
      doc,
      brandingTheme(undefined),
      frame,
      222,
      "Document control",
      [
        { label: "Organization", value: "Contoso" },
        { label: "Prepared by", value: undefined },
        { label: "Contact", value: "" },
        { label: "Version", value: "1.0" },
      ],
    );
    const [page] = readPdfPageTexts(bytes(doc));
    expect(page).toContain("(Organization) Tj");
    expect(page).toContain("(Version) Tj");
    expect(page).not.toContain("(Prepared by) Tj");
    expect(page).not.toContain("(Contact) Tj");
    // One row of two cells.
    expect(bottom).toBeCloseTo(222 + 5 + 13, 6);
  });

  it("wraps scoped cover titles to three lines with an ellipsis", () => {
    const doc = newDoc();
    const { titleBottom } = drawCoverHeadline(
      doc,
      brandingTheme(undefined),
      pageFrame(doc),
      {
        eyebrow: "Intune Configuration Export",
        title: Array.from({ length: 40 }, (_, index) => `Word${index}`).join(
          " ",
        ),
        titleMaxLines: 3,
        subtitle: "Configuration Documentation",
        lead: "Lead",
      },
    );
    const [page] = readPdfPageTexts(bytes(doc));
    const titleRuns = [...page!.matchAll(/\((Word[^)]*)\) Tj/g)].map(
      (match) => match[1]!,
    );
    expect(titleRuns).toHaveLength(3);
    expect(titleRuns[2]).toMatch(/\.\.\.$/);
    expect(titleBottom).toBeCloseTo(70 + 2 * 24 * 0.42, 6);
  });

  it("leaves out an empty cover lead", () => {
    const doc = newDoc();
    const { titleBottom, bottom } = drawCoverHeadline(
      doc,
      brandingTheme(undefined),
      pageFrame(doc),
      {
        eyebrow: "Intune Configuration Export",
        title: "Title",
        subtitle: "Configuration Documentation",
        lead: "",
      },
    );
    const [page] = readPdfPageTexts(bytes(doc));
    expect(page).not.toContain("() Tj");
    expect(bottom).toBeCloseTo(titleBottom + 13.5, 6);
  });

  it("splits table header labels at words that do not fit", () => {
    const doc = newDoc();
    expect(tableHeaderLines(doc, "Not applicable", 18.4)).toEqual([
      "Not",
      "applicable",
    ]);
    expect(tableHeaderLines(doc, "Policy", 58)).toEqual(["Policy"]);
  });

  it("continues the contents on inserted pages with links", () => {
    const doc = newDoc();
    doc.addPage();
    for (let page = 0; page < 40; page += 1) doc.addPage();
    const frame = pageFrame(doc);
    const entries = Array.from(
      { length: 140 },
      (_, index): TocItem => ({
        title: `Entry ${index + 1}`,
        page: 3 + (index % 30),
        level: index % 10 === 0 ? 0 : 1,
      }),
    );
    const { rows, extraPages } = layoutToc(doc, frame, entries, 21);
    expect(extraPages).toBeGreaterThan(0);
    for (const row of rows)
      expect(row.y + row.height).toBeLessThanOrEqual(frame.contentBottom);
    expect(new Set(rows.map((row) => row.pageOffset)).size).toBe(
      extraPages + 1,
    );
    const pagesBefore = doc.internal.getNumberOfPages();
    for (const entry of entries) entry.page += extraPages;
    drawToc(doc, brandingTheme(undefined), frame, {
      heading: "Contents",
      tocPage: 2,
      startY: 21,
      rows,
      extraPages,
    });
    expect(doc.internal.getNumberOfPages()).toBe(pagesBefore + extraPages);
    const pdf = bytes(doc);
    const pages = readPdfPageTexts(pdf);
    for (let offset = 0; offset <= extraPages; offset += 1)
      expect(pages[1 + offset]).toContain("(Contents) Tj");
    expect(pages[1]).toContain("(Entry 1) Tj");
    expect(pages[1 + extraPages]).toContain("(Entry 140) Tj");
    const links = Buffer.from(pdf)
      .toString("latin1")
      .match(/\/Subtype \/Link/g);
    expect(links).toHaveLength(entries.length);
  });

  it("draws on inserted contents pages before their rows", () => {
    const doc = newDoc();
    doc.addPage();
    for (let page = 0; page < 5; page += 1) doc.addPage();
    const frame = pageFrame(doc);
    const entries = Array.from(
      { length: 60 },
      (_, index): TocItem => ({
        title: `Entry ${index + 1}`,
        page: 3,
        level: 0,
      }),
    );
    const { rows, extraPages } = layoutToc(doc, frame, entries, 21);
    expect(extraPages).toBeGreaterThan(0);
    const inserted: number[] = [];
    drawToc(doc, brandingTheme(undefined), frame, {
      heading: "Contents",
      tocPage: 2,
      startY: 21,
      rows,
      extraPages,
      onInsertPage: (page) => {
        inserted.push(page);
        doc.text("Mark", 20, 150);
      },
    });
    expect(inserted).toEqual(
      Array.from({ length: extraPages }, (_, index) => 3 + index),
    );
    const pages = readPdfPageTexts(bytes(doc));
    const page = pages[2] ?? "";
    expect(page.indexOf("(Mark) Tj")).toBeGreaterThanOrEqual(0);
    expect(page.indexOf("(Mark) Tj")).toBeLessThan(
      page.indexOf("(Contents) Tj"),
    );
  });

  it("insets the header note and footer text for logos", () => {
    const xOf = (inset: number, label: string) => {
      const doc = newDoc();
      doc.addPage();
      drawRunningChrome(doc, brandingTheme(undefined), pageFrame(doc), {
        title: "Title",
        headerRight: "Header note",
        headerRightInset: inset,
        footer: "Footer text",
        footerInset: inset,
        pageLabel: (page, count) => `Page ${page} of ${count}`,
      });
      const page = readPdfPageTexts(bytes(doc))[1] ?? "";
      const match = new RegExp(
        `(-?[\\d.]+) -?[\\d.]+ Td\\n\\(${label}\\) Tj`,
      ).exec(page);
      return Number(match?.[1]);
    };
    const mm = 72 / 25.4;
    expect(xOf(10, "Footer text") - xOf(0, "Footer text")).toBeCloseTo(
      10 * mm,
      3,
    );
    expect(xOf(0, "Header note") - xOf(12, "Header note")).toBeCloseTo(
      12 * mm,
      3,
    );
  });

  it("numbers running pages from the second page", () => {
    const doc = newDoc();
    doc.addPage();
    doc.addPage();
    drawRunningChrome(doc, brandingTheme(undefined), pageFrame(doc), {
      title: "Intune Documentation",
      headerRight: "1a2b3c4d...",
      footer: "Intune Documentation",
      footerCentre: "Confidential",
      pageLabel: (page, count) => `Page ${page} of ${count}`,
    });
    const pages = readPdfPageTexts(bytes(doc));
    expect(pages[0]).not.toContain("Page 1 of 3");
    expect(pages[1]).toContain("(Page 2 of 3) Tj");
    expect(pages[2]).toContain("(Page 3 of 3) Tj");
    expect(pages[2]).toContain("(Confidential) Tj");
    expect(pages[2]).toContain("(1a2b3c4d...) Tj");
  });
});

describe("cover masthead logo sizing", () => {
  const SQUARE_PNG =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgSDvDsCyIgcE47f///wAekQXBjgK93AAAAABJRU5ErkJggg==";
  // Width and height in points of the image drawn on the page.
  const imageSize = (doc: jsPDF) => {
    const page = /([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm\n\/I\d+ Do/.exec(
      doc.output(),
    );
    return page ? [Number(page[1]), Number(page[2])] : null;
  };
  const draw = (keepLogoRatio?: boolean) => {
    const doc = newDoc();
    drawCoverMasthead(doc, brandingTheme(undefined), pageFrame(doc), {
      productName: "Intune Documentation",
      logo: { dataUrl: SQUARE_PNG, height: 10 },
      ...(keepLogoRatio ? { keepLogoRatio } : {}),
    });
    return imageSize(doc);
  };
  const mm = 72 / 25.4;

  it("keeps the compliance report's original size for a height only logo", () => {
    expect(draw()?.map((value) => Math.round(value / mm))).toEqual([36, 10]);
  });

  it("keeps the image ratio for the documentation export", () => {
    expect(draw(true)?.map((value) => Math.round(value / mm))).toEqual([
      10, 10,
    ]);
  });
});
