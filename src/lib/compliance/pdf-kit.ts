import type jsPDF from "jspdf";

// Drawing primitives for the evidence report design system. Geometry is in
// millimetres, type in points. Only built-in Helvetica, solid fills, lines,
// circles and rounded rectangles are used so every viewer renders the same.

// Math.sin and Math.cos may differ in the last bit between CPUs, and jsPDF
// writes coordinates at full precision. Rounding to 0.0001 mm keeps PDF bytes
// identical on every platform.
function fixedPoint(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export type RgbColor = [number, number, number];
export type FontStyle = "normal" | "bold" | "italic";
export type MarkerKind = "filled" | "half" | "outline" | "triangle";

export const PALETTE = {
  navy: [0, 51, 102],
  blue: [0, 102, 204],
  green: [0, 166, 82],
  ink: [30, 30, 30],
  muted: [91, 107, 127],
  faint: [138, 151, 168],
  rule: [227, 232, 239],
  border: [214, 222, 232],
  panel: [244, 247, 251],
  zebra: [248, 250, 252],
  navyTint: [234, 241, 249],
  track: [220, 227, 236],
  dashed: [195, 205, 217],
  white: [255, 255, 255],
  coverAccentText: [159, 195, 233],
  coverMutedText: [201, 216, 234],
  coverRule: [42, 88, 133],
  coverRing: [10, 63, 114],
  coverRingStrong: [17, 80, 140],
} as const satisfies Record<string, RgbColor>;

/** Text and background pairs for pills; markers use the status colours. */
export type Tone =
  | "found"
  | "supporting"
  | "partial"
  | "none"
  | "conflict"
  | "na"
  | "info";

export const TONES: Record<
  Tone,
  { text: RgbColor; fill: RgbColor; border?: RgbColor }
> = {
  found: { text: [23, 104, 63], fill: [231, 242, 236] },
  supporting: { text: [30, 78, 140], fill: [232, 240, 250] },
  partial: { text: [143, 79, 16], fill: [250, 239, 227] },
  none: { text: [71, 85, 105], fill: [238, 241, 245] },
  conflict: { text: [185, 28, 28], fill: [251, 233, 233] },
  na: { text: [143, 79, 16], fill: [255, 255, 255], border: [227, 194, 158] },
  info: { text: [0, 51, 102], fill: [234, 241, 249] },
};

const POINT_TO_MM = 0.3528;

/** Approximate cap height in mm for Helvetica at the given point size. */
export function capHeight(size: number): number {
  return size * POINT_TO_MM * 0.7;
}

/** Baseline that vertically centres a single line in a box. */
export function centredBaseline(top: number, height: number, size: number) {
  return top + height / 2 + capHeight(size) / 2;
}

export function setFont(
  doc: jsPDF,
  size: number,
  style: FontStyle = "normal",
  color?: RgbColor,
) {
  doc.setFont("helvetica", style);
  doc.setFontSize(size);
  if (color) doc.setTextColor(...color);
}

export function textWidth(
  doc: jsPDF,
  text: string,
  size: number,
  style: FontStyle = "normal",
  charSpace = 0,
): number {
  setFont(doc, size, style);
  return doc.getTextWidth(text) + charSpace * Math.max(text.length - 1, 0);
}

/** Shortens a single line with an ellipsis until it fits the width. */
export function clampLine(
  doc: jsPDF,
  text: string,
  width: number,
  size: number,
  style: FontStyle = "normal",
): string {
  if (textWidth(doc, text, size, style) <= width) return text;
  // Binary search for the longest prefix that fits with the ellipsis.
  let low = 1;
  let high = text.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (textWidth(doc, `${text.slice(0, middle)}...`, size, style) <= width)
      low = middle;
    else high = middle - 1;
  }
  return `${text.slice(0, low).trimEnd()}...`;
}

/** Wraps text and keeps at most maxLines lines, ending in an ellipsis. */
export function wrapLines(
  doc: jsPDF,
  text: string,
  width: number,
  size: number,
  style: FontStyle = "normal",
  maxLines = Number.POSITIVE_INFINITY,
): string[] {
  setFont(doc, size, style);
  const lines = (doc.splitTextToSize(text, Math.max(width, 1)) as string[]).map(
    (line) =>
      textWidth(doc, line, size, style) > width
        ? clampLine(doc, line, width, size, style)
        : line,
  );
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  kept[maxLines - 1] = clampLine(
    doc,
    `${kept[maxLines - 1] ?? ""} ${lines[maxLines] ?? ""}`,
    width,
    size,
    style,
  );
  if (!kept[maxLines - 1]?.endsWith("..."))
    kept[maxLines - 1] = `${kept[maxLines - 1]}...`;
  return kept;
}

/** Uppercase label with letter spacing. Never use it for searchable text. */
export function drawEyebrow(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  options: {
    color?: RgbColor;
    size?: number;
    charSpace?: number;
    align?: "left" | "right";
  } = {},
): number {
  const size = options.size ?? 6.5;
  const charSpace = options.charSpace ?? 0.25;
  const label = text.toUpperCase();
  setFont(doc, size, "bold", options.color ?? PALETTE.blue);
  const width = textWidth(doc, label, size, "bold", charSpace);
  const startX = options.align === "right" ? x - width : x;
  doc.text(label, startX, y, { charSpace });
  return width;
}

export function drawMarker(
  doc: jsPDF,
  centerX: number,
  centerY: number,
  kind: MarkerKind,
  color: RgbColor,
  radius = 1.1,
  background: RgbColor = PALETTE.white,
) {
  doc.setLineWidth(0.35);
  doc.setDrawColor(...color);
  doc.setFillColor(...color);
  if (kind === "filled") {
    doc.circle(centerX, centerY, radius, "F");
  } else if (kind === "half") {
    doc.setFillColor(...background);
    doc.circle(centerX, centerY, radius, "F");
    doc.setFillColor(...color);
    // Left half filled: a polygon approximating the half disc.
    const points: Array<[number, number]> = [];
    for (let step = 0; step <= 12; step += 1) {
      const angle = Math.PI / 2 + (Math.PI * step) / 12;
      points.push([
        fixedPoint(centerX + radius * Math.cos(angle)),
        fixedPoint(centerY - radius * Math.sin(angle)),
      ]);
    }
    fillPolygon(doc, points);
    doc.circle(centerX, centerY, radius, "S");
  } else if (kind === "outline") {
    doc.setFillColor(...background);
    doc.circle(centerX, centerY, radius, "FD");
  } else {
    const r = radius * 1.15;
    doc.triangle(
      centerX - r,
      centerY + r * 0.85,
      centerX + r,
      centerY + r * 0.85,
      centerX,
      centerY - r * 1.05,
      "F",
    );
  }
}

function fillPolygon(doc: jsPDF, points: ReadonlyArray<[number, number]>) {
  const first = points[0];
  if (!first) return;
  const segments: Array<[number, number]> = [];
  for (let index = 1; index < points.length; index += 1) {
    const point = points[index]!;
    const previous = points[index - 1]!;
    segments.push([point[0] - previous[0], point[1] - previous[1]]);
  }
  doc.lines(segments, first[0], first[1], [1, 1], "F", true);
}

export interface PillOptions {
  tone: Tone;
  marker?: MarkerKind;
  markerColor?: RgbColor;
  small?: boolean;
  /** Shrinks the label font so the pill never exceeds this width. */
  maxWidth?: number;
}

export function pillMetrics(
  doc: jsPDF,
  label: string,
  options: PillOptions,
): { width: number; height: number; size: number } {
  let size = options.small ? 6.2 : 6.6;
  const height = options.small ? 4.2 : 4.8;
  const padLeft = options.marker ? (options.small ? 1.6 : 1.8) : 2.2;
  const markerSpace = options.marker ? 2.2 + 1.3 : 0;
  const measure = () =>
    padLeft + markerSpace + textWidth(doc, label, size, "bold") + 2.2;
  if (options.maxWidth !== undefined)
    while (size > 5 && measure() > options.maxWidth) size -= 0.2;
  return { width: measure(), height, size };
}

/** Fully rounded status pill with a marker. Returns its width. */
export function drawPill(
  doc: jsPDF,
  x: number,
  top: number,
  label: string,
  options: PillOptions,
): number {
  const tone = TONES[options.tone];
  const { width, height, size } = pillMetrics(doc, label, options);
  doc.setFillColor(...tone.fill);
  if (tone.border) {
    doc.setDrawColor(...tone.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, top, width, height, height / 2, height / 2, "FD");
  } else {
    doc.roundedRect(x, top, width, height, height / 2, height / 2, "F");
  }
  let textX = x + 2.2;
  if (options.marker) {
    const padLeft = options.small ? 1.6 : 1.8;
    drawMarker(
      doc,
      x + padLeft + 1.1,
      top + height / 2,
      options.marker,
      options.markerColor ?? tone.text,
      options.small ? 1 : 1.1,
      tone.fill,
    );
    textX = x + padLeft + 2.2 + 1.3;
  }
  setFont(doc, size, "bold", tone.text);
  doc.text(label, textX, centredBaseline(top, height, size));
  return width;
}

export type ChipVariant = "id" | "solid" | "evidence" | "muted";

export function chipWidth(doc: jsPDF, label: string, size = 6.8): number {
  return textWidth(doc, label, size, "bold") + 3.2;
}

/** Small rectangular chip for identifiers and evidence references. */
export function drawChip(
  doc: jsPDF,
  x: number,
  top: number,
  label: string,
  variant: ChipVariant = "id",
  options: {
    size?: number;
    height?: number;
    minWidth?: number;
    fill?: RgbColor;
    color?: RgbColor;
  } = {},
): number {
  const size = options.size ?? (variant === "evidence" ? 6.2 : 6.8);
  const height = options.height ?? (variant === "evidence" ? 4 : 4.4);
  const width = Math.max(chipWidth(doc, label, size), options.minWidth ?? 0);
  const fill: RgbColor =
    variant !== "evidence" && options.fill
      ? options.fill
      : variant === "solid"
        ? PALETTE.navy
        : variant === "evidence"
          ? PALETTE.white
          : variant === "muted"
            ? TONES.none.fill
            : PALETTE.navyTint;
  doc.setFillColor(...fill);
  if (variant === "evidence") {
    doc.setDrawColor(...PALETTE.border);
    doc.setLineWidth(0.25);
    doc.roundedRect(x, top, width, height, 1, 1, "FD");
  } else {
    doc.roundedRect(x, top, width, height, 1, 1, "F");
  }
  setFont(
    doc,
    size,
    "bold",
    variant === "solid"
      ? PALETTE.white
      : variant === "muted"
        ? TONES.none.text
        : (options.color ?? PALETTE.navy),
  );
  doc.text(label, x + width / 2, centredBaseline(top, height, size), {
    align: "center",
  });
  return width;
}

export interface BarSegment {
  value: number;
  color: RgbColor;
}

/** Horizontal stacked bar with rounded ends on the track. */
export function drawStackedBar(
  doc: jsPDF,
  x: number,
  top: number,
  width: number,
  height: number,
  segments: readonly BarSegment[],
  total: number,
  options: { track?: RgbColor; gap?: number } = {},
) {
  const radius = height / 2;
  doc.setFillColor(...(options.track ?? PALETTE.rule));
  doc.roundedRect(x, top, width, height, radius, radius, "F");
  if (total <= 0) return;
  const visible = segments.filter((segment) => segment.value > 0);
  const gap = options.gap ?? 0;
  const usable = width - gap * Math.max(visible.length - 1, 0);
  let cursor = x;
  visible.forEach((segment, index) => {
    const segmentWidth = (usable * segment.value) / total;
    if (segmentWidth <= 0) return;
    doc.setFillColor(...segment.color);
    const isFirst = index === 0;
    const isLast =
      index === visible.length - 1 &&
      Math.abs(cursor + segmentWidth - (x + width)) < 0.01;
    if (segmentWidth >= height && (isFirst || isLast)) {
      doc.roundedRect(cursor, top, segmentWidth, height, radius, radius, "F");
      // Square the inner edge so adjoining segments meet cleanly.
      if (isFirst && !isLast)
        doc.rect(cursor + segmentWidth - radius, top, radius, height, "F");
      if (isLast && !isFirst) doc.rect(cursor, top, radius, height, "F");
    } else {
      doc.rect(cursor, top, segmentWidth, height, "F");
    }
    cursor += segmentWidth + gap;
  });
}

/** Ring chart: a full track ring with arcs for each segment, clockwise from 12. */
export function drawDonut(
  doc: jsPDF,
  centerX: number,
  centerY: number,
  radius: number,
  thickness: number,
  segments: readonly BarSegment[],
  total: number,
  track: RgbColor = PALETTE.track,
) {
  doc.setLineWidth(thickness);
  doc.setDrawColor(...track);
  doc.circle(centerX, centerY, radius, "S");
  if (total <= 0) return;
  let start = 0;
  for (const segment of segments) {
    const fraction = Math.min(Math.max(segment.value / total, 0), 1 - start);
    if (fraction <= 0) continue;
    if (fraction >= 0.999) {
      doc.setDrawColor(...segment.color);
      doc.circle(centerX, centerY, radius, "S");
      return;
    }
    const steps = Math.max(Math.ceil(fraction * 120), 2);
    const points: Array<[number, number]> = [];
    for (let step = 0; step <= steps; step += 1) {
      const angle =
        -Math.PI / 2 + 2 * Math.PI * (start + fraction * (step / steps));
      points.push([
        fixedPoint(centerX + radius * Math.cos(angle)),
        fixedPoint(centerY + radius * Math.sin(angle)),
      ]);
    }
    const lines: Array<[number, number]> = [];
    for (let index = 1; index < points.length; index += 1) {
      lines.push([
        points[index]![0] - points[index - 1]![0],
        points[index]![1] - points[index - 1]![1],
      ]);
    }
    doc.setDrawColor(...segment.color);
    doc.setLineCap("butt");
    doc.setLineJoin("round");
    doc.lines(lines, points[0]![0], points[0]![1], [1, 1], "S", false);
    doc.setLineJoin("miter");
    start += fraction;
  }
}

export interface CardOptions {
  fill?: RgbColor;
  stroke?: RgbColor;
  radius?: number;
  lineWidth?: number;
  dashed?: boolean;
}

export function drawCard(
  doc: jsPDF,
  x: number,
  top: number,
  width: number,
  height: number,
  options: CardOptions = {},
) {
  const radius = options.radius ?? 2;
  const fill = options.fill;
  const stroke = options.stroke;
  if (fill) doc.setFillColor(...fill);
  if (stroke) {
    doc.setDrawColor(...stroke);
    doc.setLineWidth(options.lineWidth ?? 0.25);
  }
  const dashApi = doc as unknown as {
    setLineDashPattern: (pattern: number[], phase: number) => void;
  };
  if (options.dashed) dashApi.setLineDashPattern([1.2, 0.9], 0);
  const style = fill && stroke ? "FD" : fill ? "F" : "S";
  doc.roundedRect(x, top, width, height, radius, radius, style);
  if (options.dashed) dashApi.setLineDashPattern([], 0);
}

export function drawRule(
  doc: jsPDF,
  x1: number,
  y: number,
  x2: number,
  color: RgbColor = PALETTE.rule,
  lineWidth = 0.2,
) {
  doc.setDrawColor(...color);
  doc.setLineWidth(lineWidth);
  doc.line(x1, y, x2, y);
}

/** KPI tile: eyebrow with marker, large number and a caption. */
export function drawKpiTile(
  doc: jsPDF,
  x: number,
  top: number,
  width: number,
  height: number,
  tile: {
    label: string;
    value: string;
    caption: string;
    marker: MarkerKind;
    markerColor: RgbColor;
    valueColor: RgbColor;
  },
) {
  drawCard(doc, x, top, width, height, { stroke: PALETTE.border });
  drawMarker(doc, x + 5.1, top + 5.6, tile.marker, tile.markerColor, 1.1);
  const label = tile.label.toUpperCase();
  const labelWidth = width - 10.5;
  let labelSize = 6.2;
  while (
    labelSize > 5.6 &&
    textWidth(doc, label, labelSize, "bold", 0.15) > labelWidth
  )
    labelSize -= 0.2;
  // Long labels wrap to a second line instead of being cut off.
  const labelLines =
    textWidth(doc, label, labelSize, "bold", 0.15) > labelWidth
      ? wrapLines(
          doc,
          label,
          labelWidth - label.length * 0.08,
          labelSize,
          "bold",
          2,
        )
      : [label];
  setFont(doc, labelSize, "bold", PALETTE.muted);
  labelLines.forEach((line, index) =>
    doc.text(line, x + 7.4, top + 6.5 + index * 2.6, { charSpace: 0.15 }),
  );
  setFont(doc, 24, "bold", tile.valueColor);
  doc.text(tile.value, x + 4, top + 16.5);
  const captionLines = wrapLines(
    doc,
    tile.caption,
    width - 8,
    6.8,
    "normal",
    2,
  );
  setFont(doc, 6.8, "normal", PALETTE.muted);
  captionLines.forEach((line, index) =>
    doc.text(line, x + 4, top + 21 + index * 2.9),
  );
}
