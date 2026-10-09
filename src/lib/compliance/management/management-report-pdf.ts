import jsPDF from "jspdf";
import type { CompliancePlatform, ControlStatus } from "../types";
import {
  MANAGEMENT_REPORT_STRINGS,
  type ManagementReportStrings,
} from "./management-report-strings";
import { measuresWithSafeguards } from "./management-summary";
import type {
  BaselineDelta,
  ManagementLocale,
  ManagementSummary,
  NextAction,
  SafeguardCount,
  SafeguardState,
} from "./types";

// Security summary for two readers. Page 1 is for management: plain words,
// numbers and bars, no control ids, and it must fit one A4 page. The pages
// after it are for the IT reviewer: how the numbers are counted, every
// safeguard per measure with the policies behind it, and the detail lists.
// Internal links jump between page 1 and the IT pages; external links only
// open the Intune or Entra admin centers.

export interface ManagementReportSafeguard {
  capabilityId: string;
  name: string;
  state: SafeguardState;
  policies: readonly { name: string; assigned: boolean }[];
}

export interface ManagementReportControl {
  id: string;
  title: string;
  status: ControlStatus;
  aliases?: readonly { scheme: string; id: string }[];
  cis?: readonly string[];
  safeguards: readonly ManagementReportSafeguard[];
}

export interface ManagementReportInput {
  summary: ManagementSummary;
  controls: readonly ManagementReportControl[];
  unassigned: readonly {
    capabilityId: string;
    name: string;
    controlIds: string[];
  }[];
  /** Absent when no baseline was loaded. */
  delta?: BaselineDelta;
  crosswalkLoaded?: boolean;
  /** COMPLIANCE_DISCLAIMER (English); German comes from the strings file. */
  disclaimer: string;
  tenantLabel?: string;
  locale: ManagementLocale;
}

type RgbColor = [number, number, number];
type FontStyle = "normal" | "bold" | "italic";
/** Link target: a fixed IT page or `measure:<control id>`. */
type Target =
  | "guide"
  | "overview"
  | "unassigned"
  | "change"
  | "outsideScope"
  | `measure:${string}`;

// Same defaults as the technical evidence report.
const PRIMARY: RgbColor = [0, 51, 102];
const SECONDARY: RgbColor = [0, 102, 204];
const ACCENT: RgbColor = [0, 166, 82];
const TEXT: RgbColor = [30, 30, 30];
const MUTED: RgbColor = [105, 105, 105];
const WARNING: RgbColor = [171, 95, 0];
const BORDER: RgbColor = [215, 220, 226];
const TRACK: RgbColor = [228, 232, 237];
const HERO_FILL: RgbColor = [240, 245, 250];
const BAND_FILL: RgbColor = [232, 239, 247];
const ZEBRA: RgbColor = [248, 249, 250];
const WHITE: RgbColor = [255, 255, 255];

// Bar colors by share of safeguards in place; the same tones as the status
// colors in presentation.ts, with a softer red for "none yet".
const SHARE_NONE: RgbColor = [190, 75, 60];
const SHARE_PARTIAL: RgbColor = [196, 113, 31];
const SHARE_FULL: RgbColor = [31, 133, 83];

const STATE_COLORS: Record<SafeguardState, RgbColor> = {
  inPlace: [31, 133, 83],
  switchedOff: [185, 28, 28],
  conflicting: [185, 28, 28],
  partial: [196, 113, 31],
  notAssigned: [171, 95, 0],
  notConfigured: [100, 116, 139],
  dataMissing: [196, 113, 31],
};

/** Safeguard table order: in place, then what needs attention most. */
const STATE_ORDER: readonly SafeguardState[] = [
  "inPlace",
  "switchedOff",
  "conflicting",
  "partial",
  "notAssigned",
  "notConfigured",
  "dataMissing",
];

const ALLOWED_LINK_HOSTS = new Set([
  "intune.microsoft.com",
  "entra.microsoft.com",
]);
const MAX_ACTIONS = 5;
const MAX_PAGE1_MEASURES = 8;
const MAX_LISTED_IDS = 8;
/** Policies named per safeguard row; assigned ones come first. */
const POLICIES_PER_SAFEGUARD = 8;

/** Only https links to the Intune or Entra admin center become clickable. */
export function isAllowedPortalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "https:" && ALLOWED_LINK_HOSTS.has(parsed.hostname)
    );
  } catch {
    return false;
  }
}

export function managementReportFileName(
  frameworkId: string,
  locale: ManagementLocale,
  date: Date,
  tenantLabel?: string,
): string {
  const slug = tenantLabel ? fileSlug(tenantLabel) : "";
  const tenantPart = slug ? `-${slug}` : "";
  return `${MANAGEMENT_REPORT_STRINGS[locale].fileNamePrefix}-${fileSlug(frameworkId)}${tenantPart}-${localIsoDate(date)}.pdf`;
}

function fileSlug(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function localIsoDate(date: Date): string {
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value: string, strings: ManagementReportStrings): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(strings.dateLocale, {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function idList(
  ids: readonly string[],
  strings: ManagementReportStrings,
  limit = Infinity,
): string {
  if (ids.length === 0) return strings.changeNone;
  if (ids.length <= limit) return ids.join(", ");
  return `${ids.slice(0, limit).join(", ")} ${strings.moreItems(ids.length - limit)}`;
}

/** Platforms from the scope key; the key is the JSON written by scopeKeyOf. */
function scopeLabel(
  scopeKey: string,
  strings: ManagementReportStrings,
): string {
  try {
    const parsed: unknown = JSON.parse(scopeKey);
    const platforms = Array.isArray(parsed) ? parsed[0] : undefined;
    if (platforms === null) return strings.allPlatforms;
    if (Array.isArray(platforms))
      return platforms
        .map((platform) =>
          typeof platform === "string" && platform in strings.platforms
            ? strings.platforms[platform as CompliancePlatform]
            : String(platform),
        )
        .join(", ");
  } catch {
    // Fall through to the raw key.
  }
  return scopeKey;
}

function shareOf(count: SafeguardCount): number {
  return count.total > 0 ? count.inPlace / count.total : 0;
}

function shareColor(count: SafeguardCount): RgbColor {
  if (count.total > 0 && count.inPlace >= count.total) return SHARE_FULL;
  return count.inPlace > 0 ? SHARE_PARTIAL : SHARE_NONE;
}

export async function generateManagementReportPDF(
  input: ManagementReportInput,
): Promise<Uint8Array> {
  const strings = MANAGEMENT_REPORT_STRINGS[input.locale];
  const { summary, delta } = input;
  const metrics = summary.metrics;
  const disclaimer = strings.disclaimer ?? input.disclaimer;
  // Unmapped measures that related settings could support, counted apart from
  // those outside Intune scope.
  const notEvaluated = summary.outsideScope.filter(
    (measure) => measure.notEvaluated,
  ).length;

  // Measures shown on page 1 and in the IT sections: every assessed control
  // except those outside the selected platform scope, in framework order.
  const measures = input.controls.filter(
    (control) => control.status !== "notApplicable",
  );
  const countFor = (control: ManagementReportControl): SafeguardCount =>
    summary.safeguards[control.id] ?? {
      inPlace: control.safeguards.filter((item) => item.state === "inPlace")
        .length,
      total: control.safeguards.length,
    };
  // Measure figures come from the same per-measure counts as the bars, so
  // "no safeguards" plus "at least one" always adds up to the measures shown.
  const measureCoverage = measuresWithSafeguards({
    safeguards: Object.fromEntries(
      measures.map((control) => [control.id, countFor(control)]),
    ),
  });
  const noSafeguards = measureCoverage.total - measureCoverage.withSafeguard;
  const titleById = new Map(
    input.controls.map((control) => [control.id, control.title]),
  );

  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true,
  });
  doc.setFont("helvetica", "normal");
  doc.setProperties({
    title: strings.title(summary.frameworkName),
    author: strings.footer,
    subject: `${summary.frameworkName} ${summary.frameworkVersion}`,
  });

  const pageWidth = doc.internal.pageSize.width;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const right = margin + contentWidth;
  const contentBottom = pageHeight - 22;
  let y = 18;

  const wrap = (
    text: string,
    width: number,
    fontSize: number,
    style: FontStyle = "normal",
  ): string[] => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    return doc.splitTextToSize(text, width) as string[];
  };

  /** Cuts wrapped lines to maxLines, ending the last kept line with "...". */
  const clampLines = (
    lines: string[],
    maxLines: number,
    width: number,
  ): string[] => {
    if (lines.length <= maxLines) return lines;
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1] ?? "";
    while (last.length > 0 && doc.getTextWidth(`${last}...`) > width) {
      last = last.slice(0, -1);
    }
    kept[maxLines - 1] = `${last.trimEnd()}...`;
    return kept;
  };

  const setText = (fontSize: number, style: FontStyle, color: RgbColor) => {
    doc.setFont("helvetica", style);
    doc.setFontSize(fontSize);
    doc.setTextColor(...color);
  };

  /** Largest bold size from max down to min at which the text fits the width. */
  const fitFontSize = (
    text: string,
    max: number,
    min: number,
    width: number,
  ): number => {
    doc.setFont("helvetica", "bold");
    let size = max;
    doc.setFontSize(size);
    while (size > min && doc.getTextWidth(text) > width) {
      size -= 0.5;
      doc.setFontSize(size);
    }
    return size;
  };

  const bar = (
    x: number,
    top: number,
    width: number,
    height: number,
    share: number,
    color: RgbColor,
  ) => {
    doc.setFillColor(...TRACK);
    doc.rect(x, top, width, height, "F");
    const filled = width * Math.min(1, Math.max(0, share));
    if (filled > 0) {
      doc.setFillColor(...color);
      doc.rect(x, top, Math.max(filled, 0.8), height, "F");
    }
  };

  const pageNumber = () => doc.internal.getCurrentPageInfo().pageNumber;

  // Link sources are often drawn before their target page exists, so link
  // rectangles are collected and added once every page is laid out.
  const pendingLinks: {
    page: number;
    rect: [number, number, number, number];
    target: Target;
  }[] = [];
  const targetPages = new Map<Target, number>();
  const linkTo = (target: Target, rect: [number, number, number, number]) =>
    pendingLinks.push({ page: pageNumber(), rect, target });

  // ---- Page 1: management ----------------------------------------------

  const titleLines = clampLines(
    wrap(strings.title(summary.frameworkName), contentWidth, 18, "bold"),
    2,
    contentWidth,
  );
  setText(18, "bold", PRIMARY);
  titleLines.forEach((line, index) => doc.text(line, margin, y + index * 7.5));
  y += (titleLines.length - 1) * 7.5 + 6;

  const meta = [
    input.tenantLabel ? `${strings.tenant}: ${input.tenantLabel}` : null,
    `${strings.date}: ${formatDate(summary.generatedAt, strings)}`,
  ].filter((part): part is string => part !== null);
  const metaLines = clampLines(
    wrap(meta.join("  |  "), contentWidth, 9),
    2,
    contentWidth,
  );
  setText(9, "normal", MUTED);
  metaLines.forEach((line, index) => doc.text(line, margin, y + index * 4.2));
  y += (metaLines.length - 1) * 4.2 + 3;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(margin, y, right, y);
  y += 6;

  // Hero: the safeguard figure with a bar and one plain sentence.
  {
    const available = metrics.safeguardPct !== null;
    const big = available
      ? strings.percent(metrics.safeguardPct ?? 0)
      : strings.heroNotAvailable;
    const bigSize = available ? 34 : 18;
    setText(bigSize, "bold", PRIMARY);
    const bigWidth = Math.max(doc.getTextWidth(big), 30);
    const columnX = margin + 8 + bigWidth + 9;
    const columnWidth = right - 7 - columnX;
    const sentence = available
      ? strings.heroSentence(metrics.safeguardsInPlace, metrics.safeguardsTotal)
      : strings.heroNotAvailableSentence;
    const sentenceLines = clampLines(
      wrap(sentence, columnWidth, 9.5),
      3,
      columnWidth,
    );
    const height = Math.max(32, 23 + sentenceLines.length * 4.4);
    doc.setFillColor(...HERO_FILL);
    doc.rect(margin, y, contentWidth, height, "F");
    doc.setFillColor(...PRIMARY);
    doc.rect(margin, y, 1.5, height, "F");

    setText(bigSize, "bold", PRIMARY);
    doc.text(big, margin + 8, y + height / 2 + bigSize * 0.13);
    setText(11, "bold", TEXT);
    doc.text(strings.heroLabel, columnX, y + 9);
    bar(
      columnX,
      y + 12.5,
      columnWidth,
      4,
      available ? (metrics.safeguardPct ?? 0) / 100 : 0,
      PRIMARY,
    );
    setText(9.5, "normal", TEXT);
    sentenceLines.forEach((line, index) =>
      doc.text(line, columnX, y + 23 + index * 4.4),
    );
    y += height + 5;
  }

  // Four tiles in one row, each linking to its IT page.
  {
    const gap = 3;
    const width = (contentWidth - gap * 3) / 4;
    const height = 30;
    const change = (() => {
      if (!delta)
        return { value: strings.noBaseline, detail: strings.noBaselineHint };
      if (delta.safeguardDeltaPoints === null)
        return {
          value: strings.deltaNotAvailable,
          detail: strings.oldBaselineDetail,
        };
      return {
        value: strings.deltaPoints(delta.safeguardDeltaPoints),
        detail: strings.deltaDetail(formatDate(delta.baselineDate, strings)),
      };
    })();
    const tiles: {
      label: string;
      value: string;
      detail: string;
      target: Target;
    }[] = [
      {
        label: strings.tileInPlace,
        value: strings.ofCount(
          metrics.safeguardsInPlace,
          metrics.safeguardsTotal,
        ),
        detail: strings.tileInPlaceDetail,
        target: "guide",
      },
      {
        label: strings.tileNoSafeguards,
        value: String(noSafeguards),
        detail: strings.tileNoSafeguardsDetail(measureCoverage.total),
        target: "overview",
      },
      {
        label: strings.tileNotSwitchedOn,
        value: String(metrics.unassignedConfigs),
        detail: strings.tileNotSwitchedOnDetail,
        target: "unassigned",
      },
      { label: strings.tileChange, ...change, target: "change" },
    ];
    tiles.forEach((tile, index) => {
      const x = margin + index * (width + gap);
      const inner = width - 8;
      doc.setFillColor(...WHITE);
      doc.setDrawColor(...BORDER);
      doc.setLineWidth(0.3);
      doc.rect(x, y, width, height, "FD");
      doc.setFillColor(...PRIMARY);
      doc.rect(x, y, width, 1, "F");

      const label = clampLines(wrap(tile.label, inner, 7.8, "bold"), 2, inner);
      setText(7.8, "bold", TEXT);
      label.forEach((line, lineIndex) =>
        doc.text(line, x + 4, y + 6 + lineIndex * 3.3),
      );

      const valueSize = fitFontSize(tile.value, 16, 10, inner);
      doc.setFontSize(valueSize);
      if (doc.getTextWidth(tile.value) <= inner) {
        setText(valueSize, "bold", PRIMARY);
        doc.text(tile.value, x + 4, y + 18);
      } else {
        // Long words such as "No earlier report loaded" wrap to two lines.
        const lines = clampLines(wrap(tile.value, inner, 9, "bold"), 2, inner);
        setText(9, "bold", PRIMARY);
        lines.forEach((line, lineIndex) =>
          doc.text(line, x + 4, y + 15.3 + lineIndex * 3.6),
        );
      }

      const detail = clampLines(wrap(tile.detail, inner, 7), 1, inner);
      setText(7, "normal", MUTED);
      doc.text(detail[0] ?? "", x + 4, y + 22.8);
      setText(6.8, "normal", SECONDARY);
      doc.text(strings.details, x + width - 4, y + 27, { align: "right" });
      linkTo(tile.target, [x, y, width, height]);
    });
    y += height + 8;
  }

  const sectionHeading = (text: string, caption?: string) => {
    setText(12, "bold", PRIMARY);
    doc.text(text, margin, y);
    if (caption) {
      setText(7.8, "normal", MUTED);
      doc.text(caption, right, y, { align: "right" });
    }
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.4);
    doc.line(margin, y + 2, right, y + 2);
    y += 7.5;
  };

  // Measures: one row per measure with a bar; the weakest eight when there
  // are more, still in framework order so they match the IT pages.
  {
    sectionHeading(strings.measuresHeading, strings.measuresCaption);
    const shown =
      measures.length <= MAX_PAGE1_MEASURES
        ? measures
        : (() => {
            const weakest = new Set(
              measures
                .map((control, index) => ({ control, index }))
                .sort(
                  (left, rightItem) =>
                    shareOf(countFor(left.control)) -
                      shareOf(countFor(rightItem.control)) ||
                    left.index - rightItem.index,
                )
                .slice(0, MAX_PAGE1_MEASURES)
                .map((item) => item.control),
            );
            return measures.filter((control) => weakest.has(control));
          })();
    const rowHeight = 6.6;
    const countWidth = 22;
    const barWidth = 46;
    const barX = right - 4 - countWidth - barWidth;
    const titleWidth = barX - margin - 6;
    shown.forEach((control, index) => {
      const count = countFor(control);
      const top = y - 4.4;
      if (index % 2 === 0) {
        doc.setFillColor(...ZEBRA);
        doc.rect(margin, top, contentWidth, rowHeight, "F");
      }
      const title = clampLines(
        wrap(control.title, titleWidth, 9),
        1,
        titleWidth,
      );
      setText(9, "normal", TEXT);
      doc.text(title[0] ?? "", margin + 2, y);
      bar(barX, y - 2.6, barWidth, 2.8, shareOf(count), shareColor(count));
      setText(8.8, "bold", shareColor(count));
      doc.text(strings.ofCount(count.inPlace, count.total), right - 5, y, {
        align: "right",
      });
      setText(7.5, "normal", SECONDARY);
      doc.text(">", right - 1, y, { align: "right" });
      linkTo(`measure:${control.id}`, [margin, top, contentWidth, rowHeight]);
      y += rowHeight;
    });
    if (measures.length === 0) {
      setText(9, "italic", MUTED);
      doc.text(strings.heroNotAvailableSentence, margin, y);
      y += 5;
    }
    y += 1.5;
    if (shown.length < measures.length) {
      const text = strings.moreMeasures(measures.length - shown.length);
      setText(8.5, "normal", SECONDARY);
      doc.text(`${text} >`, margin + 2, y);
      linkTo("overview", [margin, y - 3.5, doc.getTextWidth(text) + 6, 5]);
      y += 5;
    }
    if (metrics.outsideIntuneScope !== null && metrics.outsideIntuneScope > 0) {
      const lines = wrap(
        strings.outsideScopeLine(metrics.outsideIntuneScope),
        contentWidth - 24,
        9,
      );
      setText(9, "normal", TEXT);
      lines.forEach((line, index) =>
        doc.text(line, margin + 2, y + index * 4.2),
      );
      if (summary.outsideScope.length > 0) {
        setText(7.5, "normal", SECONDARY);
        doc.text(strings.details, right - 1, y, { align: "right" });
        linkTo("outsideScope", [
          margin,
          y - 3.5,
          contentWidth,
          lines.length * 4.2 + 1,
        ]);
      }
      y += lines.length * 4.2 + 1;
    }
    if (notEvaluated > 0) {
      const lines = wrap(
        strings.notEvaluatedLine(notEvaluated),
        contentWidth - 24,
        9,
      );
      setText(9, "normal", TEXT);
      lines.forEach((line, index) =>
        doc.text(line, margin + 2, y + index * 4.2),
      );
      setText(7.5, "normal", SECONDARY);
      doc.text(strings.details, right - 1, y, { align: "right" });
      linkTo("outsideScope", [
        margin,
        y - 3.5,
        contentWidth,
        lines.length * 4.2 + 1,
      ]);
      y += lines.length * 4.2 + 1;
    }
    if (metrics.dataGaps > 0) {
      const lines = wrap(
        strings.dataGapsNote(metrics.dataGaps),
        contentWidth - 2,
        8,
        "italic",
      );
      setText(8, "italic", WARNING);
      lines.forEach((line, index) =>
        doc.text(line, margin + 2, y + index * 3.8),
      );
      y += lines.length * 3.8 + 1;
    }
  }

  // Note and disclaimer anchored at the bottom; next steps fill the space above.
  const noteLines = wrap(strings.page1Note, contentWidth - 8, 7.8, "bold");
  const disclaimerLines = wrap(disclaimer, contentWidth - 8, 7.2);
  const boxHeight =
    9 + noteLines.length * 3.5 + 1 + disclaimerLines.length * 3.2 + 1;
  const boxTop = contentBottom - boxHeight;

  y += 5;
  sectionHeading(strings.nextStepsHeading);
  const actions = [...summary.nextActions]
    .sort((left, rightItem) => left.rank - rightItem.rank)
    .slice(0, MAX_ACTIONS);
  if (actions.length === 0) {
    setText(9, "italic", MUTED);
    doc.text(strings.noNextSteps, margin, y);
  }
  const linkColumn = 30;
  const actionWidth = contentWidth - 7 - linkColumn;
  // Stop at the first step that does not fit, so numbering never skips.
  for (const [index, action] of actions.entries()) {
    const sentence = clampLines(
      wrap(
        strings.actionSentence[action.tier](action.name),
        actionWidth,
        9.5,
        "bold",
      ),
      2,
      actionWidth,
    );
    const helped = action.controlIds
      .map((id) => titleById.get(id))
      .filter((title): title is string => title !== undefined);
    const context = helped.length
      ? clampLines(
          wrap(strings.helpsWith(helped.join("; ")), actionWidth, 7.8),
          1,
          actionWidth,
        )
      : [];
    const height = sentence.length * 4.3 + context.length * 3.6 + 2.8;
    if (y + height > boxTop - 2) break;

    setText(9.5, "bold", PRIMARY);
    doc.text(`${index + 1}.`, margin, y);
    setText(9.5, "bold", TEXT);
    sentence.forEach((line, lineIndex) =>
      doc.text(line, margin + 7, y + lineIndex * 4.3),
    );
    setText(7.8, "normal", MUTED);
    context.forEach((line, lineIndex) =>
      doc.text(
        line,
        margin + 7,
        y + sentence.length * 4.3 - 0.4 + lineIndex * 3.6,
      ),
    );
    drawActionLink(action, y);
    y += height;
  }

  function drawActionLink(action: NextAction, top: number) {
    if (!isAllowedPortalUrl(action.url)) return;
    const label =
      new URL(action.url).hostname === "entra.microsoft.com"
        ? strings.openInEntra
        : strings.openInIntune;
    setText(7.5, "normal", SECONDARY);
    const width = doc.getTextWidth(label);
    doc.text(label, right, top, { align: "right" });
    doc.link(right - width - 1, top - 3.5, width + 2, 5, { url: action.url });
  }

  doc.setFillColor(255, 248, 230);
  doc.rect(margin, boxTop, contentWidth, boxHeight, "F");
  setText(8, "bold", TEXT);
  doc.text(strings.disclaimerHeading, margin + 4, boxTop + 5);
  let boxY = boxTop + 9;
  setText(7.8, "bold", TEXT);
  for (const line of noteLines) {
    doc.text(line, margin + 4, boxY);
    boxY += 3.5;
  }
  boxY += 1;
  setText(7.2, "normal", TEXT);
  for (const line of disclaimerLines) {
    doc.text(line, margin + 4, boxY);
    boxY += 3.2;
  }

  // ---- IT reviewer pages -------------------------------------------------

  let currentHeading = "";

  const drawItHeader = (heading: string) => {
    doc.setFillColor(...BAND_FILL);
    doc.rect(margin, 9, contentWidth, 7, "F");
    setText(7.5, "bold", PRIMARY);
    doc.text(strings.itBand.toUpperCase(), margin + 3, 13.6);
    setText(7.5, "normal", SECONDARY);
    const width = doc.getTextWidth(strings.backToSummary);
    doc.text(strings.backToSummary, right - 3, 13.6, { align: "right" });
    doc.link(right - 4 - width, 9, width + 2, 7, { pageNumber: 1 });

    y = 25;
    const lines = wrap(heading, contentWidth, 15, "bold");
    setText(15, "bold", PRIMARY);
    lines.forEach((line, index) => doc.text(line, margin, y + index * 6.5));
    y += (lines.length - 1) * 6.5 + 3;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.5);
    doc.line(margin, y, right, y);
    y += 6;
  };

  const startItPage = (target: Target, heading: string) => {
    doc.addPage();
    targetPages.set(target, pageNumber());
    currentHeading = heading;
    drawItHeader(heading);
  };

  const continuePage = () => {
    doc.addPage();
    drawItHeader(strings.continued(currentHeading));
  };

  const ensureSpace = (space: number) => {
    if (y + space > contentBottom) continuePage();
  };

  const paragraph = (
    text: string,
    options: {
      size?: number;
      style?: FontStyle;
      color?: RgbColor;
      indent?: number;
      after?: number;
    } = {},
  ) => {
    const size = options.size ?? 9;
    const indent = options.indent ?? 0;
    const lineHeight = size * 0.45;
    for (const line of wrap(text, contentWidth - indent, size, options.style)) {
      if (y + lineHeight > contentBottom) continuePage();
      setText(size, options.style ?? "normal", options.color ?? TEXT);
      doc.text(line, margin + indent, y);
      y += lineHeight;
    }
    y += options.after ?? 2;
  };

  const bullet = (text: string) => {
    const lines = wrap(text, contentWidth - 5, 9);
    ensureSpace(Math.min(lines.length, 2) * 4.05);
    doc.setFillColor(...PRIMARY);
    doc.circle(margin + 1.2, y - 1.1, 0.6, "F");
    for (const line of lines) {
      if (y + 4.05 > contentBottom) continuePage();
      setText(9, "normal", TEXT);
      doc.text(line, margin + 5, y);
      y += 4.05;
    }
    y += 0.8;
  };

  const subheading = (text: string) => {
    const lines = wrap(text, contentWidth, 10.5, "bold");
    ensureSpace(lines.length * 4.8 + 10);
    setText(10.5, "bold", PRIMARY);
    for (const line of lines) {
      doc.text(line, margin, y);
      y += 4.8;
    }
    y += 0.8;
  };

  interface Segment {
    text: string;
    size?: number;
    style?: FontStyle;
    color?: RgbColor;
  }
  interface Row {
    cells: Segment[][];
    target?: Target;
  }

  const TABLE_PADDING = 1.6;
  const TABLE_HEADER = 7;

  const lineHeightOf = (line: { size: number }) => line.size * 0.42 + 0.3;

  /** Wrapped cell lines; cells are cut to maxHeight with an ellipsis. */
  const layoutRow = (
    row: Row,
    widths: readonly number[],
    maxHeight = Infinity,
  ) => {
    const room = maxHeight - TABLE_PADDING * 2;
    const cells = row.cells.map((cell, index) => {
      const width = (widths[index] ?? 0) - TABLE_PADDING * 2;
      const lines = cell.flatMap((segment) => {
        const size = segment.size ?? 8;
        return wrap(segment.text, width, size, segment.style).map((line) => ({
          ...segment,
          text: line,
          size,
        }));
      });
      let used = 0;
      const kept = lines.filter((line) => (used += lineHeightOf(line)) <= room);
      const last = kept[kept.length - 1];
      if (last && kept.length < lines.length) {
        setText(last.size, last.style ?? "normal", TEXT);
        kept[kept.length - 1] = {
          ...last,
          text: clampLines([last.text, ""], 1, width)[0] ?? last.text,
        };
      }
      return kept;
    });
    const height =
      Math.max(
        ...cells.map((lines) =>
          lines.reduce((sum, line) => sum + lineHeightOf(line), 0),
        ),
      ) +
      TABLE_PADDING * 2;
    return { cells, height };
  };

  /** Space for the header and the first row, which always stay together. */
  const tableStartHeight = (widths: readonly number[], rows: readonly Row[]) =>
    TABLE_HEADER + (rows[0] ? layoutRow(rows[0], widths).height : 0);

  const table = (
    headers: readonly string[],
    widths: readonly number[],
    rows: readonly Row[],
  ) => {
    const drawHeader = () => {
      doc.setFillColor(...PRIMARY);
      doc.rect(margin, y, contentWidth, TABLE_HEADER, "F");
      setText(7.5, "bold", WHITE);
      let x = margin;
      headers.forEach((header, index) => {
        doc.text(header, x + TABLE_PADDING, y + 4.7);
        x += widths[index] ?? 0;
      });
      y += TABLE_HEADER;
    };

    ensureSpace(tableStartHeight(widths, rows));
    drawHeader();
    rows.forEach((row, rowIndex) => {
      let { cells, height } = layoutRow(row, widths);
      if (y + height > contentBottom) {
        continuePage();
        drawHeader();
      }
      // A row taller than a whole page is cut so it never reaches the footer.
      if (y + height > contentBottom)
        ({ cells, height } = layoutRow(row, widths, contentBottom - y));
      doc.setFillColor(...(rowIndex % 2 === 0 ? ZEBRA : WHITE));
      doc.rect(margin, y, contentWidth, height, "F");
      let x = margin;
      cells.forEach((lines, index) => {
        let lineY = y + TABLE_PADDING;
        for (const line of lines) {
          lineY += lineHeightOf(line);
          setText(line.size, line.style ?? "normal", line.color ?? TEXT);
          doc.text(line.text, x + TABLE_PADDING, lineY - 0.6);
        }
        x += widths[index] ?? 0;
      });
      if (row.target) linkTo(row.target, [margin, y, contentWidth, height]);
      y += height;
    });
    y += 4;
  };

  const countSegment = (count: SafeguardCount): Segment => ({
    text: strings.ofCount(count.inPlace, count.total),
    style: "bold",
    color: shareColor(count),
  });

  // How to read this report
  startItPage("guide", strings.guideHeading);
  for (const section of strings.guideSections) {
    subheading(section.heading);
    for (const text of section.paragraphs) paragraph(text, { after: 1 });
    for (const text of section.bullets ?? []) bullet(text);
    y += 1.2;
  }

  subheading(strings.figuresHeading);
  {
    const figure = (
      text: { label: string; note: string },
      value: string,
    ): Row => ({
      cells: [
        [
          { text: text.label, style: "bold" },
          { text: text.note, size: 7.2, color: MUTED },
        ],
        [{ text: value }],
      ],
    });
    const pct = (value: number | null) =>
      value === null ? "" : ` (${strings.percent(value)})`;
    const rows: Row[] = [
      figure(
        strings.figures.inPlace,
        `${strings.ofCount(metrics.safeguardsInPlace, metrics.safeguardsTotal)}${pct(metrics.safeguardPct)}`,
      ),
      figure(
        strings.figures.coverage,
        `${strings.measuresOf(measureCoverage.withSafeguard, measureCoverage.total)}${pct(
          measureCoverage.total
            ? Math.floor(
                (measureCoverage.withSafeguard * 100) / measureCoverage.total,
              )
            : null,
        )}`,
      ),
      figure(strings.figures.noSafeguards, strings.measuresValue(noSafeguards)),
      figure(
        strings.figures.conflicting,
        strings.measuresValue(metrics.conflicting),
      ),
      figure(
        strings.figures.notSwitchedOn,
        strings.safeguardsValue(metrics.unassignedConfigs),
      ),
    ];
    if (metrics.outsideIntuneScope !== null)
      rows.push(
        figure(
          strings.figures.outsideScope,
          strings.measuresValue(metrics.outsideIntuneScope),
        ),
      );
    if (notEvaluated > 0)
      rows.push(
        figure(
          strings.figures.notEvaluated,
          strings.measuresValue(notEvaluated),
        ),
      );
    rows.push(
      figure(
        strings.figures.dataGaps,
        strings.safeguardsValue(metrics.dataGaps),
      ),
    );
    table(strings.figureHeaders, [contentWidth - 38, 38], rows);
  }

  subheading(strings.aboutRunHeading);
  paragraph(
    [
      `${strings.frameworkVersion}: ${summary.frameworkName} ${summary.frameworkVersion}`,
      `${strings.rulesetVersion}: ${summary.rulesetVersion}`,
      `${strings.generated}: ${formatDate(summary.generatedAt, strings)}`,
      `${strings.scope}: ${scopeLabel(summary.scopeKey, strings)}`,
    ].join("  |  "),
    { after: 3 },
  );
  {
    const lines = wrap(disclaimer, contentWidth - 8, 7.5);
    const height = 9 + lines.length * 3.4;
    ensureSpace(height + 2);
    doc.setFillColor(255, 248, 230);
    doc.rect(margin, y, contentWidth, height, "F");
    setText(8, "bold", TEXT);
    doc.text(strings.disclaimerHeading, margin + 4, y + 5);
    setText(7.5, "normal", TEXT);
    lines.forEach((line, index) =>
      doc.text(line, margin + 4, y + 9.4 + index * 3.4),
    );
    y += height + 4;
  }

  // Measures overview
  startItPage("overview", strings.overviewHeading);
  paragraph(strings.overviewIntro, { after: 2 });
  if (input.crosswalkLoaded)
    paragraph(strings.crosswalkNote, {
      size: 8,
      style: "italic",
      color: MUTED,
    });
  y += 2;
  table(
    strings.overviewHeaders,
    [28, contentWidth - 28 - 42, 42],
    measures.map((control) => ({
      cells: [
        [{ text: control.id, style: "bold" }],
        [{ text: control.title }],
        [countSegment(countFor(control))],
      ],
      target: `measure:${control.id}`,
    })),
  );

  // Safeguards per measure; sections share pages and paginate cleanly.
  const safeguardWidths = [66, 44, contentWidth - 66 - 44] as const;
  measures.forEach((control, index) => {
    const heading = `${control.id}  ${control.title}`;
    const headingLines = wrap(heading, contentWidth, 11.5, "bold");
    const notes: string[] = [];
    if (control.aliases && control.aliases.length > 0)
      notes.push(
        control.aliases
          .map((alias) => `${alias.scheme}: ${alias.id}`)
          .join("; "),
      );
    if (control.cis && control.cis.length > 0)
      notes.push(`${strings.cisLabel}: ${control.cis.join(", ")}`);
    const noteLines = notes.flatMap((note) => wrap(note, contentWidth, 7.5));
    const rows: Row[] = [...control.safeguards]
      .sort(
        (left, rightItem) =>
          STATE_ORDER.indexOf(left.state) -
          STATE_ORDER.indexOf(rightItem.state),
      )
      .map((safeguard) => ({
        cells: [
          [{ text: safeguard.name, style: "bold" }],
          [
            {
              text: strings.safeguardStates[safeguard.state],
              color: STATE_COLORS[safeguard.state],
            },
          ],
          safeguard.policies.length === 0
            ? [{ text: strings.noPolicy, style: "italic", color: MUTED }]
            : [
                ...safeguard.policies.slice(0, POLICIES_PER_SAFEGUARD).map(
                  (policy): Segment =>
                    policy.assigned
                      ? { text: policy.name }
                      : {
                          text: `${policy.name} ${strings.notAssignedSuffix}`,
                          color: MUTED,
                        },
                ),
                ...(safeguard.policies.length > POLICIES_PER_SAFEGUARD
                  ? [
                      {
                        text: strings.moreItems(
                          safeguard.policies.length - POLICIES_PER_SAFEGUARD,
                        ),
                        style: "italic" as const,
                        color: MUTED,
                      },
                    ]
                  : []),
              ],
        ],
      }));

    if (index === 0) {
      startItPage(`measure:${control.id}`, strings.measureDetailHeading);
      paragraph(strings.measureDetailIntro, { after: 5 });
    } else {
      // Heading, notes, count line, table header and first row stay together.
      const blockHeight =
        8 +
        headingLines.length * 5.2 +
        noteLines.length * 3.4 +
        7 +
        (rows.length > 0 ? tableStartHeight(safeguardWidths, rows) : 5);
      currentHeading = strings.measureDetailHeading;
      if (y + blockHeight > contentBottom) continuePage();
      else {
        doc.setDrawColor(...BORDER);
        doc.setLineWidth(0.3);
        doc.line(margin, y - 1, right, y - 1);
        y += 6;
      }
    }
    targetPages.set(`measure:${control.id}`, pageNumber());
    currentHeading = heading;
    setText(11.5, "bold", PRIMARY);
    headingLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 5.2;
    });
    setText(7.5, "normal", MUTED);
    noteLines.forEach((line) => {
      doc.text(line, margin, y);
      y += 3.4;
    });

    const count = countFor(control);
    y += 2.6;
    const countText = strings.measureCount(count.inPlace, count.total);
    setText(9.5, "bold", TEXT);
    doc.text(countText, margin, y);
    bar(
      margin + doc.getTextWidth(countText) + 5,
      y - 2.6,
      40,
      2.8,
      shareOf(count),
      shareColor(count),
    );
    y += 4.4;

    if (rows.length === 0)
      paragraph(strings.noSafeguardsMapped, { style: "italic", color: MUTED });
    else table(strings.safeguardHeaders, safeguardWidths, rows);
    y += 2;
  });

  // Set up but not switched on
  startItPage("unassigned", strings.unassignedHeading);
  paragraph(strings.unassignedIntro, { after: 4 });
  if (input.unassigned.length === 0)
    paragraph(strings.unassignedEmpty, { style: "italic", color: MUTED });
  else
    table(
      strings.unassignedHeaders,
      [contentWidth * 0.5, contentWidth * 0.5],
      input.unassigned.map((item) => ({
        cells: [
          [{ text: item.name, style: "bold" }],
          [{ text: idList(item.controlIds, strings, MAX_LISTED_IDS) }],
        ],
      })),
    );

  // Change since the last report
  if (delta) {
    startItPage("change", strings.changeHeading);
    paragraph(strings.changeIntro(formatDate(delta.baselineDate, strings)), {
      after: 4,
    });
    const section = (label: string, value: string) => {
      paragraph(label, { style: "bold", after: 0.5 });
      paragraph(value, { indent: 4, after: 3 });
    };
    section(
      strings.changeSafeguards,
      delta.safeguardDeltaPoints === null
        ? strings.changeSafeguardsMissing
        : strings.deltaPoints(delta.safeguardDeltaPoints),
    );
    if (delta.safeguardChanges.length > 0) {
      paragraph(strings.changePerMeasure, { style: "bold", after: 1.5 });
      table(
        strings.changeHeaders,
        [28, contentWidth - 28 - 46, 46],
        delta.safeguardChanges.map((item) => ({
          cells: [
            [{ text: item.controlId, style: "bold" }],
            [{ text: titleById.get(item.controlId) ?? "" }],
            [
              {
                text: strings.changeFromTo(item.from, item.to, item.total),
                style: "bold",
                color: item.to < item.from ? SHARE_NONE : TEXT,
              },
            ],
          ],
        })),
      );
      y += 3;
    } else if (delta.safeguardDeltaPoints !== null) {
      section(strings.changePerMeasure, strings.changeNone);
    }
    section(
      strings.changeNewlyEvidenced,
      idList(delta.newlyEvidenced, strings),
    );
    section(strings.changeRegressions, idList(delta.regressions, strings));
    section(strings.changeAdded, idList(delta.added, strings));
    section(strings.changeRemoved, idList(delta.removed, strings));
    if (delta.rulesetChanged)
      paragraph(strings.rulesetChanged, { style: "italic", color: WARNING });
  } else {
    startItPage("change", strings.noBaselineHeading);
    for (const step of strings.noBaselineSteps) paragraph(step, { after: 3 });
  }

  // Measures outside Intune scope
  if (summary.outsideScope.length > 0) {
    startItPage("outsideScope", strings.outsideScopeHeading);
    paragraph(strings.outsideScopeIntro, { after: notEvaluated > 0 ? 2 : 4 });
    if (notEvaluated > 0) paragraph(strings.notEvaluatedIntro, { after: 4 });
    table(
      strings.outsideScopeHeaders,
      [28, contentWidth - 28],
      summary.outsideScope.map((measure) => ({
        cells: [
          [{ text: measure.id, style: "bold" }],
          [
            { text: measure.title[input.locale] },
            ...(measure.notEvaluated
              ? [{ text: strings.notEvaluatedNote, size: 7.2, color: MUTED }]
              : []),
          ],
        ],
      })),
    );
  }

  // ---- Links and footer ------------------------------------------------

  for (const { page, rect, target } of pendingLinks) {
    const targetPage = targetPages.get(target);
    if (targetPage === undefined) continue;
    doc.setPage(page);
    doc.link(...rect, { pageNumber: targetPage });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 16, right, pageHeight - 16);
    setText(7, "normal", MUTED);
    doc.text(strings.footer, margin, pageHeight - 10);
    doc.text(strings.pageNumber(page, pageCount), right, pageHeight - 10, {
      align: "right",
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
