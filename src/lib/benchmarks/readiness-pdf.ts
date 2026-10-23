/**
 * The benchmark readiness PDF in the evidence report design, built only on
 * the shared kit (src/lib/compliance/pdf-kit.ts) and chrome
 * (src/lib/compliance/pdf-chrome.ts). It shows one assessment: the headline
 * per Level (Matches out of Matches plus Differs, n/a when nothing was
 * assessed), the counts outside it with their reasons, coverage of the full
 * benchmark only with a delivered list, every result, the settings behind
 * Differs and Needs review, the manual items with the manual notice, and the
 * exceptions. "Readiness comparison, not a certification" is on the cover and
 * in the footer of every page. Titles come from the delivered pack and only
 * exist in the rendered bytes.
 */
import jsPDF from "jspdf";
import type { BrandingOptions } from "~/types/branding";
import {
  PALETTE,
  capHeight,
  clampLine,
  dateParts,
  drawCard,
  drawDonut,
  drawEyebrow,
  drawKpiTile,
  drawLines,
  drawMarker,
  drawPill,
  drawRule,
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
  drawFooterNotice,
  drawCoverHeadline,
  drawCoverMasthead,
  drawCoverTenantBlock,
  drawDocumentControlGrid,
  drawPageTitle,
  drawRunningChrome,
  drawSectionHeading,
  drawTableHeader,
  drawZebraRow,
  layoutRunningFooter,
  pageFrame,
  type DocumentControlCell,
  tableHeaderLines,
} from "../compliance/pdf-chrome";
import { childLists, MAX_SETTING_DEPTH } from "../compliance/graph-rows";
import type {
  BenchmarkAssessment,
  LevelSummary,
  Observation,
  ReasonCode,
  ResultState,
  SettingFinding,
} from "./assessment";
import {
  READINESS_DISCLAIMER,
  REASON_LABELS,
  RESULT_LABELS,
  SETTING_STATUS_LABELS,
  benchmarkDisplayName,
  coverageStatement,
  exclusionsText,
  headlineLabel,
  levelCheckSummary,
  levelsLabel,
  observationLabel,
  ratePercent,
} from "./display";
import { appliesOn, localDate, type BenchmarkException } from "./exceptions";
import {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
} from "./manual";
import {
  readableOwnValue,
  readableRecommendation,
  record,
  type Json,
  type RecordJson,
} from "./policies";

export interface ReadinessPdfOptions {
  /** Benchmark name from the delivered catalog; the id in words otherwise. */
  benchmarkName?: string;
  /** Shortened tenant label, as the documentation export shows it. */
  tenantLabel?: string;
  /** Fixed render time: same input, same bytes. */
  renderDate?: Date;
  branding?: BrandingOptions;
  /** Stored exceptions; those of this benchmark, version and Level are listed. */
  exceptions?: readonly BenchmarkException[];
}

const PRODUCT = "Intune Documentation";

const RESULT_STYLE: Readonly<
  Record<ResultState, { tone: Tone; marker: MarkerKind; color: RgbColor }>
> = {
  Pass: { tone: "found", marker: "filled", color: [31, 133, 83] },
  Fail: { tone: "conflict", marker: "triangle", color: [185, 28, 28] },
  Review: { tone: "partial", marker: "half", color: [196, 113, 31] },
  "Not assessed": { tone: "none", marker: "outline", color: [100, 116, 139] },
};

const RESULT_ORDER: readonly ResultState[] = [
  "Pass",
  "Fail",
  "Review",
  "Not assessed",
];

const ASSIGNMENT_LABELS: Readonly<Record<Observation["assignment"], string>> = {
  assigned: "Assigned",
  notAssigned: "Not assigned",
  unknown: "Assignment unknown",
};

const METHOD_LINES = [
  "Each setting of the delivered pack is compared with the Settings Catalog policies of the last collection only. Device configurations, administrative templates, security baselines and endpoint security intents are not read. Nothing is written to the tenant.",
  "Matches needs the recommended value on at least one assigned policy. A matching value only on policies that are not assigned, or whose assignment could not be read, needs review.",
  "Differs needs a readable tenant value that differs, or a complete collection that shows the setting missing from every policy while no profile of another type exists for its platform. When such profiles exist, a setting missing from the Settings Catalog needs review, because it may be set outside it.",
  "Absent, unreadable or incomplete data is Needs review or Not assessed, never Differs.",
  "A recommendation that names a setting outside the pack is Not assessed.",
];

/** The headline as text: a percentage, or n/a when nothing was assessed. */
export function headlineValue(rate: number | null): string {
  const value = ratePercent(rate);
  return value === null ? "n/a" : `${value}%`;
}

/** "Matches 3 of 4" for a headline, naming what the rate is made of. */
export function headlineBasisText(
  counts: LevelSummary["headline"]["counts"],
): string {
  const assessed = counts.pass + counts.fail;
  return assessed
    ? `Matches ${counts.pass} of ${assessed} (Matches plus Differs)`
    : "Nothing was assessed as Matches or Differs";
}

function formatDate(value: Date, utc: boolean): string {
  const { year, month, day, hours, minutes } = dateParts(value, utc);
  return `${year}-${month}-${day} ${hours}:${minutes}${utc ? " UTC" : ""}`;
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
  let rest = text.replace(/\s+/g, " ").trim();
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

/**
 * The instance of a definition id inside a root, the root itself included,
 * found through the child lists the shared instance rules read
 * (graph-rows.ts childLists) to MAX_SETTING_DEPTH, as the comparison does.
 */
function findInstance(
  value: Json | undefined,
  id: string,
  depth = 0,
): RecordJson | null {
  if (!record(value) || depth > MAX_SETTING_DEPTH) return null;
  if (value.settingDefinitionId === id) return value;
  for (const children of childLists(value) ?? [])
    for (const child of children) {
      const found = findInstance(child as Json, id, depth + 1);
      if (found) return found;
    }
  return null;
}

function choiceText(value: Json, id: string): string {
  const raw =
    record(value) && typeof value.value === "string" ? value.value : "";
  return raw.startsWith(`${id}_`) ? raw.slice(id.length + 1) : raw;
}

function simpleText(value: Json): string {
  if (!record(value)) return "";
  const { value: own } = value;
  return typeof own === "string" ||
    typeof own === "number" ||
    typeof own === "boolean"
    ? String(own)
    : "";
}

/** A short readable form of one instance's own value. */
export function valueText(instance: RecordJson | null): string {
  if (!instance) return "Not set";
  if (!readableOwnValue(instance)) return "Not readable";
  const text = (value: Json | undefined) =>
    typeof value === "string" ? value : "";
  const id = text(instance.settingDefinitionId);
  const list = (value: Json | undefined) => (Array.isArray(value) ? value : []);
  const type = text(instance["@odata.type"]).toLowerCase();
  let shown: string;
  if (type.endsWith("choicesettinginstance"))
    shown = choiceText(instance.choiceSettingValue ?? null, id);
  else if (type.endsWith("choicesettingcollectioninstance"))
    shown = list(instance.choiceSettingCollectionValue)
      .map((entry) => choiceText(entry, id))
      .join(", ");
  else if (type.endsWith("simplesettinginstance"))
    shown = simpleText(instance.simpleSettingValue ?? null);
  else if (type.endsWith("simplesettingcollectioninstance"))
    shown = list(instance.simpleSettingCollectionValue)
      .map(simpleText)
      .join(", ");
  else if (type.endsWith("groupsettingcollectioninstance")) {
    const count = list(instance.groupSettingCollectionValue).length;
    shown = `${count} ${count === 1 ? "entry" : "entries"}`;
  } else shown = "Group of settings";
  if (!shown) return "Empty";
  return shown.length > 160 ? `${shown.slice(0, 157)}...` : shown;
}

/** One table column: label and width in mm. */
interface Column {
  label: string;
  width: number;
}

type Cell =
  | {
      lines: string[];
      size?: number;
      style?: FontStyle;
      color?: RgbColor;
    }
  | { result: ResultState };

const BODY = 7.4;
const SMALL = 6.8;
const lineHeight = (size: number) => size * 0.45;

/** Renders the readiness PDF of one assessment. */
export function renderReadinessPdf(
  assessment: BenchmarkAssessment,
  options: ReadinessPdfOptions = {},
): Uint8Array {
  const { branding } = options;
  const theme = brandingTheme(branding);
  const fixed = options.renderDate !== undefined;
  const generatedAt = options.renderDate
    ? new Date(options.renderDate.getTime())
    : new Date();
  const name = options.benchmarkName?.trim()
    ? options.benchmarkName.trim()
    : benchmarkDisplayName(assessment.benchmark);
  const title = `${name} ${assessment.version}`;
  const tenant = options.tenantLabel?.trim() || undefined;
  const assessedAt = new Date(assessment.assessedAt);
  const collectedAt = assessment.collection.collectedAt
    ? new Date(assessment.collection.collectedAt)
    : null;

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  applyTheme(doc, theme);
  doc.setProperties({
    title: `${title} readiness comparison`,
    author: branding?.companyName ?? PRODUCT,
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
  // The disclaimer and the manual notice are in the footer of every page.
  const footer = layoutRunningFooter(doc, frame, {
    text: `${PRODUCT}. ${READINESS_DISCLAIMER}.`,
    notice: `${MANUAL_RECOMMENDATIONS_NOTICE} ${MANUAL_RECOMMENDATIONS_URL}`,
  });
  const { margin, right, contentWidth, contentTop } = frame;
  const contentBottom = footer.contentBottom;
  let y = contentTop;

  const newPage = () => {
    doc.addPage();
    y = contentTop;
  };
  /** Starts a new page when height does not fit; true when it did. */
  const ensure = (height: number) => {
    if (y + height <= contentBottom) return false;
    newPage();
    return true;
  };
  const paragraph = (
    text: string,
    options: {
      size?: number;
      style?: FontStyle;
      color?: RgbColor;
      indent?: number;
      width?: number;
    } = {},
  ) => {
    const size = options.size ?? 8.4;
    const style = options.style ?? "normal";
    const indent = options.indent ?? 0;
    const lines = wrapText(
      doc,
      text,
      options.width ?? contentWidth - indent,
      size,
      style,
    );
    const step = lineHeight(size) + 0.6;
    for (const line of lines) {
      ensure(step);
      drawLines(
        doc,
        [line],
        margin + indent,
        y,
        size,
        style,
        options.color ?? theme.text,
        step,
      );
      y += step;
    }
    y += 1.6;
  };

  const levelOf = (level: number) =>
    assessment.levels.find((item) => item.level === level);
  const coverLevel = levelOf(assessment.level) ?? assessment.levels[0];
  const emptyCounts = { pass: 0, fail: 0, review: 0, notAssessed: 0 };
  const coverCounts = coverLevel?.headline.counts ?? emptyCounts;
  const coverRate = coverLevel?.headline.rate ?? null;

  // ---------------------------------------------------------------- Cover
  drawCoverBackground(doc, theme, frame, { ringFraction: coverRate ?? 0 });
  drawCoverMasthead(doc, theme, frame, {
    productName: PRODUCT,
    logo: branding?.logo,
    companyName: branding?.companyName,
  });
  drawCoverHeadline(doc, theme, frame, {
    eyebrow: "CIS Benchmark readiness",
    title,
    subtitle: levelsLabel(assessment),
    lead: `${READINESS_DISCLAIMER}. The delivered pack compared with the last collection of Settings Catalog policies.`,
  });
  drawCoverTenantBlock(doc, theme, frame, {
    tenantEyebrow: "Tenant",
    tenant,
    facts: [
      ["Levels", levelsLabel(assessment).replace(/^Levels? /, "")],
      ["Assessed", formatDate(assessedAt, fixed)],
      [
        "Data collected",
        collectedAt ? formatDate(collectedAt, fixed) : "Not recorded",
      ],
      ["Generated", formatDate(generatedAt, fixed)],
    ],
  });

  // Headline card: donut of Matches over Matches plus Differs.
  const midTop = 144;
  drawCard(doc, margin, midTop, 72, 70, { fill: PALETTE.panel });
  const donutX = margin + 36;
  const donutY = midTop + 28;
  drawDonut(
    doc,
    donutX,
    donutY,
    18,
    4.4,
    [
      { value: coverCounts.pass, color: RESULT_STYLE.Pass.color },
      { value: coverCounts.fail, color: RESULT_STYLE.Fail.color },
    ],
    coverCounts.pass + coverCounts.fail,
  );
  setFont(doc, 22, "bold", theme.primary);
  doc.text(headlineValue(coverRate), donutX, donutY + 2.2, { align: "center" });
  const captionLines = wrapText(
    doc,
    `${headlineLabel(assessment.basis)}, Level ${coverLevel?.level ?? assessment.level}`,
    64,
    8.3,
    "bold",
    2,
  );
  const subLines = wrapText(
    doc,
    headlineBasisText(coverCounts),
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
    doc.text(line, donutX, captionY, { align: "center" });
  }
  captionY += 0.8;
  setFont(doc, 7, "normal", PALETTE.muted);
  for (const line of subLines) {
    captionY += 3;
    doc.text(line, donutX, captionY, { align: "center" });
  }

  // At a glance: every result with its count, then coverage.
  const glanceX = margin + 80;
  const glanceWidth = contentWidth - 80;
  drawEyebrow(doc, "At a glance", glanceX, midTop + 2.4, {
    color: theme.secondary,
  });
  drawRule(doc, glanceX, midTop + 5, right, theme.primary, 0.4);
  const glanceCounts: Record<ResultState, number> = {
    Pass: coverCounts.pass,
    Fail: coverCounts.fail,
    Review: coverCounts.review,
    "Not assessed": coverCounts.notAssessed,
  };
  RESULT_ORDER.forEach((state, index) => {
    const rowTop = midTop + 5 + index * 8.6;
    const middle = rowTop + 4.3;
    const style = RESULT_STYLE[state];
    drawMarker(doc, glanceX + 1.4, middle, style.marker, style.color);
    setFont(doc, 8.5, "normal", theme.text);
    doc.text(RESULT_LABELS[state], glanceX + 5, middle + capHeight(8.5) / 2);
    setFont(doc, 11, "bold", theme.primary);
    doc.text(String(glanceCounts[state]), right, middle + capHeight(11) / 2, {
      align: "right",
    });
    drawRule(doc, glanceX, rowTop + 8.6, right);
  });
  const noteTop = midTop + 5 + 4 * 8.6 + 4;
  const noteLines = wrapText(
    doc,
    `Needs review and Not assessed are not counted in the headline. ${coverLevel ? coverageStatement(coverLevel) : "Coverage of the full benchmark is not shown."}`,
    glanceWidth,
    7.4,
    "normal",
    Math.floor((midTop + 70 - noteTop) / 3.4),
  );
  drawLines(
    doc,
    noteLines,
    glanceX,
    noteTop,
    7.4,
    "normal",
    PALETTE.muted,
    3.4,
  );

  const controlCells: DocumentControlCell[] = [
    { label: "Benchmark", value: name, span: 2 },
    { label: "Version", value: assessment.version },
    { label: "Level", value: String(assessment.level) },
    { label: "Tenant", value: tenant },
    { label: "Assessed", value: formatDate(assessedAt, fixed) },
    {
      label: "Data collected",
      value: collectedAt ? formatDate(collectedAt, fixed) : "Not recorded",
    },
    {
      label: "Basis",
      value:
        assessment.basis === "recommendations" ? "Recommendations" : "Settings",
    },
    { label: "Prepared by", value: branding?.companyName },
  ];
  // Long values move the grid up so it stays clear of the footer notice.
  const controlTop = Math.min(
    222,
    contentBottom - documentControlGridHeight(doc, frame, controlCells),
  );
  drawDocumentControlGrid(
    doc,
    theme,
    frame,
    controlTop,
    "Document control",
    controlCells,
  );
  drawRule(doc, margin, footer.ruleY, right);
  drawFooterNotice(doc, frame, footer);
  footer.lines.forEach((line, index) =>
    doc.text(line, margin, footer.ruleY + 3.9 + index * 2.8),
  );

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
            x: xs[index]!,
            lines: tableHeaderLines(doc, column.label, column.width),
          })),
        ) + 0.6;
    };
    ensure(16);
    header();
    rows.forEach((cells, index) => {
      const height = Math.max(
        7,
        ...cells.map((cell) =>
          "lines" in cell
            ? cell.lines.length * lineHeight(cell.size ?? BODY) + 3.4
            : 7,
        ),
      );
      if (ensure(height)) {
        y = drawSectionHeading(doc, theme, frame, y, continued);
        header();
      }
      drawZebraRow(doc, frame, y, height, index);
      cells.forEach((cell, cellIndex) => {
        const x = xs[cellIndex]! + 1.5;
        if ("lines" in cell) {
          const size = cell.size ?? BODY;
          drawLines(
            doc,
            cell.lines,
            x,
            y + 1.9,
            size,
            cell.style ?? "normal",
            cell.color ?? theme.text,
            lineHeight(size),
          );
        } else {
          const style = RESULT_STYLE[cell.result];
          drawPill(doc, x, y + 1.2, RESULT_LABELS[cell.result], {
            tone: style.tone,
            marker: style.marker,
            markerColor: style.color,
            small: true,
            maxWidth: columns[cellIndex]!.width - 3,
          });
        }
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
    const size = extra.size ?? BODY;
    const style = extra.style ?? "normal";
    return {
      lines: wrapText(doc, text, width - 3, size, style, extra.max ?? 6),
      size,
      style,
      ...(extra.color ? { color: extra.color } : {}),
    };
  };

  const manualNotice = () => {
    const width = contentWidth - 12;
    const lines = wrapText(doc, MANUAL_RECOMMENDATIONS_NOTICE, width, 8.2);
    const height = 8 + lines.length * 3.9 + 10;
    ensure(height + 4);
    drawCard(doc, margin, y, contentWidth, height, {
      fill: PALETTE.navyTint,
    });
    drawEyebrow(doc, "Manual recommendations", margin + 6, y + 5.4, {
      color: theme.secondary,
    });
    drawLines(doc, lines, margin + 6, y + 8, 8.2, "normal", theme.text, 3.9);
    const urlY = y + 8 + lines.length * 3.9 + 4.2;
    setFont(doc, 8.2, "bold", theme.secondary);
    doc.textWithLink(MANUAL_RECOMMENDATIONS_URL, margin + 6, urlY, {
      url: MANUAL_RECOMMENDATIONS_URL,
    });
    y += height + 5;
  };

  // ---------------------------------------------------------------- Summary
  newPage();
  y = drawPageTitle(doc, theme, frame, y, {
    eyebrow: "Readiness summary",
    title: "Results by Level",
    lead: "The headline is Matches out of Matches plus Differs. Needs review and Not assessed are counted next to it and never lower it.",
  });

  const itemsOf = (level: number) =>
    assessment.basis === "recommendations"
      ? assessment.recommendations.filter((item) => item.level === level)
      : assessment.settings;
  const reasonRows = (
    items: ReadonlyArray<{ result: ResultState; reason?: ReasonCode }>,
    state: ResultState,
  ) => {
    const counts = new Map<string, number>();
    for (const item of items)
      if (item.result === state) {
        const label = item.reason
          ? REASON_LABELS[item.reason]
          : "No reason recorded.";
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
    );
  };

  for (const level of assessment.levels) {
    const { headline } = level;
    const items = itemsOf(level.level);
    ensure(70);
    y = drawSectionHeading(
      doc,
      theme,
      frame,
      y,
      `Level ${level.level}`,
      headlineLabel(level.headline.basis),
    );
    // Headline band.
    drawCard(doc, margin, y, contentWidth, 15, { fill: PALETTE.panel });
    drawEyebrow(doc, "Headline", margin + 5, y + 5.2, {
      color: PALETTE.muted,
    });
    setFont(doc, 16, "bold", theme.primary);
    doc.text(headlineValue(headline.rate), margin + 5, y + 12);
    const valueWidth = textWidth(doc, headlineValue(headline.rate), 16, "bold");
    setFont(doc, 8.2, "normal", theme.text);
    doc.text(
      headlineBasisText(headline.counts),
      margin + 9 + valueWidth,
      y + 12,
    );
    const exclusions = exclusionsText(headline);
    if (exclusions) {
      setFont(doc, 7.4, "bold", theme.secondary);
      doc.text(exclusions, right - 5, y + 12, { align: "right" });
    }
    y += 19;
    // Count tiles.
    const gap = 3;
    const tileWidth = (contentWidth - gap * 3) / 4;
    const counts: Record<ResultState, number> = {
      Pass: headline.counts.pass,
      Fail: headline.counts.fail,
      Review: headline.counts.review,
      "Not assessed": headline.counts.notAssessed,
    };
    RESULT_ORDER.forEach((state, index) => {
      const style = RESULT_STYLE[state];
      drawKpiTile(doc, margin + index * (tileWidth + gap), y, tileWidth, 27, {
        label: RESULT_LABELS[state],
        value: String(counts[state]),
        caption:
          state === "Pass" || state === "Fail"
            ? "Counted in the headline."
            : "Not counted in the headline.",
        marker: style.marker,
        markerColor: style.color,
        valueColor: theme.primary,
      });
    });
    y += 32;
    for (const state of ["Review", "Not assessed"] as const) {
      const rows = reasonRows(items, state);
      if (!rows.length) continue;
      ensure(10);
      drawEyebrow(doc, `${RESULT_LABELS[state]} by reason`, margin, y + 2.4, {
        color: theme.secondary,
      });
      y += 5.5;
      for (const [label, count] of rows)
        paragraph(`${count}: ${label}`, { size: 8, indent: 3 });
    }
    ensure(10);
    drawEyebrow(doc, "Coverage", margin, y + 2.4, { color: theme.secondary });
    y += 5.5;
    paragraph(coverageStatement(level), { size: 8, indent: 3 });
    paragraph(
      levelCheckSummary(
        level,
        items.filter((item) => item.result !== "Not assessed").length,
        PRODUCT,
      ),
      { size: 8, indent: 3 },
    );
    y += 3;
  }
  if (!assessment.levels.length)
    paragraph("No Level was assessed: the pack delivered no results.");

  ensure(24);
  y = drawSectionHeading(doc, theme, frame, y, "Collection");
  if (assessment.collection.complete)
    paragraph(
      "The Settings Catalog collection is complete, so a setting missing from every policy is reported as Differs, unless profiles of another type for its platform may set it (Needs review).",
    );
  else {
    paragraph(
      "The Settings Catalog collection is not complete. Settings it cannot show to match or to be missing are Needs review, never Differs.",
    );
    for (const gap of assessment.collection.gaps)
      paragraph(gap, { size: 8, indent: 3, color: PALETTE.muted });
  }
  y += 2;
  ensure(40);
  y = drawSectionHeading(doc, theme, frame, y, "Method");
  for (const line of METHOD_LINES) paragraph(line, { size: 8 });
  y += 2;
  manualNotice();
  paragraph(assessment.manualNote || MANUAL_NOT_ASSESSED_NOTE, {
    size: 8,
    color: PALETTE.muted,
  });

  // ---------------------------------------------------------- Recommendations
  newPage();
  const byRecommendation = assessment.basis === "recommendations";
  const totals = assessment.levels.reduce(
    (sum, level) =>
      sum + Object.values(level.headline.counts).reduce((a, b) => a + b, 0),
    0,
  );
  y = drawPageTitle(doc, theme, frame, y, {
    eyebrow: byRecommendation ? "Recommendations" : "Settings",
    title: byRecommendation ? "Recommendation results" : "Setting results",
    lead: `${byRecommendation ? assessment.recommendations.length : assessment.settings.length} results with the reason for every result that is not Matches.${totals ? "" : " Nothing was assessed."}`,
  });
  const multiLevel =
    new Set(assessment.recommendations.map((item) => item.level)).size > 1;
  if (byRecommendation) {
    const columns: Column[] = [
      { label: "ID", width: 20 },
      { label: "Title", width: contentWidth - 20 - 28 - 58 },
      { label: "Result", width: 28 },
      { label: "Reason", width: 58 },
    ];
    drawTable(
      columns,
      assessment.recommendations.map((item) => [
        {
          lines: [
            ...wrapText(doc, item.id, 17, BODY, "bold", 2),
            ...(multiLevel ? [`Level ${item.level}`] : []),
          ],
          style: "bold",
          color: theme.primary,
        },
        textCell(item.title, columns[1]!.width),
        { result: item.result },
        textCell(item.reason ? REASON_LABELS[item.reason] : "", 58, {
          size: SMALL,
          color: PALETTE.muted,
        }),
      ]),
      "Recommendation results, continued",
    );
  } else {
    const columns: Column[] = [
      { label: "Setting", width: contentWidth - 28 - 58 },
      { label: "Result", width: 28 },
      { label: "Reason", width: 58 },
    ];
    drawTable(
      columns,
      assessment.settings.map((finding) => [
        textCell(finding.settingId, columns[0]!.width, { size: SMALL }),
        { result: finding.result },
        textCell(finding.reason ? REASON_LABELS[finding.reason] : "", 58, {
          size: SMALL,
          color: PALETTE.muted,
        }),
      ]),
      "Setting results, continued",
    );
  }

  // ------------------------------------------------------------ Setting detail
  const findings = new Map(assessment.settings.map((item) => [item.key, item]));
  interface DetailSetting {
    id: string;
    status: string;
    result: ResultState;
    reason?: ReasonCode;
    findings: SettingFinding[];
  }
  const details: Array<{
    id: string;
    title?: string;
    result: ResultState;
    settings: DetailSetting[];
  }> = byRecommendation
    ? assessment.recommendations
        .filter((item) => item.result === "Fail" || item.result === "Review")
        .map((item) => ({
          id: item.id,
          title: item.title,
          result: item.result,
          settings: item.settings
            .filter((setting) => setting.result !== "Pass")
            .map((setting) => ({
              id: setting.id,
              status: SETTING_STATUS_LABELS[setting.status],
              result: setting.result,
              ...(setting.reason ? { reason: setting.reason } : {}),
              findings: setting.findingKeys
                .map((key) => findings.get(key))
                .filter((entry): entry is SettingFinding => Boolean(entry)),
            })),
        }))
    : assessment.settings
        .filter((item) => item.result === "Fail" || item.result === "Review")
        .map((item) => ({
          id: item.settingId,
          result: item.result,
          settings: [
            {
              id: item.settingId,
              status: SETTING_STATUS_LABELS[item.status],
              result: item.result,
              ...(item.reason ? { reason: item.reason } : {}),
              findings: [item],
            },
          ],
        }));

  newPage();
  y = drawPageTitle(doc, theme, frame, y, {
    eyebrow: "Setting detail",
    title: "Differs and Needs review",
    lead: "The settings behind every result that differs or needs review, with the tenant policies that hold them.",
  });
  if (!details.length)
    paragraph("No result differs or needs review.", { color: PALETTE.muted });
  for (const detail of details) {
    // Heading row: id, title and the result pill.
    const pillWidth = pillMetrics(doc, RESULT_LABELS[detail.result], {
      tone: RESULT_STYLE[detail.result].tone,
      marker: RESULT_STYLE[detail.result].marker,
      small: true,
    }).width;
    const headingText = detail.title
      ? `${detail.id}  ${detail.title}`
      : detail.id;
    const headingLines = wrapText(
      doc,
      headingText,
      contentWidth - pillWidth - 6,
      8.6,
      "bold",
      3,
    );
    const headingHeight = headingLines.length * 3.9 + 3;
    ensure(headingHeight + 16);
    drawRule(doc, margin, y, right, theme.primary, 0.4);
    drawLines(
      doc,
      headingLines,
      margin,
      y + 2.4,
      8.6,
      "bold",
      theme.primary,
      3.9,
    );
    const style = RESULT_STYLE[detail.result];
    drawPill(doc, right - pillWidth, y + 1.6, RESULT_LABELS[detail.result], {
      tone: style.tone,
      marker: style.marker,
      markerColor: style.color,
      small: true,
    });
    y += headingHeight + 1;
    for (const setting of detail.settings) {
      const lines: Array<{
        text: string;
        style: FontStyle;
        color: RgbColor;
        indent: number;
      }> = [];
      const reason = setting.reason ? ` ${REASON_LABELS[setting.reason]}` : "";
      for (const line of wrapText(
        doc,
        setting.id,
        contentWidth - 3,
        SMALL,
        "bold",
      ))
        lines.push({ text: line, style: "bold", color: theme.text, indent: 3 });
      for (const line of wrapText(
        doc,
        `${setting.status}.${reason}`,
        contentWidth - 3,
        SMALL,
      ))
        lines.push({
          text: line,
          style: "normal",
          color: PALETTE.muted,
          indent: 3,
        });
      // A recommended value on, below or above an unreadable pack value is
      // not readable either (policies.ts readableRecommendation).
      const recommended = setting.findings
        .map((finding) =>
          readableRecommendation(finding.recommended, setting.id)
            ? valueText(findInstance(finding.recommended, setting.id))
            : "Not readable",
        )
        .filter((value, index, all) => all.indexOf(value) === index);
      if (recommended.length)
        for (const line of wrapText(
          doc,
          `Recommended value: ${recommended.join("; ")}`,
          contentWidth - 3,
          SMALL,
        ))
          lines.push({
            text: line,
            style: "normal",
            color: theme.text,
            indent: 3,
          });
      const observations = setting.findings.flatMap((finding) =>
        finding.observations.map((observation) => ({ finding, observation })),
      );
      if (!observations.length)
        lines.push({
          text: "No collected policy holds this setting.",
          style: "normal",
          color: theme.text,
          indent: 6,
        });
      for (const { finding, observation } of observations) {
        const comparison = observationLabel(finding, observation, setting.id);
        const value =
          comparison === "Matches" || comparison === "Differs"
            ? `, value ${valueText(findInstance(observation.value, setting.id))}`
            : "";
        for (const line of wrapText(
          doc,
          `Policy ${observation.policyName}: ${ASSIGNMENT_LABELS[observation.assignment]}, ${comparison}${value}.`,
          contentWidth - 6,
          SMALL,
        ))
          lines.push({
            text: line,
            style: "normal",
            color: theme.text,
            indent: 6,
          });
      }
      const step = lineHeight(SMALL) + 0.5;
      ensure(Math.min(lines.length, 3) * step + 2);
      for (const line of lines) {
        if (ensure(step)) {
          y = drawSectionHeading(
            doc,
            theme,
            frame,
            y,
            `${detail.id}, continued`,
          );
        }
        drawLines(
          doc,
          [line.text],
          margin + line.indent,
          y,
          SMALL,
          line.style,
          line.color,
          step,
        );
        y += step;
      }
      y += 2;
    }
    y += 3;
  }

  // ---------------------------------------------------------- Manual items
  newPage();
  y = drawPageTitle(doc, theme, frame, y, {
    eyebrow: "Manual recommendations",
    title: "Recommendations to check manually",
    lead: assessment.manualNote || MANUAL_NOT_ASSESSED_NOTE,
  });
  manualNotice();
  const packTitles = new Map(
    assessment.recommendations.map((item) => [item.id, item.title]),
  );
  for (const level of assessment.levels) {
    ensure(20);
    y = drawSectionHeading(
      doc,
      theme,
      frame,
      y,
      `Level ${level.level}`,
      `${level.manual.length} listed`,
    );
    if (!level.manual.length) {
      paragraph(
        assessment.listUsed
          ? `The delivered list names no manual item for Level ${level.level}.`
          : `No manual item is listed for Level ${level.level} because no recommendation list was delivered. Recommendations outside the pack need a manual check.`,
        { size: 8, color: PALETTE.muted },
      );
      continue;
    }
    drawTable(
      [
        { label: "ID", width: 22 },
        { label: "Title", width: contentWidth - 22 },
      ],
      level.manual.map((item) => [
        {
          lines: wrapText(doc, item.identifier, 19, BODY, "bold", 2),
          style: "bold",
          color: theme.primary,
        },
        (item.title ?? packTitles.get(item.identifier))
          ? textCell(
              item.title ?? packTitles.get(item.identifier) ?? "",
              contentWidth - 22,
            )
          : textCell("No title delivered", contentWidth - 22, {
              color: PALETTE.muted,
            }),
      ]),
      `Level ${level.level} manual recommendations, continued`,
    );
  }

  // ------------------------------------------------------------ Exceptions
  const exceptions = (options.exceptions ?? []).filter(
    (exception) =>
      exception.benchmark === assessment.benchmark &&
      exception.version === assessment.version &&
      exception.level === assessment.level,
  );
  const inUse = new Set(
    assessment.levels.flatMap((level) => level.headline.exceptionIds),
  );
  const assessedDay = localDate(assessment.assessedAt);
  ensure(40);
  y += 2;
  y = drawSectionHeading(
    doc,
    theme,
    frame,
    y,
    "Exceptions",
    `${exceptions.length} recorded`,
  );
  if (!exceptions.length)
    paragraph(
      "No exceptions are recorded for this benchmark, version and Level.",
      {
        size: 8,
        color: PALETTE.muted,
      },
    );
  else {
    const columns: Column[] = [
      { label: "Setting", width: 52 },
      { label: "Owner", width: 30 },
      { label: "Reason", width: contentWidth - 52 - 30 - 22 - 26 },
      { label: "Expires", width: 22 },
      { label: "Status", width: 26 },
    ];
    drawTable(
      columns,
      [...exceptions]
        .sort(
          (a, b) =>
            a.settingId.localeCompare(b.settingId) || a.id.localeCompare(b.id),
        )
        .map((exception) => [
          textCell(exception.settingId, 52, { size: SMALL }),
          textCell(exception.owner, 30, { size: SMALL }),
          textCell(exception.reason, columns[2]!.width, { size: SMALL }),
          textCell(exception.expiresOn, 22, { size: SMALL }),
          textCell(
            inUse.has(exception.id)
              ? "Applied to the headline"
              : appliesOn(exception, assessedDay)
                ? "In effect"
                : "Not in effect",
            26,
            { size: SMALL, color: PALETTE.muted },
          ),
        ]),
      "Exceptions, continued",
    );
  }

  drawRunningChrome(doc, theme, frame, {
    title,
    titleMaxWidth: 90,
    ...(tenant || branding?.companyName
      ? { headerRight: tenant ?? branding?.companyName }
      : {}),
    footer,
    pageLabel: (page, count) => `Page ${page} of ${count}`,
  });

  return new Uint8Array(doc.output("arraybuffer"));
}
