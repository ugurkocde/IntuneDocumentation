/**
 * The benchmark readiness PDF in the evidence report design, built only on
 * the shared kit (src/lib/compliance/pdf-kit.ts) and chrome
 * (src/lib/compliance/pdf-chrome.ts). Pages: the cover, an about page with
 * the notices and the contents, the summary (headline per Level with its
 * base, counts of every state, reasons, sections, first steps and key
 * findings), what to do (the fix plan in order), the results table, the data
 * basis, one card per result that differs or needs review, and an appendix
 * with the manual recommendations, the exceptions and the method.
 * "Readiness comparison, not a certification" is on the cover, in the about
 * callout and in the footer of every page; the manual notice is on the
 * cover, the about page and in the manual section. Titles come from the
 * delivered pack and only exist in the rendered bytes; pack policy names are
 * never shown.
 */
import jsPDF from "jspdf";
import type { BrandingOptions } from "~/types/branding";
import {
  PALETTE,
  TONES,
  capHeight,
  centredBaseline,
  chipWidth,
  clampLine,
  dateParts,
  drawCard,
  drawChip,
  drawDonut,
  drawEyebrow,
  drawKpiTile,
  drawLines,
  drawMarker,
  drawPill,
  drawRule,
  drawStackedBar,
  mixColor,
  pillMetrics,
  pinPdfMetadata,
  setFont,
  textWidth,
  type FontStyle,
  type MarkerKind,
  type RgbColor,
  type Tone,
} from "../compliance/pdf-kit";
import {
  applyTheme,
  brandingTheme,
  documentControlGridHeight,
  drawCoverBackground,
  drawCoverFooter,
  drawCoverHeadline,
  drawCoverMasthead,
  drawCoverTenantBlock,
  drawDocumentControlGrid,
  drawNoticeCallout,
  drawPageTitle,
  drawRunningChrome,
  drawSectionHeading,
  drawTableHeader,
  drawToc,
  drawZebraRow,
  layoutToc,
  pageFrame,
  tableHeaderLines,
  type DocumentControlCell,
  type TocItem,
} from "../compliance/pdf-chrome";
import { addPdfOutline, type PdfOutlineEntry } from "../pdf-outline";
import {
  assessmentResults,
  exceptionLevels,
  isNotConfigured,
  type AssessmentResult,
  type BenchmarkAssessment,
  type HeadlineStates,
  type LevelSummary,
  type ReasonCode,
  type SettingFinding,
} from "./assessment";
import {
  COVER_LEAD,
  KPI_CAPTIONS,
  LEVEL_2_NOTE,
  NEEDS_REVIEW_NOTE,
  READINESS_DISCLAIMER,
  REASON_LABELS,
  RESULT_LABELS,
  SETTINGS_BASIS_NOTE,
  SHORT_REASON_LABELS,
  STATE_DESCRIPTIONS,
  differsReasonText,
  UNREADABLE_CAUSE_LABELS,
  absentValueText,
  assignmentLabel,
  benchmarkDisplayName,
  benchmarkName,
  coverageStatement,
  exclusionsText,
  headlineBaseText,
  headlineLabel,
  headlineWithBase,
  levelCheckSummary,
  levelsLabel,
  matchingPolicies,
  OTHER_PROFILE_LABELS,
  ratePercent,
  rateIsHero,
  resultLabel,
  reachText,
  resultSettingDetails,
  settingStatusText,
  DIFFERS_BELOW_LABEL,
  holderValueText,
  type HolderDetail,
  type ResultSettingDetail,
} from "./display";
import { appliesOn, localDate, type BenchmarkException } from "./exceptions";
import {
  buildFixPlan,
  nextStepText,
  type FixAction,
  type FixPlan,
} from "./fix-plan";
import {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
} from "./manual";
import {
  NOT_CONFIGURED,
  NOT_READABLE,
  differenceStates,
  settingName,
  valueText,
} from "./values";

export { valueText };

export interface ReadinessPdfOptions {
  /** Benchmark name from the delivered catalog; the id in words otherwise. */
  benchmarkName?: string;
  /** The tenant's display name when known, otherwise its shortened id. */
  tenantLabel?: string;
  /** Fixed render time: same input, same bytes. */
  renderDate?: Date;
  branding?: BrandingOptions;
  /** Stored exceptions; those of this benchmark, version and Level are listed. */
  exceptions?: readonly BenchmarkException[];
  /** The fix plan of the assessment; built from it when absent. */
  fixPlan?: FixPlan;
}

const PRODUCT = "Intune Documentation";
const GENERATED_WITH =
  "Generated with Intune Documentation (intunedocumentation.com)";
const DOCUMENT_TITLE = "CIS Benchmark readiness comparison";

/** The displayed states, in display order. */
type State = keyof Omit<HeadlineStates, "assessed" | "total">;
const STATES: readonly State[] = [
  "matches",
  "differs",
  "notConfigured",
  "needsReview",
  "notAssessed",
];

const RED: RgbColor = [185, 28, 28];
const AMBER: RgbColor = [196, 113, 31];

/** Pills, markers and bar colours of the states, as the evidence report uses them. */
const STATE_STYLE: Readonly<
  Record<
    State,
    {
      label: string;
      tone: Tone;
      marker: MarkerKind;
      color: RgbColor;
      bar: RgbColor;
    }
  >
> = {
  matches: {
    label: RESULT_LABELS.Pass,
    tone: "found",
    marker: "filled",
    color: [31, 133, 83],
    bar: [31, 133, 83],
  },
  differs: {
    label: RESULT_LABELS.Fail,
    tone: "conflict",
    marker: "triangle",
    color: RED,
    bar: RED,
  },
  notConfigured: {
    label: NOT_CONFIGURED,
    tone: "conflict",
    marker: "outline",
    color: RED,
    bar: mixColor(RED, PALETTE.white, 0.45),
  },
  needsReview: {
    label: RESULT_LABELS.Review,
    tone: "partial",
    marker: "half",
    color: AMBER,
    bar: AMBER,
  },
  notAssessed: {
    label: RESULT_LABELS["Not assessed"],
    tone: "na",
    marker: "triangle",
    color: AMBER,
    bar: [226, 200, 170],
  },
};

const PARENT_DIFFERS = "Parent has another option";
/** The current value of a setting no collected policy holds, while absence is not proven. */
const NOT_FOUND = "Not found";

const PLATFORM_NAMES: Readonly<Record<string, string>> = {
  windows: "Windows",
  macos: "macOS",
  ios: "iOS",
  android: "Android",
  linux: "Linux",
};

/** Short reasons of the results that carry no reason code. */
const FAIL_REASONS = {
  differs: "Another value is set",
  notConfigured: "Set in no collected policy",
} as const;

const METHOD_LINES = [
  "Each setting of the delivered pack is compared with the Settings Catalog policies of the last collection only. Device configurations, administrative templates, security baselines and endpoint security intents are not read. Nothing is written to the tenant.",
  "Matches needs the recommended value on at least one assigned policy. A matching value only on policies that are not assigned, or whose assignment could not be read, needs review. A policy that is not assigned applies to nobody, so another value held only there needs review too.",
  "Differs needs a readable tenant value that differs on a policy that is assigned or whose assignment could not be read, or a complete collection that shows the setting missing from every policy while no profile of another type exists for its platform. When such profiles exist, a setting missing from the Settings Catalog needs review, because it may be set outside it.",
  "Absent, unreadable or incomplete data is Needs review or Not assessed, never Differs.",
  "A recommendation that names a setting outside the pack is Not assessed.",
];

const HOW_TO_READ_NOTES = [
  "The headline is Matches out of Matches plus Differs, Not configured counted as Differs. Needs review and Not assessed are counted beside it and never lower it.",
  "Only assigned policies count as Matches. A match on a policy that is not assigned applies to nobody.",
  "Page numbers point to the result detail of every result that differs or needs review.",
];

/** The headline as text: a percentage, or n/a when nothing was assessed. */
export function headlineValue(rate: number | null): string {
  const value = ratePercent(rate);
  return value === null ? "n/a" : `${value}%`;
}

const NOTHING_ASSESSED = "Nothing was assessed as Matches or Differs";

/** The base written after a headline rate, "of 4 assessed, 2 need review". */
export function headlineBasisText(
  counts: LevelSummary["headline"]["counts"],
): string {
  return counts.pass + counts.fail
    ? headlineBaseText(counts)
    : NOTHING_ASSESSED;
}

/**
 * The big value of a headline, the line under it and the fraction its ring
 * shows, one measure for all three: the rate of the assessed results when it
 * may lead (rateIsHero), the matches out of every result otherwise.
 */
export function headlineHero(
  states: HeadlineStates,
  rate: number | null,
): { value: string; count: string; fraction: number } {
  if (rateIsHero(states) && rate !== null)
    return {
      value: headlineValue(rate),
      count: `of ${states.assessed.toLocaleString("en-US")} assessed`,
      fraction: rate,
    };
  return {
    value: states.matches.toLocaleString("en-US"),
    count: states.total
      ? `of ${states.total.toLocaleString("en-US")} match`
      : "No results",
    fraction: states.total ? states.matches / states.total : 0,
  };
}

/**
 * What the delivered packs cover. One Level keeps its coverage statement;
 * with several, each pack is named with its count, so a Level 2 count is
 * never read as the whole comparison.
 */
export function packCoverageText(levels: readonly LevelSummary[]): string {
  if (!levels.length) return "Coverage of the full benchmark is not shown.";
  if (levels.length === 1) return coverageStatement(levels[0]!);
  const covers = levels.map((level) => {
    const { total } = level.headline.states;
    const noun =
      level.headline.basis === "settings"
        ? total === 1
          ? "setting"
          : "settings"
        : total === 1
          ? "recommendation"
          : "recommendations";
    return `the Level ${level.level} pack covers ${total.toLocaleString("en-US")} ${noun}`;
  });
  const listed = `${covers.slice(0, -1).join(", ")} and ${covers.at(-1)}`;
  const withList = levels.filter((level) => level.coverage.source !== "none");
  return [
    `${listed.replace(/^./, (char) => char.toUpperCase())}.`,
    ...withList.map(
      (level) => `Level ${level.level}: ${coverageStatement(level)}`,
    ),
    ...(withList.length < levels.length
      ? [
          "The full benchmark also has manual and other recommendations; coverage of the full benchmark will be shown once its list is published.",
        ]
      : []),
  ].join(" ");
}

/**
 * Whether the next section starts on the current page instead of a new one:
 * when the page was begun by a page break and holds only the end of the
 * previous section, no more than half its height, so a spilled block never
 * stands alone on a page and the section still gets half a page.
 */
export function continuesOnPage(
  spilled: boolean,
  used: number,
  height: number,
): boolean {
  return spilled && used <= height / 2;
}

/**
 * How many key findings the block shows and its height: all of them when
 * they fit the room, otherwise as many as fit with the line naming the
 * rest, at least two (the block then moves to the next page whole).
 * heights are the rows' heights; the block adds its heading, the line for
 * the rest of total and a gap.
 */
export function fittedFindings(
  heights: readonly number[],
  total: number,
  room: number,
): { count: number; height: number } {
  const blockHeight = (count: number) =>
    6.5 +
    (count
      ? heights.slice(0, count).reduce((sum, height) => sum + height, 0) +
        (total > count ? 5 : 0)
      : 8) +
    3;
  let count = heights.length;
  while (count > 2 && blockHeight(count) > room) count -= 1;
  return { count, height: blockHeight(count) };
}

// Helvetica, the standard PDF font, holds the WinAnsi characters only.
// Others are measured and drawn wrongly, so a line holding them could run
// into the badge beside it: they are written in a plain form where one is
// usual, dropped when invisible and shown as ? otherwise.
const WIN_ANSI_EXTRA = new Set(
  "\u20ac\u201a\u0192\u201e\u2026\u2020\u2021\u02c6\u2030\u0160\u2039\u0152\u017d\u2018\u2019\u201c\u201d\u2022\u2013\u2014\u02dc\u2122\u0161\u203a\u0153\u017e\u0178",
);
const PLAIN_FORMS: Readonly<Record<string, string>> = {
  "\u2264": "<=",
  "\u2265": ">=",
  "\u2260": "!=",
  "\u2190": "<-",
  "\u2192": "->",
  "\u2194": "<->",
  "\u2010": "-",
  "\u2011": "-",
  "\u2212": "-",
  "\u2032": "'",
  "\u2033": '"',
};
const INVISIBLE =
  /[\u0000-\u001f\u007f-\u009f\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

/** Text the standard PDF font can measure and draw as it is. */
export function pdfText(text: string): string {
  return [...text]
    .map((char) => {
      const code = char.codePointAt(0)!;
      if (
        (code >= 0x20 && code <= 0x7e) ||
        (code >= 0xa0 && code <= 0xff) ||
        WIN_ANSI_EXTRA.has(char)
      )
        return char;
      if (PLAIN_FORMS[char]) return PLAIN_FORMS[char];
      if (/\s/.test(char)) return " ";
      return INVISIBLE.test(char) ? "" : "?";
    })
    .join("");
}

function formatDate(value: Date, utc: boolean): string {
  const { year, month, day, hours, minutes } = dateParts(value, utc);
  return `${year}-${month}-${day} ${hours}:${minutes}${utc ? " UTC" : ""}`;
}

function formatDay(value: Date, utc: boolean): string {
  const { year, month, day } = dateParts(value, utc);
  return `${year}-${month}-${day}`;
}

/**
 * Wraps text to the width, breaking at spaces and, for identifiers without
 * spaces, after an underscore, dot, slash, hyphen or tilde, or anywhere.
 * Keeps at most maxLines lines, the last one ending in an ellipsis when text
 * was cut.
 */
export function wrapText(
  doc: jsPDF,
  text: string,
  width: number,
  size: number,
  style: FontStyle = "normal",
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  const fits = (value: string) => textWidth(doc, value, size, style) <= width;
  const lines: string[] = [];
  let rest = pdfText(text.replace(/\s+/g, " ")).replace(/\s+/g, " ").trim();
  while (rest) {
    if (fits(rest)) {
      lines.push(rest);
      break;
    }
    if (lines.length === maxLines - 1) {
      lines.push(clampLine(doc, rest, width, size, style));
      break;
    }
    let low = 1;
    let high = rest.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (fits(rest.slice(0, middle))) low = middle;
      else high = middle - 1;
    }
    let cut = low;
    const space = rest.lastIndexOf(" ", low);
    if (space > 0) cut = space;
    else {
      const soft = Math.max(
        ...["_", ".", "/", "-", "~"].map((mark) =>
          rest.lastIndexOf(mark, low - 1),
        ),
      );
      if (soft >= low / 2) cut = soft + 1;
    }
    lines.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  return lines;
}

/** Plan text with tenant names trimmed: no space before punctuation. */
const prose = (text: string) => text.replace(/\s+([,.;:)])/g, "$1");

/** The displayed state of one result. */
function stateOf(item: AssessmentResult): State {
  if (item.result === "Pass") return "matches";
  if (item.result === "Review") return "needsReview";
  if (item.result === "Not assessed") return "notAssessed";
  return isNotConfigured(
    item.kind === "recommendation" ? item.recommendation : item.finding,
  )
    ? "notConfigured"
    : "differs";
}

/** The reason of one result as a short label, or null for Matches. */
function shortReason(item: AssessmentResult): string | null {
  if (item.reason) return SHORT_REASON_LABELS[item.reason];
  const state = stateOf(item);
  return state === "differs" || state === "notConfigured"
    ? FAIL_REASONS[state]
    : null;
}

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

const numeric = (a: string, b: string) =>
  a.localeCompare(b, undefined, { numeric: true });

/** One table column: label and width in mm. */
interface Column {
  label: string;
  width: number;
  /** Numbers are right aligned, with their header. */
  align?: "right";
}

type Cell =
  | {
      lines: string[];
      size?: number;
      style?: FontStyle;
      color?: RgbColor;
    }
  | { state: State };

/** One piece of a card, drawn at its top; cards break between blocks. */
interface Block {
  height: number;
  draw: (top: number) => void;
  /** Starts a new page with the next block rather than leave it alone there. */
  keepNext?: boolean;
}

interface TocEntry extends TocItem {
  /** A section the bookmarks nest under; level 0 entries only. */
  children?: TocEntry[];
}

/** Needs review results under one step of the plan, or one reason without a step. */
interface ReviewGroup {
  key: string;
  level: number;
  action?: FixAction;
  /** The action's number on the What to Do page. */
  step?: number;
  reason?: ReasonCode;
  items: AssessmentResult[];
}

interface PageRef {
  page: number;
  x: number;
  y: number;
  /** Result key whose detail page is written, or a fixed page index. */
  key: string;
  size: number;
  label: (page: number) => string;
}

const BODY = 8.8;
const SMALL = 7.2;
const lineHeight = (size: number) => size * 0.45;

/** Renders the readiness PDF of one assessment. */
export function renderReadinessPdf(
  assessment: BenchmarkAssessment,
  options: ReadinessPdfOptions = {},
): Uint8Array {
  const { branding } = options;
  const theme = brandingTheme(branding);
  const primaryTint = mixColor(theme.primary, PALETTE.white, 0.92);
  const fixed = options.renderDate !== undefined;
  const generatedAt = options.renderDate
    ? new Date(options.renderDate.getTime())
    : new Date();
  // The shared chrome draws these as they are, so they are made drawable here.
  const name = options.benchmarkName?.trim()
    ? pdfText(benchmarkName(options.benchmarkName))
    : benchmarkDisplayName(assessment.benchmark);
  const title = `${name} ${assessment.version}`;
  const tenant = pdfText(options.tenantLabel?.trim() ?? "").trim() || undefined;
  const company =
    pdfText(branding?.companyName?.trim() ?? "").trim() || undefined;
  const assessedAt = new Date(assessment.assessedAt);
  const collectedAt = assessment.collection.collectedAt
    ? new Date(assessment.collection.collectedAt)
    : null;
  const plan = options.fixPlan ?? buildFixPlan(assessment);
  const results = assessmentResults(assessment);
  const multiLevel = assessment.levels.length > 1;
  const findings = new Map(assessment.settings.map((item) => [item.key, item]));

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  applyTheme(doc, theme);
  doc.setProperties({
    title: DOCUMENT_TITLE,
    author: GENERATED_WITH,
    subject: READINESS_DISCLAIMER,
  });
  if (fixed)
    pinPdfMetadata(
      doc,
      generatedAt,
      JSON.stringify([
        assessment.benchmark,
        assessment.version,
        assessment.level,
        assessment.assessedAt,
        generatedAt.toISOString(),
        tenant ?? null,
      ]),
    );

  const frame = pageFrame(doc, {
    margin: 15,
    contentTop: 21,
    contentBottom: 276,
  });
  const { margin, right, contentWidth, contentTop, contentBottom } = frame;
  let y = contentTop;
  const toc: TocEntry[] = [];
  const pageRefs: PageRef[] = [];
  const detailPages = new Map<string, number>();
  const currentPage = () => doc.internal.getCurrentPageInfo().pageNumber;

  // A page begun by a page break holds the rest of a section; a section
  // start continues on it when that rest is short (continuesOnPage).
  let spilled = false;
  const newPage = () => {
    doc.addPage();
    y = contentTop;
    spilled = true;
  };
  /** Starts a section on a new page, or below the spilled end of the last one. */
  const sectionPage = () => {
    if (continuesOnPage(spilled, y - contentTop, contentBottom - contentTop))
      y += 8;
    else newPage();
    spilled = false;
  };
  /** Starts a new page when height does not fit; true when it did. */
  const ensure = (height: number) => {
    if (y + height <= contentBottom) return false;
    newPage();
    return true;
  };
  const caption = (text: string) => {
    setFont(doc, 7.2, "italic", PALETTE.muted);
    doc.text(pdfText(text), margin, y + 2.6);
    y += 6;
  };
  const paragraph = (
    text: string,
    extra: {
      size?: number;
      style?: FontStyle;
      color?: RgbColor;
      indent?: number;
      width?: number;
      after?: number;
    } = {},
  ) => {
    const size = extra.size ?? BODY;
    const style = extra.style ?? "normal";
    const indent = extra.indent ?? 0;
    const lines = wrapText(
      doc,
      text,
      extra.width ?? contentWidth - indent,
      size,
      style,
    );
    const step = size * 0.44;
    for (const line of lines) {
      ensure(step);
      drawLines(
        doc,
        [line],
        margin + indent,
        y,
        size,
        style,
        extra.color ?? theme.text,
        step,
      );
      y += step;
    }
    y += extra.after ?? 1.8;
  };
  const sectionHeading = (text: string, small?: string) => {
    y = drawSectionHeading(doc, theme, frame, y, pdfText(text), small);
  };
  const pageTitle = (
    eyebrow: string,
    heading: string,
    lead?: string,
    tocTitle = heading,
  ): TocEntry => {
    const entry: TocEntry = { title: tocTitle, page: currentPage(), level: 0 };
    toc.push(entry);
    y = drawPageTitle(doc, theme, frame, y, {
      eyebrow,
      title: heading,
      ...(lead ? { lead } : {}),
    });
    return entry;
  };
  const statePill = (
    x: number,
    top: number,
    state: State,
    maxWidth?: number,
    label = STATE_STYLE[state].label,
  ) =>
    drawPill(doc, x, top, label, {
      tone: STATE_STYLE[state].tone,
      marker: STATE_STYLE[state].marker,
      markerColor: STATE_STYLE[state].color,
      small: true,
      ...(maxWidth !== undefined ? { maxWidth } : {}),
    });
  const idChip = (x: number, top: number, id: string, maxWidth = 30) => {
    const label = pdfText(id);
    const size = chipWidth(doc, label, 6.6) > maxWidth ? 5.8 : 6.6;
    return drawChip(doc, x, top, label, "id", {
      size,
      height: 4.4,
      minWidth: 9.6,
      fill: primaryTint,
      color: theme.primary,
    });
  };
  /** One line with the middle cut out, so both ends of a long id stay. */
  const middleClamp = (text: string, width: number, size: number) => {
    const value = pdfText(text);
    if (textWidth(doc, value, size) <= width) return value;
    let keep = Math.floor(value.length / 2);
    while (
      keep > 4 &&
      textWidth(doc, `${value.slice(0, keep)}...${value.slice(-keep)}`, size) >
        width
    )
      keep -= 1;
    return `${value.slice(0, keep)}...${value.slice(-keep)}`;
  };
  /** A dashed card with one muted line, the evidence report's empty state. */
  const emptyCard = (text: string) => {
    const lines = wrapText(doc, text, contentWidth - 10, 8.2);
    const height = lines.length * 3.8 + 8;
    ensure(height + 4);
    drawCard(doc, margin, y, contentWidth, height, {
      stroke: PALETTE.dashed,
      dashed: true,
    });
    drawLines(doc, lines, margin + 5, y + 4, 8.2, "normal", PALETTE.muted, 3.8);
    y += height + 5;
  };
  const pageRef = (key: string, x: number, baseline: number, size = 6.6) =>
    pageRefs.push({
      page: currentPage(),
      x,
      y: baseline,
      key,
      size,
      label: (page) => `See page ${page}`,
    });

  const levelOf = (level: number) =>
    assessment.levels.find((item) => item.level === level);
  const coverLevel = levelOf(assessment.level) ?? assessment.levels[0];
  const emptyStates: HeadlineStates = {
    matches: 0,
    differs: 0,
    notConfigured: 0,
    needsReview: 0,
    notAssessed: 0,
    assessed: 0,
    total: 0,
  };
  const statesOf = (level: LevelSummary | undefined) =>
    level?.headline.states ?? emptyStates;
  const nounOf = (level: LevelSummary | undefined, count: number) =>
    level?.headline.basis === "settings"
      ? count === 1
        ? "setting"
        : "settings"
      : count === 1
        ? "recommendation"
        : "recommendations";
  const shownStates = (list: readonly HeadlineStates[]) =>
    STATES.filter(
      (state) =>
        state !== "notConfigured" ||
        list.some((item) => item.notConfigured > 0),
    );
  const segmentsOf = (states: HeadlineStates) =>
    STATES.map((state) => ({
      value: states[state],
      color: STATE_STYLE[state].bar,
    }));
  /** "Matches 1, Differs 0, Needs review 87": the counts with their labels. */
  const countsLine = (states: HeadlineStates) =>
    shownStates([states])
      .map(
        (state) =>
          `${STATE_STYLE[state].label} ${states[state].toLocaleString("en-US")}`,
      )
      .join(", ");
  /** The big value of a headline: the rate only when it may lead, the matches otherwise. */
  const heroValue = (level: LevelSummary | undefined) =>
    headlineHero(statesOf(level), level?.headline.rate ?? null);

  // The results with a detail, in the order of the detail: Level, then
  // Differs before Needs review, then id.
  const SEVERITY: Readonly<Record<string, number>> = { Fail: 0, Review: 1 };
  const detailResults = results
    .filter((item) => item.result === "Fail" || item.result === "Review")
    .sort(
      (a, b) =>
        a.level - b.level ||
        SEVERITY[a.result]! - SEVERITY[b.result]! ||
        numeric(a.id, b.id),
    );
  const detailKeys = new Set(detailResults.map((item) => item.key));
  const titleOf = (item: AssessmentResult) =>
    item.kind === "recommendation"
      ? item.recommendation.title
      : (assessment.settingNames[item.finding.settingId]?.name ??
        item.finding.settingId);
  // Differs and Not configured get a card per result. Needs review results
  // are grouped per Level by their first step in the plan, the one of the
  // highest impact, and without a step by their reason: one card per group,
  // a row per result, the other steps named in the row.
  const stepOf = new Map(
    plan.actions.map((action, index) => [action.id, index + 1]),
  );
  const reviewKeys = new Set(
    detailResults
      .filter((item) => item.result === "Review")
      .map((item) => item.key),
  );
  /** The step a Needs review result is listed under, its first. */
  const firstStep = (key: string) => {
    const first = (plan.byResult[key] ?? []).find((id) => stepOf.has(id));
    return first ? stepOf.get(first) : undefined;
  };
  const reviewGroups = (() => {
    const groups = new Map<string, ReviewGroup>();
    for (const item of detailResults) {
      if (item.result !== "Review") continue;
      const step = firstStep(item.key);
      const key = `group:${item.level}:${step ? `step:${step}` : `reason:${item.reason ?? ""}`}`;
      const group = groups.get(key) ?? {
        key,
        level: item.level,
        ...(step ? { action: plan.actions[step - 1]!, step } : {}),
        ...(!step && item.reason ? { reason: item.reason } : {}),
        items: [],
      };
      group.items.push(item);
      groups.set(key, group);
    }
    return [...groups.values()].sort(
      (a, b) =>
        a.level - b.level ||
        (a.step ?? Number.MAX_SAFE_INTEGER) -
          (b.step ?? Number.MAX_SAFE_INTEGER) ||
        (a.reason ?? "").localeCompare(b.reason ?? ""),
    );
  })();
  const groupOfAction = new Map<string, string>();
  for (const group of reviewGroups)
    if (group.action && !groupOfAction.has(group.action.id))
      groupOfAction.set(group.action.id, group.key);
  /** The card of an action, or the detail of its first result. */
  const actionTarget = (action: FixAction) =>
    groupOfAction.get(action.id) ??
    action.results.find((item) => detailKeys.has(item.key))?.key;

  // ---------------------------------------------------------------- Cover
  // The decorative ring shows the cover headline's measure; with several
  // Levels no one measure stands for the comparison, so it stays empty.
  drawCoverBackground(doc, theme, frame, {
    ringFraction: multiLevel ? 0 : heroValue(coverLevel).fraction,
  });
  drawCoverMasthead(doc, theme, frame, {
    productName: PRODUCT,
    logo: branding?.logo,
    companyName: company,
  });
  drawCoverHeadline(doc, theme, frame, {
    eyebrow: "CIS Benchmark readiness",
    title,
    subtitle: levelsLabel(assessment),
    lead: COVER_LEAD,
  });
  const reportDay = formatDay(generatedAt, fixed);
  const collectedDay = collectedAt ? formatDay(collectedAt, fixed) : null;
  drawCoverTenantBlock(doc, theme, frame, {
    tenantEyebrow: "Tenant",
    tenant,
    facts: [
      ["Report date", reportDay],
      ...(collectedDay && collectedDay !== reportDay
        ? [["Data collected", collectedDay] as const]
        : []),
    ],
  });

  // Headline card: a donut per Level whose arc is the measure its centre
  // states (headlineHero), and each headline with its base. With several
  // Levels every one is shown, so Level 2 never stands for the comparison.
  const midTop = 144;
  drawCard(doc, margin, midTop, 72, 70, { fill: PALETTE.panel });
  const cardX = margin + 36;
  const donut = (
    x: number,
    centre: number,
    radius: number,
    thickness: number,
    level: LevelSummary | undefined,
    sizes: { value: number; count: number; gap: number },
  ) => {
    const hero = heroValue(level);
    drawDonut(
      doc,
      x,
      centre,
      radius,
      thickness,
      [{ value: hero.fraction, color: STATE_STYLE.matches.bar }],
      1,
    );
    setFont(doc, sizes.value, "bold", theme.primary);
    doc.text(hero.value, x, centre + sizes.value * 0.1, { align: "center" });
    setFont(doc, sizes.count, "normal", PALETTE.muted);
    doc.text(
      clampLine(doc, hero.count, (radius - thickness / 2) * 2 - 2, sizes.count),
      x,
      centre + sizes.gap,
      { align: "center" },
    );
  };
  const centred = (
    lines: readonly string[],
    x: number,
    top: number,
    size: number,
    style: FontStyle,
    color: RgbColor,
    step: number,
  ) => {
    setFont(doc, size, style, color);
    lines.forEach((line, index) =>
      doc.text(line, x, top + capHeight(size) + index * step, {
        align: "center",
      }),
    );
  };
  if (multiLevel) {
    const shown = assessment.levels.slice(0, 2);
    const bases = new Set(shown.map((level) => level.headline.basis));
    const captionLines = wrapText(
      doc,
      `${headlineLabel(bases.size === 1 ? [...bases][0]! : "mixed")}, ${levelsLabel(assessment)}`,
      64,
      8.3,
      "bold",
      2,
    );
    shown.forEach((level, index) => {
      const x = margin + 18 + index * 36;
      donut(x, midTop + 23, 12.5, 3.4, level, {
        value: 14,
        count: 5.6,
        gap: 5.2,
      });
      centred(
        [`Level ${level.level}`],
        x,
        midTop + 38.6,
        7.6,
        "bold",
        theme.text,
        3.4,
      );
      centred(
        wrapText(
          doc,
          headlineWithBase(
            level.headline.rate,
            level.headline.counts,
            NOTHING_ASSESSED,
          ),
          32,
          6.4,
          "normal",
          3,
        ),
        x,
        midTop + 43.4,
        6.4,
        "normal",
        PALETTE.muted,
        2.8,
      );
    });
    centred(
      captionLines,
      cardX,
      midTop + 70 - 4.6 - captionLines.length * 3.7,
      8.3,
      "bold",
      theme.text,
      3.7,
    );
  } else {
    donut(cardX, midTop + 28, 18, 4.4, coverLevel, {
      value: 22,
      count: 6.6,
      gap: 6.6,
    });
    const captionLines = wrapText(
      doc,
      coverLevel
        ? `${headlineLabel(coverLevel.headline.basis)}, Level ${coverLevel.level}`
        : "No Level assessed",
      64,
      8.3,
      "bold",
      2,
    );
    const subLines = wrapText(
      doc,
      coverLevel
        ? headlineWithBase(
            coverLevel.headline.rate,
            coverLevel.headline.counts,
            NOTHING_ASSESSED,
          )
        : "The pack delivered no results.",
      62,
      7,
      "normal",
      2,
    );
    let captionY =
      midTop + 70 - 4 - subLines.length * 3 - captionLines.length * 3.7;
    setFont(doc, 8.3, "bold", theme.text);
    for (const line of captionLines) {
      captionY += 3.7;
      doc.text(line, cardX, captionY, { align: "center" });
    }
    captionY += 0.8;
    setFont(doc, 7, "normal", PALETTE.muted);
    for (const line of subLines) {
      captionY += 3;
      doc.text(line, cardX, captionY, { align: "center" });
    }
  }

  // At a glance: every state with its count, one column per Level.
  const glanceX = margin + 80;
  const glanceWidth = contentWidth - 80;
  const glanceLevels = assessment.levels.length ? assessment.levels : [];
  drawEyebrow(doc, "At a glance", glanceX, midTop + 2.4, {
    color: theme.secondary,
  });
  if (multiLevel)
    glanceLevels.forEach((level, index) =>
      drawEyebrow(
        doc,
        `Level ${level.level}`,
        right - (glanceLevels.length - 1 - index) * 18,
        midTop + 2.4,
        { color: PALETTE.muted, size: 5.8, align: "right" },
      ),
    );
  drawRule(doc, glanceX, midTop + 5, right, theme.primary, 0.4);
  const glanceStates = shownStates(
    glanceLevels.map((level) => level.headline.states),
  );
  const glanceRow = glanceStates.length > 4 ? 7.4 : 8.6;
  glanceStates.forEach((state, index) => {
    const rowTop = midTop + 5 + index * glanceRow;
    const middle = rowTop + glanceRow / 2;
    const style = STATE_STYLE[state];
    drawMarker(doc, glanceX + 1.4, middle, style.marker, style.color);
    setFont(doc, 8.5, "normal", theme.text);
    doc.text(style.label, glanceX + 5, middle + capHeight(8.5) / 2);
    (glanceLevels.length ? glanceLevels : [undefined]).forEach(
      (level, column, all) => {
        setFont(doc, 11, "bold", theme.primary);
        doc.text(
          statesOf(level)[state].toLocaleString("en-US"),
          right - (all.length - 1 - column) * 18,
          middle + capHeight(11) / 2,
          { align: "right" },
        );
      },
    );
    drawRule(doc, glanceX, rowTop + glanceRow, right);
  });
  const noteTop = midTop + 5 + glanceStates.length * glanceRow + 4;
  drawLines(
    doc,
    wrapText(
      doc,
      `Needs review and Not assessed are not counted in the headline. ${packCoverageText(assessment.levels)}`,
      glanceWidth,
      7.4,
      "normal",
      Math.max(1, Math.floor((midTop + 72 - noteTop) / 3.4)),
    ),
    glanceX,
    noteTop,
    7.4,
    "normal",
    PALETTE.muted,
    3.4,
  );

  const basisLabel = (() => {
    const parts = assessment.levels.map(
      (level) =>
        `${level.headline.basis === "settings" ? "Settings" : "Recommendations"}${multiLevel ? ` (Level ${level.level})` : ""}`,
    );
    return parts.length ? parts.join(", ") : "Recommendations";
  })();
  const controlCells: DocumentControlCell[] = [
    { label: "Benchmark", value: name, span: 2 },
    { label: "Version", value: assessment.version },
    { label: "Level", value: levelsLabel(assessment).replace(/^Levels? /, "") },
    { label: "Tenant", value: tenant },
    { label: "Assessed", value: formatDate(assessedAt, fixed) },
    {
      label: "Data collected",
      value: collectedAt ? formatDate(collectedAt, fixed) : "Not recorded",
    },
    { label: "Basis", value: basisLabel },
    { label: "Prepared by", value: company },
  ];
  // The manual notice sits at the foot of the cover, above the footer line.
  const coverNotice = wrapText(
    doc,
    MANUAL_RECOMMENDATIONS_NOTICE,
    contentWidth,
    6.8,
  );
  const coverNoticeTop = 281 - (coverNotice.length + 1) * 3;
  const controlTop = Math.min(
    222,
    coverNoticeTop - 4 - documentControlGridHeight(doc, frame, controlCells),
  );
  drawDocumentControlGrid(
    doc,
    theme,
    frame,
    controlTop,
    "Document control",
    controlCells,
  );
  drawLines(
    doc,
    coverNotice,
    margin,
    coverNoticeTop,
    6.8,
    "normal",
    PALETTE.muted,
    3,
  );
  setFont(doc, 6.8, "bold", theme.secondary);
  doc.textWithLink(
    MANUAL_RECOMMENDATIONS_URL,
    margin,
    coverNoticeTop + coverNotice.length * 3 + capHeight(6.8),
    { url: MANUAL_RECOMMENDATIONS_URL },
  );
  drawCoverFooter(doc, frame, GENERATED_WITH, READINESS_DISCLAIMER);

  // ---------------------------------------------------- About and contents
  newPage();
  spilled = false;
  drawEyebrow(doc, "About this report", margin, y + 2.4, {
    color: theme.secondary,
  });
  y += 6;
  y =
    drawNoticeCallout(doc, theme, frame, y, {
      heading: "Read this first",
      paragraphs: [
        `${READINESS_DISCLAIMER}.`,
        "This report compares the delivered benchmark pack with the Settings Catalog policies of the last collection. It shows where the tenant holds the recommended values and does not replace an audit.",
        NEEDS_REVIEW_NOTE,
        MANUAL_RECOMMENDATIONS_NOTICE,
      ],
      link: {
        text: MANUAL_RECOMMENDATIONS_URL,
        url: MANUAL_RECOMMENDATIONS_URL,
      },
    }) + 10;
  const tocPage = currentPage();
  const tocStartY = y;

  // ---------------------------------------------------------------- Tables
  const drawTable = (
    columns: readonly Column[],
    rows: ReadonlyArray<readonly Cell[]>,
    continued: string,
  ) => {
    const xs = columns.reduce<number[]>(
      (list, column, index) => [
        ...list,
        index ? list[index - 1]! + columns[index - 1]!.width : margin,
      ],
      [],
    );
    const header = () => {
      y =
        drawTableHeader(
          doc,
          theme,
          frame,
          y,
          columns.map((column, index) => ({
            x:
              column.align === "right"
                ? xs[index]! +
                  column.width -
                  3 -
                  textWidth(doc, column.label.toUpperCase(), 5.6, "bold", 0.2)
                : xs[index]!,
            lines: tableHeaderLines(doc, column.label, column.width),
          })),
        ) + 0.6;
    };
    ensure(16);
    header();
    rows.forEach((cells, index) => {
      const height = Math.max(
        6.6,
        ...cells.map((cell) =>
          "lines" in cell
            ? cell.lines.length * lineHeight(cell.size ?? SMALL) + 3.2
            : 6.6,
        ),
      );
      if (ensure(height)) {
        caption(continued);
        header();
      }
      drawZebraRow(doc, frame, y, height, index);
      cells.forEach((cell, cellIndex) => {
        const x = xs[cellIndex]! + 1.5;
        if ("lines" in cell && columns[cellIndex]!.align === "right") {
          const size = cell.size ?? SMALL;
          setFont(doc, size, cell.style ?? "normal", cell.color ?? theme.text);
          cell.lines.forEach((line, lineIndex) =>
            doc.text(
              line,
              xs[cellIndex]! + columns[cellIndex]!.width - 1.5,
              y + 1.7 + capHeight(size) + lineIndex * lineHeight(size),
              { align: "right" },
            ),
          );
        } else if ("lines" in cell) {
          const size = cell.size ?? SMALL;
          drawLines(
            doc,
            cell.lines,
            x,
            y + 1.7,
            size,
            cell.style ?? "normal",
            cell.color ?? theme.text,
            lineHeight(size),
          );
        } else statePill(x, y + 1.2, cell.state, columns[cellIndex]!.width - 3);
      });
      y += height;
    });
    y += 5;
  };
  const textCell = (
    text: string,
    width: number,
    extra: {
      size?: number;
      style?: FontStyle;
      color?: RgbColor;
      max?: number;
    } = {},
  ): Cell => {
    const size = extra.size ?? SMALL;
    const style = extra.style ?? "normal";
    return {
      lines: wrapText(doc, text, width - 3, size, style, extra.max ?? 6),
      size,
      style,
      ...(extra.color ? { color: extra.color } : {}),
    };
  };

  // -------------------------------------------------------------- Summary
  newPage();
  spilled = false;
  pageTitle("01 Summary", "Summary", multiLevel ? LEVEL_2_NOTE : undefined);

  // A hero card per Level: the counts lead; the rate leads only when
  // rateIsHero allows it and is always shown with its base. The bar is the
  // matches out of every result of the Level.
  for (const level of assessment.levels) {
    const { headline } = level;
    const states = headline.states;
    const big = heroValue(level);
    const textX = margin + 58;
    const heroWidth = contentWidth - 58 - 6;
    const leadLines = wrapText(
      doc,
      `Level ${level.level}: ${states.matches.toLocaleString("en-US")} of ${plural(states.total, nounOf(level, 1), nounOf(level, 2))} ${states.matches === 1 ? "matches" : "match"} on assigned policies.`,
      heroWidth,
      9.4,
      "bold",
    );
    const exclusions = exclusionsText(headline);
    const baseLines = wrapText(
      doc,
      `${headlineWithBase(headline.rate, headline.counts, NOTHING_ASSESSED)}${exclusions ? `; ${exclusions}` : ""}.`,
      heroWidth,
      8.4,
    );
    const mutedLines = [
      ...wrapText(doc, `${countsLine(states)}.`, heroWidth, 7.6),
      ...(headline.basis === "settings"
        ? wrapText(doc, SETTINGS_BASIS_NOTE, heroWidth, 7.6)
        : []),
    ];
    const textHeight =
      leadLines.length * 4.3 +
      1.2 +
      baseLines.length * 3.8 +
      1.2 +
      mutedLines.length * 3.4 +
      3 +
      3 +
      4;
    const height = Math.max(multiLevel ? 30 : 34, textHeight + 8);
    ensure(height + 4);
    const top = y;
    drawCard(doc, margin, top, contentWidth, height, { fill: PALETTE.panel });
    setFont(doc, multiLevel ? 32 : 40, "bold", theme.primary);
    doc.text(big.value, margin + 6, top + height / 2 + 4);
    drawEyebrow(
      doc,
      clampLine(
        doc,
        `Matching, Level ${level.level}`.toUpperCase(),
        46,
        5.8,
        "bold",
      ),
      margin + 6.3,
      top + height / 2 + 9.5,
      { color: PALETTE.muted, size: 5.8, charSpace: 0.2 },
    );
    let textY = top + (height - textHeight) / 2;
    drawLines(doc, leadLines, textX, textY, 9.4, "bold", theme.text, 4.3);
    textY += leadLines.length * 4.3 + 1.2;
    drawLines(doc, baseLines, textX, textY, 8.4, "normal", theme.text, 3.8);
    textY += baseLines.length * 3.8 + 1.2;
    drawLines(doc, mutedLines, textX, textY, 7.6, "normal", PALETTE.muted, 3.4);
    textY += mutedLines.length * 3.4 + 3;
    drawStackedBar(
      doc,
      textX,
      textY,
      heroWidth,
      3,
      [{ value: states.matches, color: STATE_STYLE.matches.bar }],
      Math.max(states.total, 1),
      { track: PALETTE.track },
    );
    setFont(doc, 6.2, "normal", PALETTE.muted);
    doc.text("0", textX, textY + 6.6);
    doc.text(
      plural(states.total, nounOf(level, 1), nounOf(level, 2)),
      textX + heroWidth,
      textY + 6.6,
      {
        align: "right",
      },
    );
    y = top + height + 4;
  }
  if (!assessment.levels.length)
    emptyCard("No Level was assessed: the pack delivered no results.");

  // Count tiles for one Level, one per state shown on the cover.
  if (assessment.levels.length === 1) {
    const states = statesOf(coverLevel);
    const shown = shownStates([states]);
    const gap = 4;
    const tileWidth = (contentWidth - gap * (shown.length - 1)) / shown.length;
    shown.forEach((state, index) => {
      const style = STATE_STYLE[state];
      drawKpiTile(doc, margin + index * (tileWidth + gap), y, tileWidth, 26, {
        label: style.label,
        value: states[state].toLocaleString("en-US"),
        caption:
          state === "needsReview" || state === "notAssessed"
            ? KPI_CAPTIONS.notCounted
            : KPI_CAPTIONS.counted,
        marker: style.marker,
        markerColor: style.color,
        valueColor: states[state] > 0 ? TONES[style.tone].text : PALETTE.faint,
      });
    });
    y += 26 + 5;
  }

  // Status distribution: every state of each Level, with a legend.
  if (assessment.levels.length) {
    const totalAll = assessment.levels.reduce(
      (sum, level) => sum + level.headline.states.total,
      0,
    );
    ensure(8 + assessment.levels.length * 12);
    sectionHeading(
      "Status distribution",
      plural(totalAll, "result", "results"),
    );
    for (const level of assessment.levels) {
      const states = level.headline.states;
      const barX = multiLevel ? margin + 16 : margin;
      if (multiLevel) {
        setFont(doc, 7, "bold", theme.primary);
        doc.text(`Level ${level.level}`, margin, y + 3.4);
      }
      drawStackedBar(
        doc,
        barX,
        y,
        right - barX,
        4,
        segmentsOf(states),
        Math.max(states.total, 1),
        { gap: 0.6 },
      );
      y += 4 + 3.4;
      let legendX = barX;
      let legendY = y;
      for (const state of shownStates([states]).filter(
        (item) => states[item] > 0,
      )) {
        const count = states[state].toLocaleString("en-US");
        const label = `${STATE_STYLE[state].label}, ${Math.round((states[state] / Math.max(states.total, 1)) * 100)}%`;
        const countWidth = textWidth(doc, count, 7, "bold");
        const itemWidth = 3.4 + countWidth + 1.2 + textWidth(doc, label, 7) + 6;
        if (legendX + itemWidth > right + 6 && legendX > barX) {
          legendX = barX;
          legendY += 4.2;
        }
        drawMarker(
          doc,
          legendX + 1.1,
          legendY + 1.3,
          STATE_STYLE[state].marker,
          STATE_STYLE[state].color,
          1,
        );
        setFont(doc, 7, "bold", theme.text);
        doc.text(count, legendX + 3.4, legendY + 2.3);
        setFont(doc, 7, "normal", PALETTE.muted);
        doc.text(label, legendX + 3.4 + countWidth + 1.2, legendY + 2.3);
        legendX += itemWidth;
      }
      y = legendY + 4.2 + 2;
    }
    y += 3;
  }

  // Open results by reason: zebra rows with a small bar and the count.
  const reasonRows = (() => {
    const rows = new Map<
      string,
      { state: State; label: string; count: number }
    >();
    for (const item of results) {
      const label = shortReason(item);
      if (!label) continue;
      const state = stateOf(item);
      const key = `${STATES.indexOf(state)}:${label}`;
      const row = rows.get(key) ?? { state, label, count: 0 };
      row.count += 1;
      rows.set(key, row);
    }
    return [...rows.values()].sort(
      (a, b) =>
        STATES.indexOf(a.state) - STATES.indexOf(b.state) ||
        b.count - a.count ||
        a.label.localeCompare(b.label),
    );
  })();
  const totalResults = results.length;
  const openCount = reasonRows.reduce((sum, row) => sum + row.count, 0);
  if (reasonRows.length) {
    const shown = reasonRows.slice(0, 7);
    ensure(8 + shown.length * 6.2);
    sectionHeading(
      "Open results by reason",
      `${openCount.toLocaleString("en-US")} of ${plural(totalResults, "result", "results")}`,
    );
    drawRule(doc, margin, y - 1.5, right, theme.primary, 0.4);
    y -= 1.5;
    shown.forEach((row, index) => {
      const middle = y + 3.1;
      drawZebraRow(doc, frame, y, 6.2, index);
      const style = STATE_STYLE[row.state];
      drawMarker(doc, margin + 2.6, middle, style.marker, style.color, 1);
      setFont(doc, 7.8, "normal", theme.text);
      doc.text(
        clampLine(doc, `${style.label}: ${row.label}`, 112, 7.8),
        margin + 6,
        middle + capHeight(7.8) / 2,
      );
      drawStackedBar(
        doc,
        right - 58,
        middle - 0.9,
        44,
        1.8,
        [{ value: row.count, color: style.bar }],
        Math.max(totalResults, 1),
      );
      setFont(doc, 7.8, "bold", theme.primary);
      doc.text(
        row.count.toLocaleString("en-US"),
        right - 1.5,
        middle + capHeight(7.8) / 2,
        { align: "right" },
      );
      y += 6.2;
    });
    if (reasonRows.length > shown.length) {
      setFont(doc, 7, "italic", PALETTE.muted);
      doc.text(
        `${reasonRows.length - shown.length} more reasons are in the results table.`,
        margin,
        y + 3.4,
      );
      y += 5;
    }
    y += 5;
  }

  // The first steps and the key findings, measured before the sections so
  // the sections take the room that is left.
  const firstSteps = plan.actions.slice(0, 3).map((action) => ({
    action,
    lines: wrapText(
      doc,
      prose(action.text),
      contentWidth - 8 - 24,
      7.8,
      "normal",
      2,
    ),
  }));
  const stepsHeight = firstSteps.length
    ? 6.5 +
      firstSteps.reduce((sum, step) => sum + step.lines.length * 3.4 + 3, 0) +
      4
    : 0;
  const differing = detailResults.filter((item) => item.result === "Fail");
  const keyFindings = differing.slice(0, 4).map((item) => {
    const state = stateOf(item);
    const pillWidth = pillMetrics(doc, STATE_STYLE[state].label, {
      tone: STATE_STYLE[state].tone,
      marker: STATE_STYLE[state].marker,
      small: true,
    }).width;
    const chip =
      item.kind === "recommendation"
        ? Math.max(chipWidth(doc, pdfText(item.id), 6.6), 9.6) + 1.6
        : 0;
    const textX = 3.4 + pillWidth + 1.6 + chip;
    return {
      item,
      state,
      textX,
      lines: wrapText(
        doc,
        titleOf(item),
        contentWidth - textX - 26,
        7.6,
        "bold",
        2,
      ),
    };
  });
  const findingHeights = keyFindings.map((finding) =>
    finding.lines.length > 1 ? 10.6 : 7.4,
  );
  const findingsHeight = fittedFindings(
    findingHeights,
    differing.length,
    Number.POSITIVE_INFINITY,
  ).height;

  // Results by section: the first id segment of the recommendations, with
  // a bar of their states and the matches out of all.
  const sections = (() => {
    const map = new Map<string, Record<State, number> & { total: number }>();
    for (const item of results) {
      if (item.kind !== "recommendation") continue;
      const key = item.id.split(".")[0] || item.id;
      const entry = map.get(key) ?? {
        matches: 0,
        differs: 0,
        notConfigured: 0,
        needsReview: 0,
        notAssessed: 0,
        total: 0,
      };
      entry[stateOf(item)] += 1;
      entry.total += 1;
      map.set(key, entry);
    }
    return [...map.entries()].sort((a, b) => numeric(a[0], b[0]));
  })();
  if (sections.length > 1) {
    const columns = sections.length > 8 ? 2 : 1;
    const rowHeight = 6.4;
    const room = contentBottom - y - stepsHeight - findingsHeight - 6.5 - 10;
    const rows = Math.min(
      Math.ceil(sections.length / columns),
      Math.floor(room / rowHeight),
    );
    if (rows >= 2) {
      sectionHeading("Results by section", "matches of all results");
      drawRule(doc, margin, y - 1.5, right, theme.primary, 0.4);
      const top = y - 1.5;
      const gap = 8;
      const columnWidth = (contentWidth - gap * (columns - 1)) / columns;
      const shown = sections.slice(0, rows * columns);
      shown.forEach(([key, counts], index) => {
        const column = Math.floor(index / rows);
        const row = index % rows;
        const x = margin + column * (columnWidth + gap);
        const rowTop = top + row * rowHeight;
        const middle = rowTop + rowHeight / 2;
        drawChip(doc, x, middle - 2, pdfText(key), "id", {
          size: 6.4,
          height: 4,
          minWidth: 9,
          fill: primaryTint,
          color: theme.primary,
        });
        drawStackedBar(
          doc,
          x + 13,
          middle - 1.3,
          columnWidth - 13 - 22,
          2.6,
          [{ value: counts.matches, color: STATE_STYLE.matches.bar }],
          counts.total,
          { track: PALETTE.track },
        );
        const total = ` of ${counts.total}`;
        setFont(doc, 7.8, "normal", PALETTE.muted);
        const totalWidth = doc.getTextWidth(total);
        doc.text(total, x + columnWidth, middle + capHeight(7.8) / 2, {
          align: "right",
        });
        setFont(doc, 7.8, "bold", theme.primary);
        doc.text(
          String(counts.matches),
          x + columnWidth - totalWidth,
          middle + capHeight(7.8) / 2,
          {
            align: "right",
          },
        );
        drawRule(doc, x, rowTop + rowHeight, x + columnWidth);
      });
      y = top + rows * rowHeight;
      if (sections.length > shown.length) {
        setFont(doc, 7, "italic", PALETTE.muted);
        doc.text(
          `${sections.length - shown.length} more sections are in the results table.`,
          margin,
          y + 3.6,
        );
        y += 5;
      }
      y += 5;
    }
  }

  if (firstSteps.length) {
    ensure(stepsHeight);
    sectionHeading(
      "What to do first",
      `${plural(plan.actions.length, "step", "steps")} in total`,
    );
    firstSteps.forEach(({ action, lines }, index) => {
      const top = y;
      setFont(doc, 8, "bold", theme.primary);
      doc.text(`${index + 1}.`, margin, top + capHeight(8));
      drawLines(doc, lines, margin + 6, top, 7.8, "normal", theme.text, 3.4);
      const target = actionTarget(action);
      if (target) pageRef(target, right, top + capHeight(7.8));
      y += lines.length * 3.4 + 3;
      drawRule(doc, margin, y - 1.4, right);
    });
    y += 4;
  }

  // Fewer findings rather than a page holding only this block.
  const fitted = fittedFindings(
    findingHeights,
    differing.length,
    contentBottom - y,
  );
  const shownFindings = keyFindings.slice(0, fitted.count);
  ensure(fitted.height);
  sectionHeading(
    "Key findings",
    keyFindings.length ? "results that differ, by Level and id" : undefined,
  );
  if (!keyFindings.length) {
    setFont(doc, 8.2, "normal", PALETTE.muted);
    doc.text(
      pdfText(
        detailResults.length
          ? `No result differs. ${plural(detailResults.length, "result needs", "results need")} review; the steps above say what to check.`
          : "No result differs or needs review.",
      ),
      margin,
      y + 3,
    );
    y += 8;
  } else {
    for (const finding of shownFindings) {
      const height = finding.lines.length > 1 ? 10.6 : 7.4;
      const top = y;
      const middle = top + 3.7;
      doc.setFillColor(...STATE_STYLE[finding.state].color);
      doc.roundedRect(margin, top + 1.4, 0.9, height - 2.8, 0.45, 0.45, "F");
      let x = margin + 3.4;
      x += statePill(x, middle - 2.1, finding.state) + 1.6;
      if (finding.item.kind === "recommendation")
        x += idChip(x, middle - 2.2, finding.item.id) + 1.6;
      setFont(doc, 7.6, "bold", theme.text);
      finding.lines.forEach((line, index) =>
        doc.text(
          line,
          margin + finding.textX,
          middle + capHeight(7.6) / 2 + index * 3.3,
        ),
      );
      pageRef(finding.item.key, right - 1, middle + capHeight(6.6) / 2);
      drawRule(doc, margin, top + height, right);
      y += height;
    }
    if (differing.length > shownFindings.length) {
      setFont(doc, 7, "italic", PALETTE.muted);
      doc.text(
        `${plural(differing.length - shownFindings.length, "further result differs", "further results differ")}; see the result detail.`,
        margin,
        y + 3.4,
      );
      y += 5;
    }
  }

  // ---------------------------------------------------------- What to do
  sectionPage();
  pageTitle(
    "02 What to do",
    "What to Do",
    "The steps from the comparison, in order of impact. Each names the policy and the results it concerns, with the page of their detail. This report changes nothing in the tenant.",
  );
  if (!plan.actions.length)
    emptyCard(
      detailResults.length
        ? "No step could be derived from the collected data; the result detail says what each result needs."
        : "Nothing to do: no result differs or needs review.",
    );
  plan.actions.forEach((action, index) => {
    const width = contentWidth - 8 - 26;
    const textLines = wrapText(doc, prose(action.text), width, 9, "normal", 4);
    // Settings are named by their display names, their ids beneath.
    const levelTag = (text: string, level: number) =>
      multiLevel ? `${text} (Level ${level})` : text;
    const ids = action.results.map((result) =>
      levelTag(
        result.kind === "setting"
          ? settingName(assessment.settingNames, result.id)
          : result.id,
        result.level,
      ),
    );
    const shownIds = ids.slice(0, 6);
    const namedIds = action.results
      .slice(0, 6)
      .filter(
        (result) =>
          result.kind === "setting" &&
          settingName(assessment.settingNames, result.id) !== result.id,
      )
      .map((result) => result.id);
    // A step without a card of its own says where its results are listed.
    const under = groupOfAction.has(action.id)
      ? []
      : [
          ...new Set(
            action.results.flatMap((result) => {
              const step = reviewKeys.has(result.key)
                ? firstStep(result.key)
                : undefined;
              return step && step !== index + 1 ? [step] : [];
            }),
          ),
        ].sort((a, b) => a - b);
    const helps = `Helps with: ${shownIds.join(", ")}${ids.length > shownIds.length ? ` and ${ids.length - shownIds.length} more` : ""}${
      under.length
        ? `; listed under step${under.length > 1 ? "s" : ""} ${under.join(", ")}`
        : ""
    }`;
    const subLines = wrapText(doc, helps, width, 7.2, "normal", 3);
    const idLines = namedIds.length
      ? wrapText(
          doc,
          `${namedIds.length === 1 ? "Setting id" : "Setting ids"}: ${namedIds.join(", ")}`,
          width,
          5.8,
          "normal",
          2,
        )
      : [];
    // A setting compared at two Levels is one step. Assigning a policy
    // lists the steps to do first (its conditions), not the values it holds.
    const steps = [
      ...new Set(
        [
          ...(action.kind === "assignPolicy" || action.kind === "checkOtherProfiles" ? [] : action.settings),
          ...(action.conditions ?? []),
        ].map((setting) => prose(setting.text)),
      ),
    ];
    const listed = steps.slice(0, 3);
    const settingLines = listed.map((text) =>
      wrapText(doc, text, width - 4, 7.2, "normal", 2),
    );
    const more = steps.length - listed.length;
    const height =
      2.4 +
      textLines.length * 4.1 +
      0.8 +
      subLines.length * 3.2 +
      idLines.length * 2.5 +
      settingLines.reduce((sum, lines) => sum + lines.length * 3.2 + 0.6, 0) +
      (more > 0 ? 3.4 : 0) +
      2.8;
    if (ensure(height) && index > 0) caption("What to do (continued)");
    const top = y;
    setFont(doc, 9, "bold", theme.primary);
    doc.text(`${index + 1}.`, margin + 1.5, top + 2.4 + capHeight(9));
    let lineTop = top + 2.4;
    drawLines(
      doc,
      textLines,
      margin + 8,
      lineTop,
      9,
      "normal",
      theme.text,
      4.1,
    );
    lineTop += textLines.length * 4.1 + 0.8;
    drawLines(
      doc,
      subLines,
      margin + 8,
      lineTop,
      7.2,
      "normal",
      PALETTE.muted,
      3.2,
    );
    lineTop += subLines.length * 3.2;
    drawLines(
      doc,
      idLines,
      margin + 8,
      lineTop,
      5.8,
      "normal",
      PALETTE.faint,
      2.5,
    );
    lineTop += idLines.length * 2.5;
    for (const lines of settingLines) {
      doc.setFillColor(...PALETTE.muted);
      doc.circle(margin + 9, lineTop + 1.3, 0.45, "F");
      drawLines(
        doc,
        lines,
        margin + 12,
        lineTop,
        7.2,
        "normal",
        theme.text,
        3.2,
      );
      lineTop += lines.length * 3.2 + 0.6;
    }
    if (more > 0) {
      setFont(doc, 7.2, "italic", PALETTE.muted);
      doc.text(
        `and ${plural(more, "more setting", "more settings")}`,
        margin + 12,
        lineTop + capHeight(7.2),
      );
    }
    const target = actionTarget(action);
    if (target) pageRef(target, right - 1.5, top + 2.4 + capHeight(9), 7);
    drawRule(doc, margin, top + height, right);
    y += height;
  });

  // ------------------------------------------------------------- Results
  sectionPage();
  pageTitle(
    "03 Results",
    "Results",
    `${plural(results.length, "result", "results")}${
      assessment.levels.some(
        (level) => level.headline.basis === "recommendations",
      )
        ? ", grouped by section,"
        : ""
    } with the reason for every result that is not Matches and the page of its detail.`,
  );
  const reasonsUsed = new Map<string, string>();
  const drawResultsTable = (
    items: readonly AssessmentResult[],
    byRecommendation: boolean,
  ) => {
    const widths = byRecommendation ? [19, 95, 25, 34, 7] : [114, 25, 34, 7];
    const labels = byRecommendation
      ? ["ID", "Recommendation", "Result", "Reason", "Page"]
      : ["Setting", "Result", "Reason", "Page"];
    const xs = widths.map(
      (_, index) =>
        margin + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    );
    const header = () => {
      y =
        drawTableHeader(
          doc,
          theme,
          frame,
          y,
          labels.map((label, index) => ({
            // The page column is right aligned, as its numbers are.
            x:
              index === labels.length - 1
                ? right -
                  3 -
                  textWidth(doc, label.toUpperCase(), 5.6, "bold", 0.2)
                : xs[index]!,
            lines: [label],
          })),
        ) + 0.6;
    };
    const groups = new Map<string, AssessmentResult[]>();
    for (const item of [...items].sort((a, b) => numeric(a.id, b.id))) {
      const key = byRecommendation ? item.id.split(".")[0] || item.id : "";
      groups.set(key, [...(groups.get(key) ?? []), item]);
    }
    const nameColumn = byRecommendation ? 1 : 0;
    const layouts = [...groups.entries()].map(([key, group]) => ({
      key,
      rows: group.map((item) => {
        const nameWidth = widths[nameColumn]! - 3;
        const nameLines = wrapText(
          doc,
          titleOf(item),
          nameWidth,
          7,
          "normal",
          3,
        );
        const rawLines =
          item.kind === "setting" && titleOf(item) !== item.id
            ? [middleClamp(item.id, nameWidth - 2, 5.8)]
            : [];
        const reason = shortReason(item);
        if (item.reason)
          reasonsUsed.set(
            SHORT_REASON_LABELS[item.reason],
            REASON_LABELS[item.reason],
          );
        const reasonLines = reason
          ? wrapText(doc, reason, widths[nameColumn + 2]! - 3, 6.6, "normal", 2)
          : [];
        return {
          item,
          nameLines,
          rawLines,
          reasonLines,
          height: Math.max(
            5.8,
            nameLines.length * 3 + rawLines.length * 2.4 + 2.2,
            reasonLines.length * 2.8 + 2.2,
          ),
        };
      }),
    }));
    ensure(18);
    header();
    layouts.forEach((group, groupIndex) => {
      const bandHeight = 6.4;
      if (y + bandHeight + (group.rows[0]?.height ?? 0) > contentBottom) {
        newPage();
        caption("Results (continued)");
        header();
      } else if (groupIndex > 0) y += 1.5;
      const matches = group.rows.filter(
        (row) => row.item.result === "Pass",
      ).length;
      doc.setFillColor(...primaryTint);
      doc.rect(margin, y, contentWidth, bandHeight, "F");
      setFont(doc, 7.4, "bold", theme.primary);
      doc.text(
        byRecommendation
          ? `Section ${pdfText(group.key)}`
          : multiLevel
            ? `Level ${group.rows[0]?.item.level ?? ""} settings`
            : "Settings",
        margin + 1.5,
        centredBaseline(y, bandHeight, 7.4),
      );
      setFont(doc, 6.8, "normal", PALETTE.muted);
      doc.text(
        `${matches} of ${group.rows.length} match`,
        right - 1.5,
        centredBaseline(y, bandHeight, 6.8),
        { align: "right" },
      );
      y += bandHeight;
      group.rows.forEach((row, rowIndex) => {
        if (y + row.height > contentBottom) {
          newPage();
          caption(
            byRecommendation
              ? `Section ${group.key} (continued)`
              : "Results (continued)",
          );
          header();
        }
        const top = y;
        const middle = top + row.height / 2;
        drawZebraRow(doc, frame, top, row.height, rowIndex);
        if (byRecommendation)
          idChip(margin + 1.5, middle - 2.2, row.item.id, widths[0]! - 3);
        const nameX = xs[nameColumn]! + 1.5;
        const blockHeight =
          row.nameLines.length * 3 + row.rawLines.length * 2.4;
        drawLines(
          doc,
          row.nameLines,
          nameX,
          middle - blockHeight / 2 + 0.2,
          7,
          "normal",
          theme.text,
          3,
        );
        drawLines(
          doc,
          row.rawLines,
          nameX,
          middle - blockHeight / 2 + 0.2 + row.nameLines.length * 3,
          5.8,
          "normal",
          PALETTE.faint,
          2.4,
        );
        const state = stateOf(row.item);
        statePill(
          xs[nameColumn + 1]!,
          middle - 2.1,
          state,
          widths[nameColumn + 1]! - 2,
          resultLabel(
            row.item.kind === "recommendation"
              ? row.item.recommendation
              : row.item.finding,
          ),
        );
        drawLines(
          doc,
          row.reasonLines,
          xs[nameColumn + 2]! + 1.5,
          middle - (row.reasonLines.length * 2.8) / 2 + 0.2,
          6.6,
          "normal",
          PALETTE.muted,
          2.8,
        );
        if (detailKeys.has(row.item.key))
          pageRefs.push({
            page: currentPage(),
            x: right - 1.5,
            y: middle + capHeight(7.4) / 2,
            key: row.item.key,
            size: 7.4,
            label: (page) => String(page),
          });
        y += row.height;
      });
    });
    y += 6;
  };
  if (!results.length) emptyCard("The pack delivered no results.");
  for (const level of assessment.levels) {
    const items = results.filter((item) => item.level === level.level);
    if (!items.length) continue;
    if (multiLevel) {
      ensure(30);
      sectionHeading(
        `Level ${level.level}`,
        `${headlineLabel(level.headline.basis)}, ${plural(items.length, "result", "results")}`,
      );
    }
    drawResultsTable(items, level.headline.basis === "recommendations");
  }

  // Reason key: each short label once with its full sentence.
  for (const item of results)
    if (!item.reason) {
      const state = stateOf(item);
      if (state === "differs" || state === "notConfigured")
        reasonsUsed.set(FAIL_REASONS[state], STATE_DESCRIPTIONS[state]);
    }
  if (reasonsUsed.size) {
    const entries = [...reasonsUsed.entries()].map(([label, text]) => ({
      label: wrapText(doc, label, 50, 7.2, "bold"),
      text: wrapText(doc, text, contentWidth - 11 - 54, 7.2),
    }));
    const rowHeight = (entry: (typeof entries)[number]) =>
      Math.max(entry.label.length, entry.text.length) * 3.3 + 1.6;
    const height =
      6 + 5 + entries.reduce((sum, entry) => sum + rowHeight(entry), 0) + 4;
    ensure(height);
    const top = y;
    drawCard(doc, margin, top, contentWidth, height, { fill: PALETTE.panel });
    drawEyebrow(doc, "Reason key", margin + 5.5, top + 7.3, {
      color: theme.secondary,
    });
    let rowTop = top + 11.5;
    for (const entry of entries) {
      drawLines(
        doc,
        entry.label,
        margin + 5.5,
        rowTop,
        7.2,
        "bold",
        theme.text,
        3.3,
      );
      drawLines(
        doc,
        entry.text,
        margin + 5.5 + 54,
        rowTop,
        7.2,
        "normal",
        PALETTE.muted,
        3.3,
      );
      rowTop += rowHeight(entry);
    }
    y = top + height + 4;
  }

  // How to read this report: the states with their pills, then notes.
  {
    const pad = 5.5;
    const legendWidth = 98;
    const notesX = margin + pad + legendWidth + 6;
    const notesWidth = right - pad - notesX;
    const pillColumn = 30;
    const legendStates = shownStates(
      assessment.levels.map((level) => level.headline.states),
    );
    const legendRows = legendStates.map((state) => {
      const lines = wrapText(
        doc,
        STATE_DESCRIPTIONS[state],
        legendWidth - pillColumn - 2,
        6.8,
      );
      return { state, lines, height: Math.max(5, lines.length * 2.9 + 1.6) };
    });
    const notes = HOW_TO_READ_NOTES.map((note) =>
      wrapText(doc, note, notesWidth - 4, 7.2),
    );
    const legendHeight = legendRows.reduce((sum, row) => sum + row.height, 0);
    const notesHeight = notes.reduce(
      (sum, lines) => sum + lines.length * 3.4 + 1.6,
      0,
    );
    const height = 6 + 5 + Math.max(legendHeight, notesHeight) + pad;
    ensure(height);
    const top = y;
    drawCard(doc, margin, top, contentWidth, height, { fill: PALETTE.panel });
    drawEyebrow(doc, "How to read this report", margin + pad, top + pad + 1.8, {
      color: theme.secondary,
    });
    let rowTop = top + pad + 6;
    for (const row of legendRows) {
      const middle = rowTop + row.height / 2;
      statePill(margin + pad, middle - 2.1, row.state, pillColumn - 2);
      drawLines(
        doc,
        row.lines,
        margin + pad + pillColumn,
        middle - (row.lines.length * 3) / 2 + 0.2,
        6.8,
        "normal",
        PALETTE.muted,
        3,
      );
      rowTop += row.height;
    }
    let noteTop = top + pad + 6.6;
    notes.forEach((lines, index) => {
      setFont(doc, 7.2, "bold", theme.primary);
      doc.text(`${index + 1}.`, notesX, noteTop + capHeight(7.2));
      drawLines(
        doc,
        lines,
        notesX + 4,
        noteTop,
        7.2,
        "normal",
        theme.text,
        3.4,
      );
      noteTop += lines.length * 3.4 + 1.6;
    });
    y = top + height + 4;
  }

  // ----------------------------------------------------------- Data basis
  sectionPage();
  pageTitle("04 Data basis", "Data Basis");
  {
    const inner = contentWidth - 10;
    const facts = [
      {
        text: `Report date: ${formatDate(generatedAt, fixed)}`,
        style: "bold" as FontStyle,
        color: theme.text,
      },
      {
        text: `${
          formatDate(assessedAt, fixed) === formatDate(generatedAt, fixed)
            ? ""
            : `Assessed: ${formatDate(assessedAt, fixed)}. `
        }Data collected: ${collectedAt ? formatDate(collectedAt, fixed) : "Not recorded"}.`,
        style: "normal" as FontStyle,
        color: theme.text,
      },
      { text: COVER_LEAD, style: "normal" as FontStyle, color: theme.text },
      {
        text: `${title}, ${levelsLabel(assessment)}. Results are counted by ${basisLabel.toLowerCase().replace(/\(level/g, "(Level")}.`,
        style: "bold" as FontStyle,
        color: theme.primary,
      },
    ].map((fact) => ({
      ...fact,
      lines: wrapText(doc, fact.text, inner, 8.4, fact.style),
    }));
    const height =
      facts.reduce((sum, fact) => sum + fact.lines.length * 3.9 + 1.5, 0) + 7.5;
    const top = y;
    drawCard(doc, margin, top, contentWidth, height, { fill: PALETTE.panel });
    let panelY = top + 4.5;
    for (const fact of facts) {
      drawLines(
        doc,
        fact.lines,
        margin + 5,
        panelY,
        8.4,
        fact.style,
        fact.color,
        3.9,
      );
      panelY += fact.lines.length * 3.9 + 1.5;
    }
    y = top + height + 7;
  }
  sectionHeading(
    "Collection",
    assessment.collection.complete ? "Complete" : "Not complete",
  );
  if (assessment.collection.complete)
    paragraph(
      "The Settings Catalog collection is complete, so a setting missing from every policy is reported as Differs, unless profiles of another type for its platform may set it (Needs review).",
    );
  else {
    paragraph(
      "The Settings Catalog collection is not complete. Settings it cannot show to match or to be missing are Needs review, never Differs.",
    );
    for (const gap of assessment.collection.gaps)
      paragraph(gap, { size: SMALL, indent: 3, color: PALETTE.muted });
  }
  y += 3;
  const families = assessment.collection.otherProfiles ?? [];
  if (families.length) {
    ensure(30);
    sectionHeading(
      "Profile types outside the Settings Catalog",
      "not compared",
    );
    paragraph(
      "These profile types are not read by the comparison. Where they exist for a platform, a setting missing from the Settings Catalog needs review, because one of them may set it.",
    );
    const columns: Column[] = [
      { label: "Profile type", width: 84 },
      { label: "Collection", width: 30 },
      { label: "Platforms", width: contentWidth - 134 },
      { label: "Profiles", width: 20, align: "right" },
    ];
    drawTable(
      columns,
      families.map((family) => [
        textCell(
          OTHER_PROFILE_LABELS[family.family].replace(/^./, (char) =>
            char.toUpperCase(),
          ),
          84,
        ),
        textCell(family.complete ? "Complete" : "Not complete", 30),
        textCell(
          family.platforms === null
            ? "Not collected"
            : family.platforms.length
              ? family.platforms
                  .map((platform) => PLATFORM_NAMES[platform] ?? platform)
                  .join(", ")
              : "None",
          columns[2]!.width,
        ),
        textCell(String(family.count), 20),
      ]),
      "Profile types (continued)",
    );
  }
  ensure(24);
  sectionHeading("Coverage of the full benchmark");
  for (const level of assessment.levels) {
    paragraph(coverageStatement(level), { size: 8.4 });
    paragraph(
      levelCheckSummary(
        level,
        results.filter(
          (item) =>
            item.level === level.level && item.result !== "Not assessed",
        ).length,
        PRODUCT,
      ),
      { size: 8.4 },
    );
  }
  if (!assessment.levels.length)
    paragraph("No Level was assessed: the pack delivered no results.", {
      color: PALETTE.muted,
    });

  // -------------------------------------------------------- Result detail
  sectionPage();
  const detailEntry = pageTitle(
    "05 Result detail",
    "Differs and Needs Review",
    "One card per result that differs or is not configured: the tenant policies holding its settings, their assignment, the current and the recommended value, why the result is what it is and the next step. Results that need review are grouped by the step that resolves them: one card per step with its policy and assignment, and a row per result.",
    "Result Detail",
  );
  detailEntry.children = [];
  if (!detailResults.length) emptyCard("No result differs or needs review.");

  const pad = 4;
  const innerX = margin + pad;
  const innerWidth = contentWidth - pad * 2;
  const tableWidths = [64, 22, 28, 28, innerWidth - 142] as const;
  const tableX = tableWidths.map(
    (_, index) =>
      innerX +
      tableWidths.slice(0, index).reduce((sum, width) => sum + width, 0),
  );
  const rowLabel = (holder: HolderDetail): { state: State; label: string } => {
    const unassigned = holder.assignment === "notAssigned";
    const unknown = holder.assignment === "unknown";
    switch (holder.label) {
      case "Matches":
        return unassigned
          ? { state: "needsReview", label: "Matches, unassigned" }
          : unknown
            ? { state: "needsReview", label: "Matches, unconfirmed" }
            : { state: "matches", label: "Matches" };
      case "Differs":
        return unassigned
          ? { state: "needsReview", label: "Differs, unassigned" }
          : { state: "differs", label: "Differs" };
      case "Parent setting differs":
        return {
          state: unassigned ? "needsReview" : "differs",
          label: "Parent differs",
        };
      default:
        return { state: "notAssessed", label: NOT_READABLE };
    }
  };
  /** The column labels of a table inside a card, the last right aligned when asked. */
  const headerBlock = (
    labels: readonly string[],
    xs: readonly number[],
    lastRight: boolean,
  ): Block => ({
    height: 4.9,
    draw: (top) => {
      labels.forEach((label, index) => {
        const last = lastRight && index === labels.length - 1;
        drawEyebrow(doc, label, last ? right - pad : xs[index]!, top + 2.8, {
          color: PALETTE.muted,
          size: 5.6,
          charSpace: 0.2,
          align: last ? "right" : "left",
        });
      });
      drawRule(doc, innerX, top + 4.1, right - pad, PALETTE.border, 0.25);
    },
  });
  const tableHeaderBlock = headerBlock(
    ["Policy", "Assignment", "Current", "Recommended", "Result"],
    tableX,
    true,
  );
  /** The recommended value of a setting as every export shows it (values.ts recommendedValue). */
  const recommendedText = (detail: ResultSettingDetail) =>
    detail.recommended.join("; ") || NOT_READABLE;
  /**
   * A holder's value; below another parent option the setting does not
   * apply, and a value that reads like the recommended one while it differs
   * says that a setting below it differs (holderValueText).
   */
  const shownValue = (holder: HolderDetail, recommended: readonly string[]) =>
    holder.label === "Parent setting differs"
      ? PARENT_DIFFERS
      : holderValueText(holder, recommended);
  /** The differing settings below a holder's setting, as one sentence. */
  const differencesLine = (holder: HolderDetail) => {
    const text = differenceStates(holder, assessment.settingNames);
    return text ? `${DIFFERS_BELOW_LABEL}: ${text}.` : "";
  };

  /** The card of one result as blocks; table rows mark where a header repeats. */
  const cardBlocks = (item: AssessmentResult) => {
    const blocks: Block[] = [];
    const rowIndexes = new Set<number>();
    const state = stateOf(item);
    const label = resultLabel(
      item.kind === "recommendation" ? item.recommendation : item.finding,
    );
    const pillWidth = pillMetrics(doc, label, {
      tone: STATE_STYLE[state].tone,
      marker: STATE_STYLE[state].marker,
    }).width;
    const settings = resultSettingDetails(assessment, item).filter(
      (setting) => setting.result !== "Pass",
    );
    // One open setting of a recommendation is named in the header, its id
    // beneath it; several get a line each above their table.
    const single =
      item.kind === "recommendation" && settings.length === 1
        ? settings[0]
        : undefined;
    const chipW =
      item.kind === "recommendation"
        ? Math.max(chipWidth(doc, pdfText(item.id), 6.6), 9.6) + 2.5
        : 0;
    const nameWidth = innerWidth - chipW - pillWidth - 4;
    const nameLines = wrapText(doc, titleOf(item), nameWidth, 8.8, "bold", 4);
    const level = multiLevel ? `Level ${item.level}` : "";
    const settingLine =
      item.kind === "setting"
        ? level
        : single
          ? [level, single.name].filter(Boolean).join(", ")
          : level;
    const rawId =
      item.kind === "setting"
        ? titleOf(item) !== item.id
          ? item.id
          : ""
        : single && single.name !== single.settingId
          ? single.settingId
          : "";
    const settingLines = settingLine
      ? wrapText(doc, settingLine, nameWidth, 6.8, "normal", 2)
      : [];
    const rawLines = rawId
      ? wrapText(doc, rawId, nameWidth, 5.8, "normal", 2)
      : [];
    const textHeight =
      nameLines.length * 3.9 + settingLines.length * 3 + rawLines.length * 2.5;
    const headHeight = Math.max(8.6, textHeight + 3.8);
    blocks.push({
      height: headHeight + 1,
      draw: (top) => {
        doc.setFillColor(...PALETTE.panel);
        doc.roundedRect(margin, top, contentWidth, headHeight, 2, 2, "F");
        doc.rect(margin, top + headHeight - 2, contentWidth, 2, "F");
        let textTop = top + (headHeight - textHeight) / 2 + 0.2;
        // The badge sits on the first title line, as in the evidence report.
        const badgeTop =
          nameLines.length > 1
            ? textTop + capHeight(8.8) / 2 - 2.4
            : top + (headHeight - 4.8) / 2;
        const textX = innerX + chipW;
        if (item.kind === "recommendation")
          idChip(innerX, textTop + capHeight(8.8) / 2 - 2.2, item.id);
        drawLines(doc, nameLines, textX, textTop, 8.8, "bold", theme.text, 3.9);
        textTop += nameLines.length * 3.9;
        drawLines(
          doc,
          settingLines,
          textX,
          textTop,
          6.8,
          "normal",
          PALETTE.muted,
          3,
        );
        textTop += settingLines.length * 3;
        drawLines(
          doc,
          rawLines,
          textX,
          textTop,
          5.8,
          "normal",
          PALETTE.faint,
          2.5,
        );
        drawPill(doc, right - pad - pillWidth, badgeTop, label, {
          tone: STATE_STYLE[state].tone,
          marker: STATE_STYLE[state].marker,
          markerColor: STATE_STYLE[state].color,
        });
      },
    });

    const settingResults =
      item.kind === "recommendation"
        ? item.recommendation.settings
        : [
            {
              id: item.finding.settingId,
              status: item.finding.status,
              result: item.finding.result,
              ...(item.finding.reason ? { reason: item.finding.reason } : {}),
              findingKeys: [item.finding.key],
            },
          ];
    const whyTexts: string[] = [];
    settings.forEach((detail, settingIndex) => {
      const settingResult = settingResults.find(
        (setting) => setting.id === detail.settingId,
      );
      const own = (settingResult?.findingKeys ?? [])
        .map((key) => findings.get(key))
        .filter((finding): finding is SettingFinding => Boolean(finding));
      const recommended = recommendedText(detail);
      if (item.kind === "recommendation" && !single) {
        const nameLine = wrapText(doc, detail.name, innerWidth, 7.4, "bold", 2);
        const idLine =
          detail.name !== detail.settingId
            ? wrapText(doc, detail.settingId, innerWidth, 5.8, "normal", 2)
            : [];
        const gap = settingIndex ? 2.4 : 0.6;
        blocks.push({
          height: gap + nameLine.length * 3.3 + idLine.length * 2.5 + 0.6,
          draw: (top) => {
            drawLines(
              doc,
              nameLine,
              innerX,
              top + gap,
              7.4,
              "bold",
              theme.primary,
              3.3,
            );
            drawLines(
              doc,
              idLine,
              innerX,
              top + gap + nameLine.length * 3.3,
              5.8,
              "normal",
              PALETTE.faint,
              2.5,
            );
          },
        });
      }
      blocks.push(tableHeaderBlock);
      if (!detail.holders.length) {
        const currentLines = wrapText(
          doc,
          detail.status === "Missing"
            ? absentValueText(detail.status)
            : NOT_FOUND,
          tableWidths[2] - 3,
          SMALL,
          "italic",
          4,
        );
        const recLines = wrapText(
          doc,
          recommended,
          tableWidths[3] - 3,
          SMALL,
          "normal",
          6,
        );
        const height =
          Math.max(currentLines.length, recLines.length, 1) * 3.1 + 2.4;
        rowIndexes.add(blocks.length);
        blocks.push({
          height,
          draw: (top) => {
            drawLines(
              doc,
              ["No collected policy holds this setting."],
              innerX,
              top + 1.2,
              SMALL,
              "italic",
              PALETTE.muted,
              3.1,
            );
            drawLines(
              doc,
              currentLines,
              tableX[2]!,
              top + 1.2,
              SMALL,
              "italic",
              PALETTE.muted,
              3.1,
            );
            drawLines(
              doc,
              recLines,
              tableX[3]!,
              top + 1.2,
              SMALL,
              "normal",
              PALETTE.muted,
              3.1,
            );
            const absent =
              detail.status === "Missing"
                ? ({ state: "notConfigured", label: NOT_CONFIGURED } as const)
                : ({ state: "needsReview", label: NOT_FOUND } as const);
            const pill = {
              tone: STATE_STYLE[absent.state].tone,
              marker: STATE_STYLE[absent.state].marker,
              markerColor: STATE_STYLE[absent.state].color,
              small: true,
              maxWidth: tableWidths[4] - 1,
            } as const;
            drawPill(
              doc,
              right - pad - pillMetrics(doc, absent.label, pill).width,
              top + 0.3,
              absent.label,
              pill,
            );
          },
        });
      }
      detail.holders.forEach((holder, holderIndex) => {
        const policyLines = wrapText(
          doc,
          holder.policyName,
          tableWidths[0] - 3,
          SMALL,
          "bold",
          3,
        );
        const reach =
          holder.assignment === "assigned"
            ? holder.assignedTo.replace(/^assigned to /, "")
            : holder.assignment === "unknown"
              ? holder.assignedTo.replace(/^assignment unknown: /, "")
              : "";
        // The assignment chip names its targets when they fit beside it.
        const assignment = assignmentLabel(holder.assignment);
        const inline =
          holder.assignment === "assigned" &&
          textWidth(doc, pdfText(`${assignment}: ${reach}`), 6) + 3.4 <=
            tableWidths[1] - 1;
        const chipLabel = inline
          ? pdfText(`${assignment}: ${reach}`)
          : assignment;
        const reachLines =
          reach && !inline
            ? wrapText(doc, reach, tableWidths[1] - 2, 6, "normal", 3)
            : [];
        const currentText = shownValue(holder, detail.recommended);
        const currentLines = wrapText(
          doc,
          currentText,
          tableWidths[2] - 3,
          SMALL,
          "bold",
          6,
        );
        const recLines = wrapText(
          doc,
          recommended,
          tableWidths[3] - 3,
          SMALL,
          "normal",
          6,
        );
        const causeLines = holder.current.cause
          ? wrapText(
              doc,
              UNREADABLE_CAUSE_LABELS[holder.current.cause],
              innerWidth - 2,
              6.4,
              "italic",
              2,
            )
          : [];
        const below = differencesLine(holder);
        const differenceLines = below
          ? wrapText(doc, below, innerWidth - 2, 6.4, "normal", 6)
          : [];
        const notesTop = causeLines.length ? causeLines.length * 2.8 + 0.4 : 0;
        const row = rowLabel(holder);
        const body = Math.max(
          policyLines.length * 3.1,
          4 + reachLines.length * 2.6,
          currentLines.length * 3.1,
          recLines.length * 3.1,
          4,
        );
        const height =
          body +
          2.1 +
          notesTop +
          (differenceLines.length ? differenceLines.length * 2.8 + 0.4 : 0);
        const last = holderIndex === detail.holders.length - 1;
        rowIndexes.add(blocks.length);
        blocks.push({
          height,
          draw: (top) => {
            if (row.state === "differs") {
              doc.setFillColor(255, 247, 247);
              doc.rect(innerX, top, innerWidth, height, "F");
            }
            const cellTop = top + 1.15;
            drawLines(
              doc,
              policyLines,
              tableX[0]!,
              cellTop,
              SMALL,
              "bold",
              theme.text,
              3.1,
            );
            const tone =
              holder.assignment === "assigned"
                ? "info"
                : holder.assignment === "notAssigned"
                  ? "none"
                  : "partial";
            const chipW = textWidth(doc, chipLabel, 6) + 3.4;
            doc.setFillColor(
              ...(tone === "info" ? primaryTint : TONES[tone].fill),
            );
            doc.roundedRect(
              tableX[1]!,
              cellTop - 0.7,
              chipW,
              3.9,
              1.95,
              1.95,
              "F",
            );
            setFont(
              doc,
              6,
              "normal",
              tone === "info" ? theme.primary : TONES[tone].text,
            );
            doc.text(
              chipLabel,
              tableX[1]! + 1.7,
              centredBaseline(cellTop - 0.7, 3.9, 6),
            );
            drawLines(
              doc,
              reachLines,
              tableX[1]!,
              cellTop + 4,
              6,
              "normal",
              PALETTE.muted,
              2.6,
            );
            drawLines(
              doc,
              currentLines,
              tableX[2]!,
              cellTop,
              SMALL,
              currentText !== PARENT_DIFFERS &&
                holder.current.text !== NOT_READABLE
                ? "bold"
                : "italic",
              currentText !== PARENT_DIFFERS &&
                holder.current.text !== NOT_READABLE
                ? theme.text
                : PALETTE.muted,
              3.1,
            );
            drawLines(
              doc,
              recLines,
              tableX[3]!,
              cellTop,
              SMALL,
              "normal",
              PALETTE.muted,
              3.1,
            );
            const pill = {
              tone: STATE_STYLE[row.state].tone,
              marker: STATE_STYLE[row.state].marker,
              markerColor: STATE_STYLE[row.state].color,
              small: true,
              maxWidth: tableWidths[4] - 1,
            } as const;
            drawPill(
              doc,
              right - pad - pillMetrics(doc, row.label, pill).width,
              cellTop - 0.9,
              row.label,
              pill,
            );
            drawLines(
              doc,
              causeLines,
              innerX,
              cellTop + body + 0.4,
              6.4,
              "italic",
              PALETTE.muted,
              2.8,
            );
            drawLines(
              doc,
              differenceLines,
              innerX,
              cellTop + body + 0.4 + notesTop,
              6.4,
              "normal",
              theme.text,
              2.8,
            );
            if (!last) drawRule(doc, innerX, top + height, right - pad);
          },
        });
      });
      // Why the setting has its result, with its own qualifier.
      const status = settingResult
        ? settingStatusText(
            settingResult,
            matchingPolicies(own, detail.settingId),
          )
        : RESULT_LABELS[detail.result];
      // The rows carry the qualifier of each match, so the reason alone
      // follows; a difference says which policies hold the other value.
      const why = detail.reason
        ? REASON_LABELS[detail.reason]
        : detail.result === "Fail"
          ? differsReasonText(detail)
          : `${status}.`;
      if (single || item.kind === "setting") whyTexts.push(why);
      else {
        const lines = wrapText(doc, why, innerWidth, 6.8, "normal", 4);
        blocks.push({
          height: lines.length * 3 + 2,
          draw: (top) => {
            drawRule(doc, innerX, top + 0.4, right - pad, PALETTE.border, 0.25);
            drawLines(
              doc,
              lines,
              innerX,
              top + 1.4,
              6.8,
              "normal",
              PALETTE.muted,
              3,
            );
          },
        });
      }
    });
    // The reason and the next step close the card as short muted lines.
    const next = prose(nextStepText(plan, item));
    // A reason the next step already states is not repeated.
    const whyLines = whyTexts
      .filter((text) => !next.includes(text))
      .flatMap((text) => wrapText(doc, text, innerWidth, 6.8, "normal", 4));
    const nextLines = next
      ? wrapText(doc, next, innerWidth - 18, 7, "normal", 6)
      : [];
    if (whyLines.length || nextLines.length)
      blocks.push({
        height:
          1.6 +
          whyLines.length * 3 +
          (nextLines.length
            ? (whyLines.length ? 1 : 0) + nextLines.length * 3.1
            : 0) +
          0.6,
        draw: (top) => {
          drawRule(doc, innerX, top + 0.4, right - pad, PALETTE.border, 0.25);
          let lineTop = top + 1.6;
          drawLines(
            doc,
            whyLines,
            innerX,
            lineTop,
            6.8,
            "normal",
            PALETTE.muted,
            3,
          );
          lineTop += whyLines.length * 3 + (whyLines.length ? 1 : 0);
          if (nextLines.length) {
            drawEyebrow(doc, "Next step", innerX, lineTop + capHeight(7), {
              color: PALETTE.muted,
              size: 5.4,
              charSpace: 0.2,
            });
            drawLines(
              doc,
              nextLines,
              innerX + 18,
              lineTop,
              7,
              "normal",
              theme.text,
              3.1,
            );
          }
        },
      });
    return { blocks, rowIndexes };
  };

  /** The card of a group of Needs review results: the step, its policy and a row per result. */
  const groupBlocks = (group: ReviewGroup) => {
    const blocks: Block[] = [];
    const rowIndexes = new Set<number>();
    const { action } = group;
    const policy = action?.policy;
    const byRecommendation = group.items.some(
      (item) => item.kind === "recommendation",
    );
    const widths = byRecommendation
      ? [18, 60, 28, 28, innerWidth - 134]
      : [0, 78, 28, 28, innerWidth - 134];
    const xs = widths.map(
      (_, index) =>
        innerX + widths.slice(0, index).reduce((sum, width) => sum + width, 0),
    );

    // The head: the step chip, the action or the reason, the count, and the
    // policy with where it is assigned.
    const chipLabel = action ? `Step ${group.step}` : "No step";
    const chipW = Math.max(chipWidth(doc, chipLabel, 6.6), 9.6) + 2.5;
    // The step's results of this Level that need review; those not here are
    // listed under an earlier step.
    const ofStep = action
      ? action.results.filter(
          (result) =>
            result.level === group.level && reviewKeys.has(result.key),
        ).length
      : group.items.length;
    // Assigning a policy lists the results that would match and those its
    // conditions change (each of which would differ as it is); the other
    // results that would differ are counted in its text and listed
    // elsewhere.
    const wouldDiffer =
      action?.kind === "assignPolicy" && action.unlocks
        ? Math.max(
            0,
            action.unlocks.differs -
              (action.results.length - action.unlocks.matches),
          )
        : 0;
    const earlier = ofStep - group.items.length;
    // A step for settings of several Levels counts all of them in its text;
    // this card lists those of its Level, so the count names the whole.
    const otherLevels = action
      ? action.results.filter(
          (result) =>
            result.level !== group.level && reviewKeys.has(result.key),
        )
      : [];
    const otherLevelNames = [
      ...new Set(otherLevels.map((result) => result.level)),
    ].sort((a, b) => a - b);
    const count =
      earlier > 0 || otherLevels.length
        ? `${group.items.length.toLocaleString("en-US")} of ${plural(ofStep + otherLevels.length, "result", "results")}`
        : plural(group.items.length, "result", "results");
    const countWidth = textWidth(doc, count, 6.8);
    const textWidthHere = innerWidth - chipW - countWidth - 4;
    const titleLines = wrapText(
      doc,
      action
        ? prose(action.text)
        : group.reason
          ? SHORT_REASON_LABELS[group.reason]
          : "Needs review",
      textWidthHere,
      8.2,
      "bold",
      5,
    );
    const subText = policy
      ? `Policy ${policy.name}`
      : !action && group.reason
        ? `${REASON_LABELS[group.reason]} The plan has no step for these results.`
        : "";
    const subLines = subText
      ? wrapText(
          doc,
          subText,
          textWidthHere,
          7,
          policy ? "bold" : "normal",
          policy ? 2 : 4,
        )
      : [];
    const reach = policy
      ? reachText(policy).replace(/^./, (char) => char.toUpperCase())
      : "";
    const reachLines = [
      ...(reach ? wrapText(doc, reach, textWidthHere, 6.6, "normal", 3) : []),
      ...(earlier > 0
        ? wrapText(
            doc,
            `${otherLevels.length ? "" : "The other "}${plural(earlier, "result is", "results are")} listed under an earlier step.`,
            textWidthHere,
            6.6,
            "normal",
            2,
          )
        : []),
      ...(otherLevels.length
        ? wrapText(
            doc,
            `${plural(otherLevels.length, "result of this step is", "results of this step are")} at Level ${otherLevelNames.join(" and ")}, listed with ${otherLevelNames.length > 1 ? "those Levels" : "that Level"}.`,
            textWidthHere,
            6.6,
            "normal",
            2,
          )
        : []),
      ...(wouldDiffer > 0
        ? wrapText(
            doc,
            `The ${plural(wouldDiffer, "result that would differ is", "results that would differ are")} not listed in this card.`,
            textWidthHere,
            6.6,
            "normal",
            2,
          )
        : []),
      // The steps to do before assigning the policy, as the plan names them.
      ...(action?.conditions?.length
        ? wrapText(
            doc,
            `Before assigning it: ${[...new Set(action.conditions.map((setting) => prose(setting.text)))].join(" ")}`,
            textWidthHere,
            6.6,
            "normal",
            6,
          )
        : []),
    ];
    const textHeight =
      titleLines.length * 3.7 +
      (subLines.length ? 0.8 + subLines.length * 3.1 : 0) +
      reachLines.length * 2.9;
    const headHeight = Math.max(9, textHeight + 4);
    blocks.push({
      height: headHeight + 1,
      draw: (top) => {
        detailPages.set(group.key, currentPage());
        doc.setFillColor(...PALETTE.panel);
        doc.roundedRect(margin, top, contentWidth, headHeight, 2, 2, "F");
        doc.rect(margin, top + headHeight - 2, contentWidth, 2, "F");
        let textTop = top + (headHeight - textHeight) / 2 + 0.2;
        drawChip(
          doc,
          innerX,
          textTop + capHeight(8.2) / 2 - 2.2,
          chipLabel,
          "id",
          {
            size: 6.6,
            height: 4.4,
            minWidth: 9.6,
            fill: primaryTint,
            color: theme.primary,
          },
        );
        const textX = innerX + chipW;
        drawLines(
          doc,
          titleLines,
          textX,
          textTop,
          8.2,
          "bold",
          theme.text,
          3.7,
        );
        setFont(doc, 6.8, "normal", PALETTE.muted);
        doc.text(count, right - pad, textTop + capHeight(8.2), {
          align: "right",
        });
        textTop += titleLines.length * 3.7 + (subLines.length ? 0.8 : 0);
        drawLines(
          doc,
          subLines,
          textX,
          textTop,
          7,
          policy ? "bold" : "normal",
          policy ? theme.text : PALETTE.muted,
          3.1,
        );
        textTop += subLines.length * 3.1;
        drawLines(
          doc,
          reachLines,
          textX,
          textTop,
          6.6,
          "normal",
          PALETTE.muted,
          2.9,
        );
      },
    });
    const header = headerBlock(
      byRecommendation
        ? ["ID", "Recommendation", "Current", "Recommended", "Reason"]
        : ["Setting", "Current", "Recommended", "Reason"],
      byRecommendation ? xs : xs.slice(1),
      false,
    );
    blocks.push(header);

    // A row per result: its open settings, each with the value in the step's
    // policy (in every holding policy for a step without one) and the
    // recommended value, the reason and the other steps of the result.
    const causes = new Set<string>();
    const reasons = new Set<ReasonCode>();
    const valueStyle = (text: string) =>
      text === NOT_READABLE ||
      text === PARENT_DIFFERS ||
      text === NOT_CONFIGURED ||
      text === NOT_FOUND
        ? { style: "italic" as FontStyle, color: PALETTE.muted }
        : { style: "bold" as FontStyle, color: theme.text };
    group.items.forEach((item, rowIndex) => {
      if (item.reason) reasons.add(item.reason);
      const title = titleOf(item);
      const nameWidth = widths[1]! - 3;
      const titleLines = wrapText(doc, title, nameWidth, 7, "normal", 5);
      const details = resultSettingDetails(assessment, item).filter(
        (detail) => detail.result !== "Pass",
      );
      const parts = details.map((detail) => {
        const named =
          item.kind === "recommendation" &&
          (details.length > 1 || detail.name !== title);
        // A setting of several with its own reason says so.
        const ownReason =
          details.length > 1 && detail.reason && detail.reason !== item.reason
            ? ` (${SHORT_REASON_LABELS[detail.reason]})`
            : "";
        const nameLines = named
          ? wrapText(
              doc,
              `${detail.name}${ownReason}`,
              nameWidth,
              6.4,
              "normal",
              3,
            )
          : [];
        const rawLines =
          detail.name !== detail.settingId
            ? [middleClamp(detail.settingId, nameWidth, 5.6)]
            : [];
        // The step's policy when it holds the setting, otherwise every holder.
        const own = policy
          ? detail.holders.filter((holder) => holder.policyId === policy.id)
          : [];
        const holders = own.length ? own : detail.holders;
        for (const holder of detail.holders)
          if (holder.current.cause)
            causes.add(UNREADABLE_CAUSE_LABELS[holder.current.cause]);
        const valueOf = (holder: HolderDetail) =>
          shownValue(holder, detail.recommended);
        const named_ = (holder: HolderDetail) =>
          `${holder.policyName} (${assignmentLabel(holder.assignment).toLowerCase()})`;
        const values = [...new Set(holders.map(valueOf))];
        // The other policies holding the setting are named with their
        // assignment: those with another value beside the step's policy, all
        // of them for a step without one. Their steps are in the reason
        // column, so the card loses nothing a result's own card showed.
        const others = own.length
          ? detail.holders.filter(
              (holder) =>
                !own.includes(holder) && !values.includes(valueOf(holder)),
            )
          : [];
        const listed = own.length
          ? others.length
            ? `In other policies: ${others.map((holder) => `${named_(holder)}: ${valueOf(holder)}`).join("; ")}`
            : ""
          : holders.length
            ? `Held by: ${holders
                .map((holder) =>
                  values.length > 1
                    ? `${named_(holder)}: ${valueOf(holder)}`
                    : named_(holder),
                )
                .join("; ")}`
            : "";
        // The settings below that differ, per policy when several are shown.
        const below = holders.flatMap((holder) => {
          const line = differencesLine(holder);
          return line
            ? [holders.length > 1 ? `${holder.policyName}: ${line}` : line]
            : [];
        });
        const note = below.length
          ? [listed && `${listed}.`, ...below].filter(Boolean).join(" ")
          : listed;
        const otherLines = note
          ? wrapText(doc, note, nameWidth, 6, "italic", 14)
          : [];
        const current = !holders.length
          ? detail.status === "Missing"
            ? NOT_CONFIGURED
            : NOT_FOUND
          : values.join("; ");
        const recommended =
          detail.status === "Unmapped" ? "" : recommendedText(detail);
        const currentStyle = valueStyle(current);
        const currentLines = wrapText(
          doc,
          current,
          widths[2]! - 3,
          6.8,
          currentStyle.style,
          8,
        );
        const recLines = wrapText(
          doc,
          recommended,
          widths[3]! - 3,
          6.8,
          "normal",
          6,
        );
        return {
          nameLines,
          rawLines,
          otherLines,
          currentLines,
          currentStyle,
          recLines,
          labelHeight:
            nameLines.length * 2.9 +
            rawLines.length * 2.4 +
            otherLines.length * 2.6,
          valueHeight: Math.max(currentLines.length, recLines.length) * 3,
        };
      });
      const single = parts.length === 1;
      const reason = shortReason(item);
      const reasonLines = reason
        ? wrapText(doc, reason, widths[4]! - 3, 6.4, "normal", 3)
        : [];
      const others = (plan.byResult[item.key] ?? [])
        .slice(1)
        .flatMap((id) => (stepOf.has(id) ? [stepOf.get(id)!] : []));
      const alsoLines = others.length
        ? wrapText(
            doc,
            `Also step${others.length > 1 ? "s" : ""} ${others.join(", ")}`,
            widths[4]! - 3,
            6,
            "italic",
            3,
          )
        : [];
      const titleHeight = titleLines.length * 3.1;
      // One setting sits beside the title; several get a line each below it.
      const partsHeight = single
        ? parts[0]!.labelHeight
        : parts.reduce(
            (sum, part) =>
              sum + Math.max(part.labelHeight, part.valueHeight) + 0.6,
            0,
          );
      const height =
        Math.max(
          titleHeight + partsHeight,
          single ? parts[0]!.valueHeight : titleHeight + partsHeight,
          reasonLines.length * 2.8 + alsoLines.length * 2.6,
          4,
        ) + 2.4;
      const last = rowIndex === group.items.length - 1;
      rowIndexes.add(blocks.length);
      blocks.push({
        height,
        draw: (top) => {
          detailPages.set(item.key, currentPage());
          if (rowIndex % 2 === 1) {
            doc.setFillColor(...PALETTE.zebra);
            doc.rect(innerX, top, innerWidth, height, "F");
          }
          const cellTop = top + 1.2;
          if (item.kind === "recommendation")
            idChip(xs[0]!, cellTop - 0.5, item.id, widths[0]! - 2);
          drawLines(
            doc,
            titleLines,
            xs[1]!,
            cellTop,
            7,
            "normal",
            theme.text,
            3.1,
          );
          let partTop = cellTop + titleHeight;
          parts.forEach((part) => {
            const valueTop = single ? cellTop : partTop;
            drawLines(
              doc,
              part.nameLines,
              xs[1]!,
              partTop,
              6.4,
              "normal",
              PALETTE.muted,
              2.9,
            );
            drawLines(
              doc,
              part.rawLines,
              xs[1]!,
              partTop + part.nameLines.length * 2.9,
              5.6,
              "normal",
              PALETTE.faint,
              2.4,
            );
            drawLines(
              doc,
              part.otherLines,
              xs[1]!,
              partTop +
                part.nameLines.length * 2.9 +
                part.rawLines.length * 2.4,
              6,
              "italic",
              PALETTE.muted,
              2.6,
            );
            drawLines(
              doc,
              part.currentLines,
              xs[2]!,
              valueTop,
              6.8,
              part.currentStyle.style,
              part.currentStyle.color,
              3,
            );
            drawLines(
              doc,
              part.recLines,
              xs[3]!,
              valueTop,
              6.8,
              "normal",
              PALETTE.muted,
              3,
            );
            partTop += single
              ? part.labelHeight
              : Math.max(part.labelHeight, part.valueHeight) + 0.6;
          });
          drawLines(
            doc,
            reasonLines,
            xs[4]!,
            cellTop,
            6.4,
            "normal",
            PALETTE.muted,
            2.8,
          );
          drawLines(
            doc,
            alsoLines,
            xs[4]!,
            cellTop + reasonLines.length * 2.8,
            6,
            "italic",
            PALETTE.muted,
            2.6,
          );
          if (!last) drawRule(doc, innerX, top + height, right - pad);
        },
      });
    });

    // Why, once per card: the reasons of a step's results and the causes of
    // values that cannot be read.
    const notes = [
      ...(action ? [...reasons].map((reason) => REASON_LABELS[reason]) : []),
      ...causes,
    ];
    if (notes.length) {
      const lines = notes.flatMap((note) =>
        wrapText(doc, note, innerWidth, 6.6, "normal", 4),
      );
      // The notes never open a page on their own.
      blocks[blocks.length - 1]!.keepNext = true;
      blocks.push({
        height: 1.6 + lines.length * 2.9 + 0.6,
        draw: (top) => {
          drawRule(doc, innerX, top + 0.4, right - pad, PALETTE.border, 0.25);
          drawLines(
            doc,
            lines,
            innerX,
            top + 1.6,
            6.6,
            "normal",
            PALETTE.muted,
            2.9,
          );
        },
      });
    }
    return { blocks, rowIndexes, header };
  };

  /**
   * Draws a card from blocks. A card that fits a page starts on the next
   * page when it does not fit here (whole), or when less than 40 mm remain;
   * a taller one, and a grouped card (whole: false) once 40 mm remain,
   * continues on the next page with its own border, a caption and the table
   * header again.
   */
  let groupHeading = "";
  const flowCard = (card: {
    /** The key whose page the card's first page is, for page numbers. */
    pageKey?: string;
    blocks: readonly Block[];
    rowIndexes: ReadonlySet<number>;
    header: Block;
    continued: string;
    whole: boolean;
  }) => {
    const { blocks, rowIndexes, header } = card;
    const bottomPad = 2.2;
    const total =
      blocks.reduce((sum, block) => sum + block.height, 0) + bottomPad;
    if (
      y + total > contentBottom &&
      ((card.whole && total <= contentBottom - contentTop - 8) ||
        contentBottom - y < 40)
    ) {
      newPage();
      caption(`${groupHeading} (continued)`);
    }
    if (card.pageKey) detailPages.set(card.pageKey, currentPage());
    let segmentTop = y;
    const close = () => {
      drawCard(
        doc,
        margin,
        segmentTop,
        contentWidth,
        y + bottomPad - segmentTop,
        { stroke: PALETTE.border },
      );
      y += bottomPad;
    };
    blocks.forEach((block, index) => {
      const needed =
        block.height + (block.keepNext ? (blocks[index + 1]?.height ?? 0) : 0);
      if (y + needed + bottomPad > contentBottom && y > segmentTop) {
        close();
        newPage();
        caption(card.continued);
        segmentTop = y;
        y += 1.5;
        if (rowIndexes.has(index)) {
          header.draw(y);
          y += header.height;
        }
      }
      block.draw(y);
      y += block.height;
    });
    close();
    y += 2.6;
  };

  // Per Level: a card per result that differs, then the grouped cards of
  // the results that need review.
  const levelsShown = [...new Set(detailResults.map((item) => item.level))];
  const section = (heading: string, count: number, first: readonly Block[]) => {
    const lead = Math.min(
      first.reduce((sum, block) => sum + block.height, 0) + 3,
      60,
    );
    if (y > contentTop) y += 2;
    ensure(6.5 + lead);
    detailEntry.children!.push({
      title: heading,
      page: currentPage(),
      level: 1,
    });
    sectionHeading(heading, plural(count, "result", "results"));
    groupHeading = heading;
  };
  for (const level of levelsShown) {
    const prefix = multiLevel ? `Level ${level}, ` : "";
    const differing = detailResults.filter(
      (item) => item.level === level && item.result === "Fail",
    );
    // Not configured is a kind of Differs; the heading names what is there.
    const kinds = new Set(differing.map(stateOf));
    const differsHeading =
      kinds.has("differs") && kinds.has("notConfigured")
        ? `${RESULT_LABELS.Fail} and ${NOT_CONFIGURED}`
        : kinds.has("notConfigured")
          ? NOT_CONFIGURED
          : RESULT_LABELS.Fail;
    differing.forEach((item, index) => {
      const { blocks, rowIndexes } = cardBlocks(item);
      if (!index)
        section(`${prefix}${differsHeading}`, differing.length, blocks);
      flowCard({
        pageKey: item.key,
        blocks,
        rowIndexes,
        header: tableHeaderBlock,
        continued: `${prefix}${item.kind === "recommendation" ? item.id : titleOf(item)} (continued)`,
        whole: true,
      });
    });
    const groups = reviewGroups.filter((group) => group.level === level);
    groups.forEach((group, index) => {
      const card = groupBlocks(group);
      if (!index)
        section(
          `${prefix}${RESULT_LABELS.Review}, by step`,
          groups.reduce((sum, item) => sum + item.items.length, 0),
          card.blocks.slice(0, 4),
        );
      flowCard({
        ...card,
        continued: `${prefix}${group.step ? `Step ${group.step}` : "Results without a step"}${
          group.action?.policy
            ? `, policy ${group.action.policy.name.trim()}`
            : ""
        } (continued)`,
        whole: false,
      });
    });
  }

  // -------------------------------------------------------------- Appendix
  sectionPage();
  const appendix = pageTitle(
    "Appendix",
    "Manual Recommendations, Exceptions and Method",
    undefined,
    "Appendix: Manual Recommendations, Exceptions and Method",
  );
  appendix.children = [];
  appendix.children.push({
    title: "Manual recommendations",
    page: currentPage(),
    level: 1,
  });
  const manualCount = assessment.levels.reduce(
    (sum, level) => sum + level.manual.length,
    0,
  );
  sectionHeading("Manual recommendations", `${manualCount} listed`);
  y =
    drawNoticeCallout(doc, theme, frame, y, {
      heading: "Check these by hand",
      paragraphs: [MANUAL_RECOMMENDATIONS_NOTICE],
      link: {
        text: MANUAL_RECOMMENDATIONS_URL,
        url: MANUAL_RECOMMENDATIONS_URL,
      },
    }) + 4;
  const packTitles = new Map(
    assessment.recommendations.map((item) => [item.id, item.title]),
  );
  if (!manualCount)
    paragraph(
      assessment.listUsed
        ? `The delivered list names no manual recommendation. ${assessment.manualNote || MANUAL_NOT_ASSESSED_NOTE}`
        : `No recommendation list was delivered, so no manual recommendation is listed. ${assessment.manualNote || MANUAL_NOT_ASSESSED_NOTE}`,
      { size: 8.4, color: PALETTE.muted },
    );
  else {
    paragraph(assessment.manualNote || MANUAL_NOT_ASSESSED_NOTE, {
      size: 8.4,
      color: PALETTE.muted,
    });
    for (const level of assessment.levels) {
      if (!level.manual.length) continue;
      if (multiLevel) caption(`Level ${level.level}`);
      drawTable(
        [
          { label: "ID", width: 22 },
          { label: "Title", width: contentWidth - 22 },
        ],
        level.manual.map((manual) => [
          {
            lines: wrapText(doc, manual.identifier, 19, SMALL, "bold", 2),
            style: "bold",
            color: theme.primary,
          },
          (manual.title ?? packTitles.get(manual.identifier))
            ? textCell(
                manual.title ?? packTitles.get(manual.identifier) ?? "",
                contentWidth - 22,
              )
            : textCell("No title delivered", contentWidth - 22, {
                color: PALETTE.muted,
              }),
        ]),
        "Manual recommendations (continued)",
      );
    }
  }

  // The exceptions of the Levels the assessment applies, each with the
  // headlines that counted it: a Level 2 exception the Level 1 part did not
  // use (Level 1 has its own) is never attributed to Level 1.
  const levelsApplied = exceptionLevels(assessment);
  const exceptions = (options.exceptions ?? []).filter(
    (exception) =>
      exception.benchmark === assessment.benchmark &&
      exception.version === assessment.version &&
      levelsApplied.includes(exception.level),
  );
  const appliedTo = (id: string) =>
    assessment.levels
      .filter((level) => level.headline.exceptionIds.includes(id))
      .map((level) => level.level);
  const severalLevels = assessment.levels.length > 1;
  const levelWidth = levelsApplied.length > 1 ? 12 : 0;
  const assessedDay = localDate(assessment.assessedAt);
  y += 3;
  ensure(24);
  appendix.children.push({
    title: "Exceptions",
    page: currentPage(),
    level: 1,
  });
  sectionHeading("Exceptions", `${exceptions.length} recorded`);
  if (!exceptions.length)
    emptyCard(
      "No exceptions are recorded for this benchmark, version and Level.",
    );
  else {
    const columns: Column[] = [
      { label: "Setting", width: 52 },
      ...(levelWidth ? [{ label: "Level", width: levelWidth }] : []),
      { label: "Owner", width: 30 },
      { label: "Reason", width: contentWidth - 52 - levelWidth - 30 - 22 - 32 },
      { label: "Expires", width: 22 },
      { label: "Status", width: 32 },
    ];
    const status = (exception: BenchmarkException) => {
      const applied = appliedTo(exception.id);
      if (applied.length)
        return severalLevels
          ? `Applied to Level ${applied.join(" and ")}`
          : "Applied to the headline";
      return appliesOn(exception, assessedDay) ? "In effect" : "Not in effect";
    };
    drawTable(
      columns,
      [...exceptions]
        .sort(
          (a, b) =>
            a.settingId.localeCompare(b.settingId) ||
            a.level - b.level ||
            a.id.localeCompare(b.id),
        )
        .map((exception) => [
          textCell(exception.settingId, 52, { size: 6.8 }),
          ...(levelWidth
            ? [textCell(String(exception.level), levelWidth, { size: 6.8 })]
            : []),
          textCell(exception.owner, 30, { size: 6.8 }),
          textCell(exception.reason, columns[levelWidth ? 3 : 2]!.width, {
            size: 6.8,
          }),
          textCell(exception.expiresOn, 22, { size: 6.8 }),
          textCell(status(exception), 32, {
            size: 6.8,
            color: PALETTE.muted,
          }),
        ]),
      "Exceptions (continued)",
    );
  }

  y += 2;
  ensure(36);
  appendix.children.push({ title: "Method", page: currentPage(), level: 1 });
  sectionHeading("Method");
  for (const line of METHOD_LINES) paragraph(line, { size: 8.6 });

  // A section with a single group needs no sub-entry.
  if (detailEntry.children.length < 2) detailEntry.children = [];

  // ------------------------------------------------------------- Contents
  const flat: TocItem[] = toc.flatMap((entry) => [
    entry,
    ...(entry.children ?? []),
  ]);
  const { rows: tocRows, extraPages } = layoutToc(doc, frame, flat, tocStartY);
  // Every recorded page after the contents moves by the inserted pages.
  for (const entry of flat) entry.page += extraPages;
  drawToc(doc, theme, frame, {
    heading: "Table of Contents",
    tocPage,
    startY: tocStartY,
    rows: tocRows,
    extraPages,
  });
  for (const reference of pageRefs) {
    const target = detailPages.get(reference.key);
    if (target === undefined) continue;
    doc.setPage(reference.page + extraPages);
    setFont(
      doc,
      reference.size,
      "bold",
      reference.size >= 7.4 ? theme.primary : theme.secondary,
    );
    doc.text(reference.label(target + extraPages), reference.x, reference.y, {
      align: "right",
    });
  }
  const outline = (entry: TocEntry): PdfOutlineEntry => ({
    title: entry.title,
    pageNumber: entry.page,
    ...(entry.children?.length
      ? { children: entry.children.map(outline) }
      : {}),
  });
  addPdfOutline(doc, toc.map(outline));

  drawRunningChrome(doc, theme, frame, {
    title: `${title}, ${levelsLabel(assessment)}`,
    titleMaxWidth: 90,
    ...(tenant || company ? { headerRight: tenant ?? company } : {}),
    footer: `${GENERATED_WITH}. ${READINESS_DISCLAIMER}.`,
    pageLabel: (page, count) => `Page ${page} of ${count}`,
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
