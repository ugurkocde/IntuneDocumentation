import { compareControlIds } from "./compliance/engine";
import {
  CONTROL_STATUS_LABELS,
  CONTROL_STATUS_ORDER,
  CONTROL_STATUS_COLORS,
  frameworkCoverageLabel,
} from "./compliance/presentation";
import jsPDF from "jspdf";
import {
  PALETTE,
  TONES,
  capHeight,
  HEADER_LOGO_BOX,
  clampLine,
  dateParts,
  drawCard,
  drawDonut,
  drawEyebrow,
  drawKpiTile,
  fitLogo,
  drawLines,
  drawMarker,
  drawRule,
  drawStackedBar,
  fitFontSize,
  pinPdfMetadata,
  setFont,
  wrapLines,
  type FontStyle,
  type MarkerKind,
  type RgbColor,
} from "./compliance/pdf-kit";
import {
  applyTheme,
  brandingTheme,
  drawCoverBackground,
  drawCoverFooter,
  drawCoverHeadline,
  documentControlGridHeight,
  drawCoverMasthead,
  drawCoverTenantBlock,
  drawDocumentControlGrid,
  drawFooterNotice,
  drawPageTitle,
  drawRunningChrome,
  drawSectionHeading,
  drawTableHeader,
  drawToc,
  drawZebraRow,
  layoutRunningFooter,
  layoutToc,
  pageFrame,
} from "./compliance/pdf-chrome";
import {
  extractSettingValue,
  parseDeviceConfiguration,
  parseAdministrativeTemplate,
  parseComplianceRules,
  parseSecurityBaseline,
  parseAssignments,
  ASSIGNMENTS_NOT_APPLICABLE,
  formatValue,
  parseDocumentableProperties,
  extractAppConfigurationSettings,
  SETTINGS_UNAVAILABLE,
  settingsUnavailable,
} from "./configuration-parser";
import {
  assignable,
  assignmentStatus,
  itemFetchErrors,
} from "./compliance/assignments";
import {
  analyzeConfigurations,
  type DetailedExportData,
  type PolicyExportError,
  type ExportGenerationResult,
} from "./configuration-analyzer";
import {
  DOCUMENT_PRODUCT_LINE,
  DOCUMENT_SOURCE_NOTE,
  buildGlanceModel,
  formatDocumentDate,
  plural,
  summaryNotes,
} from "./documentation-glance";
import {
  ADDITIONAL_FAMILY_LABELS,
  REDACTED_VALUE,
} from "./intune-policy-registry";
import { assessCompliance } from "./compliance";
import { unlistedSources } from "./compliance/graph-rows";
import { withoutDesktopOnlyFrameworks } from "./compliance/framework-availability";
import {
  buildConditionalAccessReportRows,
  conditionalAccessStateLabel,
} from "./conditional-access-report";
import { addPdfOutline, type PdfOutlineEntry } from "./pdf-outline";

export type { PolicyExportError };
export type PdfGenerationResult = ExportGenerationResult;

type DetailedPdfData = DetailedExportData;

export interface DetailedPdfOptions {
  /**
   * "web" (the default) leaves desktop-only frameworks such as NIS2 and DORA
   * out of the compliance evidence preview. The desktop app passes "desktop"
   * to keep every framework.
   */
  audience?: "desktop" | "web";
  /**
   * Fixed render time. Replaces the current time for the generated date and
   * the PDF metadata, so the same input always produces the same bytes.
   */
  renderDate?: Date;
}

const PRODUCT_NAME = "Intune Documentation";
const DEFAULT_TAGLINE =
  "Comprehensive export of Intune policies, profiles, and assignments";

function controlStatusMarker(
  status: keyof typeof CONTROL_STATUS_LABELS,
): MarkerKind {
  return status === "evidenceFound"
    ? "filled"
    : status === "partialEvidence"
      ? "half"
      : status === "conflictingEvidence" || status === "notAssessed"
        ? "triangle"
        : "outline";
}

export async function generateDetailedPDF(
  data: DetailedPdfData,
  options: DetailedPdfOptions = {},
): Promise<PdfGenerationResult> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true, // Enable compression for smaller file size
  });
  const generatedAt = options.renderDate
    ? new Date(options.renderDate.getTime())
    : new Date();
  // Fixed render dates read calendar fields in UTC so every time zone renders
  // the same text.
  const fixedDate = options.renderDate !== undefined;
  if (fixedDate)
    pinPdfMetadata(
      doc,
      generatedAt,
      `documentation|${generatedAt.toISOString()}|${data.collectedAt ?? ""}`,
    );

  // Error tracking for graceful degradation
  const exportErrors: PolicyExportError[] = [];
  let totalPolicies = 0;
  let successfulPolicies = 0;

  // Analyze configurations for overview; the glance model reads the same
  // analytics so every count matches the Word export.
  const analytics = analyzeConfigurations(data, generatedAt);
  const glance = buildGlanceModel(data, analytics);

  // Opt in: a scoped export titles the cover for its scope, and a compact
  // one leaves out the summary pages.
  const scope = data.documentScope;
  const compactScope = scope?.compact === true;
  // The glance and the Executive Summary, as in the Word export.
  const showAnalytics =
    !compactScope &&
    data.branding?.documentSettings?.includeAnalytics !== false;

  // Branding colours over the evidence report palette, the branding font for
  // every kit and chrome call, and the branding sizes for body text.
  const branding = data.branding;
  const fontFamily = branding?.fonts?.family || "helvetica";
  const headerFontSize = branding?.fonts?.headerSize || 14;
  const bodyFontSize = branding?.fonts?.bodySize || 11;
  const theme = brandingTheme(branding, fontFamily);
  applyTheme(doc, theme);
  const {
    primary: primaryColor,
    secondary: secondaryColor,
    text: textColor,
  } = theme;
  const sectionTitleSize = Math.min(Math.max(headerFontSize + 6, 16), 26);
  const policyNameSize = Math.max(bodyFontSize + 1, 12);
  const metaFontSize = Math.max(bodyFontSize - 3, 8);
  const tableFontSize = Math.max(bodyFontSize - 3, 8);

  const grid = pageFrame(doc, {
    margin: 15,
    contentTop: 21,
    contentBottom: 276,
  });

  const currentPage = () => doc.internal.getCurrentPageInfo().pageNumber;

  // Set PDF metadata with sensible fallbacks
  try {
    const metaTitle =
      branding?.metadata?.title ||
      (branding?.companyName
        ? `${branding.companyName}: Intune Configuration Report`
        : "Intune Configuration Report");
    const metaAuthor =
      branding?.metadata?.author ||
      branding?.companyName ||
      branding?.department ||
      "Intune Documentation Tool";
    const metaSubject =
      branding?.metadata?.subject ||
      "Microsoft Intune Configuration Documentation";
    const metaKeywords =
      branding?.metadata?.keywords?.join(", ") ||
      "Intune, Microsoft, Configuration, Documentation, Report";
    // Some jsPDF builds expose setProperties; use optional chaining defensively
    (doc as any).setProperties?.({
      title: metaTitle,
      author: metaAuthor,
      subject: metaSubject,
      keywords: metaKeywords,
    });
  } catch {}

  // The branding logo, normalised once. It appears where its position says:
  // on the cover, in the running header or footer, or as a watermark.
  const logoImage = (() => {
    const imgData = branding?.logo?.dataUrl;
    if (!imgData || typeof imgData !== "string") return null;
    let format: "PNG" | "JPEG" = "PNG";
    let base64Data = imgData;
    if (imgData.startsWith("data:")) {
      const matches = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i.exec(imgData);
      if (matches) {
        const detectedFormat = matches[1]?.toLowerCase();
        format =
          detectedFormat === "jpeg" || detectedFormat === "jpg"
            ? "JPEG"
            : "PNG";
        base64Data = matches[2] || imgData;
      } else {
        // An unexpected data URL: keep the payload after the comma and guess
        // the format from the prefix.
        const dataIndex = imgData.indexOf(",");
        if (dataIndex > -1) {
          base64Data = imgData.substring(dataIndex + 1);
          if (/jpe?g/i.test(imgData.slice(0, dataIndex))) format = "JPEG";
        }
      }
    }
    const dataUrl = `data:image/${format.toLowerCase()};base64,${base64Data}`;
    let width = 100;
    let height = 100;
    try {
      const properties = (doc as any).getImageProperties?.(dataUrl);
      width = Math.max(Number(properties?.width) || 100, 1);
      height = Math.max(Number(properties?.height) || 100, 1);
    } catch (propsError) {
      console.warn(
        "Could not get image properties, using default aspect ratio:",
        propsError,
      );
    }
    return { dataUrl, format, aspect: width / height, size: { width, height } };
  })();
  const logoPosition = logoImage ? branding?.logo?.position : undefined;

  // Logo size in mm from the branding size, kept within the given box.
  const logoBox = (
    defaultHeight: number,
    maxHeight: number,
    maxLogoWidth: number,
  ) => {
    if (!logoImage) return null;
    let height = Math.min(branding?.logo?.height || defaultHeight, maxHeight);
    if (branding?.logo?.width && !branding?.logo?.height)
      height = Math.min(branding.logo.width / logoImage.aspect, maxHeight);
    let width = height * logoImage.aspect;
    if (width > maxLogoWidth) {
      height = (height * maxLogoWidth) / width;
      width = maxLogoWidth;
    }
    return { width, height };
  };

  const drawLogo = (
    x: number,
    y: number,
    box: { width: number; height: number },
  ) => {
    if (!logoImage) return;
    try {
      doc.addImage(
        logoImage.dataUrl,
        logoImage.format,
        x,
        y,
        box.width,
        box.height,
        undefined,
        "FAST",
      );
    } catch (err) {
      console.error("Error adding logo:", err);
    }
  };

  // A header logo sits right of the header note, in the same box as in the
  // Word export; a footer logo sits left of the footer text.
  const headerLogoSize =
    logoImage &&
    (logoPosition === "header" || branding?.header?.includeLogo === true)
      ? fitLogo(branding?.logo ?? {}, logoImage.size, HEADER_LOGO_BOX)
      : null;
  const headerLogo = headerLogoSize
    ? { width: headerLogoSize.widthMm, height: headerLogoSize.heightMm }
    : null;
  const footerLogo = logoPosition === "footer" ? logoBox(15, 5.5, 40) : null;
  const footerInset = footerLogo ? footerLogo.width + 3 : 0;

  // The footer text and the confidentiality notice wrap instead of being
  // cut; the content stays above the notice.
  const footerEnabled = branding?.footer?.enabled === true;
  const footerLayout = layoutRunningFooter(doc, grid, {
    text:
      footerEnabled && branding?.footer?.text
        ? branding.footer.text
        : DOCUMENT_PRODUCT_LINE,
    inset: footerInset,
    notice: footerEnabled
      ? branding?.footer?.confidentialityNotice || undefined
      : undefined,
  });
  const frame = { ...grid, contentBottom: footerLayout.contentBottom };
  const {
    margin,
    right,
    contentWidth,
    contentTop,
    contentBottom,
    pageWidth,
    pageHeight,
  } = frame;
  const maxWidth = contentWidth;
  let yPosition = contentTop;
  // The policy whose content is being drawn, named on continuation pages.
  let currentPolicy: string | undefined;

  // Text and logo watermarks go on each content page as it is created, so
  // the content draws over them.
  const addWatermark = () => {
    if (branding?.watermark?.enabled && branding?.watermark?.text) {
      const watermarkFontSize = branding.watermark.fontSize || 50;
      // setTextColor takes no alpha, so a lighter grey stands in for opacity.
      const opacity = branding.watermark.opacity || 0.1;
      const grayValue = Math.round(230 - (230 - 200) * (1 - opacity));
      setFont(doc, watermarkFontSize, "bold", [
        grayValue,
        grayValue,
        grayValue,
      ]);
      doc.text(branding.watermark.text, pageWidth / 2, pageHeight / 2, {
        align: "center",
        angle: branding.watermark.angle || -45,
      });
    }
    if (logoPosition === "watermark") {
      const box = logoBox(60, 100, Math.min(contentWidth, 120));
      if (box)
        drawLogo(
          pageWidth / 2 - box.width / 2,
          pageHeight / 2 - box.height / 2,
          box,
        );
    }
  };

  const drawContinuationCaption = () => {
    if (!currentPolicy) return;
    setFont(doc, 7.2, "italic", PALETTE.muted);
    doc.text(
      clampLine(
        doc,
        `${currentPolicy} (continued)`,
        contentWidth,
        7.2,
        "italic",
      ),
      margin,
      yPosition + 2.6,
    );
    yPosition += 6;
  };

  const addContentPage = () => {
    doc.addPage();
    addWatermark();
    yPosition = contentTop;
    drawContinuationCaption();
  };

  /** Starts a new page when the next block of this height does not fit. */
  const ensureSpace = (height: number): boolean => {
    if (yPosition + height <= contentBottom) return false;
    addContentPage();
    return true;
  };

  const addText = (
    text: string,
    fontSize = bodyFontSize,
    style: FontStyle = "normal",
    color: RgbColor = textColor,
    x = margin,
  ) => {
    setFont(doc, fontSize, style);
    const lines: string[] = doc.splitTextToSize(text, maxWidth - (x - margin));
    const lineHeight = fontSize * 0.45;
    for (const line of lines) {
      ensureSpace(lineHeight);
      setFont(doc, fontSize, style, color);
      doc.text(line, x, yPosition + capHeight(fontSize));
      yPosition += lineHeight;
    }
  };

  /** A bold heading kept on the page with the start of what follows it. */
  const addSubheading = (text: string, fontSize = 9.5) => {
    ensureSpace(fontSize * 0.45 + 16);
    addText(text, fontSize, "bold", primaryColor);
    yPosition += 1.5;
  };

  // Monospaced script source, line by line across pages.
  const addCode = (text: string) => {
    doc.setFont("courier", "normal");
    doc.setFontSize(8);
    const lines: string[] = doc.splitTextToSize(text, maxWidth - 10);
    for (const line of lines) {
      ensureSpace(4);
      doc.setFont("courier", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...PALETTE.ink);
      doc.text(line, margin + 5, yPosition + capHeight(8));
      yPosition += 4;
    }
    yPosition += 3;
  };

  // Track sections and their page numbers for the contents and bookmarks.
  const tocEntries: {
    title: string;
    pageNum: number;
    children?: PdfOutlineEntry[];
  }[] = [];

  /**
   * Opens a section on a new page: eyebrow, searchable title and a primary
   * rule. toc is the contents and bookmark title when it differs.
   */
  const startSection = (section: {
    title: string;
    eyebrow: string;
    toc?: string;
    lead?: string;
  }) => {
    currentPolicy = undefined;
    addContentPage();
    tocEntries.push({
      title: section.toc ?? section.title,
      pageNum: currentPage(),
    });
    yPosition = drawPageTitle(doc, theme, frame, yPosition, {
      eyebrow: section.eyebrow,
      title: section.title,
      lead: section.lead,
      size: sectionTitleSize,
    });
    drawRule(doc, margin, yPosition - 2, right, primaryColor, 0.4);
    yPosition += 3.5;
  };

  const addConfigHeader = (
    name: string,
    assignments: string,
    createdDate?: string,
    modifiedDate?: string,
  ) => {
    // A break before the header is not a continuation of the previous policy.
    currentPolicy = undefined;
    setFont(doc, policyNameSize, "bold");
    const nameLines: string[] = doc.splitTextToSize(name, maxWidth);
    const nameLineHeight = policyNameSize * 0.45;
    setFont(doc, metaFontSize, "normal");
    const assignmentLines: string[] = doc.splitTextToSize(
      `Assigned to: ${assignments}`,
      maxWidth,
    );
    const metaLineHeight = metaFontSize * 0.45;
    const created = formatDocumentDate(createdDate, fixedDate);
    const modified = formatDocumentDate(modifiedDate, fixedDate);
    const dates = [
      created ? `Created: ${created}` : undefined,
      modified ? `Last Modified: ${modified}` : undefined,
    ].filter((part): part is string => Boolean(part));
    const headerHeight =
      3 +
      nameLines.length * nameLineHeight +
      (dates.length ? metaLineHeight : 0) +
      Math.min(assignmentLines.length, 4) * metaLineHeight +
      4;
    // Keep the header with the start of its content.
    ensureSpace(Math.min(headerHeight + 16, contentBottom - contentTop));

    // Bookmark the policy under the section that is currently being rendered
    const currentSection = tocEntries[tocEntries.length - 1];
    if (currentSection) {
      (currentSection.children ??= []).push({
        title: name,
        pageNumber: currentPage(),
      });
    }

    yPosition += 2;
    for (const line of nameLines) {
      setFont(doc, policyNameSize, "bold", secondaryColor);
      doc.text(line, margin, yPosition + capHeight(policyNameSize));
      yPosition += nameLineHeight;
    }
    yPosition += 1;
    if (dates.length) {
      setFont(doc, metaFontSize, "normal", PALETTE.muted);
      doc.text(
        dates.join("     "),
        margin,
        yPosition + capHeight(metaFontSize),
      );
      yPosition += metaLineHeight;
    }
    for (const line of assignmentLines) {
      ensureSpace(metaLineHeight);
      setFont(doc, metaFontSize, "normal", PALETTE.muted);
      doc.text(line, margin, yPosition + capHeight(metaFontSize));
      yPosition += metaLineHeight;
    }
    yPosition += 1;
    drawRule(doc, margin, yPosition, right);
    yPosition += 3;
    currentPolicy = name;
  };

  const addSettingsTable = (
    settings: Array<{ name: string; value: string; description?: string }>,
  ) => {
    if (settings.length === 0) return;

    // Name, value and description columns
    const colWidths = [50, 65, 65];
    const columnX = [margin, margin + 50, margin + 115];
    const lineHeight = tableFontSize * 0.45;
    const padding = 1.6;

    // Helper function to wrap long technical strings
    const wrapTechnicalString = (str: string, width: number): string[] => {
      // For technical strings like "defender_configuration_enableconvertwarntoblock_1"
      // Break at underscores if the string is too long
      if (typeof str === "string" && str.includes("_") && str.length > 40) {
        const parts = str.split("_");
        const lines: string[] = [];
        let currentLine = "";

        parts.forEach((part, idx) => {
          const separator = idx > 0 ? "_" : "";
          const testLine = currentLine + separator + part;
          const testWidth = doc.getTextWidth(testLine);

          if (testWidth > width && currentLine) {
            lines.push(currentLine);
            currentLine = part;
          } else {
            currentLine = testLine;
          }
        });

        if (currentLine) lines.push(currentLine);
        return lines;
      }

      // For regular text, use the standard split function
      return doc.splitTextToSize(str, width);
    };

    const drawHeader = () => {
      yPosition =
        drawTableHeader(doc, theme, frame, yPosition, [
          { x: columnX[0]!, lines: ["Setting"] },
          { x: columnX[1]!, lines: ["Value"] },
          { x: columnX[2]!, lines: ["Description"] },
        ]) + 0.4;
    };

    // The header and the first row stay together.
    ensureSpace(6 + lineHeight + padding * 2);
    drawHeader();

    // Lines that fit a page below the continuation caption and the header.
    const pageLines = Math.floor(
      (contentBottom - contentTop - 12 - padding * 2) / lineHeight,
    );

    settings.forEach((setting, rowIndex) => {
      setFont(doc, tableFontSize, "normal");
      const nameLines: string[] = doc.splitTextToSize(
        setting.name,
        (colWidths[0] || 50) - 3,
      );
      // Ensure valueText is always a string to avoid .includes() errors
      const valueText =
        setting.value != null ? String(setting.value) : "Not configured";

      // Handle newlines in values (e.g., arrays formatted with \n)
      const valueLines = valueText
        .split("\n")
        .flatMap((part) => wrapTechnicalString(part, (colWidths[1] || 65) - 3));

      const descLines: string[] = setting.description
        ? doc.splitTextToSize(setting.description, (colWidths[2] || 65) - 3)
        : [];
      const columns: Array<{ lines: string[]; color: RgbColor }> = [
        { lines: nameLines, color: textColor },
        { lines: valueLines, color: textColor },
        { lines: descLines, color: PALETTE.muted },
      ];
      const lineCount = Math.max(
        nameLines.length,
        valueLines.length,
        descLines.length,
        1,
      );

      // A row moves to the next page whole; only a row taller than a page
      // is split, and its header is repeated on every page.
      let start = 0;
      let freshPage = false;
      while (start < lineCount) {
        const remaining = lineCount - start;
        const available = Math.floor(
          (contentBottom - yPosition - padding * 2) / lineHeight,
        );
        let take = remaining;
        if (remaining > available) {
          if (!freshPage && (remaining <= pageLines || available < 3)) {
            addContentPage();
            drawHeader();
            freshPage = true;
            continue;
          }
          take = Math.max(available, 1);
        }
        const rowHeight = take * lineHeight + padding * 2;
        drawZebraRow(doc, frame, yPosition, rowHeight, rowIndex);
        columns.forEach(({ lines, color }, columnIndex) => {
          const slice = lines.slice(start, start + take);
          if (slice.length === 0) return;
          drawLines(
            doc,
            slice,
            (columnX[columnIndex] ?? margin) + 1.5,
            yPosition + padding,
            tableFontSize,
            "normal",
            color,
            lineHeight,
          );
        });
        yPosition += rowHeight;
        start += take;
        freshPage = false;
      }
    });

    yPosition += 4;
  };

  // ------------------------------------------------------------------ Cover
  const classificationLabel = branding?.metadata?.classification
    ? branding.metadata.classification.charAt(0).toUpperCase() +
      branding.metadata.classification.slice(1)
    : undefined;
  const generatedText = formatDocumentDate(generatedAt, fixedDate) ?? "";
  // Only a real collection time is shown; the export time is not one.
  const collectedText = formatDocumentDate(data.collectedAt, fixedDate);
  const { year, month, day } = dateParts(generatedAt, fixedDate);
  const version = `v${year}.${month}.${day}`;

  drawCoverBackground(doc, theme, frame, {
    ringFraction: showAnalytics ? (glance.assignedShare ?? 0) : 0,
  });
  const coverLogo = logoPosition === "cover" ? logoImage : null;
  drawCoverMasthead(doc, theme, frame, {
    productName: PRODUCT_NAME,
    keepLogoRatio: true,
    ...(coverLogo
      ? {
          logo: {
            dataUrl: coverLogo.dataUrl,
            ...(branding?.logo?.width ? { width: branding.logo.width } : {}),
            ...(branding?.logo?.height ? { height: branding.logo.height } : {}),
          },
        }
      : {}),
    companyName: branding?.companyName,
  });

  // A configuration name can be long: up to three title lines, which leaves
  // no room for the description line.
  const coverTitle =
    scope?.title || branding?.coverPage?.title || "Microsoft Intune";
  const titleMaxLines = scope?.title ? 3 : 2;
  const coverTitleSize = fitFontSize(doc, coverTitle, contentWidth, 36, 24);
  const coverTitleLines = wrapLines(
    doc,
    coverTitle,
    contentWidth,
    coverTitleSize,
    "bold",
    titleMaxLines,
  ).length;
  const coverLead = scope?.subtitle
    ? "Configuration Documentation"
    : branding?.coverPage?.subtitle || DEFAULT_TAGLINE;
  drawCoverHeadline(doc, theme, frame, {
    eyebrow: "Intune Configuration Export",
    title: coverTitle,
    titleMaxLines,
    subtitle: scope?.subtitle || "Configuration Documentation",
    lead: coverTitleLines > 2 ? "" : coverLead,
  });
  drawCoverTenantBlock(doc, theme, frame, {
    tenantEyebrow: "Tenant",
    tenant: data.tenantLabel,
    facts: [
      ...(collectedText ? [["Data collected", collectedText] as const] : []),
      ["Generated", generatedText] as const,
      ...(classificationLabel
        ? [["Classification", classificationLabel] as const]
        : []),
    ],
  });

  // At a glance, for the full export only.
  const collectionLine = (() => {
    const { collection } = glance;
    if (!collection.hasWarnings)
      return "Collection: no collection warnings recorded.";
    const parts = [
      collection.partial
        ? `${plural(collection.partial, "resource", "resources")} partially collected`
        : undefined,
      collection.unavailable
        ? `${plural(collection.unavailable, "resource", "resources")} unavailable`
        : undefined,
      collection.skippedFamilies.length
        ? `${plural(collection.skippedFamilies.length, "policy family", "policy families")} left out of the collection`
        : undefined,
    ].filter(Boolean);
    return `Collection: ${parts.join(", ")}.`;
  })();

  if (showAnalytics) {
    const midTop = 142;
    const cardWidth = 62;
    const cardHeight = 66;
    drawCard(doc, margin, midTop, cardWidth, cardHeight, {
      fill: PALETTE.panel,
    });
    const donutX = margin + cardWidth / 2;
    const donutY = midTop + 25;
    drawDonut(
      doc,
      donutX,
      donutY,
      17,
      4.4,
      [{ value: glance.assigned, color: secondaryColor }],
      Math.max(glance.assignmentApplicable, 1),
    );
    setFont(doc, 22, "bold", primaryColor);
    doc.text(
      glance.assignedShare === null
        ? "n/a"
        : `${Math.round(glance.assignedShare * 100)}%`,
      donutX,
      donutY + 2.2,
      { align: "center" },
    );
    setFont(doc, 6.6, "normal", PALETTE.muted);
    doc.text(
      `${glance.assigned} of ${glance.assignmentApplicable} assignable`,
      donutX,
      donutY + 6.6,
      { align: "center" },
    );
    setFont(doc, 8.3, "bold", textColor);
    doc.text("Assigned configurations", donutX, midTop + 52, {
      align: "center",
    });
    setFont(doc, 7, "normal", PALETTE.muted);
    wrapLines(
      doc,
      "Share of the configurations that take assignments",
      cardWidth - 8,
      7,
      "normal",
      2,
    ).forEach((line, index) =>
      doc.text(line, donutX, midTop + 56 + index * 3, { align: "center" }),
    );

    const glanceX = margin + cardWidth + 6;
    const glanceWidth = right - glanceX;
    drawEyebrow(doc, "At a glance", glanceX, midTop + 2.4, {
      color: secondaryColor,
    });
    drawRule(doc, glanceX, midTop + 5, right, primaryColor, 0.4);
    const tileGap = 3;
    const tileWidth = (glanceWidth - tileGap) / 2;
    const tileHeight = 27.5;
    const tiles = [
      {
        label: "Configurations collected",
        value: String(glance.configurations),
        caption: plural(glance.policyTypes, "policy type", "policy types"),
        marker: "filled" as const,
        markerColor: primaryColor,
      },
      {
        label: "Assigned",
        value: String(glance.assigned),
        caption: "With at least one assignment",
        marker: "filled" as const,
        markerColor: secondaryColor,
      },
      {
        label: "Not assigned",
        value: String(glance.notAssigned),
        caption: "No assignment found",
        marker: "outline" as const,
        markerColor: secondaryColor,
      },
      {
        label: "Assignment unknown",
        value: String(glance.assignmentUnknown),
        caption: "Assignments could not be read",
        marker: "half" as const,
        markerColor: PALETTE.muted,
      },
    ];
    tiles.forEach((tile, index) =>
      drawKpiTile(
        doc,
        glanceX + (index % 2) * (tileWidth + tileGap),
        midTop + 8 + Math.floor(index / 2) * (tileHeight + tileGap),
        tileWidth,
        tileHeight,
        { ...tile, valueColor: primaryColor },
      ),
    );
    setFont(doc, 7.2, "normal", PALETTE.muted);
    doc.text(
      "Unknown assignments are not counted as assigned.",
      margin,
      midTop + 72,
    );
    drawLines(
      doc,
      wrapLines(doc, collectionLine, contentWidth, 7.2, "normal", 2),
      margin,
      midTop + 74.6,
      7.2,
      "normal",
      textColor,
      3.2,
    );
  }

  const controlCells = [
    {
      label: "Organization",
      value:
        [branding?.companyName, branding?.department]
          .filter(Boolean)
          .join(" / ") || undefined,
    },
    {
      label: "Prepared by",
      value: branding?.metadata?.author || branding?.coverPage?.author,
    },
    { label: "Contact", value: branding?.contactEmail },
    { label: "Website", value: branding?.website },
    { label: "Tenant", value: data.tenantLabel },
    { label: "Version", value: version },
    { label: "Classification", value: classificationLabel },
  ];
  // The grid moves up to stay clear of a long confidentiality notice. When
  // even that would reach the glance or the tenant block, the cover leaves
  // the notice out; every other page still prints it in full.
  const controlDefaultTop = showAnalytics ? 224 : 144;
  const controlFloor = showAnalytics ? 226 : 144;
  const controlHeight = documentControlGridHeight(doc, frame, controlCells);
  const noticeTop = footerLayout.noticeLines.length
    ? footerLayout.contentBottom
    : frame.pageHeight;
  const controlTop = Math.min(controlDefaultTop, noticeTop - 2 - controlHeight);
  const coverNotice =
    footerLayout.noticeLines.length > 0 &&
    controlTop >= Math.min(controlFloor, controlDefaultTop);
  drawDocumentControlGrid(
    doc,
    theme,
    frame,
    coverNotice ? controlTop : controlDefaultTop,
    "Document control",
    controlCells,
  );
  drawCoverFooter(doc, frame, DOCUMENT_PRODUCT_LINE, DOCUMENT_SOURCE_NOTE);
  // The confidentiality notice shows on the cover too, as in Word.
  if (coverNotice) drawFooterNotice(doc, frame, footerLayout);

  // === TABLE OF CONTENTS ===
  // Check if ToC is enabled (default to true if not specified)
  const includeToC =
    !compactScope &&
    branding?.documentSettings?.includeTableOfContents !== false;

  // The contents page is filled in at the end, once every page is known.
  let tocPageNumber = 0;
  if (includeToC) {
    addContentPage();
    tocPageNumber = currentPage();
  }

  const addTenantOverview = () => {
    startSection({
      toc: "Tenant Overview",
      eyebrow: "Tenant Overview",
      title: "Executive Summary",
      lead: "Counts read from the collected configuration. Unknown assignments are not counted as assigned.",
    });

    // Configurations by family, with their assignment counts.
    yPosition = drawSectionHeading(
      doc,
      theme,
      frame,
      yPosition,
      "Configurations by family",
      `${plural(glance.configurations, "configuration", "configurations")} in ${plural(glance.policyTypes, "policy type", "policy types")}`,
    );
    drawRule(doc, margin, yPosition - 1.5, right, primaryColor, 0.4);
    yPosition -= 1.5;
    if (glance.families.length === 0) {
      yPosition += 3;
      addText(
        "No configurations were collected.",
        8.5,
        "normal",
        PALETTE.muted,
      );
    }
    const familyRowHeight = 7.6;
    for (const family of glance.families) {
      ensureSpace(familyRowHeight);
      const middle = yPosition + familyRowHeight / 2;
      drawMarker(doc, margin + 1.4, middle, "filled", secondaryColor);
      setFont(doc, 8.5, "normal", textColor);
      doc.text(
        clampLine(doc, family.label, 82, 8.5),
        margin + 5,
        middle + capHeight(8.5) / 2,
      );
      // Configurations without an assignment relationship count in none of
      // the three.
      const notApplicable =
        family.configurations -
        family.assigned -
        family.notAssigned -
        family.assignmentUnknown;
      setFont(doc, 7, "normal", PALETTE.muted);
      doc.text(
        notApplicable === family.configurations
          ? "Assignment not applicable"
          : `${family.assigned} assigned, ${family.notAssigned} not assigned, ${family.assignmentUnknown} unknown${notApplicable > 0 ? `, ${notApplicable} not applicable` : ""}`,
        right - 16,
        middle + capHeight(7) / 2,
        { align: "right" },
      );
      setFont(doc, 10, "bold", primaryColor);
      doc.text(
        String(family.configurations),
        right,
        middle + capHeight(10) / 2,
        { align: "right" },
      );
      yPosition += familyRowHeight;
      drawRule(doc, margin, yPosition, right);
    }
    yPosition += 4;
    for (const note of summaryNotes(analytics)) {
      addText(note, 8, "normal", PALETTE.muted);
      yPosition += 1;
    }
    addText(collectionLine, 8, "normal", PALETTE.muted);
    yPosition += 7;

    // === CONFIGURATION INVENTORY ===
    const activeInventory = analytics.inventory.filter(
      (item) => item.total > 0,
    );
    const inventoryRowHeight = 6.4;
    const inventoryColumns = [
      { x: margin, label: "Policy type" },
      { x: margin + 96, label: "Total" },
      { x: margin + 117, label: "Assigned" },
      { x: margin + 138, label: "Not assigned" },
      { x: margin + 161, label: "Unknown" },
    ];
    const drawInventoryHeader = () => {
      yPosition =
        drawTableHeader(
          doc,
          theme,
          frame,
          yPosition,
          inventoryColumns.map(({ x, label }) => ({ x, lines: [label] })),
        ) + 0.4;
    };
    // Start on a new page when the whole table fits there but not here.
    const inventoryHeight = 14 + activeInventory.length * inventoryRowHeight;
    if (
      yPosition + inventoryHeight > contentBottom &&
      inventoryHeight <= contentBottom - contentTop
    )
      addContentPage();
    ensureSpace(14 + inventoryRowHeight);
    yPosition = drawSectionHeading(
      doc,
      theme,
      frame,
      yPosition,
      "Configuration Inventory",
    );
    drawInventoryHeader();
    activeInventory.forEach((item, index) => {
      if (ensureSpace(inventoryRowHeight)) drawInventoryHeader();
      drawZebraRow(doc, frame, yPosition, inventoryRowHeight, index);
      const baseline = yPosition + inventoryRowHeight / 2 + capHeight(8) / 2;
      const notApplicable = item.notApplicable === item.total;
      setFont(doc, 8, "normal", textColor);
      doc.text(
        clampLine(doc, item.label, 92, 8),
        inventoryColumns[0]!.x + 1.5,
        baseline,
      );
      setFont(doc, 8, "bold", primaryColor);
      doc.text(String(item.total), inventoryColumns[1]!.x + 1.5, baseline);
      setFont(doc, 8, "normal", textColor);
      [item.assigned, item.unassigned, item.unknown].forEach((count, column) =>
        doc.text(
          notApplicable ? "n/a" : String(count),
          inventoryColumns[column + 2]!.x + 1.5,
          baseline,
        ),
      );
      yPosition += inventoryRowHeight;
    });
    yPosition += 8;

    // === PLATFORM COVERAGE ===
    if (Object.keys(analytics.platformCounts).length > 0 || data.deviceCounts) {
      // Combine configuration counts with device counts to rank platforms
      const platformData: Record<string, { configs: number; devices: number }> =
        {};
      Object.entries(analytics.platformCounts).forEach(([platform, count]) => {
        platformData[platform] = { configs: count, devices: 0 };
      });

      // Add device counts (normalize OS names to match configuration platforms)
      if (data.deviceCounts) {
        Object.entries(data.deviceCounts).forEach(([os, count]) => {
          const normalizedPlatform = (() => {
            if (typeof os !== "string") return String(os);
            const lower = os.toLowerCase();
            if (lower.includes("windows")) return "Windows";
            if (lower.includes("mac")) return "macOS";
            if (lower.includes("ios")) return "iOS";
            if (lower.includes("android")) return "Android";
            if (lower.includes("linux")) return "Linux";
            return os;
          })();

          if (platformData[normalizedPlatform]) {
            platformData[normalizedPlatform].devices += count;
          } else {
            platformData[normalizedPlatform] = { configs: 0, devices: count };
          }
        });
      }

      // Sort platforms by total activity and show the top five
      const sortedPlatforms = Object.entries(platformData)
        .sort(
          (a, b) => b[1].configs + b[1].devices - (a[1].configs + a[1].devices),
        )
        .slice(0, 5);

      const platformRowHeight = 7;
      ensureSpace(8 + sortedPlatforms.length * platformRowHeight);
      yPosition = drawSectionHeading(
        doc,
        theme,
        frame,
        yPosition,
        "Platform Coverage",
        "Configurations per platform",
      );
      drawRule(doc, margin, yPosition - 1.5, right, primaryColor, 0.4);
      yPosition -= 1.5;
      const maxConfigs = Math.max(
        ...sortedPlatforms.map(([, counts]) => counts.configs),
        1,
      );
      for (const [platform, counts] of sortedPlatforms) {
        const middle = yPosition + platformRowHeight / 2;
        setFont(doc, 8.5, "normal", textColor);
        doc.text(
          clampLine(doc, platform, 38, 8.5),
          margin,
          middle + capHeight(8.5) / 2,
        );
        drawStackedBar(
          doc,
          margin + 42,
          middle - 1.6,
          110,
          3.2,
          [{ value: counts.configs, color: secondaryColor }],
          maxConfigs,
          { track: PALETTE.track },
        );
        setFont(doc, 8, "bold", primaryColor);
        doc.text(
          plural(counts.configs, "config", "configs"),
          right,
          middle + capHeight(8) / 2,
          {
            align: "right",
          },
        );
        yPosition += platformRowHeight;
        drawRule(doc, margin, yPosition, right);
      }
      yPosition += 8;
    }

    // === TOP ASSIGNED GROUPS ===
    if (analytics.topGroups.length > 0) {
      const topGroupsData = analytics.topGroups.slice(0, 5);
      const groupRowHeight = 7;
      const maxCount = Math.max(...analytics.topGroups.map((g) => g[1]), 1);
      const groupColumns = [
        { x: margin, lines: ["Rank"] },
        { x: margin + 14, lines: ["Group"] },
        { x: margin + 130, lines: ["Assignments"] },
      ];
      ensureSpace(14 + topGroupsData.length * groupRowHeight);
      yPosition = drawSectionHeading(
        doc,
        theme,
        frame,
        yPosition,
        "Top Assigned Groups",
      );
      yPosition =
        drawTableHeader(doc, theme, frame, yPosition, groupColumns) + 0.4;
      topGroupsData.forEach(([groupId, count], index) => {
        drawZebraRow(doc, frame, yPosition, groupRowHeight, index);
        const baseline = yPosition + groupRowHeight / 2 + capHeight(8) / 2;
        setFont(doc, 8, "bold", primaryColor);
        doc.text(String(index + 1), margin + 1.5, baseline);
        setFont(doc, 8, "normal", textColor);
        const groupName = data.groupNames?.get(groupId) || groupId;
        doc.text(clampLine(doc, groupName, 112, 8), margin + 15.5, baseline);
        drawStackedBar(
          doc,
          margin + 131.5,
          yPosition + groupRowHeight / 2 - 1.2,
          30,
          2.4,
          [{ value: count, color: secondaryColor }],
          maxCount,
          { track: PALETTE.track },
        );
        setFont(doc, 8, "bold", primaryColor);
        doc.text(String(count), right - 1.5, baseline, { align: "right" });
        yPosition += groupRowHeight;
      });
      yPosition += 8;
    }
  };

  const addComplianceOverview = () => {
    let assessment;
    try {
      assessment =
        options.audience === "desktop"
          ? assessCompliance(data)
          : withoutDesktopOnlyFrameworks(assessCompliance(data));
    } catch (error) {
      console.error("Skipping compliance preview section:", error);
      return;
    }

    startSection({
      title: "Compliance Evidence Preview",
      eyebrow: "Compliance evidence",
      lead: "This preview maps the exported configuration to technical evidence for each supported compliance framework. Supporting evidence may describe configuration or a compliance requirement. Device state, effective access and the remaining control requirements are assessed separately.",
    });

    const statusLabels = CONTROL_STATUS_LABELS;
    const statusColors = CONTROL_STATUS_COLORS;
    const statusRank = CONTROL_STATUS_ORDER;

    for (const framework of assessment.frameworks) {
      ensureSpace(30);
      addText(
        `${framework.framework.name} (${framework.framework.version})`,
        10.5,
        "bold",
        primaryColor,
      );
      yPosition += 1;
      const coverageLabel = frameworkCoverageLabel(framework);
      if (coverageLabel) addText(coverageLabel, 8, "normal", PALETTE.muted);
      addText(
        `${framework.summary.withEvidence} with evidence, ${framework.summary.partial} partial, ${framework.summary.withoutEvidence} without evidence (${framework.summary.applicableControls} entries in scope; ${framework.summary.notApplicable} outside scope; ${framework.summary.notAssessed} not assessed; ${framework.summary.conflicting} mixed evidence)`,
        8,
        "normal",
        PALETTE.muted,
      );
      yPosition += 2;
      drawRule(doc, margin, yPosition, right);
      yPosition += 2.5;

      const maxRows = 8;
      const ranked = [...framework.controls].sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          compareControlIds(a.control.id, b.control.id),
      );
      for (const assessed of ranked.slice(0, maxRows)) {
        ensureSpace(5);
        drawMarker(
          doc,
          margin + 1.4,
          yPosition + capHeight(8) / 2,
          controlStatusMarker(assessed.status),
          statusColors[assessed.status],
        );
        const tier = assessed.control.tier ? ` (${assessed.control.tier})` : "";
        addText(
          `${assessed.control.id} ${assessed.control.title}${tier}: ${statusLabels[assessed.status]}`,
          8,
          "normal",
          textColor,
          margin + 5,
        );
        if (framework.framework.id === "essential-eight")
          addText(
            assessed.control.summary,
            8,
            "normal",
            PALETTE.muted,
            margin + 5,
          );
        yPosition += 1;
      }
      if (ranked.length > maxRows) {
        addText(
          `…and ${ranked.length - maxRows} more controls in the full report.`,
          8,
          "italic",
          PALETTE.muted,
          margin + 5,
        );
      }
      yPosition += 6;
    }

    ensureSpace(20);
    addText(assessment.disclaimer, 8, "italic", PALETTE.muted);
    yPosition += 4;
    addText(
      "Generate the full requirement-level compliance report from the Compliance view in your dashboard: intunedocumentation.com/dashboard",
      9,
      "bold",
      primaryColor,
    );
  };

  if (showAnalytics) addTenantOverview();
  if (data.includeComplianceEvidence !== false) {
    addComplianceOverview();
  }

  if (data.fetchErrors?.length) {
    startSection({
      title: "Collection Warnings",
      eyebrow: "Collection",
      lead: "The following resources were only partially collected or were unavailable. Successful sibling resources remain in this document.",
    });

    for (const warning of data.fetchErrors) {
      ensureSpace(12);
      drawMarker(
        doc,
        margin + 1.4,
        yPosition + capHeight(9) / 2,
        warning.partial ? "half" : "outline",
        TONES.partial.text,
      );
      addText(
        `${warning.partial ? "Partial data" : "Collection unavailable"}: ${warning.policyType}: ${warning.policyName}`,
        9,
        "bold",
        TONES.partial.text,
        margin + 5,
      );
      addText(
        [
          warning.error,
          warning.statusCode ? `HTTP ${warning.statusCode}` : undefined,
          warning.endpoint
            ? `Microsoft Graph beta ${warning.endpoint}`
            : undefined,
          warning.permissionHint
            ? `Permission hint: ${warning.permissionHint}`
            : undefined,
        ]
          .filter(Boolean)
          .join(" · "),
        8,
        "normal",
        PALETTE.muted,
        margin + 5,
      );
      yPosition += 2;
      drawRule(doc, margin, yPosition, right);
      yPosition += 3;
    }
  }

  // The assignment collection status of an item, with its collection
  // errors matched by family as the engine matches them.
  const statusOf = (item: Record<string, unknown>, family: string) =>
    assignmentStatus(item, itemFetchErrors(data.fetchErrors, item, family));
  // Settings Catalog Section
  const enhanceAssignmentText = (text: string): string => {
    if (!text) return text;
    if (data.groupNames && data.groupNames.size > 0) {
      data.groupNames.forEach((name, id) => {
        const reGroup = new RegExp(`(Group: )${id}`, "g");
        const reExcl = new RegExp(`(Excluded: )${id}`, "g");
        text = text.replace(reGroup, `$1${name}`).replace(reExcl, `$1${name}`);
      });
    }
    return text;
  };
  if (data.settingsCatalog.length > 0) {
    startSection({
      title: "Settings Catalog Policies",
      eyebrow: "Device configuration",
    });

    totalPolicies += data.settingsCatalog.length;

    data.settingsCatalog.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName || policy.name,
          enhanceAssignmentText(
            parseAssignments(
              policy.assignments,
              statusOf(policy, "settingsCatalog"),
            ),
          ),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Extract and display settings
        if (Array.isArray(policy.settings) && policy.settings.length > 0) {
          const formattedSettings: Array<{
            name: string;
            value: string;
            description?: string;
          }> = [];

          // Process each setting and flatten nested settings
          for (const setting of policy.settings) {
            const extracted = extractSettingValue(setting);

            // Skip unconfigured settings
            if (extracted.value === "Not configured") {
              continue;
            }

            // Add the main setting
            formattedSettings.push({
              name: extracted.name,
              value: extracted.value,
              description: extracted.description,
            });

            // Add nested settings if they exist
            if (
              extracted.nestedSettings &&
              extracted.nestedSettings.length > 0
            ) {
              formattedSettings.push(...extracted.nestedSettings);
            }
          }

          if (formattedSettings.length > 0) {
            addSettingsTable(formattedSettings);
          } else {
            addText("No settings configured", 9, "normal", PALETTE.muted);
            yPosition += 5;
          }
        } else {
          addText(
            settingsUnavailable(policy, "settingsCatalog")
              ? SETTINGS_UNAVAILABLE
              : "No settings configured",
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Settings Catalog",
          policyName: policy.displayName || policy.name || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Settings Catalog policy: ${policy.displayName || policy.name}`,
          error,
        );
      }
    });
  }

  // Device Configurations Section
  if (data.deviceConfigurations.length > 0) {
    startSection({
      title: "Device Configurations",
      eyebrow: "Device configuration",
    });

    totalPolicies += data.deviceConfigurations.length;

    data.deviceConfigurations.forEach((config) => {
      try {
        addConfigHeader(
          config.displayName,
          enhanceAssignmentText(
            parseAssignments(
              config.assignments,
              statusOf(config, "deviceConfigurations"),
            ),
          ),
          config.createdDateTime,
          config.lastModifiedDateTime,
        );

        if (config.description) {
          addText(config.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Parse and display configuration settings
        const categories = parseDeviceConfiguration(config);
        categories.forEach((category) => {
          if (category.settings.length > 0) {
            addSubheading(category.category);
            addSettingsTable(category.settings);
          }
        });

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Device Configuration",
          policyName: config.displayName || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Device Configuration: ${config.displayName}`,
          error,
        );
      }
    });
  }

  // Administrative Templates Section
  if (data.administrativeTemplates.length > 0) {
    startSection({
      title: "Administrative Templates",
      eyebrow: "Device configuration",
    });

    totalPolicies += data.administrativeTemplates.length;

    data.administrativeTemplates.forEach((template) => {
      try {
        addConfigHeader(
          template.displayName,
          enhanceAssignmentText(
            parseAssignments(
              template.assignments,
              statusOf(template, "administrativeTemplates"),
            ),
          ),
          template.createdDateTime,
          template.lastModifiedDateTime,
        );

        if (template.description) {
          addText(template.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Parse and display definition values
        if (
          Array.isArray(template.definitionValues) &&
          template.definitionValues.length > 0
        ) {
          const settings = parseAdministrativeTemplate(
            template.definitionValues,
          );
          const groupedSettings = settings.reduce((acc: any, setting) => {
            if (!acc[setting.category]) acc[setting.category] = [];
            acc[setting.category].push({
              name: setting.name,
              value: `${setting.state}: ${setting.value}`,
            });
            return acc;
          }, {});

          Object.entries(groupedSettings).forEach(
            ([category, categorySettings]: [string, any]) => {
              addSubheading(category);
              addSettingsTable(categorySettings);
            },
          );
        } else {
          addText(
            settingsUnavailable(template, "administrativeTemplates")
              ? SETTINGS_UNAVAILABLE
              : "No settings configured",
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Administrative Template",
          policyName: template.displayName || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Administrative Template: ${template.displayName}`,
          error,
        );
      }
    });
  }

  // Compliance Policies Section
  if (data.compliancePolicies.length > 0) {
    startSection({
      title: "Compliance Policies",
      eyebrow: "Device compliance",
    });

    totalPolicies += data.compliancePolicies.length;

    data.compliancePolicies.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName,
          enhanceAssignmentText(
            parseAssignments(
              policy.assignments,
              statusOf(policy, "compliancePolicies"),
            ),
          ),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Parse and display compliance rules
        const rules = parseComplianceRules(policy);
        if (rules.length > 0) {
          const rulesTable = rules.map((rule) => ({
            name: rule.rule,
            value: `${rule.value} (Action: ${rule.action})`,
          }));
          addSettingsTable(rulesTable);
        } else {
          addText("No compliance rules configured", 9, "normal", PALETTE.muted);
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Compliance Policy",
          policyName: policy.displayName || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Compliance Policy: ${policy.displayName}`,
          error,
        );
      }
    });
  }

  // App Protection Policies Section
  if (data.appProtectionPolicies && data.appProtectionPolicies.length > 0) {
    startSection({
      title: "App Protection Policies",
      eyebrow: "App management",
    });

    totalPolicies += data.appProtectionPolicies.length;

    data.appProtectionPolicies.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName,
          enhanceAssignmentText(
            parseAssignments(
              policy.assignments,
              statusOf(policy, "appProtectionPolicies"),
            ),
          ),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Display platform type
        if (policy.platformType) {
          addSubheading("Platform:");
          addText(policy.platformType, 9, "normal", PALETTE.muted);
          yPosition += 3;
        }

        // Parse and display MAM settings comprehensively
        const settings: Array<{ name: string; value: string }> = [];

        // Helper function to add setting if configured
        const addSettingIfConfigured = (name: string, value: any) => {
          if (value !== undefined && value !== null) {
            const formattedValue = formatValue(value);
            if (formattedValue !== "Not configured") {
              settings.push({ name, value: formattedValue });
            }
          }
        };

        // Data Transfer Settings
        addSettingIfConfigured(
          "Allowed Inbound Data Transfer Sources",
          policy.allowedInboundDataTransferSources,
        );
        addSettingIfConfigured(
          "Allowed Outbound Data Transfer Destinations",
          policy.allowedOutboundDataTransferDestinations,
        );
        addSettingIfConfigured(
          "Allowed Outbound Clipboard Sharing Level",
          policy.allowedOutboundClipboardSharingLevel,
        );

        // Data Protection Settings
        addSettingIfConfigured("Block Data Backup", policy.dataBackupBlocked);
        addSettingIfConfigured("Block Save As", policy.saveAsBlocked);
        addSettingIfConfigured("Block Printing", policy.printBlocked);
        addSettingIfConfigured(
          "Organizational Credentials Required",
          policy.organizationalCredentialsRequired,
        );

        // Compliance & Security
        addSettingIfConfigured(
          "Device Compliance Required",
          policy.deviceComplianceRequired,
        );
        addSettingIfConfigured(
          "Managed Browser Required",
          policy.managedBrowserToOpenLinksRequired,
        );
        addSettingIfConfigured(
          "Maximum Allowed Device Threat Level",
          policy.maximumAllowedDeviceThreatLevel,
        );
        addSettingIfConfigured(
          "Mobile Threat Defense Remediation Action",
          policy.mobileThreatDefenseRemediationAction,
        );
        addSettingIfConfigured(
          "Action If Unable to Authenticate User",
          policy.appActionIfUnableToAuthenticateUser,
        );

        // Access Requirements
        addSettingIfConfigured("PIN Required", policy.pinRequired);
        addSettingIfConfigured("Block Fingerprint", policy.fingerprintBlocked);
        addSettingIfConfigured("Block Face ID", policy.faceIdBlocked);

        // Version Requirements - Minimum Required
        addSettingIfConfigured(
          "Minimum Required SDK Version",
          policy.minimumRequiredSdkVersion,
        );
        addSettingIfConfigured(
          "Minimum Required OS Version",
          policy.minimumRequiredOsVersion,
        );
        addSettingIfConfigured(
          "Minimum Required App Version",
          policy.minimumRequiredAppVersion,
        );

        // Version Requirements - Warning
        addSettingIfConfigured(
          "Minimum Warning OS Version",
          policy.minimumWarningOsVersion,
        );
        addSettingIfConfigured(
          "Minimum Warning App Version",
          policy.minimumWarningAppVersion,
        );

        // Version Requirements - Wipe
        addSettingIfConfigured(
          "Minimum Wipe SDK Version",
          policy.minimumWipeSdkVersion,
        );
        addSettingIfConfigured(
          "Minimum Wipe OS Version",
          policy.minimumWipeOsVersion,
        );
        addSettingIfConfigured(
          "Minimum Wipe App Version",
          policy.minimumWipeAppVersion,
        );

        // Version Requirements - Maximum
        addSettingIfConfigured(
          "Maximum Required OS Version",
          policy.maximumRequiredOsVersion,
        );
        addSettingIfConfigured(
          "Maximum Warning OS Version",
          policy.maximumWarningOsVersion,
        );
        addSettingIfConfigured(
          "Maximum Wipe OS Version",
          policy.maximumWipeOsVersion,
        );

        // Offline/Grace Periods
        addSettingIfConfigured(
          "Period Offline Before Wipe Is Enforced",
          policy.periodOfflineBeforeWipeIsEnforced,
        );
        addSettingIfConfigured(
          "Period Offline Before Access Check",
          policy.periodOfflineBeforeAccessCheck,
        );
        addSettingIfConfigured(
          "Period Online Before Access Check",
          policy.periodOnlineBeforeAccessCheck,
        );

        // Additional Settings
        addSettingIfConfigured("Is Assigned", policy.isAssigned);
        addSettingIfConfigured("Deployed App Count", policy.deployedAppCount);

        const existingSettingNames = new Set(settings.map((item) => item.name));
        settings.push(
          ...parseDocumentableProperties(policy).filter(
            (item) => !existingSettingNames.has(item.name),
          ),
        );

        if (settings.length > 0) {
          addSubheading("Protection Settings:");
          addSettingsTable(settings);
        } else {
          addText(
            "No protection settings configured",
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "App Protection Policy",
          policyName: policy.displayName || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export App Protection Policy: ${policy.displayName}`,
          error,
        );
      }
    });
  }

  // Security Baselines Section
  if (data.securityBaselines.length > 0) {
    startSection({
      title: "Security Baselines",
      eyebrow: "Endpoint security",
    });

    totalPolicies += data.securityBaselines.length;

    data.securityBaselines.forEach((baseline) => {
      try {
        addConfigHeader(
          baseline.displayName,
          enhanceAssignmentText(
            parseAssignments(
              baseline.assignments,
              statusOf(baseline, "securityBaselines"),
            ),
          ),
          baseline.createdDateTime,
          baseline.lastModifiedDateTime,
        );

        if (baseline.description) {
          addText(baseline.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        if (baseline.collectionStatus?.settings === "incomplete") {
          addText(
            "Baseline settings collection incomplete",
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 5;
        }
        // Parse and display baseline settings
        const unlisted = unlistedSources(baseline, "securityBaselines").size;
        if (
          !unlisted &&
          (baseline.settings?.length || baseline.categories?.length)
        ) {
          const categories = parseSecurityBaseline(
            baseline.categories || [],
            baseline.settings,
          );
          categories.forEach((category) => {
            if (category.settings.length > 0) {
              addSubheading(category.category);
              addSettingsTable(category.settings);
            }
          });
        } else {
          addText(
            settingsUnavailable(baseline, "securityBaselines")
              ? SETTINGS_UNAVAILABLE
              : "No settings configured",
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Security Baseline",
          policyName: baseline.displayName || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Security Baseline: ${baseline.displayName}`,
          error,
        );
      }
    });
  }

  // Scripts Section
  if (data.scripts.windows.length > 0 || data.scripts.macOS.length > 0) {
    startSection({
      title: "Scripts",
      eyebrow: "Scripts",
    });

    totalPolicies += data.scripts.windows.length + data.scripts.macOS.length;

    // Windows PowerShell Scripts
    if (data.scripts.windows.length > 0) {
      currentPolicy = undefined;
      addSubheading("Windows PowerShell Scripts", 11);
      yPosition += 2;

      data.scripts.windows.forEach((script) => {
        try {
          addConfigHeader(
            script.displayName,
            enhanceAssignmentText(
              parseAssignments(script.assignments, statusOf(script, "scripts")),
            ),
            script.createdDateTime,
            script.lastModifiedDateTime,
          );

          const scriptInfo = [
            { name: "File Name", value: script.fileName || "n/a" },
            {
              name: "Run As",
              value: script.runAsAccount === "system" ? "System" : "User",
            },
            {
              name: "Enforce Signature",
              value: formatValue(script.enforceSignatureCheck),
            },
            { name: "Run as 32-bit", value: formatValue(script.runAs32Bit) },
          ];

          addSettingsTable(scriptInfo);

          if (script.scriptContent === REDACTED_VALUE) {
            addText(
              "Script content omitted from the export for security.",
              9,
              "italic",
              PALETTE.muted,
            );
            yPosition += 3;
          } else if (script.scriptContent) {
            addSubheading("Script Content:", 9);

            // Decode base64 script content if needed
            let scriptText = script.scriptContent;
            try {
              // Check if it's base64 encoded
              if (
                scriptText &&
                typeof scriptText === "string" &&
                !scriptText.includes(" ") &&
                scriptText.length % 4 === 0
              ) {
                const decoded = atob(scriptText);
                scriptText = decoded;
              }
            } catch {
              // Not base64, use as is
            }

            addCode(scriptText);

            // Add script length info
            addText(
              `Total script length: ${scriptText.length} characters`,
              8,
              "normal",
              PALETTE.muted,
            );
            yPosition += 2;
          }

          yPosition += 5;
          successfulPolicies++;
        } catch (error: any) {
          exportErrors.push({
            policyType: "Windows Script",
            policyName: script.displayName || "Unknown Script",
            error: error?.message || "Unknown error occurred",
          });
          console.error(
            `Failed to export Windows Script: ${script.displayName}`,
            error,
          );
        }
      });
    }

    // macOS Shell Scripts
    if (data.scripts.macOS.length > 0) {
      currentPolicy = undefined;
      addSubheading("macOS Shell Scripts", 11);
      yPosition += 2;

      data.scripts.macOS.forEach((script) => {
        try {
          addConfigHeader(
            script.displayName,
            enhanceAssignmentText(
              parseAssignments(script.assignments, statusOf(script, "scripts")),
            ),
            script.createdDateTime,
            script.lastModifiedDateTime,
          );

          const scriptInfo = [
            { name: "File Name", value: script.fileName || "n/a" },
            {
              name: "Run As",
              value: script.runAsAccount === "system" ? "System" : "User",
            },
          ];

          addSettingsTable(scriptInfo);

          if (script.scriptContent === REDACTED_VALUE) {
            addText(
              "Script content omitted from the export for security.",
              9,
              "italic",
              PALETTE.muted,
            );
            yPosition += 3;
          } else if (script.scriptContent) {
            addSubheading("Script Content:", 9);

            // Decode base64 script content if needed
            let scriptText = script.scriptContent;
            try {
              // Check if it's base64 encoded
              if (
                scriptText &&
                typeof scriptText === "string" &&
                !scriptText.includes(" ") &&
                scriptText.length % 4 === 0
              ) {
                const decoded = atob(scriptText);
                scriptText = decoded;
              }
            } catch {
              // Not base64, use as is
            }

            addCode(scriptText);

            // Add script length info
            addText(
              `Total script length: ${scriptText.length} characters`,
              8,
              "normal",
              PALETTE.muted,
            );
            yPosition += 2;
          }

          yPosition += 5;
          successfulPolicies++;
        } catch (error: any) {
          exportErrors.push({
            policyType: "macOS Script",
            policyName: script.displayName || "Unknown Script",
            error: error?.message || "Unknown error occurred",
          });
          console.error(
            `Failed to export macOS Script: ${script.displayName}`,
            error,
          );
        }
      });
    }
  }

  // App Configuration Policies Section
  if (data.appConfigurations && data.appConfigurations.length > 0) {
    startSection({
      title: "App Configuration Policies",
      eyebrow: "App management",
    });

    totalPolicies += data.appConfigurations.length;

    data.appConfigurations.forEach((config) => {
      try {
        addConfigHeader(
          config.displayName || config.name,
          enhanceAssignmentText(
            parseAssignments(
              config.assignments,
              statusOf(config, "appConfigurations"),
            ),
          ),
          config.createdDateTime,
          config.lastModifiedDateTime,
        );

        if (config.description) {
          addText(config.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Display configuration type and platform
        const configSettings: Array<{ name: string; value: string }> = [];

        if (config["@odata.type"]) {
          configSettings.push({
            name: "Configuration Type",
            value: config["@odata.type"].replace("#microsoft.graph.", ""),
          });
        }

        if (config.targetedMobileApps && config.targetedMobileApps.length > 0) {
          configSettings.push({
            name: "Number of Targeted Apps",
            value: config.targetedMobileApps.length.toString(),
          });
        }

        // Add app configuration settings based on type
        // For managed app configurations (iOS/Android)
        if (config.encodedSettingXml) {
          if (config.encodedSettingXml === REDACTED_VALUE) {
            configSettings.push({
              name: "Configuration Settings (XML)",
              value: "Omitted from the export for security",
            });
          } else
            try {
              // Try to decode and display XML settings
              const decodedXml = atob(config.encodedSettingXml);
              configSettings.push({
                name: "Configuration Settings (XML)",
                value:
                  decodedXml.substring(0, 500) +
                  (decodedXml.length > 500 ? "..." : ""),
              });
            } catch {
              configSettings.push({
                name: "Configuration Settings",
                value: "XML settings present (base64 encoded)",
              });
            }
        }

        // For managed device configurations
        if (config.payloadJson) {
          if (config.payloadJson === REDACTED_VALUE) {
            configSettings.push({
              name: "Configuration Payload",
              value: "Omitted from the export for security",
            });
          } else
            try {
              const payload = JSON.parse(config.payloadJson);
              Object.entries(payload).forEach(([key, value]) => {
                const formattedValue = formatValue(value);
                // Skip unconfigured settings
                if (formattedValue !== "Not configured") {
                  configSettings.push({
                    name: key,
                    value: formattedValue,
                  });
                }
              });
            } catch {
              configSettings.push({
                name: "Configuration Payload",
                value:
                  config.payloadJson.substring(0, 200) +
                  (config.payloadJson.length > 200 ? "..." : ""),
              });
            }
        }

        // For settings array (generic configurations)
        if (config.settings && Array.isArray(config.settings)) {
          configSettings.push(...extractAppConfigurationSettings(config));
        }

        // Additional common properties
        if (config.payload && typeof config.payload === "string") {
          configSettings.push({
            name: "Payload",
            value:
              config.payload === REDACTED_VALUE
                ? "Omitted from the export for security"
                : config.payload.substring(0, 200) +
                  (config.payload.length > 200 ? "..." : ""),
          });
        }

        if (config.permissionActions && config.permissionActions.length > 0) {
          configSettings.push({
            name: "Permission Actions",
            value: config.permissionActions.join(", "),
          });
        }

        // Display all collected settings
        if (configSettings.length > 0) {
          addSettingsTable(configSettings);
        }

        // Show targeted apps if available
        if (config.targetedMobileApps && config.targetedMobileApps.length > 0) {
          addSubheading("Targeted Apps:");
          config.targetedMobileApps.forEach((appId: string) => {
            addText(`• ${appId}`, 9, "normal", PALETTE.muted);
            yPosition += 1;
          });
          yPosition += 2;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "App Configuration",
          policyName: config.displayName || config.name || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export App Configuration: ${config.displayName || config.name}`,
          error,
        );
      }
    });
  }

  // Windows Update Policies Section
  if (data.windowsUpdatePolicies && data.windowsUpdatePolicies.length > 0) {
    startSection({
      title: "Windows Update Policies",
      eyebrow: "Updates",
    });

    totalPolicies += data.windowsUpdatePolicies.length;

    data.windowsUpdatePolicies.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName || policy.name,
          enhanceAssignmentText(
            parseAssignments(
              policy.assignments,
              statusOf(policy, "windowsUpdatePolicies"),
            ),
          ),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Add Windows Update specific settings
        const updateSettings: Array<{ name: string; value: string }> = [];

        // Helper function to add setting if configured
        const addUpdateSettingIfConfigured = (name: string, value: any) => {
          if (value !== undefined && value !== null) {
            const formattedValue = formatValue(value);
            if (formattedValue !== "Not configured") {
              updateSettings.push({ name, value: formattedValue });
            }
          }
        };

        addUpdateSettingIfConfigured(
          "Delivery Optimization Mode",
          policy.deliveryOptimizationMode,
        );
        addUpdateSettingIfConfigured(
          "Prerelease Features",
          policy.prereleaseFeatures,
        );
        addUpdateSettingIfConfigured(
          "Automatic Update Mode",
          policy.automaticUpdateMode,
        );
        addUpdateSettingIfConfigured(
          "Business Ready Updates Only",
          policy.businessReadyUpdatesOnly,
        );
        addUpdateSettingIfConfigured(
          "Drivers Excluded",
          policy.driversExcluded,
        );
        addUpdateSettingIfConfigured(
          "Quality Updates Deferral (days)",
          policy.qualityUpdatesDeferralPeriodInDays,
        );
        addUpdateSettingIfConfigured(
          "Feature Updates Deferral (days)",
          policy.featureUpdatesDeferralPeriodInDays,
        );
        addUpdateSettingIfConfigured(
          "Quality Updates Paused",
          policy.qualityUpdatesPaused,
        );
        addUpdateSettingIfConfigured(
          "Feature Updates Paused",
          policy.featureUpdatesPaused,
        );

        if (updateSettings.length > 0) {
          addSettingsTable(updateSettings);
        } else {
          addText("No settings configured", 9, "normal", PALETTE.muted);
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Windows Update Policy",
          policyName: policy.displayName || policy.name || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Windows Update Policy: ${policy.displayName || policy.name}`,
          error,
        );
      }
    });
  }

  // Conditional Access Policies Section
  if (
    data.conditionalAccessPolicies &&
    data.conditionalAccessPolicies.length > 0
  ) {
    startSection({
      title: "Conditional Access Policies",
      eyebrow: "Identity and access",
    });

    totalPolicies += data.conditionalAccessPolicies.length;

    data.conditionalAccessPolicies.forEach((policy: any) => {
      try {
        addConfigHeader(
          policy.displayName,
          "Defined by policy conditions",
          policy.createdDateTime,
          policy.modifiedDateTime,
        );

        if (policy.state) {
          addText(
            `State: ${conditionalAccessStateLabel(policy.state)}`,
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 2;
        }

        if (policy.description) {
          addText(policy.description, 9, "normal", PALETTE.muted);
          yPosition += 2;
        }

        const info = buildConditionalAccessReportRows(policy, data.groupNames);

        if (info.length > 0) {
          addSettingsTable(info);
        } else {
          addText(
            "No additional conditions configured",
            9,
            "normal",
            PALETTE.muted,
          );
          yPosition += 5;
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Conditional Access Policy",
          policyName: policy.displayName || "Unknown Policy",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Conditional Access Policy: ${policy.displayName}`,
          error,
        );
      }
    });
  }

  // Enrollment Configurations Section
  if (
    data.enrollmentConfigurations &&
    data.enrollmentConfigurations.length > 0
  ) {
    startSection({
      title: "Enrollment Configurations",
      eyebrow: "Enrollment",
    });

    totalPolicies += data.enrollmentConfigurations.length;

    data.enrollmentConfigurations.forEach((config) => {
      try {
        addConfigHeader(
          config.displayName || config.name,
          enhanceAssignmentText(
            parseAssignments(
              config.assignments,
              statusOf(config, "enrollmentConfigurations"),
            ),
          ),
          config.createdDateTime,
          config.lastModifiedDateTime,
        );

        if (config.description) {
          addText(config.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }

        // Add enrollment type
        if (config["@odata.type"]) {
          const enrollmentType = config["@odata.type"]
            .split(".")
            .pop()
            ?.replace(/([A-Z])/g, " $1")
            .trim();
          addText(`Type: ${enrollmentType}`, 9, "normal", PALETTE.muted);
          yPosition += 2;
        }

        // Add priority if available
        if (config.priority !== undefined) {
          addText(`Priority: ${config.priority}`, 9, "normal", PALETTE.muted);
          yPosition += 2;
        }

        // Add enrollment-specific settings
        const enrollmentSettings = [];

        if (config.limit !== undefined) {
          enrollmentSettings.push({
            name: "Device Enrollment Limit",
            value: config.limit,
          });
        }

        if (config.iosRestriction) {
          enrollmentSettings.push({
            name: "iOS Restrictions",
            value: config.iosRestriction.platformBlocked
              ? "Blocked"
              : "Allowed",
          });
          if (
            config.iosRestriction.personalDeviceEnrollmentBlocked !== undefined
          ) {
            enrollmentSettings.push({
              name: "iOS Personal Devices",
              value: config.iosRestriction.personalDeviceEnrollmentBlocked
                ? "Blocked"
                : "Allowed",
            });
          }
        }

        if (config.androidRestriction) {
          enrollmentSettings.push({
            name: "Android Restrictions",
            value: config.androidRestriction.platformBlocked
              ? "Blocked"
              : "Allowed",
          });
          if (
            config.androidRestriction.personalDeviceEnrollmentBlocked !==
            undefined
          ) {
            enrollmentSettings.push({
              name: "Android Personal Devices",
              value: config.androidRestriction.personalDeviceEnrollmentBlocked
                ? "Blocked"
                : "Allowed",
            });
          }
        }

        if (config.windowsRestriction) {
          enrollmentSettings.push({
            name: "Windows Restrictions",
            value: config.windowsRestriction.platformBlocked
              ? "Blocked"
              : "Allowed",
          });
          if (
            config.windowsRestriction.personalDeviceEnrollmentBlocked !==
            undefined
          ) {
            enrollmentSettings.push({
              name: "Windows Personal Devices",
              value: config.windowsRestriction.personalDeviceEnrollmentBlocked
                ? "Blocked"
                : "Allowed",
            });
          }
        }

        if (config.macOSRestriction) {
          enrollmentSettings.push({
            name: "macOS Restrictions",
            value: config.macOSRestriction.platformBlocked
              ? "Blocked"
              : "Allowed",
          });
          if (
            config.macOSRestriction.personalDeviceEnrollmentBlocked !==
            undefined
          ) {
            enrollmentSettings.push({
              name: "macOS Personal Devices",
              value: config.macOSRestriction.personalDeviceEnrollmentBlocked
                ? "Blocked"
                : "Allowed",
            });
          }
        }

        const genericEnrollmentSettings = parseDocumentableProperties(config);
        const knownEnrollmentNames = new Set(
          enrollmentSettings.map((setting: any) => setting.name),
        );
        enrollmentSettings.push(
          ...genericEnrollmentSettings.filter(
            (setting) => !knownEnrollmentNames.has(setting.name),
          ),
        );

        if (enrollmentSettings.length > 0) {
          addSettingsTable(enrollmentSettings);
        }

        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: "Enrollment Configuration",
          policyName:
            config.displayName || config.name || "Unknown Configuration",
          error: error?.message || "Unknown error occurred",
        });
        console.error(
          `Failed to export Enrollment Configuration: ${config.displayName || config.name}`,
          error,
        );
      }
    });
  }

  const additionalSections = (data.sections || []).filter(
    (section) =>
      section.selectionPrefix.startsWith("additional-") &&
      (section.items.length > 0 || section.error),
  );
  for (const section of additionalSections) {
    startSection({
      title: section.label,
      eyebrow:
        ADDITIONAL_FAMILY_LABELS[
          section.familyKey as keyof typeof ADDITIONAL_FAMILY_LABELS
        ] ?? "Additional configuration",
    });

    if (section.endpoint) {
      addText(
        `Source: Microsoft Graph beta ${section.endpoint}`,
        8,
        "normal",
        PALETTE.muted,
      );
      yPosition += 2;
    }
    if (section.error) {
      addText(
        `${section.error.partial ? "Partial data" : "Collection unavailable"}: ${section.error.message}`,
        9,
        "normal",
        TONES.partial.text,
      );
      yPosition += 3;
    }

    totalPolicies += section.items.length;
    for (const item of section.items) {
      try {
        addConfigHeader(
          item.displayName || item.name || section.label,
          assignable(item)
            ? enhanceAssignmentText(
                parseAssignments(
                  item.assignments,
                  statusOf(item, section.familyKey),
                ),
              )
            : ASSIGNMENTS_NOT_APPLICABLE,
          item.createdDateTime,
          item.lastModifiedDateTime || item.modifiedDateTime,
        );
        if (item.description) {
          addText(item.description, 9, "italic", PALETTE.muted);
          yPosition += 2;
        }
        const settings = parseDocumentableProperties(item);
        if (settings.length > 0) addSettingsTable(settings);
        else
          addText(
            "No additional settings returned",
            9,
            "normal",
            PALETTE.muted,
          );
        yPosition += 5;
        successfulPolicies++;
      } catch (error: any) {
        exportErrors.push({
          policyType: section.label,
          policyName: item.displayName || item.name || section.label,
          error: error?.message || "Unknown error occurred",
        });
      }
    }
  }

  // === RENDER TABLE OF CONTENTS ===
  // Now go back and fill in the ToC if it was included
  if (includeToC && tocEntries.length > 0) {
    // Rows that do not fit on the first contents page continue on pages
    // inserted directly after it.
    const items = tocEntries.map((entry) => ({
      title: entry.title,
      page: entry.pageNum,
      level: 0 as const,
    }));
    const { rows, extraPages } = layoutToc(doc, frame, items, contentTop);

    // Every recorded page moves back by the number of inserted ToC pages
    if (extraPages > 0) {
      for (const entry of tocEntries) {
        entry.pageNum += extraPages;
        for (const child of entry.children ?? []) {
          child.pageNumber += extraPages;
        }
      }
      for (const item of items) item.page += extraPages;
    }
    drawToc(doc, theme, frame, {
      heading: "Table of Contents",
      tocPage: tocPageNumber,
      startY: contentTop,
      rows,
      extraPages,
      onInsertPage: addWatermark,
    });
  }

  // === RUNNING HEADER AND FOOTER ===
  // Drawn last, on every page after the cover in the final page order.
  const totalPages = doc.internal.getNumberOfPages();
  for (let page = 2; page <= totalPages; page++) {
    doc.setPage(page);
    if (headerLogo)
      drawLogo(right - headerLogo.width, 13.8 - headerLogo.height, headerLogo);
    if (footerLogo)
      drawLogo(
        margin,
        footerLayout.ruleY + 3.1 - footerLogo.height / 2,
        footerLogo,
      );
  }
  const headerRightInset = headerLogo ? headerLogo.width + 3 : 0;
  const runningTitle =
    scope?.title ||
    `${branding?.coverPage?.title || "Microsoft Intune"} Configuration Documentation`;
  const headerNote =
    branding?.header?.enabled && branding.header.text
      ? branding.header.text
      : data.tenantLabel;
  drawRunningChrome(doc, theme, frame, {
    title: runningTitle,
    titleMaxWidth: 90,
    headerRight: headerNote
      ? clampLine(doc, headerNote, contentWidth - 94 - headerRightInset, 6.5)
      : undefined,
    headerRightInset,
    footer: footerLayout,
    footerInset,
    pageLabel: (page, pageCount) => `Page ${page} of ${pageCount}`,
  });

  // PDF bookmarks: one per section, with its policies nested beneath it
  addPdfOutline(
    doc,
    tocEntries.map((entry) => ({
      title: entry.title,
      pageNumber: entry.pageNum,
      children: entry.children,
    })),
  );

  // Return PDF with error details
  return {
    buffer: new Uint8Array(doc.output("arraybuffer")),
    errors: exportErrors,
    totalPolicies,
    successfulPolicies,
  };
}
