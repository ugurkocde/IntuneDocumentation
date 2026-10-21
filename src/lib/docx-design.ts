import {
  AlignmentType,
  BorderStyle,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  InternalHyperlink,
  LineRuleType,
  PageNumber,
  PageReference,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  WidthType,
  type IBorderOptions,
  type IParagraphStyleOptions,
} from "docx";
import type { BrandingOptions } from "~/types/branding";
import {
  COVER_LOGO_BOX,
  HEADER_LOGO_BOX,
  PALETTE,
  fitLogo,
  hexToRgb,
  mixColor,
  type RgbColor,
} from "./compliance/pdf-kit";
import { plural, type DocumentationGlance } from "./documentation-glance";

// Word counterparts of the evidence report design (src/lib/compliance
// pdf-kit.ts and pdf-chrome.ts): theme, cover, tiles, bars, tables, contents
// rows and the running header and footer. Only tables, paragraphs, borders and
// shading are used, so Word and LibreOffice render the same; the only image is
// the branding logo.

// ---------------------------------------------------------------- Theme

const toHex = (rgb: RgbColor) =>
  rgb
    .map((channel) => channel.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

export const WORD_PALETTE = {
  white: toHex(PALETTE.white),
  ink: toHex(PALETTE.ink),
  muted: toHex(PALETTE.muted),
  faint: toHex(PALETTE.faint),
  rule: toHex(PALETTE.rule),
  border: toHex(PALETTE.border),
  panel: toHex(PALETTE.panel),
  zebra: toHex(PALETTE.zebra),
  track: toHex(PALETTE.track),
  coverAccentText: toHex(PALETTE.coverAccentText),
  coverMutedText: toHex(PALETTE.coverMutedText),
} as const;

export interface WordTheme {
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  /** Rule across the cover band, a lighter primary. */
  coverRule: string;
  font: string;
  /** Branding sizes in half points. */
  headerSizeHp: number;
  bodySizeHp: number;
}

/** Map the branding font family name to a Word font name. */
export function mapFont(family?: string): string {
  switch (family) {
    case "times":
      return "Times New Roman";
    case "courier":
      return "Courier New";
    case "helvetica":
    default:
      return "Calibri";
  }
}

/** Branding colours, font and sizes over the evidence report palette. */
export function wordTheme(branding: BrandingOptions | undefined): WordTheme {
  const primary = hexToRgb(branding?.colors?.primary, PALETTE.navy);
  return {
    primary: toHex(primary),
    secondary: toHex(hexToRgb(branding?.colors?.secondary, PALETTE.blue)),
    accent: toHex(hexToRgb(branding?.colors?.accent, PALETTE.green)),
    text: toHex(hexToRgb(branding?.colors?.text, PALETTE.ink)),
    coverRule: toHex(mixColor(primary, PALETTE.white, 0.17)),
    font: mapFont(branding?.fonts?.family),
    headerSizeHp: (branding?.fonts?.headerSize ?? 14) * 2,
    bodySizeHp: (branding?.fonts?.bodySize ?? 11) * 2,
  };
}

// ---------------------------------------------------------------- Geometry

// A4 in twips. Content pages keep Word's 1 inch margins; the cover has none,
// so its band reaches the paper edges.
export const PAGE_WIDTH = 11906;
const PAGE_MARGIN = 1440;
export const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
const COVER_MARGIN = 850; // 15 mm, the report's page margin
const COVER_INNER = PAGE_WIDTH - 2 * COVER_MARGIN;
/** Height of the shaded cover band: 134 mm, as in the evidence report. */
export const COVER_BAND_HEIGHT = 7598;
// Band, lower row and the section's closing paragraph stay above the cover
// footer, so the cover never spills onto a second page.
const COVER_LOWER_HEIGHT = 6800;
// A confidentiality notice in the cover footer takes this much of the lower
// row per line: about 110 characters of 6.5 pt text fit one line.
const COVER_NOTICE_LINE = 260;
const COVER_NOTICE_LINE_CHARS = 110;

export const COVER_PAGE_MARGINS = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
  header: 0,
  footer: 454,
} as const;

/** Grid column widths in twips for percentages of a total width. */
export function gridColumns(
  totalTwips: number,
  percentages: number[],
): number[] {
  return percentages.map((pct) => Math.floor((totalTwips * pct) / 100));
}

const NO_BORDER: IBorderOptions = {
  style: BorderStyle.NONE,
  size: 0,
  color: "FFFFFF",
};
const CELL_NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
};
const TABLE_NO_BORDERS = {
  ...CELL_NO_BORDERS,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
};
const line = (color: string, size = 4): IBorderOptions => ({
  style: BorderStyle.SINGLE,
  size,
  color,
});
const fill = (color: string) => ({
  type: ShadingType.CLEAR,
  color: "auto",
  fill: color,
});
const dxa = (size: number) => ({ size, type: WidthType.DXA });

// ---------------------------------------------------------------- Text

interface RunStyle {
  sizeHp: number;
  color: string;
  bold?: boolean;
  italics?: boolean;
  /** Uppercase letter spaced eyebrow; the document text keeps its case. */
  eyebrow?: boolean;
}

function run(theme: WordTheme, text: string, style: RunStyle): TextRun {
  return new TextRun({
    text,
    font: theme.font,
    size: style.sizeHp,
    color: style.color,
    bold: style.bold,
    italics: style.italics,
    ...(style.eyebrow ? { allCaps: true, characterSpacing: 24 } : {}),
  });
}

const tabRun = () => new TextRun({ children: [new Tab()] });

/** An empty paragraph 1 pt high, for the end of a cell. */
const tinyParagraph = () =>
  new Paragraph({
    spacing: { before: 0, after: 0, line: 20, lineRule: LineRuleType.EXACT },
    children: [new TextRun({ text: "", size: 2 })],
  });

/** Small uppercase label above a title or block. */
export function eyebrowParagraph(
  theme: WordTheme,
  text: string,
  options: { color?: string; before?: number; after?: number } = {},
): Paragraph {
  return new Paragraph({
    children: [
      run(theme, text, {
        sizeHp: Math.max(14, theme.bodySizeHp - 7),
        color: options.color ?? theme.secondary,
        bold: true,
        eyebrow: true,
      }),
    ],
    keepNext: true,
    spacing: { before: options.before ?? 0, after: options.after ?? 60 },
  });
}

/** Cut text to at most max characters at a word boundary, with "...". */
export function clampText(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 3);
  const space = cut.lastIndexOf(" ");
  return `${(space > max / 2 ? cut.slice(0, space) : cut).trimEnd()}...`;
}

// ---------------------------------------------------------------- Logo

/** Pixel size of a PNG, JPEG or GIF from its base64 data. */
export function imageSize(
  base64: string,
): { width: number; height: number } | undefined {
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(base64), (char) => char.charCodeAt(0));
  } catch {
    return undefined;
  }
  const at = (index: number) => bytes[index] ?? 0;
  const u16 = (index: number) => (at(index) << 8) | at(index + 1);
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47)
    return {
      width: ((u16(16) << 16) | u16(18)) >>> 0,
      height: ((u16(20) << 16) | u16(22)) >>> 0,
    };
  if (at(0) === 0x47 && at(1) === 0x49 && at(2) === 0x46)
    return { width: at(6) | (at(7) << 8), height: at(8) | (at(9) << 8) };
  if (at(0) === 0xff && at(1) === 0xd8) {
    let index = 2;
    while (index + 9 < bytes.length) {
      if (at(index) !== 0xff) return undefined;
      const marker = at(index + 1);
      if (marker === 0xff) {
        index += 1;
        continue;
      }
      // Start of frame markers carry the size; C4, C8 and CC do not.
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      )
        return { width: u16(index + 7), height: u16(index + 5) };
      index += 2 + u16(index + 2);
    }
  }
  return undefined;
}

/**
 * Cover logo size in mm, as the evidence report draws it: 36 mm wide by
 * default and at most 44 mm wide and 14 mm high.
 */
export const coverLogoSize = (
  logo: { width?: number; height?: number },
  intrinsic?: { width: number; height: number },
) => fitLogo(logo, intrinsic, COVER_LOGO_BOX);

/** Header logo size in mm, the same box as the PDF header logo. */
export const headerLogoSize = (
  logo: { width?: number; height?: number },
  intrinsic?: { width: number; height: number },
) => fitLogo(logo, intrinsic, HEADER_LOGO_BOX);

const MM_TWIPS = 1440 / 25.4;

/** ImageRun takes pixels and converts them to EMUs. */
export const mmToPixels = (mm: number) => (mm * 96) / 25.4;

// ---------------------------------------------------------------- Cover

export interface CoverContent {
  productName: string;
  eyebrow: string;
  title: string;
  subtitle: string;
  description: string;
  tenantEyebrow: string;
  tenant?: string;
  /** Label and value pairs right aligned beside the tenant. */
  facts: ReadonlyArray<readonly [string, string]>;
  logo?: { data: string; widthMm: number; heightMm: number };
  /** Shown top right when there is no logo. */
  companyName?: string;
  /** Free text under the band, such as the branding cover text. */
  note?: string;
  /** Notice of the cover footer; the lower row makes room for its lines. */
  footerNotice?: string;
  controlHeading: string;
  /** Rows without a value are left out. */
  control: ReadonlyArray<{ label: string; value: string | undefined }>;
}

// Approximate glyph widths in em for a proportional sans font, generous for
// wide letters, so the estimate never wraps fewer lines than Word does.
// Every glyph of a monospace font takes about 0.6 em.
const MONOSPACE = /courier|mono|consolas|menlo|monaco/i;

function glyphEm(char: string, monospace = false): number {
  if (monospace) return 0.62;
  if ("WM@%".includes(char)) return 1;
  if ("mw".includes(char)) return 0.9;
  if (/[A-Z0-9#&]/.test(char)) return 0.75;
  if (" .,:;'|!()[]{}iljtfr-".includes(char)) return 0.34;
  return 0.6;
}

const emWidthOf = (text: string, monospace = false) =>
  [...text].reduce((sum, char) => sum + glyphEm(char, monospace), 0);

/** Lines the text wraps to at this capacity in em, breaking long words. */
function wrapEm(text: string, capacity: number, monospace = false): string[] {
  const emWidth = (value: string) => emWidthOf(value, monospace);
  const lines: string[] = [];
  let current = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = current ? `${current} ${word}` : word;
    if (emWidth(candidate) <= capacity) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    current = "";
    let rest = word;
    while (emWidth(rest) > capacity) {
      let cut = 1;
      while (cut < rest.length && emWidth(rest.slice(0, cut + 1)) <= capacity)
        cut += 1;
      lines.push(rest.slice(0, cut));
      rest = rest.slice(cut);
    }
    current = rest;
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Title size in half points and text that wraps to at most three lines in
 * the cover band, measured with generous glyph widths so a title of wide
 * letters cannot push the tenant block out of the band.
 */
export function coverTitle(
  title: string,
  font?: string,
): {
  text: string;
  sizeHp: number;
  lines: number;
} {
  const monospace = MONOSPACE.test(font ?? "");
  const emWidth = (value: string) => emWidthOf(value, monospace);
  // Usable band width in points, with a safety margin for wider fonts.
  const capacity = (sizeHp: number) =>
    ((COVER_INNER / 20) * 0.9) / (sizeHp / 2);
  for (const sizeHp of [72, 56])
    if (wrapEm(title, capacity(sizeHp), monospace).length === 1)
      return { text: title, sizeHp, lines: 1 };
  const sizeHp = 48;
  const lines = wrapEm(title, capacity(sizeHp), monospace);
  if (lines.length <= 3) return { text: title, sizeHp, lines: lines.length };
  let last = lines[2]!;
  while (last && emWidth(`${last}...`) > capacity(sizeHp))
    last = last.slice(0, -1);
  return {
    text: `${lines.slice(0, 2).join(" ")} ${last.trimEnd()}...`,
    sizeHp,
    lines: 3,
  };
}

/**
 * Whether the cover's lower row can make room for the notice. When it
 * cannot, the cover leaves the notice out; every other page prints it.
 */
export function coverNoticeFits(notice: string | undefined): boolean {
  if (!notice) return true;
  return (
    COVER_LOWER_HEIGHT -
      Math.ceil(notice.length / COVER_NOTICE_LINE_CHARS) * COVER_NOTICE_LINE >=
    3000
  );
}

// Cover band positions in twips from the top of the page, as in the report:
// accent bar at 48.5 mm and the tenant rule at 104 mm. Line heights are
// estimates at 1.2 times the font size.
const COVER_ACCENT_TOP = 2750;
const COVER_RULE_TOP = 5897;
const lineTwips = (sizeHp: number) => Math.round(sizeHp * 12);

function coverMasthead(theme: WordTheme, content: CoverContent): Table {
  const product = new Paragraph({
    children: [
      run(theme, content.productName, {
        sizeHp: 19,
        color: WORD_PALETTE.white,
        bold: true,
      }),
    ],
  });
  const cells: TableCell[] = [];
  const widths: number[] = [];
  if (content.logo) {
    const boxWidth = Math.round((content.logo.widthMm + 5) * MM_TWIPS);
    widths.push(COVER_INNER - boxWidth, boxWidth);
    cells.push(
      new TableCell({
        children: [product],
        width: dxa(COVER_INNER - boxWidth),
        verticalAlign: VerticalAlign.TOP,
        borders: CELL_NO_BORDERS,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
      new TableCell({
        children: [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: content.logo.data,
                transformation: {
                  width: mmToPixels(content.logo.widthMm),
                  height: mmToPixels(content.logo.heightMm),
                },
              }),
            ],
          }),
        ],
        width: dxa(boxWidth),
        shading: fill(WORD_PALETTE.white),
        borders: CELL_NO_BORDERS,
        margins: { top: 113, bottom: 113, left: 142, right: 142 },
      }),
    );
  } else {
    const companyWidth = content.companyName ? 4535 : 0;
    widths.push(COVER_INNER - companyWidth);
    cells.push(
      new TableCell({
        children: [product],
        width: dxa(COVER_INNER - companyWidth),
        borders: CELL_NO_BORDERS,
        margins: { top: 0, bottom: 0, left: 0, right: 0 },
      }),
    );
    if (content.companyName) {
      widths.push(companyWidth);
      cells.push(
        new TableCell({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              children: [
                run(theme, clampText(content.companyName, 48), {
                  sizeHp: 19,
                  color: WORD_PALETTE.white,
                  bold: true,
                }),
              ],
            }),
          ],
          width: dxa(companyWidth),
          borders: CELL_NO_BORDERS,
          margins: { top: 0, bottom: 0, left: 0, right: 0 },
        }),
      );
    }
  }
  return new Table({
    width: dxa(COVER_INNER),
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [new TableRow({ children: cells })],
  });
}

function coverTenantBlock(theme: WordTheme, content: CoverContent): Table {
  const left = Math.round(COVER_INNER * 0.6);
  const tenantChildren = content.tenant
    ? [
        new Paragraph({
          children: [
            run(theme, content.tenantEyebrow, {
              sizeHp: 13,
              color: WORD_PALETTE.coverAccentText,
              bold: true,
              eyebrow: true,
            }),
          ],
          spacing: { after: 40 },
        }),
        new Paragraph({
          children: [
            run(theme, clampText(content.tenant, 40), {
              sizeHp: 36,
              color: WORD_PALETTE.white,
              bold: true,
            }),
          ],
        }),
      ]
    : [new Paragraph({})];
  const facts = content.facts.length
    ? content.facts.map(
        ([label, value]) =>
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            spacing: { after: 30 },
            children: [
              run(theme, `${label}  `, {
                sizeHp: 16,
                color: WORD_PALETTE.coverMutedText,
              }),
              run(theme, value, {
                sizeHp: 16,
                color: WORD_PALETTE.white,
                bold: true,
              }),
            ],
          }),
      )
    : [new Paragraph({})];
  const margins = { top: 0, bottom: 0, left: 0, right: 0 };
  return new Table({
    width: dxa(COVER_INNER),
    columnWidths: [left, COVER_INNER - left],
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            children: tenantChildren,
            width: dxa(left),
            verticalAlign: VerticalAlign.BOTTOM,
            borders: CELL_NO_BORDERS,
            margins,
          }),
          new TableCell({
            children: facts,
            width: dxa(COVER_INNER - left),
            verticalAlign: VerticalAlign.BOTTOM,
            borders: CELL_NO_BORDERS,
            margins,
          }),
        ],
      }),
    ],
  });
}

function documentControlTable(theme: WordTheme, content: CoverContent): Table {
  const cells = content.control.filter(
    (cell): cell is { label: string; value: string } => Boolean(cell.value),
  );
  const width = Math.floor(COVER_INNER / 4);
  const rows: TableRow[] = [];
  for (let index = 0; index < cells.length; index += 4) {
    const rowCells = cells.slice(index, index + 4);
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [0, 1, 2, 3].map((offset) => {
          const cell = rowCells[offset];
          return new TableCell({
            width: dxa(width),
            borders: {
              ...CELL_NO_BORDERS,
              bottom: line(WORD_PALETTE.rule),
            },
            margins: { top: 100, bottom: 120, left: 0, right: 113 },
            children: cell
              ? [
                  new Paragraph({
                    spacing: { after: 30 },
                    children: [
                      run(theme, cell.label, {
                        sizeHp: 14,
                        color: WORD_PALETTE.muted,
                        bold: true,
                      }),
                    ],
                  }),
                  new Paragraph({
                    children: [
                      run(theme, clampText(cell.value, 90), {
                        sizeHp: 18,
                        color: theme.text,
                        bold: true,
                      }),
                    ],
                  }),
                ]
              : [new Paragraph({})],
          });
        }),
      }),
    );
  }
  return new Table({
    width: dxa(width * 4),
    columnWidths: [width, width, width, width],
    layout: TableLayoutType.FIXED,
    borders: { ...TABLE_NO_BORDERS, top: line(theme.primary, 8) },
    rows,
  });
}

/**
 * Full bleed cover for a section without margins: one shaded band row of
 * fixed height with masthead, accent bar, eyebrow, title, subtitle,
 * description, rule and tenant block, then a white row with the note and the
 * document control grid.
 */
export function coverTable(theme: WordTheme, content: CoverContent): Table {
  const title = coverTitle(content.title, theme.font);
  const description = clampText(content.description, 170);
  const mastheadHeight = content.logo
    ? Math.round((content.logo.heightMm + 4) * MM_TWIPS)
    : lineTwips(19);
  const accentBefore = Math.max(200, COVER_ACCENT_TOP - 794 - mastheadHeight);
  const titleLine = Math.round(title.sizeHp * 11.5);
  // Space above the rule keeps it at COVER_RULE_TOP for short titles; long
  // titles push it down, within the band.
  const ruleBefore = Math.max(
    120,
    COVER_RULE_TOP -
      (COVER_ACCENT_TOP +
        20 +
        220 +
        lineTwips(17) +
        120 +
        title.lines * titleLine +
        160 +
        lineTwips(26) +
        80 +
        (description.length > 90 ? 2 : 1) * lineTwips(18)),
  );
  const band: (Paragraph | Table)[] = [
    coverMasthead(theme, content),
    // Accent bar: 14 mm of thick top border on an empty, 1 pt high line.
    new Paragraph({
      indent: { right: COVER_INNER - 794 },
      border: { top: line(theme.accent, 24) },
      spacing: {
        before: accentBefore,
        after: 220,
        line: 20,
        lineRule: LineRuleType.EXACT,
      },
      children: [new TextRun({ text: "", size: 2 })],
    }),
    new Paragraph({
      spacing: { after: 120 },
      children: [
        run(theme, content.eyebrow, {
          sizeHp: 17,
          color: WORD_PALETTE.coverAccentText,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 160, line: titleLine, lineRule: LineRuleType.EXACT },
      children: [
        run(theme, title.text, {
          sizeHp: title.sizeHp,
          color: WORD_PALETTE.white,
          bold: true,
        }),
      ],
    }),
    new Paragraph({
      spacing: { after: 80 },
      children: [
        run(theme, clampText(content.subtitle, 90), {
          sizeHp: 26,
          color: WORD_PALETTE.coverMutedText,
        }),
      ],
    }),
    new Paragraph({
      children: [
        run(theme, description, {
          sizeHp: 18,
          color: WORD_PALETTE.coverAccentText,
        }),
      ],
    }),
    new Paragraph({
      border: { bottom: line(theme.coverRule, 4) },
      spacing: {
        before: ruleBefore,
        after: 280,
        line: 20,
        lineRule: LineRuleType.EXACT,
      },
      children: [new TextRun({ text: "", size: 2 })],
    }),
    coverTenantBlock(theme, content),
    tinyParagraph(),
  ];

  const lower: (Paragraph | Table)[] = [];
  if (content.note)
    lower.push(
      new Paragraph({
        spacing: { after: 360 },
        children: [
          run(theme, content.note, {
            sizeHp: theme.bodySizeHp,
            color: theme.text,
          }),
        ],
      }),
    );
  if (content.control.some((cell) => cell.value)) {
    lower.push(
      eyebrowParagraph(theme, content.controlHeading, { after: 80 }),
      documentControlTable(theme, content),
    );
  }
  lower.push(tinyParagraph());

  return new Table({
    width: dxa(PAGE_WIDTH),
    columnWidths: [PAGE_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        height: { value: COVER_BAND_HEIGHT, rule: HeightRule.EXACT },
        children: [
          new TableCell({
            children: band,
            width: dxa(PAGE_WIDTH),
            shading: fill(theme.primary),
            borders: CELL_NO_BORDERS,
            verticalAlign: VerticalAlign.TOP,
            margins: {
              top: 794,
              bottom: 0,
              left: COVER_MARGIN,
              right: COVER_MARGIN,
            },
          }),
        ],
      }),
      // The rest of the page, with the document control near its foot.
      new TableRow({
        height: {
          value: Math.max(
            3000,
            COVER_LOWER_HEIGHT -
              Math.ceil(
                (content.footerNotice?.length ?? 0) / COVER_NOTICE_LINE_CHARS,
              ) *
                COVER_NOTICE_LINE,
          ),
          rule: HeightRule.ATLEAST,
        },
        children: [
          new TableCell({
            children: lower,
            width: dxa(PAGE_WIDTH),
            borders: CELL_NO_BORDERS,
            verticalAlign: VerticalAlign.BOTTOM,
            margins: {
              top: 680,
              bottom: 850,
              left: COVER_MARGIN,
              right: COVER_MARGIN,
            },
          }),
        ],
      }),
    ],
  });
}

/** Centred notice above the footer line, wrapped by Word, never cut. */
function noticeParagraph(
  theme: WordTheme,
  notice: string,
  sizeHp: number,
  indent?: { left: number; right: number },
): Paragraph {
  return new Paragraph({
    style: CHROME_STYLE,
    alignment: AlignmentType.CENTER,
    ...(indent ? { indent } : {}),
    spacing: { after: 60 },
    children: [
      run(theme, notice, { sizeHp, color: WORD_PALETTE.muted, italics: true }),
    ],
  });
}

/**
 * Product line left and a note right at the foot of the cover, under the
 * confidentiality notice when there is one, as in the PDF.
 */
export function coverFooter(
  theme: WordTheme,
  left: string,
  right: string,
  notice?: string,
): Footer {
  const indent = { left: COVER_MARGIN, right: COVER_MARGIN };
  return new Footer({
    children: [
      ...(notice ? [noticeParagraph(theme, notice, 13, indent)] : []),
      new Paragraph({
        indent,
        tabStops: [
          { type: TabStopType.RIGHT, position: PAGE_WIDTH - COVER_MARGIN },
        ],
        children: [
          run(theme, left, { sizeHp: 13, color: WORD_PALETTE.muted }),
          tabRun(),
          run(theme, right, { sizeHp: 13, color: WORD_PALETTE.muted }),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------- Tables

/**
 * Data table: primary header row repeated on every page, zebra rows with
 * hairlines and fixed column widths, so LibreOffice, QuickLook and Google
 * Docs keep the columns readable.
 */
export function dataTable(
  theme: WordTheme,
  headers: string[],
  rows: string[][],
  percentages: number[] = headers.map(() => 100 / headers.length),
): Table {
  const widths = gridColumns(CONTENT_WIDTH, percentages);
  const sizeHp = Math.max(14, theme.bodySizeHp - 2);
  const margins = { top: 70, bottom: 70, left: 100, right: 100 };
  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map(
      (header, index) =>
        new TableCell({
          children: [
            new Paragraph({
              keepNext: true,
              children: [
                run(theme, header, {
                  sizeHp: Math.max(14, theme.bodySizeHp - 3),
                  color: WORD_PALETTE.white,
                  bold: true,
                }),
              ],
            }),
          ],
          shading: fill(theme.primary),
          width: dxa(widths[index] ?? 0),
          margins,
        }),
    ),
  });
  const dataRows = rows.map(
    (cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell, index) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    run(theme, cell ?? "", { sizeHp, color: theme.text }),
                  ],
                }),
              ],
              shading: fill(
                rowIndex % 2 === 1 ? WORD_PALETTE.zebra : WORD_PALETTE.white,
              ),
              width: dxa(widths[index] ?? 0),
              margins,
            }),
        ),
      }),
  );
  return new Table({
    width: dxa(CONTENT_WIDTH),
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    rows: [headerRow, ...dataRows],
    borders: {
      ...TABLE_NO_BORDERS,
      bottom: line(WORD_PALETTE.border),
      insideHorizontal: line(WORD_PALETTE.rule),
    },
  });
}

// ---------------------------------------------------------------- Glance

/** One row of shaded tiles with a large value, a label and a detail line. */
export function tileTable(
  theme: WordTheme,
  tiles: ReadonlyArray<{ value: string; label: string; detail?: string }>,
): Table {
  const width = Math.floor(CONTENT_WIDTH / tiles.length);
  const gap: IBorderOptions = line(WORD_PALETTE.white, 36);
  return new Table({
    width: dxa(width * tiles.length),
    columnWidths: tiles.map(() => width),
    layout: TableLayoutType.FIXED,
    borders: { ...TABLE_NO_BORDERS, insideVertical: gap },
    rows: [
      new TableRow({
        cantSplit: true,
        children: tiles.map(
          (tile) =>
            new TableCell({
              width: dxa(width),
              shading: fill(WORD_PALETTE.panel),
              margins: { top: 200, bottom: 200, left: 200, right: 160 },
              children: [
                new Paragraph({
                  spacing: { after: 40 },
                  children: [
                    run(theme, tile.value, {
                      sizeHp: 44,
                      color: theme.primary,
                      bold: true,
                    }),
                  ],
                }),
                new Paragraph({
                  children: [
                    run(theme, tile.label, {
                      sizeHp: 17,
                      color: theme.text,
                      bold: true,
                    }),
                  ],
                }),
                ...(tile.detail
                  ? [
                      new Paragraph({
                        children: [
                          run(theme, tile.detail, {
                            sizeHp: 15,
                            color: WORD_PALETTE.muted,
                          }),
                        ],
                      }),
                    ]
                  : []),
              ],
            }),
        ),
      }),
    ],
  });
}

/**
 * A one row bar whose cell widths are proportional to the values. Returns
 * undefined when every value is zero.
 */
export function proportionBar(
  segments: ReadonlyArray<{ value: number; fill: string }>,
): Table | undefined {
  const shown = segments.filter((segment) => segment.value > 0);
  const total = shown.reduce((sum, segment) => sum + segment.value, 0);
  if (total === 0) return undefined;
  const widths = shown.map((segment) =>
    Math.max(90, Math.round((CONTENT_WIDTH * segment.value) / total)),
  );
  // Rounding and the minimum width may overshoot; the largest cell absorbs it.
  const largest = widths.indexOf(Math.max(...widths));
  widths[largest] =
    (widths[largest] ?? 0) -
    (widths.reduce((sum, width) => sum + width, 0) - CONTENT_WIDTH);
  return new Table({
    width: dxa(CONTENT_WIDTH),
    columnWidths: widths,
    layout: TableLayoutType.FIXED,
    borders: TABLE_NO_BORDERS,
    rows: [
      new TableRow({
        cantSplit: true,
        height: { value: 200, rule: HeightRule.EXACT },
        children: shown.map(
          (segment, index) =>
            new TableCell({
              width: dxa(widths[index] ?? 0),
              shading: fill(segment.fill),
              borders: CELL_NO_BORDERS,
              margins: { top: 0, bottom: 0, left: 0, right: 0 },
              children: [
                new Paragraph({
                  spacing: { line: 20, lineRule: LineRuleType.EXACT },
                  children: [new TextRun({ text: "", size: 2 })],
                }),
              ],
            }),
        ),
      }),
    ],
  });
}

/** The "At a glance" page, every number from buildGlanceModel. */
export function glancePage(
  theme: WordTheme,
  glance: DocumentationGlance,
): (Paragraph | Table)[] {
  const muted = (text: string, options: { italics?: boolean } = {}) =>
    run(theme, text, {
      sizeHp: Math.max(14, theme.bodySizeHp - 4),
      color: WORD_PALETTE.muted,
      italics: options.italics,
    });
  const children: (Paragraph | Table)[] = [
    eyebrowParagraph(theme, "Overview"),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      border: { bottom: line(theme.primary, 8) },
      spacing: { before: 0, after: 200 },
      children: [
        run(theme, "At a glance", {
          sizeHp: theme.headerSizeHp + 12,
          color: theme.primary,
        }),
      ],
    }),
    tileTable(theme, [
      {
        value: String(glance.configurations),
        label: "Configurations collected",
        detail: plural(glance.policyTypes, "policy type", "policy types"),
      },
      { value: String(glance.assigned), label: "Assigned" },
      { value: String(glance.notAssigned), label: "Not assigned" },
      { value: String(glance.assignmentUnknown), label: "Assignment unknown" },
    ]),
    new Paragraph({
      spacing: { before: 320, after: 120 },
      keepNext: true,
      children: [
        run(
          theme,
          glance.assignedShare === null
            ? "n/a"
            : `${Math.round(glance.assignedShare * 100)}%`,
          { sizeHp: 40, color: theme.primary, bold: true },
        ),
        run(
          theme,
          glance.assignedShare !== null
            ? `  assigned, ${glance.assigned} of ${plural(glance.assignmentApplicable, "configuration that takes", "configurations that take")} assignments`
            : glance.assignmentApplicable === 0
              ? "  assigned share: no configuration in this export takes assignments"
              : `  assigned share: the assignments of ${plural(glance.assignmentApplicable, "configuration", "configurations")} could not be read`,
          { sizeHp: theme.bodySizeHp, color: theme.text },
        ),
      ],
    }),
  ];
  const segments = [
    { value: glance.assigned, fill: theme.secondary, label: "Assigned" },
    {
      value: glance.notAssigned,
      fill: WORD_PALETTE.track,
      label: "Not assigned",
    },
    {
      value: glance.assignmentUnknown,
      fill: WORD_PALETTE.faint,
      label: "Assignment unknown",
    },
  ];
  const bar = proportionBar(segments);
  if (bar) {
    children.push(
      bar,
      new Paragraph({
        spacing: { before: 100 },
        children: segments.flatMap((segment, index) => [
          new TextRun({
            text: "   ",
            size: 14,
            shading: fill(segment.fill),
          }),
          run(theme, ` ${segment.label} ${segment.value}`, {
            sizeHp: Math.max(14, theme.bodySizeHp - 4),
            color: theme.text,
          }),
          ...(index < segments.length - 1
            ? [run(theme, "      ", { sizeHp: 14, color: theme.text })]
            : []),
        ]),
      }),
    );
  }
  // Tiles reconcile with the total: the rest take no assignments.
  const notApplicable = glance.configurations - glance.assignmentApplicable;
  if (notApplicable > 0)
    children.push(
      new Paragraph({
        spacing: { before: 80 },
        children: [
          muted(
            `${plural(notApplicable, "configuration takes", "configurations take")} no assignments and ${notApplicable === 1 ? "is" : "are"} not counted in the assignment tiles.`,
          ),
        ],
      }),
    );
  children.push(
    new Paragraph({
      spacing: { before: 80, after: 320 },
      children: [
        muted("Unknown assignments are not counted as assigned.", {
          italics: true,
        }),
      ],
    }),
  );

  if (glance.families.length) {
    children.push(
      eyebrowParagraph(theme, "Configurations by family", { after: 80 }),
      dataTable(
        theme,
        ["Family", "Configurations", "Assigned", "Not assigned", "Unknown"],
        glance.families.map((family) => {
          // Families without an assignment relationship, such as Conditional
          // Access, read "n/a" as in the configuration inventory.
          const assignable =
            family.assigned + family.notAssigned + family.assignmentUnknown > 0;
          const count = (value: number) => (assignable ? String(value) : "n/a");
          return [
            family.label,
            String(family.configurations),
            count(family.assigned),
            count(family.notAssigned),
            count(family.assignmentUnknown),
          ];
        }),
        [34, 20, 15, 16, 15],
      ),
    );
  }

  const { collection } = glance;
  children.push(
    eyebrowParagraph(theme, "Collection", { before: 320, after: 80 }),
  );
  if (!collection.hasWarnings) {
    children.push(
      new Paragraph({
        children: [
          run(theme, "No collection warnings recorded.", {
            sizeHp: theme.bodySizeHp,
            color: theme.text,
          }),
        ],
      }),
    );
  } else {
    const parts = [
      collection.partial
        ? plural(
            collection.partial,
            "resource partially collected",
            "resources partially collected",
          )
        : "",
      collection.unavailable
        ? plural(
            collection.unavailable,
            "resource unavailable",
            "resources unavailable",
          )
        : "",
      collection.skippedFamilies.length
        ? plural(
            collection.skippedFamilies.length,
            "family left out of the collection",
            "families left out of the collection",
          )
        : "",
    ].filter(Boolean);
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          run(theme, `Collection warnings recorded: ${parts.join(", ")}.`, {
            sizeHp: theme.bodySizeHp,
            color: theme.text,
          }),
        ],
      }),
    );
    const listed = collection.issues.slice(0, 8);
    for (const issue of listed)
      children.push(
        new Paragraph({
          spacing: { after: 30 },
          children: [
            muted(
              `${issue.partial ? "Partial data" : "Unavailable"}: ${issue.label}`,
            ),
          ],
        }),
      );
    if (collection.issues.length > listed.length)
      children.push(
        new Paragraph({
          children: [
            muted(`and ${collection.issues.length - listed.length} more`),
          ],
        }),
      );
  }
  return children;
}

// ---------------------------------------------------------------- Contents

const CONTENTS_ENTRY_STYLE = "ContentsEntry";
const CHROME_STYLE = "RunningChrome";

/**
 * Paragraph styles of the contents rows and the running chrome. Page number
 * fields have no run formatting of their own, so Word and LibreOffice format
 * their results with the paragraph style.
 */
export function paragraphStyles(theme: WordTheme): IParagraphStyleOptions[] {
  return [
    {
      id: CONTENTS_ENTRY_STYLE,
      name: "Contents Entry",
      basedOn: "Normal",
      run: {
        font: theme.font,
        size: theme.bodySizeHp,
        bold: true,
        color: theme.text,
      },
      paragraph: { spacing: { before: 90, after: 90 } },
    },
    {
      id: CHROME_STYLE,
      name: "Running Chrome",
      basedOn: "Normal",
      run: { font: theme.font, size: 15, color: WORD_PALETTE.muted },
      paragraph: { spacing: { before: 0, after: 0 } },
    },
  ];
}

/** Linked title and its page number right aligned, over a hairline. */
export function contentsRow(
  title: string,
  anchor: string,
  index: number,
): Paragraph {
  return new Paragraph({
    style: CONTENTS_ENTRY_STYLE,
    tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
    // Word and LibreOffice draw one border around consecutive paragraphs
    // with equal borders and indents; a one twip alternating indent keeps a
    // rule under every row.
    indent: { right: index % 2 },
    border: { bottom: { ...line(WORD_PALETTE.rule), space: 4 } },
    children: [
      new InternalHyperlink({
        anchor,
        children: [
          new TextRun({ text: title }),
          tabRun(),
          new PageReference(anchor),
        ],
      }),
    ],
  });
}

// ---------------------------------------------------------------- Chrome

/** Title left, tenant or header text and the header logo right, over a rule. */
export function runningHeader(
  theme: WordTheme,
  left: string,
  right: string | undefined,
  logo?: ImageRun,
): Header {
  const rightRuns = [
    ...(right
      ? [run(theme, right, { sizeHp: 16, color: WORD_PALETTE.muted })]
      : []),
    ...(logo ? [...(right ? [new TextRun({ text: "  " })] : []), logo] : []),
  ];
  return new Header({
    children: [
      new Paragraph({
        style: CHROME_STYLE,
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
        border: { bottom: { ...line(WORD_PALETTE.rule, 6), space: 4 } },
        children: [
          run(theme, clampText(left, 70), {
            sizeHp: 16,
            color: theme.text,
            bold: true,
          }),
          ...(rightRuns.length ? [tabRun(), ...rightRuns] : []),
        ],
      }),
    ],
  });
}

/**
 * Confidentiality notice centred above the rule, then footer text left and
 * "Page X of Y" right, as in the PDF.
 */
export function runningFooter(
  theme: WordTheme,
  left: string,
  notice?: string,
): Footer {
  const small = { sizeHp: 15, color: WORD_PALETTE.muted };
  return new Footer({
    children: [
      ...(notice ? [noticeParagraph(theme, notice, small.sizeHp)] : []),
      new Paragraph({
        style: CHROME_STYLE,
        tabStops: [{ type: TabStopType.RIGHT, position: CONTENT_WIDTH }],
        border: { top: { ...line(WORD_PALETTE.rule, 6), space: 4 } },
        children: [
          run(theme, left, small),
          tabRun(),
          new TextRun({
            children: [
              "Page ",
              PageNumber.CURRENT,
              " of ",
              PageNumber.TOTAL_PAGES,
            ],
            font: theme.font,
            size: small.sizeHp,
            color: small.color,
          }),
        ],
      }),
    ],
  });
}
