import jsPDF from "jspdf";
import { CONTROL_STATUS_COLORS } from "../presentation";
import type { ControlStatus } from "../types";
import {
  MANAGEMENT_REPORT_STRINGS,
  type ManagementReportStrings,
} from "./management-report-strings";
import type {
  BaselineDelta,
  ManagementLocale,
  ManagementSummary,
  NextAction,
} from "./types";

// One-page management summary with linked detail pages. Page 1 must fit one
// A4 page; detail pages paginate. Internal links jump between page 1 and the
// detail pages; external links only open the Intune or Entra admin centers.

export interface ManagementReportControl {
  id: string;
  title: string;
  status: ControlStatus;
  aliases?: readonly { scheme: string; id: string }[];
  cis?: readonly string[];
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
type DetailPage =
  | "controls"
  | "withoutEvidence"
  | "unassigned"
  | "change"
  | "outsideScope";

// Same defaults as the technical evidence report.
const PRIMARY: RgbColor = [0, 51, 102];
const SECONDARY: RgbColor = [0, 102, 204];
const ACCENT: RgbColor = [0, 166, 82];
const TEXT: RgbColor = [30, 30, 30];
const MUTED: RgbColor = [105, 105, 105];
const WARNING: RgbColor = [171, 95, 0];
const BORDER: RgbColor = [215, 220, 226];

const ALLOWED_LINK_HOSTS = new Set([
  "intune.microsoft.com",
  "entra.microsoft.com",
]);
const MAX_ACTIONS = 5;
const MAX_LISTED_IDS = 8;

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

export async function generateManagementReportPDF(
  input: ManagementReportInput,
): Promise<Uint8Array> {
  const strings = MANAGEMENT_REPORT_STRINGS[input.locale];
  const { summary } = input;
  const metrics = summary.metrics;
  const disclaimer = strings.disclaimer ?? input.disclaimer;

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

  /** Wraps and cuts to maxLines, ending the last kept line with "...". */
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

  const pageNumber = () => doc.internal.getCurrentPageInfo().pageNumber;

  // Page 1 is drawn first, but its tiles link to detail pages that do not
  // exist yet. Link rectangles are collected and added at the end.
  const pendingLinks: {
    rect: [number, number, number, number];
    target: DetailPage;
  }[] = [];
  const detailPages = new Map<DetailPage, number>();

  // ---- Page 1 ----------------------------------------------------------

  const titleLines = clampLines(
    wrap(strings.title(summary.frameworkName), contentWidth, 17, "bold"),
    2,
    contentWidth,
  );
  setText(17, "bold", PRIMARY);
  titleLines.forEach((line, index) => doc.text(line, margin, y + index * 7));
  y += (titleLines.length - 1) * 7 + 6;

  const meta = [
    input.tenantLabel ? `${strings.tenant}: ${input.tenantLabel}` : null,
    `${strings.date}: ${formatDate(summary.generatedAt, strings)}`,
    `${strings.frameworkVersion}: ${summary.frameworkVersion}`,
  ].filter((part): part is string => part !== null);
  const metaLines = clampLines(
    wrap(meta.join("  |  "), contentWidth, 8.5),
    2,
    contentWidth,
  );
  setText(8.5, "normal", MUTED);
  metaLines.forEach((line, index) => doc.text(line, margin, y + index * 4));
  y += (metaLines.length - 1) * 4 + 3;
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.5);
  doc.line(margin, y, pageWidth - margin, y);
  y += 5;

  // Headline
  const coverageAvailable = metrics.coveragePct !== null;
  const headline = coverageAvailable
    ? strings.coverageHeadline(strings.percent(metrics.coveragePct ?? 0))
    : strings.coverageNotAvailable;
  const headlineSentence = coverageAvailable
    ? strings.coverageSentence(metrics.withEvidence, metrics.assessable)
    : strings.coverageNotAvailableReason;
  const sentenceLines = wrap(headlineSentence, contentWidth - 12, 9.5);
  const headlineHeight = 18 + sentenceLines.length * 4.6;
  doc.setFillColor(240, 245, 250);
  doc.rect(margin, y, contentWidth, headlineHeight, "F");
  doc.setFillColor(...PRIMARY);
  doc.rect(margin, y, 1.5, headlineHeight, "F");
  setText(coverageAvailable ? 22 : 18, "bold", PRIMARY);
  doc.text(headline, margin + 6, y + 11);
  setText(9.5, "normal", TEXT);
  sentenceLines.forEach((line, index) =>
    doc.text(line, margin + 6, y + 18 + index * 4.6),
  );
  y += headlineHeight + 5;

  // Metric tiles, two by two
  const tileGap = 4;
  const tileWidth = (contentWidth - tileGap) / 2;
  const tileHeight = 27;
  const delta = input.delta;
  const tiles: {
    label: string;
    value: string;
    detail: string;
    target: DetailPage;
  }[] = [
    {
      label: strings.tileCoverage,
      value: coverageAvailable
        ? strings.percent(metrics.coveragePct ?? 0)
        : strings.notAvailable,
      detail: strings.tileCoverageDetail(
        metrics.withEvidence,
        metrics.assessable,
      ),
      target: "controls",
    },
    {
      label: strings.tileWithoutEvidence,
      value: String(metrics.withoutEvidence),
      detail: strings.tileWithoutEvidenceDetail(
        metrics.assessable,
        metrics.conflicting,
      ),
      target: "withoutEvidence",
    },
    {
      label: strings.tileUnassigned,
      value: String(metrics.unassignedConfigs),
      detail: strings.tileUnassignedDetail,
      target: "unassigned",
    },
    delta
      ? {
          label: strings.tileChange,
          value:
            delta.coverageDeltaPoints === null
              ? strings.deltaNotAvailable
              : strings.deltaPoints(delta.coverageDeltaPoints),
          detail: strings.deltaDetail(
            delta.newlyEvidenced.length,
            delta.regressions.length,
          ),
          target: "change",
        }
      : {
          label: strings.tileChange,
          value: strings.noBaseline,
          detail: strings.noBaselineHint,
          target: "change",
        },
  ];
  tiles.forEach((tile, index) => {
    const x = margin + (index % 2) * (tileWidth + tileGap);
    const top = y + Math.floor(index / 2) * (tileHeight + tileGap);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.rect(x, top, tileWidth, tileHeight, "FD");
    doc.setFillColor(...PRIMARY);
    doc.rect(x, top, 1.5, tileHeight, "F");

    setText(7.5, "normal", SECONDARY);
    const detailsWidth = doc.getTextWidth(strings.details);
    doc.text(strings.details, x + tileWidth - 4, top + 6, { align: "right" });
    const labelWidth = tileWidth - 12 - detailsWidth;
    const labelSize = fitFontSize(tile.label, 8.5, 7, labelWidth);
    const label = clampLines(
      wrap(tile.label, labelWidth, labelSize, "bold"),
      1,
      labelWidth,
    );
    setText(labelSize, "bold", TEXT);
    doc.text(label[0] ?? "", x + 5, top + 6);

    const valueSize = fitFontSize(tile.value, 16, 10, tileWidth - 10);
    setText(valueSize, "bold", PRIMARY);
    doc.text(tile.value, x + 5, top + 14.5);

    const detailLines = clampLines(
      wrap(tile.detail, tileWidth - 10, 7.8),
      2,
      tileWidth - 10,
    );
    setText(7.8, "normal", MUTED);
    detailLines.forEach((line, lineIndex) =>
      doc.text(line, x + 5, top + 20 + lineIndex * 3.4),
    );
    pendingLinks.push({
      rect: [x, top, tileWidth, tileHeight],
      target: tile.target,
    });
  });
  y += tileHeight * 2 + tileGap + 6;

  const hasOutsideScopePage = summary.outsideScope.length > 0;
  if (metrics.outsideIntuneScope !== null && metrics.outsideIntuneScope > 0) {
    const text = strings.outsideScopeLine(metrics.outsideIntuneScope);
    const lines = wrap(text, contentWidth - 22, 9);
    setText(9, "normal", TEXT);
    lines.forEach((line, index) => doc.text(line, margin, y + index * 4.2));
    if (hasOutsideScopePage) {
      setText(7.5, "normal", SECONDARY);
      doc.text(strings.details, pageWidth - margin, y, { align: "right" });
      pendingLinks.push({
        rect: [margin, y - 3.5, contentWidth, lines.length * 4.2 + 1],
        target: "outsideScope",
      });
    }
    y += lines.length * 4.2 + 1.5;
  }
  if (metrics.dataGaps > 0) {
    const lines = wrap(
      strings.dataGapsNote(metrics.dataGaps),
      contentWidth,
      8,
      "italic",
    );
    setText(8, "italic", WARNING);
    lines.forEach((line, index) => doc.text(line, margin, y + index * 3.8));
    y += lines.length * 3.8 + 1.5;
  }

  // Disclaimer anchored at the bottom of page 1; actions fill the space above.
  const disclaimerLines = wrap(disclaimer, contentWidth - 8, 7.5);
  const disclaimerHeight = 9 + disclaimerLines.length * 3.4;
  const disclaimerTop = contentBottom - disclaimerHeight;

  y += 4;
  setText(12, "bold", PRIMARY);
  doc.text(strings.nextActionsHeading, margin, y);
  doc.setDrawColor(...ACCENT);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 2, pageWidth - margin, y + 2);
  y += 8;

  const actions = [...summary.nextActions]
    .sort((left, right) => left.rank - right.rank)
    .slice(0, MAX_ACTIONS);
  if (actions.length === 0) {
    setText(9, "italic", MUTED);
    doc.text(strings.noNextActions, margin, y);
  }
  const linkColumn = 34;
  actions.forEach((action, index) => {
    const textWidth = contentWidth - 6 - linkColumn;
    const sentence = clampLines(
      wrap(
        strings.actionSentence[action.tier](action.name),
        textWidth,
        9.5,
        "bold",
      ),
      2,
      textWidth,
    );
    const context = clampLines(
      wrap(
        `${strings.areaLabel}: ${strings.portalAreas[action.area]}  |  ${strings.controlsLabel}: ${idList(action.controlIds, strings, MAX_LISTED_IDS)}`,
        textWidth,
        7.8,
      ),
      2,
      textWidth,
    );
    const height = sentence.length * 4.3 + context.length * 3.5 + 3;
    if (y + height > disclaimerTop - 2) return;

    setText(9.5, "bold", PRIMARY);
    doc.text(`${index + 1}.`, margin, y);
    setText(9.5, "bold", TEXT);
    sentence.forEach((line, lineIndex) =>
      doc.text(line, margin + 6, y + lineIndex * 4.3),
    );
    setText(7.8, "normal", MUTED);
    const contextTop = y + sentence.length * 4.3 - 0.3;
    context.forEach((line, lineIndex) =>
      doc.text(line, margin + 6, contextTop + lineIndex * 3.5),
    );
    drawActionLink(action, y);
    y += height;
  });

  function drawActionLink(action: NextAction, top: number) {
    if (!isAllowedPortalUrl(action.url)) return;
    const label =
      new URL(action.url).hostname === "entra.microsoft.com"
        ? strings.openInEntra
        : strings.openInIntune;
    setText(8, "bold", SECONDARY);
    const width = doc.getTextWidth(label);
    const right = pageWidth - margin;
    doc.text(label, right, top, { align: "right" });
    doc.link(right - width - 1, top - 3.5, width + 2, 5, { url: action.url });
  }

  doc.setFillColor(255, 248, 230);
  doc.rect(margin, disclaimerTop, contentWidth, disclaimerHeight, "F");
  setText(8, "bold", TEXT);
  doc.text(strings.disclaimerHeading, margin + 4, disclaimerTop + 5);
  setText(7.5, "normal", TEXT);
  disclaimerLines.forEach((line, index) =>
    doc.text(line, margin + 4, disclaimerTop + 9.5 + index * 3.4),
  );

  // ---- Detail pages ----------------------------------------------------

  let currentHeading = "";

  const drawPageHeading = (heading: string) => {
    y = 20;
    setText(8, "normal", SECONDARY);
    const width = doc.getTextWidth(strings.backToSummary);
    doc.text(strings.backToSummary, pageWidth - margin, y - 6, {
      align: "right",
    });
    doc.link(pageWidth - margin - width - 1, y - 9.5, width + 2, 5, {
      pageNumber: 1,
    });
    const lines = wrap(heading, contentWidth, 15, "bold");
    setText(15, "bold", PRIMARY);
    lines.forEach((line, index) => doc.text(line, margin, y + 2 + index * 6.5));
    y += 2 + (lines.length - 1) * 6.5 + 3;
    doc.setDrawColor(...ACCENT);
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 7;
  };

  const startDetailPage = (target: DetailPage, heading: string) => {
    doc.addPage();
    detailPages.set(target, pageNumber());
    currentHeading = heading;
    drawPageHeading(heading);
  };

  const continuePage = () => {
    doc.addPage();
    drawPageHeading(strings.continued(currentHeading));
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

  interface Cell {
    text: string;
    notes?: string[];
    color?: RgbColor;
  }

  const table = (
    headers: readonly string[],
    widths: readonly number[],
    rows: Cell[][],
  ) => {
    const fontSize = 8;
    const lineHeight = 3.6;
    const padding = 2;
    const drawHeader = () => {
      doc.setFillColor(...PRIMARY);
      doc.rect(margin, y, contentWidth, 7, "F");
      setText(7.5, "bold", [255, 255, 255]);
      let x = margin;
      headers.forEach((header, index) => {
        doc.text(header, x + padding, y + 4.7);
        x += widths[index] ?? 0;
      });
      y += 7;
    };
    const layout = (cell: Cell, width: number) => ({
      main: wrap(cell.text, width - padding * 2, fontSize, "normal"),
      notes: (cell.notes ?? []).flatMap((note) =>
        wrap(note, width - padding * 2, 7, "normal"),
      ),
    });

    drawHeader();
    rows.forEach((row, rowIndex) => {
      const cells = row.map((cell, index) => layout(cell, widths[index] ?? 0));
      const height =
        Math.max(
          ...cells.map(
            (cell) => cell.main.length * lineHeight + cell.notes.length * 3.2,
          ),
        ) +
        padding * 2;
      if (y + height > contentBottom) {
        continuePage();
        drawHeader();
      }
      doc.setFillColor(
        ...((rowIndex % 2 === 0
          ? [248, 249, 250]
          : [255, 255, 255]) as RgbColor),
      );
      doc.rect(margin, y, contentWidth, height, "F");
      let x = margin;
      cells.forEach((cell, index) => {
        let lineY = y + padding + 2.8;
        setText(
          fontSize,
          index === 0 ? "bold" : "normal",
          row[index]?.color ?? TEXT,
        );
        for (const line of cell.main) {
          doc.text(line, x + padding, lineY);
          lineY += lineHeight;
        }
        setText(7, "normal", MUTED);
        for (const line of cell.notes) {
          doc.text(line, x + padding, lineY);
          lineY += 3.2;
        }
        x += widths[index] ?? 0;
      });
      y += height;
    });
    y += 4;
  };

  const controlRow = (control: ManagementReportControl): Cell[] => {
    const notes: string[] = [];
    if (control.aliases && control.aliases.length > 0) {
      notes.push(
        control.aliases
          .map((alias) => `${alias.scheme}: ${alias.id}`)
          .join("; "),
      );
    }
    if (control.cis && control.cis.length > 0) {
      notes.push(`${strings.cisLabel}: ${control.cis.join(", ")}`);
    }
    return [
      { text: control.id },
      { text: control.title, notes },
      {
        text: strings.controlStatuses[control.status],
        color: CONTROL_STATUS_COLORS[control.status],
      },
    ];
  };
  const controlWidths = [30, contentWidth - 30 - 48, 48] as const;

  // D1: all controls
  startDetailPage("controls", strings.controlsHeading);
  paragraph(strings.controlsIntro, { after: 2 });
  if (input.crosswalkLoaded)
    paragraph(strings.crosswalkNote, {
      size: 8,
      style: "italic",
      color: MUTED,
    });
  y += 2;
  table(strings.controlHeaders, controlWidths, input.controls.map(controlRow));

  // D2: controls without evidence, then conflicting ones
  startDetailPage("withoutEvidence", strings.withoutEvidenceHeading);
  paragraph(strings.withoutEvidenceIntro, { after: 4 });
  const withoutEvidence = [
    ...input.controls.filter((control) => control.status === "noEvidence"),
    ...input.controls.filter(
      (control) => control.status === "conflictingEvidence",
    ),
  ];
  if (withoutEvidence.length === 0)
    paragraph(strings.withoutEvidenceEmpty, { style: "italic", color: MUTED });
  else
    table(
      strings.controlHeaders,
      controlWidths,
      withoutEvidence.map(controlRow),
    );

  // D3: unassigned security configurations
  startDetailPage("unassigned", strings.unassignedHeading);
  paragraph(strings.unassignedIntro, { after: 4 });
  if (input.unassigned.length === 0)
    paragraph(strings.unassignedEmpty, { style: "italic", color: MUTED });
  else
    table(
      strings.unassignedHeaders,
      [contentWidth * 0.45, contentWidth * 0.55],
      input.unassigned.map((item) => [
        { text: item.name },
        { text: idList(item.controlIds, strings) },
      ]),
    );

  // D4: change since baseline
  if (delta) {
    startDetailPage("change", strings.changeHeading);
    paragraph(strings.changeIntro(formatDate(delta.baselineDate, strings)), {
      after: 4,
    });
    const section = (label: string, value: string) => {
      paragraph(label, { style: "bold", after: 0.5 });
      paragraph(value, { indent: 4, after: 3 });
    };
    section(
      strings.changeCoverage,
      delta.coverageDeltaPoints === null
        ? strings.deltaNotAvailable
        : strings.deltaPoints(delta.coverageDeltaPoints),
    );
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
    startDetailPage("change", strings.noBaselineHeading);
    for (const step of strings.noBaselineSteps) paragraph(step, { after: 3 });
  }

  // D5: measures outside Intune scope
  if (hasOutsideScopePage) {
    startDetailPage("outsideScope", strings.outsideScopeHeading);
    paragraph(strings.outsideScopeIntro, { after: 4 });
    table(
      strings.outsideScopeHeaders,
      [30, contentWidth - 30],
      summary.outsideScope.map((measure) => [
        { text: measure.id },
        { text: measure.title[input.locale] },
      ]),
    );
  }

  // ---- Links and footer ------------------------------------------------

  doc.setPage(1);
  for (const { rect, target } of pendingLinks) {
    const page = detailPages.get(target);
    if (page !== undefined) doc.link(...rect, { pageNumber: page });
  }

  const pageCount = doc.internal.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setDrawColor(...PRIMARY);
    doc.setLineWidth(0.25);
    doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16);
    setText(7, "normal", MUTED);
    doc.text(strings.footer, margin, pageHeight - 10);
    doc.text(
      strings.pageNumber(page, pageCount),
      pageWidth - margin,
      pageHeight - 10,
      { align: "right" },
    );
  }

  return new Uint8Array(doc.output("arraybuffer"));
}
