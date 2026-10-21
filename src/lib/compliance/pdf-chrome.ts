import type jsPDF from "jspdf";
import type { BrandingOptions } from "~/types/branding";
import {
  COVER_LOGO_BOX,
  PALETTE,
  capHeight,
  clampLine,
  drawDonut,
  drawEyebrow,
  drawLines,
  drawRule,
  fitFontSize,
  fitLogo,
  hexToRgb,
  mixColor,
  setFont,
  setFontFamily,
  textWidth,
  wrapLines,
  type FontStyle,
  type RgbColor,
} from "./pdf-kit";

// Page level composites of the evidence report design: cover, document
// control grid, page and section titles, table header and rows, contents and
// the running header and footer. Each takes a theme for colours and a frame
// for the page grid. Composites that flow with the content take the top y in
// mm and return the y below what they drew.

export interface PdfTheme {
  primary: RgbColor;
  secondary: RgbColor;
  accent: RgbColor;
  text: RgbColor;
  /** jsPDF font family for setFont; Helvetica when absent. */
  fontFamily?: string;
}

/** Branding colours over the default palette, as the evidence report uses. */
export function brandingTheme(
  branding: BrandingOptions | undefined,
  fontFamily?: string,
): PdfTheme {
  return {
    primary: hexToRgb(branding?.colors?.primary, PALETTE.navy),
    secondary: hexToRgb(branding?.colors?.secondary, PALETTE.blue),
    accent: hexToRgb(branding?.colors?.accent, PALETTE.green),
    text: hexToRgb(branding?.colors?.text, PALETTE.ink),
    ...(fontFamily ? { fontFamily } : {}),
  };
}

/** Registers the theme's font family for every kit and chrome call on doc. */
export function applyTheme(doc: jsPDF, theme: PdfTheme) {
  setFontFamily(doc, theme.fontFamily);
}

export interface PdfFrame {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  right: number;
  contentWidth: number;
  contentTop: number;
  contentBottom: number;
}

export function pageFrame(
  doc: jsPDF,
  grid: { margin?: number; contentTop?: number; contentBottom?: number } = {},
): PdfFrame {
  const pageWidth = doc.internal.pageSize.width;
  const margin = grid.margin ?? 15;
  return {
    pageWidth,
    pageHeight: doc.internal.pageSize.height,
    margin,
    right: pageWidth - margin,
    contentWidth: pageWidth - margin * 2,
    contentTop: grid.contentTop ?? 21,
    contentBottom: grid.contentBottom ?? 276,
  };
}

interface ImagePropertiesProvider {
  getImageProperties: (dataUrl: string) => { width: number; height: number };
}

// ---------------------------------------------------------------- Cover

/**
 * Full bleed band in the primary colour with the decorative rings. The middle
 * ring shows ringFraction (0 to 1) as an arc.
 */
export function drawCoverBackground(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  options: { height?: number; ringFraction?: number } = {},
) {
  doc.setFillColor(...theme.primary);
  doc.rect(0, 0, frame.pageWidth, options.height ?? 134, "F");
  const ringSoft = mixColor(theme.primary, theme.secondary, 0.16);
  const ringStrong = mixColor(theme.primary, theme.secondary, 0.4);
  const ringX = 173;
  const ringY = 55;
  doc.setDrawColor(...ringSoft);
  doc.setLineWidth(0.6);
  doc.circle(ringX, ringY, 70, "S");
  doc.circle(ringX, ringY, 38, "S");
  drawDonut(
    doc,
    ringX,
    ringY,
    56,
    10,
    [{ value: options.ringFraction ?? 0, color: ringStrong }],
    1,
    ringSoft,
  );
}

export interface CoverLogo {
  dataUrl: string;
  /** mm; at most 44, default 36. */
  width?: number;
  /** mm; at most 14. Either dimension alone keeps the image ratio. */
  height?: number;
}

/**
 * Product mark and name top left; the custom logo in a white box top right,
 * or the company name when there is no logo or it cannot be read. Returns the
 * top of the free space in the right column below them.
 */
export function drawCoverMasthead(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  options: {
    productName: string;
    logo?: CoverLogo;
    companyName?: string;
    /** Fit the logo keeping its image ratio (documentation export). */
    keepLogoRatio?: boolean;
  },
): number {
  const { margin, right } = frame;
  doc.setFillColor(...theme.secondary);
  doc.roundedRect(margin, 14, 6.5, 6.5, 1.4, 1.4, "F");
  doc.setFillColor(...PALETTE.white);
  [
    [15.5, 3.9],
    [16.9, 3],
    [18.3, 2.2],
  ].forEach(([barY, barWidth]) =>
    doc.roundedRect(
      margin + 1.3,
      barY ?? 0,
      barWidth ?? 0,
      0.7,
      0.35,
      0.35,
      "F",
    ),
  );
  doc.setFillColor(...theme.accent);
  doc.circle(margin + 6.5 - 1.85, 14 + 6.5 - 1.85, 0.75, "F");
  setFont(doc, 9.5, "bold", PALETTE.white);
  doc.text(options.productName, margin + 9, 18.7);

  let rightTop = 13;
  const logoDataUrl = options.logo?.dataUrl;
  let logoDrawn = false;
  if (logoDataUrl) {
    try {
      const properties = (
        doc as unknown as ImagePropertiesProvider
      ).getImageProperties(logoDataUrl);
      let width: number;
      let height: number;
      if (options.keepLogoRatio) {
        // A height alone keeps the image ratio rather than a 36 mm width.
        ({ widthMm: width, heightMm: height } = fitLogo(
          options.logo ?? {},
          properties,
          COVER_LOGO_BOX,
        ));
      } else {
        // The compliance report's original sizing, kept byte for byte.
        const ratio = properties.height / Math.max(properties.width, 1);
        width = Math.min(options.logo?.width ?? 36, 44);
        height = options.logo?.height ?? width * ratio;
        if (height > 14) {
          width = (width * 14) / height;
          height = 14;
        }
      }
      const boxWidth = width + 5;
      const boxHeight = height + 4;
      doc.setFillColor(...PALETTE.white);
      doc.roundedRect(
        right - boxWidth,
        rightTop,
        boxWidth,
        boxHeight,
        1.5,
        1.5,
        "F",
      );
      const format = /image\/(jpe?g)/i.test(logoDataUrl) ? "JPEG" : "PNG";
      doc.addImage(
        logoDataUrl,
        format,
        right - boxWidth + 2.5,
        rightTop + 2,
        width,
        height,
      );
      rightTop += boxHeight + 3;
      logoDrawn = true;
    } catch {
      logoDrawn = false;
    }
  }
  if (!logoDrawn && options.companyName) {
    setFont(doc, 9.5, "bold", PALETTE.white);
    doc.text(
      clampLine(doc, options.companyName, 80, 9.5, "bold"),
      right,
      18.7,
      { align: "right" },
    );
    rightTop = 24;
  }
  return rightTop;
}

/**
 * Accent bar, eyebrow, title, subtitle and lead. The title shrinks from 36 to
 * 24 pt to fit one line, then wraps to titleMaxLines with an ellipsis.
 * Returns the baseline of the last title line and the bottom of the lead.
 */
export function drawCoverHeadline(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  options: {
    eyebrow: string;
    title: string;
    titleMaxLines?: number;
    subtitle: string;
    lead: string;
    leadMaxLines?: number;
  },
): { titleBottom: number; bottom: number } {
  const { margin, contentWidth } = frame;
  doc.setFillColor(...theme.accent);
  doc.roundedRect(margin, 48.5, 14, 1.2, 0.6, 0.6, "F");
  setFont(doc, 8.5, "bold", PALETTE.coverAccentText);
  doc.text(
    clampLine(doc, options.eyebrow, contentWidth, 8.5, "bold"),
    margin,
    56.5,
  );
  const titleSize = fitFontSize(doc, options.title, contentWidth, 36, 24);
  setFont(doc, titleSize, "bold", PALETTE.white);
  const titleLines = wrapLines(
    doc,
    options.title,
    contentWidth,
    titleSize,
    "bold",
    options.titleMaxLines ?? 2,
  );
  titleLines.forEach((line, index) =>
    doc.text(line, margin, 70 + index * titleSize * 0.42),
  );
  const titleBottom = 70 + (titleLines.length - 1) * titleSize * 0.42;
  const subtitleSize = fitFontSize(
    doc,
    options.subtitle,
    contentWidth,
    13,
    8,
    "normal",
  );
  setFont(doc, subtitleSize, "normal", PALETTE.coverMutedText);
  doc.text(options.subtitle, margin, titleBottom + 10);
  // An empty lead leaves room for a longer title.
  const leadLines = options.lead
    ? wrapLines(doc, options.lead, 150, 9, "normal", options.leadMaxLines ?? 2)
    : [];
  drawLines(
    doc,
    leadLines,
    margin,
    titleBottom + 13.5,
    9,
    "normal",
    PALETTE.coverAccentText,
    4,
  );
  return { titleBottom, bottom: titleBottom + 13.5 + leadLines.length * 4 };
}

/**
 * Rule across the band, the tenant name under its eyebrow (omitted without a
 * tenant) and label and value facts right aligned beside it.
 */
export function drawCoverTenantBlock(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  options: {
    tenantEyebrow: string;
    tenant?: string;
    facts: ReadonlyArray<readonly [string, string]>;
  },
) {
  const { margin, right } = frame;
  const coverRule = mixColor(theme.primary, PALETTE.white, 0.17);
  drawRule(doc, margin, 104, right, coverRule, 0.25);
  if (options.tenant) {
    drawEyebrow(doc, options.tenantEyebrow, margin, 110.5, {
      color: PALETTE.coverAccentText,
    });
    setFont(doc, 18, "bold", PALETTE.white);
    doc.text(clampLine(doc, options.tenant, 110, 18, "bold"), margin, 118.5);
  }
  options.facts.forEach(([label, value], index) => {
    const baseline = 113.5 + index * 5;
    setFont(doc, 8, "bold", PALETTE.white);
    const valueWidth = doc.getTextWidth(value);
    doc.text(value, right, baseline, { align: "right" });
    setFont(doc, 8, "normal", PALETTE.coverMutedText);
    doc.text(label, right - valueWidth - 1.4, baseline, { align: "right" });
  });
}

/** Small product line left and a note right at the foot of the cover. */
export function drawCoverFooter(
  doc: jsPDF,
  frame: PdfFrame,
  left: string,
  right: string,
) {
  setFont(doc, 6.5, "normal", PALETTE.muted);
  doc.text(left, frame.margin, 287);
  doc.text(right, frame.right, 287, { align: "right" });
}

export interface DocumentControlCell {
  label: string;
  /** Cells without a value are left out. */
  value: string | undefined;
  /** Columns the cell spans out of four. */
  span?: number;
}

/**
 * Eyebrow heading, primary rule and a four column grid of label and value
 * cells, values wrapped to three lines. Returns the bottom of the last row.
 */
/** Height drawDocumentControlGrid uses for these cells, from its top. */
export function documentControlGridHeight(
  doc: jsPDF,
  frame: PdfFrame,
  cells: readonly DocumentControlCell[],
): number {
  const cellWidth = frame.contentWidth / 4;
  let height = 5;
  for (const row of documentControlRows(cells)) {
    const lines = row.map(({ value, span }) =>
      wrapLines(doc, value, cellWidth * span - 3, 8.4, "bold", 3),
    );
    height += Math.max(
      13,
      Math.max(...lines.map((item) => item.length)) * 3.6 + 9.4,
    );
  }
  return height;
}

function documentControlRows(cells: readonly DocumentControlCell[]) {
  const rows: Array<Array<{ label: string; value: string; span: number }>> = [];
  for (const { label, value, span = 1 } of cells) {
    if (!value) continue;
    const current = rows[rows.length - 1];
    const used = current?.reduce((sum, cell) => sum + cell.span, 0) ?? 4;
    if (!current || used + span > 4) rows.push([{ label, value, span }]);
    else current.push({ label, value, span });
  }
  return rows;
}

export function drawDocumentControlGrid(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  top: number,
  heading: string,
  cells: readonly DocumentControlCell[],
): number {
  const { margin, right, contentWidth } = frame;
  drawEyebrow(doc, heading, margin, top + 2.4, { color: theme.secondary });
  drawRule(doc, margin, top + 5, right, theme.primary, 0.4);
  const cellWidth = contentWidth / 4;
  const rows = documentControlRows(cells);
  let rowTop = top + 5;
  for (const rowCells of rows) {
    const cellLines = rowCells.map(({ value, span }) =>
      wrapLines(doc, value, cellWidth * span - 3, 8.4, "bold", 3),
    );
    const rowHeight = Math.max(
      13,
      Math.max(...cellLines.map((lines) => lines.length)) * 3.6 + 9.4,
    );
    let cellX = margin;
    rowCells.forEach(({ label, span }, cellIndex) => {
      setFont(doc, 6.3, "bold", PALETTE.muted);
      doc.text(
        clampLine(doc, label, cellWidth * span - 3, 6.3, "bold"),
        cellX,
        rowTop + 5,
      );
      drawLines(
        doc,
        cellLines[cellIndex] ?? [],
        cellX,
        rowTop + 7.2,
        8.4,
        "bold",
        theme.text,
        3.6,
      );
      cellX += cellWidth * span;
    });
    rowTop += rowHeight;
    drawRule(doc, margin, rowTop, right);
  }
  return rowTop;
}

// ---------------------------------------------------------------- Content

/**
 * Eyebrow, a 20 pt title shrinking to 12 pt to fit one line, and an optional
 * muted lead. The title stays searchable text. Returns the y below.
 */
export function drawPageTitle(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  top: number,
  options: { eyebrow: string; title: string; lead?: string; size?: number },
): number {
  const { margin, contentWidth } = frame;
  let y = top;
  drawEyebrow(doc, options.eyebrow, margin, y + 2.4, {
    color: theme.secondary,
  });
  const size = fitFontSize(
    doc,
    options.title,
    contentWidth,
    options.size ?? 20,
    12,
  );
  setFont(doc, size, "bold", theme.primary);
  doc.text(options.title, margin, y + 4.5 + capHeight(size) + 1.2);
  y += 6 + capHeight(size) + 2.5;
  if (options.lead) {
    const lines = wrapLines(doc, options.lead, 150, 8.8);
    drawLines(doc, lines, margin, y + 0.5, 8.8, "normal", PALETTE.muted, 4);
    y += lines.length * 4 + 1;
  }
  return y + 4;
}

/**
 * 10.5 pt heading clamped to one line, with an optional small muted note
 * right aligned on the same baseline. Returns the y below.
 */
export function drawSectionHeading(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  top: number,
  text: string,
  small?: string,
): number {
  const { margin, right, contentWidth } = frame;
  const baseline = top + capHeight(10.5);
  setFont(doc, 10.5, "bold", theme.primary);
  doc.text(
    clampLine(doc, text, small ? 110 : contentWidth, 10.5, "bold"),
    margin,
    baseline,
  );
  if (small) {
    setFont(doc, 7, "normal", PALETTE.muted);
    doc.text(small, right, baseline, { align: "right" });
  }
  return top + 6.5;
}

const TABLE_HEADER_SIZE = 5.6;
const TABLE_HEADER_SPACE = 0.2;

/** Header words wrapped so the uppercase label fits a column of this width. */
export function tableHeaderLines(
  doc: jsPDF,
  label: string,
  width: number,
): string[] {
  const fits = (text: string) =>
    textWidth(
      doc,
      text.toUpperCase(),
      TABLE_HEADER_SIZE,
      "bold",
      TABLE_HEADER_SPACE,
    ) <=
    width - 2.5;
  const lines: string[] = [];
  for (const word of label.split(" ")) {
    const last = lines[lines.length - 1];
    if (last !== undefined && fits(`${last} ${word}`))
      lines[lines.length - 1] = `${last} ${word}`;
    else lines.push(word);
  }
  return lines;
}

/**
 * Eyebrow column labels inset 1.5 mm from each column's x, one line or more
 * per column, over a primary rule. Returns the y below the header.
 */
export function drawTableHeader(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  top: number,
  columns: ReadonlyArray<{ x: number; lines: readonly string[] }>,
): number {
  columns.forEach(({ x, lines }) =>
    lines.forEach((line, lineIndex) =>
      drawEyebrow(doc, line, x + 1.5, top + 3.2 + lineIndex * 2.5, {
        color: PALETTE.muted,
        size: TABLE_HEADER_SIZE,
        charSpace: TABLE_HEADER_SPACE,
      }),
    ),
  );
  const rows = Math.max(1, ...columns.map(({ lines }) => lines.length));
  const height = TABLE_HEADER_SIZE + (rows - 1) * 2.5;
  drawRule(
    doc,
    frame.margin,
    top + height - 0.4,
    frame.right,
    theme.primary,
    0.4,
  );
  return top + height;
}

/**
 * Row background across the content width: zebra on odd rows, white on even
 * rows when solid, or the given fill; then a hairline under the row.
 */
export function drawZebraRow(
  doc: jsPDF,
  frame: PdfFrame,
  top: number,
  height: number,
  index: number,
  options: { solid?: boolean; fill?: RgbColor; rule?: boolean } = {},
) {
  const fill =
    options.fill ??
    (index % 2 === 1 ? PALETTE.zebra : options.solid ? PALETTE.white : null);
  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(frame.margin, top, frame.contentWidth, height, "F");
  }
  if (options.rule !== false)
    drawRule(doc, frame.margin, top + height, frame.right);
}

// ---------------------------------------------------------------- Contents

export interface TocItem {
  title: string;
  page: number;
  level: 0 | 1;
}

export interface TocRow<T extends TocItem = TocItem> {
  entry: T;
  lines: string[];
  size: number;
  style: FontStyle;
  gapBefore: number;
  height: number;
  /** Contents page the row lands on, 0 for the first. */
  pageOffset: number;
  y: number;
}

/**
 * Places every entry: level 0 bold 8.4 pt with a rule, level 1 indented
 * 7.3 pt. The first row starts 14 mm below startY; rows that do not fit go to
 * continuation pages. extraPages is the number of continuation pages.
 */
export function layoutToc<T extends TocItem>(
  doc: jsPDF,
  frame: PdfFrame,
  entries: readonly T[],
  startY: number,
): { rows: TocRow<T>[]; extraPages: number } {
  const continuationY = frame.contentTop + 14;
  const rows = entries.map((entry, index): TocRow<T> => {
    const size = entry.level === 1 ? 7.3 : 8.4;
    const style: FontStyle = entry.level === 1 ? "normal" : "bold";
    const lines = wrapLines(
      doc,
      entry.title,
      frame.contentWidth - (entry.level === 1 ? 20 : 14),
      size,
      style,
    );
    const gapBefore = entry.level === 0 && index > 0 ? 2 : 0;
    return {
      entry,
      lines,
      size,
      style,
      gapBefore,
      height: gapBefore + lines.length * 3.6 + (entry.level === 0 ? 3.4 : 1.4),
      pageOffset: 0,
      y: 0,
    };
  });
  let extraPages = 0;
  let y = startY + 14;
  for (const row of rows) {
    if (y + row.height > frame.contentBottom && y > continuationY) {
      extraPages += 1;
      y = continuationY;
    }
    row.pageOffset = extraPages;
    row.y = y;
    y += row.height;
  }
  return { rows, extraPages };
}

/**
 * Inserts the continuation pages after tocPage and draws the heading and the
 * rows with right aligned page numbers and links. Entry pages must already
 * count the inserted pages.
 */
export function drawToc<T extends TocItem>(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  options: {
    heading: string;
    tocPage: number;
    startY: number;
    rows: readonly TocRow<T>[];
    extraPages: number;
    /** Draws under the contents on each inserted page, such as a watermark. */
    onInsertPage?: (page: number) => void;
  },
) {
  const { margin, right, contentWidth } = frame;
  const { tocPage, rows, extraPages } = options;
  for (let offset = 1; offset <= extraPages; offset += 1) {
    doc.insertPage(tocPage + offset);
    options.onInsertPage?.(tocPage + offset);
  }
  for (let offset = 0; offset <= extraPages; offset += 1) {
    // Leave the first page without a heading if no entry fits beneath it.
    if (offset === 0 && (rows[0]?.pageOffset ?? 0) > 0) continue;
    doc.setPage(tocPage + offset);
    const y = offset === 0 ? options.startY : frame.contentTop;
    setFont(doc, 20, "bold", theme.primary);
    doc.text(options.heading, margin, y + capHeight(20) + 1);
    drawRule(doc, margin, y + capHeight(20) + 4.5, right, theme.primary, 0.4);
  }
  for (const row of rows) {
    const { entry, lines, size, style, pageOffset, gapBefore } = row;
    doc.setPage(tocPage + pageOffset);
    const top = row.y + gapBefore;
    const entryX = margin + (entry.level === 1 ? 6 : 0);
    drawLines(doc, lines, entryX, top + 0.6, size, style, theme.text, 3.6);
    setFont(
      doc,
      size,
      "bold",
      entry.level === 1 ? PALETTE.muted : theme.primary,
    );
    doc.text(String(entry.page), right, top + 0.6 + capHeight(size), {
      align: "right",
    });
    if (entry.level === 0)
      drawRule(doc, margin, top + lines.length * 3.6 + 1.6, right);
    doc.link(margin, top - 0.6, contentWidth, row.height - gapBefore, {
      pageNumber: entry.page,
    });
  }
}

// ---------------------------------------------------------------- Running

const FOOTER_SIZE = 6.5;
const FOOTER_LINE = 2.8;
/** Footer lines that fit under the rule before it moves up. */
const FOOTER_LINES_BELOW_RULE = 3;

/**
 * Footer that never drops text: the footer text wraps under the rule beside
 * the page label, and the notice wraps across the page above the rule.
 * contentBottom keeps the content above both.
 */
export interface RunningFooterLayout {
  lines: string[];
  noticeLines: string[];
  /** y of the footer rule. */
  ruleY: number;
  contentBottom: number;
}

export function layoutRunningFooter(
  doc: jsPDF,
  frame: PdfFrame,
  options: {
    text: string;
    /** mm left free for a footer logo. */
    inset?: number;
    notice?: string;
  },
): RunningFooterLayout {
  const inset = options.inset ?? 0;
  // Room for the widest page label the export can print.
  const labelWidth = textWidth(doc, "Page 0000 of 0000", FOOTER_SIZE);
  const lines = wrapLines(
    doc,
    options.text,
    frame.contentWidth - inset - labelWidth - 4,
    FOOTER_SIZE,
  );
  const noticeLines = options.notice
    ? wrapLines(doc, options.notice, frame.contentWidth, FOOTER_SIZE)
    : [];
  const ruleY =
    frame.pageHeight -
    14.5 -
    Math.max(0, lines.length - FOOTER_LINES_BELOW_RULE) * FOOTER_LINE;
  const noticeTop =
    ruleY -
    1.6 -
    (noticeLines.length - 1) * FOOTER_LINE -
    capHeight(FOOTER_SIZE);
  return {
    lines,
    noticeLines,
    ruleY,
    contentBottom: Math.min(
      frame.contentBottom,
      noticeLines.length ? noticeTop - 1.5 : ruleY - 2,
    ),
  };
}

/** The notice lines of a footer layout, centred above its rule. */
export function drawFooterNotice(
  doc: jsPDF,
  frame: PdfFrame,
  layout: RunningFooterLayout,
) {
  const { noticeLines, ruleY } = layout;
  setFont(doc, FOOTER_SIZE, "normal", PALETTE.muted);
  noticeLines.forEach((line, index) =>
    doc.text(
      line,
      frame.pageWidth / 2,
      ruleY - 1.6 - (noticeLines.length - 1 - index) * FOOTER_LINE,
      { align: "center" },
    ),
  );
}

/**
 * Header (title left, a muted note right) and footer (text left, optional
 * centred note, page label right) with hairlines, on every page from
 * firstPage. Run it last so page counts are final.
 */
export function drawRunningChrome(
  doc: jsPDF,
  theme: PdfTheme,
  frame: PdfFrame,
  options: {
    title: string;
    /** Clamps the title to this width when given. */
    titleMaxWidth?: number;
    headerRight?: string;
    /** Moves the header note left by this many mm, for a header logo. */
    headerRightInset?: number;
    /**
     * One line of footer text, or a layoutRunningFooter result that wraps the
     * footer text and the notice instead of clamping them.
     */
    footer: string | RunningFooterLayout;
    /** Moves the footer text right by this many mm, for a footer logo. */
    footerInset?: number;
    /** Centred notice beside a string footer, clamped to 70 mm. */
    footerCentre?: string;
    pageLabel: (page: number, pageCount: number) => string;
    firstPage?: number;
  },
) {
  const { margin, right, pageWidth, pageHeight } = frame;
  const { footer } = options;
  const pageCount = doc.internal.getNumberOfPages();
  for (let page = options.firstPage ?? 2; page <= pageCount; page += 1) {
    doc.setPage(page);
    setFont(doc, 6.5, "bold", theme.primary);
    doc.text(
      options.titleMaxWidth === undefined
        ? options.title
        : clampLine(doc, options.title, options.titleMaxWidth, 6.5, "bold"),
      margin,
      12.4,
      { charSpace: 0.15 },
    );
    if (options.headerRight) {
      setFont(doc, 6.5, "normal", PALETTE.muted);
      doc.text(
        clampLine(doc, options.headerRight, 90, 6.5),
        right - (options.headerRightInset ?? 0),
        12.4,
        { align: "right" },
      );
    }
    drawRule(doc, margin, 14.6, right);
    if (typeof footer !== "string") {
      drawRule(doc, margin, footer.ruleY, right);
      drawFooterNotice(doc, frame, footer);
      footer.lines.forEach((line, index) =>
        doc.text(
          line,
          margin + (options.footerInset ?? 0),
          footer.ruleY + 3.9 + index * FOOTER_LINE,
        ),
      );
      doc.text(options.pageLabel(page, pageCount), right, footer.ruleY + 3.9, {
        align: "right",
      });
      continue;
    }
    drawRule(doc, margin, pageHeight - 14.5, right);
    setFont(doc, 6.5, "normal", PALETTE.muted);
    doc.text(footer, margin + (options.footerInset ?? 0), pageHeight - 10.6);
    if (options.footerCentre)
      doc.text(
        clampLine(doc, options.footerCentre, 70, 6.5),
        pageWidth / 2,
        pageHeight - 10.6,
        { align: "center" },
      );
    doc.text(options.pageLabel(page, pageCount), right, pageHeight - 10.6, {
      align: "right",
    });
  }
}
