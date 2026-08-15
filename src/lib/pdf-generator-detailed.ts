import jsPDF from "jspdf";
import {
  extractSettingValue,
  parseDeviceConfiguration,
  parseAdministrativeTemplate,
  parseComplianceRules,
  parseSecurityBaseline,
  parseAssignments,
  formatValue,
  parseDocumentableProperties,
  extractAppConfigurationSettings,
} from "./configuration-parser";
import {
  analyzeConfigurations,
  type DetailedExportData,
  type PolicyExportError,
  type ExportGenerationResult,
} from "./configuration-analyzer";
import { REDACTED_VALUE } from "./intune-policy-registry";
import {
  buildConditionalAccessReportRows,
  conditionalAccessStateLabel,
} from "./conditional-access-report";

export type { PolicyExportError };
export type PdfGenerationResult = ExportGenerationResult;

type DetailedPdfData = DetailedExportData;

export async function generateDetailedPDF(
  data: DetailedPdfData,
): Promise<PdfGenerationResult> {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
    compress: true, // Enable compression for smaller file size
  });

  let yPosition = 20;
  const pageHeight = doc.internal.pageSize.height;
  const pageWidth = doc.internal.pageSize.width;
  const margin = 15;
  const maxWidth = pageWidth - 2 * margin;
  let pageNumber = 1;

  // Error tracking for graceful degradation
  const exportErrors: PolicyExportError[] = [];
  let totalPolicies = 0;
  let successfulPolicies = 0;

  // Analyze configurations for overview
  const analytics = analyzeConfigurations(data);

  // Extract branding options with defaults
  const branding = data.branding;
  const primaryColor = branding?.colors?.primary || "#003366";
  const secondaryColor = branding?.colors?.secondary || "#0066CC";
  const textColor = branding?.colors?.text || "#000000";

  // Font settings with defaults
  const fontFamily = branding?.fonts?.family || "helvetica";
  const headerFontSize = branding?.fonts?.headerSize || 14;
  const bodyFontSize = branding?.fonts?.bodySize || 11;

  // Helper function to convert hex to RGB with proper null checking
  const hexToRgb = (hex: string | undefined): [number, number, number] => {
    if (!hex) return [0, 0, 0];
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result?.[1] && result[2] && result[3]
      ? [
          parseInt(result[1], 16),
          parseInt(result[2], 16),
          parseInt(result[3], 16),
        ]
      : [0, 0, 0];
  };

  // Helper function to calculate header height on subsequent pages
  const calculateHeaderHeight = (): number => {
    // On first page (cover), use normal margin
    if (pageNumber === 1) {
      return margin;
    }

    // On subsequent pages, calculate space needed for header elements
    let requiredSpace = margin; // Start with base margin (15mm)

    // Check for header logo (positioned at y=5)
    if (
      branding?.logo?.position === "header" ||
      branding?.header?.includeLogo
    ) {
      const logoHeight = Math.min(branding?.logo?.height || 15, 25);
      const logoBottom = 5 + logoHeight; // Logo top + height
      requiredSpace = Math.max(requiredSpace, logoBottom + 5); // 5mm spacing after logo
    }

    // Check for header text (positioned at y=10, centered)
    if (branding?.header?.enabled && branding?.header?.text) {
      const headerTextSize = 9; // Match the fixed size used in addPageNumber
      const textHeight = headerTextSize * 0.6; // Text height in mm (rough estimate)
      const textBottom = 10 + textHeight;
      requiredSpace = Math.max(requiredSpace, textBottom + 3); // 3mm spacing after text
    }

    // Ensure minimum safe distance from top (30mm) to prevent any overlap
    return Math.max(requiredSpace, 30);
  };

  // Helper functions
  const checkPageBreak = (neededSpace = 30) => {
    // Always leave at least 35mm for footer to prevent overlap
    const minFooterSpace = 35;
    const totalSpaceNeeded = Math.max(neededSpace, minFooterSpace);

    if (yPosition > pageHeight - totalSpaceNeeded) {
      doc.addPage();
      pageNumber++;
      addPageNumber();
      // Set yPosition to account for header elements on new page
      yPosition = calculateHeaderHeight();
      return true;
    }
    return false;
  };

  const addPageNumber = () => {
    // Add header logo if configured
    if (
      (branding?.logo?.position === "header" ||
        branding?.header?.includeLogo) &&
      pageNumber > 1
    ) {
      addLogo("header");
    }

    // Add header text if configured
    if (branding?.header?.enabled && branding?.header?.text && pageNumber > 1) {
      const headerTextSize = 9; // Fixed small size for header text
      doc.setFontSize(headerTextSize);
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(branding.header.text, pageWidth / 2, 10, { align: "center" });
      // Explicitly reset after rendering header text
      doc.setFontSize(bodyFontSize);
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(0, 0, 0);
    }

    // Add footer logo if configured
    if (
      branding?.logo?.position === "footer" ||
      branding?.footer?.includeLogo
    ) {
      addLogo("footer");
    }

    doc.setFontSize(Math.max(bodyFontSize - 2, 8));
    doc.setFont(fontFamily, "normal");
    doc.setTextColor(150, 150, 150);

    // Add footer text if configured
    if (branding?.footer?.enabled && branding?.footer?.text) {
      doc.text(branding.footer.text, margin, pageHeight - 10);
    }

    // Page number
    doc.text(`Page ${pageNumber}`, pageWidth / 2, pageHeight - 10, {
      align: "center",
    });

    // Add confidentiality notice if configured
    if (branding?.footer?.enabled && branding?.footer?.confidentialityNotice) {
      doc.setFontSize(Math.max(bodyFontSize - 3, 7));
      doc.text(
        branding.footer.confidentialityNotice,
        pageWidth - margin,
        pageHeight - 10,
        { align: "right" },
      );
    }

    doc.setTextColor(0, 0, 0);

    // Add watermark to every page (text or logo), but skip page 1 (cover page)
    if (pageNumber > 1) {
      addWatermark();

      // Add logo watermark if configured
      if (branding?.logo?.position === "watermark") {
        addLogo("watermark");
      }
    }

    // Reset font to body defaults after all header/footer rendering
    doc.setFontSize(bodyFontSize);
    doc.setFont(fontFamily, "normal");
    doc.setTextColor(0, 0, 0);
  };

  const addText = (
    text: string,
    fontSize = bodyFontSize,
    style: "normal" | "bold" | "italic" = "normal",
    color: [number, number, number] = [0, 0, 0],
  ) => {
    doc.setFontSize(fontSize);
    doc.setFont(fontFamily, style);
    doc.setTextColor(...color);

    const lines = doc.splitTextToSize(text, maxWidth);

    for (const line of lines) {
      checkPageBreak();
      // Re-apply font settings after potential page break (which resets fonts)
      doc.setFontSize(fontSize);
      doc.setFont(fontFamily, style);
      doc.setTextColor(...color);
      doc.text(line, margin, yPosition);
      yPosition += fontSize * 0.45;
    }
    doc.setTextColor(0, 0, 0);
  };

  const addSectionHeader = (title: string) => {
    checkPageBreak(20);
    yPosition += 3;
    doc.setFontSize(headerFontSize);
    doc.setFont(fontFamily, "bold");
    const [r, g, b] = hexToRgb(primaryColor);
    doc.setTextColor(r, g, b);
    doc.text(title, margin, yPosition);
    yPosition += 8;

    // Add underline with primary color
    doc.setDrawColor(r, g, b);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition - 2, pageWidth - margin, yPosition - 2);
    const [tr, tg, tb] = hexToRgb(textColor);
    doc.setTextColor(tr, tg, tb);
    yPosition += 3;
  };

  const addConfigHeader = (
    name: string,
    assignments: string,
    createdDate?: string,
    modifiedDate?: string,
  ) => {
    // Calculate space needed for wrapped name
    const tempFontSize = Math.max(bodyFontSize + 1, 12);
    doc.setFontSize(tempFontSize);
    const nameLines = doc.splitTextToSize(name, maxWidth);
    const nameHeight = nameLines.length * 6;
    const totalNeeded = nameHeight + 20; // name + dates + spacing

    checkPageBreak(totalNeeded);

    // Configuration name with secondary color
    doc.setFontSize(tempFontSize);
    doc.setFont(fontFamily, "bold");
    const [r, g, b] = hexToRgb(secondaryColor);
    doc.setTextColor(r, g, b);

    nameLines.forEach((line: string) => {
      doc.text(line, margin, yPosition);
      yPosition += 6;
    });

    // Reset to normal text color
    const [tr, tg, tb] = hexToRgb(textColor);
    doc.setTextColor(tr, tg, tb);

    // Dates and assignments with smaller font
    doc.setFontSize(Math.max(bodyFontSize - 2, 9));
    doc.setFont(fontFamily, "normal");
    doc.setTextColor(100, 100, 100);

    // Show dates if available
    if (createdDate || modifiedDate) {
      if (createdDate) {
        const created = new Date(createdDate).toLocaleDateString();
        doc.text(`Created: ${created}`, margin, yPosition);
        yPosition += 4;
      }
      if (modifiedDate) {
        const modified = new Date(modifiedDate).toLocaleDateString();
        doc.text(`Last Modified: ${modified}`, margin, yPosition);
        yPosition += 4;
      }
    }

    const assignmentLines = doc.splitTextToSize(
      `Assigned to: ${assignments}`,
      maxWidth,
    );
    for (const line of assignmentLines) {
      checkPageBreak();
      doc.setFontSize(Math.max(bodyFontSize - 2, 9));
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(line, margin, yPosition);
      yPosition += 4;
    }
    yPosition += 2;

    // Reset font and color to defaults
    doc.setFontSize(bodyFontSize);
    doc.setFont(fontFamily, "normal");
    doc.setTextColor(0, 0, 0);
  };

  const addSettingsTable = (
    settings: Array<{ name: string; value: string; description?: string }>,
  ) => {
    if (settings.length === 0) return;

    // Adjusted column widths for better balance
    const colWidths = [50, 65, 65]; // Name, Value, Description columns
    const tableWidth = colWidths.reduce((a, b) => a + b, 0);

    // Helper function to wrap long technical strings
    const wrapTechnicalString = (str: string, maxWidth: number): string[] => {
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

          if (testWidth > maxWidth && currentLine) {
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
      return doc.splitTextToSize(str, maxWidth);
    };

    // Helper to draw table header and advance Y
    const drawHeader = () => {
      // Ensure space for header
      checkPageBreak(15);
      doc.setFillColor(240, 240, 240);
      doc.rect(margin, yPosition, tableWidth, 8, "F");
      doc.setFontSize(Math.max(bodyFontSize - 1, 10));
      doc.setFont(fontFamily, "bold");
      doc.text("Setting", margin + 2, yPosition + 5);
      doc.text("Value", margin + (colWidths[0] || 50) + 2, yPosition + 5);
      doc.text(
        "Description",
        margin + (colWidths[0] || 50) + (colWidths[1] || 65) + 2,
        yPosition + 5,
      );
      yPosition += 8;
    };

    // Initial header
    drawHeader();

    // Table rows
    doc.setFont(fontFamily, "normal");
    doc.setFontSize(Math.max(bodyFontSize - 3, 8));

    settings.forEach((setting, index) => {
      // Prepare text for all columns
      const nameLines = doc.splitTextToSize(
        setting.name,
        (colWidths[0] || 50) - 4,
      );
      // Ensure valueText is always a string to avoid .includes() errors
      const valueText =
        setting.value != null ? String(setting.value) : "Not configured";

      // Handle newlines in values (e.g., arrays formatted with \n)
      let valueLines: string[] = [];
      if (valueText.includes("\n")) {
        // Split by newline and then wrap each line
        const valueParts = valueText.split("\n");
        valueParts.forEach((part) => {
          const wrappedPart = wrapTechnicalString(
            part,
            (colWidths[1] || 65) - 4,
          );
          valueLines = valueLines.concat(wrappedPart);
        });
      } else {
        valueLines = wrapTechnicalString(valueText, (colWidths[1] || 65) - 4);
      }

      const descLines = setting.description
        ? doc.splitTextToSize(setting.description, (colWidths[2] || 65) - 4)
        : [""];

      // Calculate row height based on maximum lines needed
      const maxLines = Math.max(
        nameLines.length,
        valueLines.length,
        descLines.length,
      );
      const rowHeight = Math.max(8, maxLines * 4 + 4); // Dynamic height based on content

      // Check for page break with actual row height; redraw header on new page
      if (checkPageBreak(rowHeight + 5)) {
        drawHeader();
        // Reset font to normal after redrawing header
        doc.setFont(fontFamily, "normal");
        doc.setFontSize(8);
      }

      // Alternate row background
      if (index % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(margin, yPosition, tableWidth, rowHeight, "F");
      }

      // Draw cell borders
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.1);
      doc.line(
        margin,
        yPosition + rowHeight,
        margin + tableWidth,
        yPosition + rowHeight,
      );

      // Setting name (all lines)
      let textY = yPosition + 4;
      nameLines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < maxLines) {
          doc.text(line, margin + 2, textY);
          textY += 4;
        }
      });

      // Value (all lines)
      textY = yPosition + 4;
      valueLines.forEach((line: string, lineIndex: number) => {
        if (lineIndex < maxLines) {
          doc.text(line, margin + (colWidths[0] || 50) + 2, textY);
          textY += 4;
        }
      });

      // Description (all lines)
      if (setting.description) {
        textY = yPosition + 4;
        doc.setTextColor(80, 80, 80);
        descLines.forEach((line: string, lineIndex: number) => {
          if (lineIndex < maxLines) {
            doc.text(
              line,
              margin + (colWidths[0] || 50) + (colWidths[1] || 65) + 2,
              textY,
            );
            textY += 4;
          }
        });
        doc.setTextColor(0, 0, 0);
      }

      yPosition += rowHeight;
    });

    yPosition += 5;
  };

  // Generate PDF content

  // Set PDF metadata with sensible fallbacks
  try {
    const metaTitle =
      branding?.metadata?.title ||
      (branding?.companyName
        ? `${branding.companyName} - Intune Configuration Report`
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

  // Helper function to add logo with proper sizing while preserving aspect ratio
  // Returns the drawn logo height in mm when successful (for layout), otherwise null
  const addLogo = (
    position: "header" | "footer" | "cover" | "watermark",
    x?: number,
    y?: number,
  ): number | null => {
    // For header/footer, check if logo should appear there
    // For cover, only show if position is 'cover'
    // For watermark, show if position is 'watermark'
    const shouldShowLogo =
      branding?.logo?.dataUrl &&
      (position === "cover"
        ? branding?.logo?.position === "cover"
        : position === "header"
          ? branding?.logo?.position === "header"
          : position === "footer"
            ? branding?.logo?.position === "footer"
            : position === "watermark"
              ? branding?.logo?.position === "watermark"
              : false);

    if (shouldShowLogo && branding?.logo?.dataUrl) {
      try {
        const imgData = branding.logo.dataUrl;

        // Detect and extract image format from data URL
        let format: "PNG" | "JPEG" = "PNG"; // Default to PNG
        let base64Data = imgData;

        if (typeof imgData === "string") {
          // Check if it's a data URL
          if (imgData.startsWith("data:")) {
            const regex = /^data:image\/(png|jpeg|jpg);base64,(.+)$/i;
            const matches = regex.exec(imgData);
            if (matches) {
              // Extract format from data URL
              const detectedFormat = matches[1]?.toLowerCase();
              if (detectedFormat === "jpeg" || detectedFormat === "jpg") {
                format = "JPEG";
              } else if (detectedFormat === "png") {
                format = "PNG";
              }
              // Extract base64 data without the header
              base64Data = matches[2] || imgData;
            } else {
              // If the data URL doesn't match expected format, try to use it as-is
              // but remove the data URL prefix if present
              const dataIndex = imgData.indexOf(",");
              if (dataIndex > -1) {
                base64Data = imgData.substring(dataIndex + 1);
                // Try to detect format from the prefix
                if (
                  imgData.toLowerCase().includes("jpeg") ||
                  imgData.toLowerCase().includes("jpg")
                ) {
                  format = "JPEG";
                }
              }
            }
          }
          // If not a data URL, assume it's already base64
        }

        // Reconstruct the data URL with proper format for jsPDF
        const properDataUrl = `data:image/${format.toLowerCase()};base64,${base64Data}`;

        // Inspect image to preserve aspect ratio
        let props: any = { width: 100, height: 100 }; // Default aspect ratio 1:1
        try {
          if ((doc as any).getImageProperties) {
            props = (doc as any).getImageProperties(properDataUrl);
          }
        } catch (propsError) {
          console.warn(
            "Could not get image properties, using default aspect ratio:",
            propsError,
          );
        }

        const naturalW = Math.max(Number(props.width) || 100, 1);
        const naturalH = Math.max(Number(props.height) || 100, 1);
        const aspect = naturalW / naturalH;

        // Determine target height/width in mm based on position and optional branding sizes
        let targetHeightMm: number;
        let maxWidthMm: number;
        if (position === "header" || position === "footer") {
          // Default small height for header/footer; allow override via branding.logo.height
          targetHeightMm = Math.min(branding?.logo?.height || 15, 25);
          maxWidthMm = 60; // Constrain width to avoid overflow
        } else if (position === "watermark") {
          // Watermark: large, centered, semi-transparent
          targetHeightMm = Math.min(branding?.logo?.height || 60, 100);
          maxWidthMm = Math.min(pageWidth - 2 * margin, 120);
        } else {
          // Cover page default; allow override
          targetHeightMm = Math.min(branding?.logo?.height || 35, 80);
          maxWidthMm = Math.min(pageWidth - 2 * margin, 150);
        }
        // If width is specified but height is not, derive height from width
        if (branding?.logo?.width && !branding?.logo?.height) {
          const derivedHeight = branding.logo.width / aspect;
          // Respect position-based caps
          const maxHeight =
            position === "header" || position === "footer"
              ? 25
              : position === "watermark"
                ? 100
                : 80;
          targetHeightMm = Math.min(derivedHeight, maxHeight);
        }

        // Compute scaled dimensions preserving aspect ratio and respecting max width
        let drawW = targetHeightMm * aspect;
        let drawH = targetHeightMm;
        if (drawW > maxWidthMm) {
          const scale = maxWidthMm / drawW;
          drawW = drawW * scale;
          drawH = drawH * scale;
        }

        if (position === "cover") {
          const xPos = x ?? pageWidth / 2 - drawW / 2;
          const yPos = y ?? 20;
          doc.addImage(
            properDataUrl,
            format,
            xPos,
            yPos,
            drawW,
            drawH,
            undefined,
            "FAST",
          );
          return drawH;
        } else if (position === "header") {
          // Right-aligned in header
          const xPos = x ?? pageWidth - margin - drawW;
          const yPos = y ?? 5;
          doc.addImage(
            properDataUrl,
            format,
            xPos,
            yPos,
            drawW,
            drawH,
            undefined,
            "FAST",
          );
          return drawH;
        } else if (position === "footer") {
          const xPos = x ?? margin;
          const yPos = y ?? pageHeight - 10 - drawH;
          doc.addImage(
            properDataUrl,
            format,
            xPos,
            yPos,
            drawW,
            drawH,
            undefined,
            "FAST",
          );
          return drawH;
        } else if (position === "watermark") {
          // Center on page with reduced opacity
          const xPos = x ?? pageWidth / 2 - drawW / 2;
          const yPos = y ?? pageHeight / 2 - drawH / 2;
          // Note: jsPDF doesn't support image opacity directly, but we can use the image itself
          // The opacity setting in branding.logo.opacity is a suggestion for UI
          doc.addImage(
            properDataUrl,
            format,
            xPos,
            yPos,
            drawW,
            drawH,
            undefined,
            "FAST",
          );
          return drawH;
        }
      } catch (err) {
        console.error("Error adding logo:", err);
      }
    }
    return null;
  };

  // Add watermark function
  const addWatermark = () => {
    if (branding?.watermark?.enabled && branding?.watermark?.text) {
      // Set watermark style
      const watermarkFontSize = branding.watermark.fontSize || 50;
      doc.setFontSize(watermarkFontSize);
      doc.setFont(fontFamily, "bold");

      // Calculate opacity (jsPDF supports alpha via rgba, but setTextColor only takes RGB)
      // We'll use light gray with opacity simulation via lighter color
      const opacity = branding.watermark.opacity || 0.1;
      const grayValue = Math.round(230 - (230 - 200) * (1 - opacity)); // Adjust gray based on opacity
      doc.setTextColor(grayValue, grayValue, grayValue);

      const watermarkText = branding.watermark.text;
      const angle = branding.watermark.angle || -45;

      // Calculate position for centered diagonal text
      const xPos = pageWidth / 2;
      const yPos = pageHeight / 2;

      // Add rotated text - jsPDF DOES support text rotation!
      doc.text(watermarkText, xPos, yPos, {
        align: "center",
        angle: angle,
      });

      // Restore to normal
      doc.setTextColor(0, 0, 0);
    }
  };

  // Professional Cover Page Design

  // Don't add page number on cover
  // addPageNumber();

  // === TOP SECTION: Company/Department Text ===
  const headerY = 20;
  let titleStartY = 70;

  // Show company/dept as small text in corners (if provided)
  if (branding?.companyName || branding?.department) {
    doc.setFontSize(Math.max(bodyFontSize - 1, 9));
    doc.setFont(fontFamily, "normal");
    doc.setTextColor(100, 100, 100);

    if (branding?.companyName) {
      doc.text(branding.companyName, margin, headerY);
    }

    if (branding?.department) {
      doc.text(branding.department, pageWidth - margin, headerY, {
        align: "right",
      });
    }
  }

  // === LOGO SECTION: Always show logo on title page if available ===
  if (branding?.logo?.dataUrl) {
    // Add logo centered above title, preserving aspect ratio
    const logoY = 35;
    const usedH = addLogo("cover", undefined, logoY);
    if (usedH) {
      titleStartY = logoY + usedH + 15; // Position title below logo
    }
  }

  // === COMPLIANCE BADGE (if classification is set) ===
  if (branding?.metadata?.classification) {
    const badgeText =
      branding.metadata.classification === "confidential"
        ? "CONFIDENTIAL"
        : branding.metadata.classification === "restricted"
          ? "RESTRICTED"
          : "AUDIT READY";

    doc.setFontSize(Math.max(bodyFontSize - 2, 8));
    doc.setFont(fontFamily, "bold");
    const badgeColor: [number, number, number] =
      branding.metadata.classification === "confidential" ||
      branding.metadata.classification === "restricted"
        ? [220, 38, 38]
        : [34, 197, 94];
    doc.setTextColor(badgeColor[0], badgeColor[1], badgeColor[2]);
    doc.text(badgeText, pageWidth - margin, headerY + 10, { align: "right" });
  }

  // === TITLE SECTION: Document Title ===
  let titleY = titleStartY;

  // Main title - Microsoft Intune (largest, bold)
  doc.setFontSize(Math.max(headerFontSize * 3, 36));
  doc.setFont(fontFamily, "bold");
  const [tr, tg, tb] = hexToRgb(primaryColor);
  doc.setTextColor(tr, tg, tb);

  const coverTitle = branding?.coverPage?.title || "Microsoft Intune";
  doc.text(coverTitle, pageWidth / 2, titleY, { align: "center" });
  titleY += 18;

  // Subtitle - Configuration Documentation (lighter gray for less emphasis)
  doc.setFontSize(Math.max(headerFontSize * 1.4, 18));
  doc.setFont(fontFamily, "normal");
  doc.setTextColor(140, 140, 140); // Lighter gray instead of secondary color
  doc.text("Configuration Documentation", pageWidth / 2, titleY, {
    align: "center",
  });
  titleY += 15;

  // Tagline - descriptive subtitle
  doc.setFontSize(bodyFontSize + 1);
  doc.setFont(fontFamily, "normal");
  doc.setTextColor(120, 120, 120);
  const tagline =
    branding?.coverPage?.subtitle ||
    "Comprehensive export of Intune policies, profiles, and assignments";
  doc.text(tagline, pageWidth / 2, titleY, { align: "center" });
  titleY += 40;

  // === METADATA SECTION: Centered Table ===
  // Position the metadata box in the center of remaining space
  // Calculate height based on number of fields
  const hasContactInfo = branding?.contactEmail || branding?.website;
  const baseHeight = 37;
  const rowHeight = 8;
  const extraRows =
    (hasContactInfo ? 1 : 0) +
    (branding?.contactEmail && branding?.website ? 1 : 0);
  const metadataHeight = baseHeight + extraRows * rowHeight;
  const metadataWidth = 140; // Narrower for centered look
  const metadataX = (pageWidth - metadataWidth) / 2;
  const metadataY = titleY + 20; // Position it higher, closer to title

  // Metadata table background
  doc.setFillColor(248, 250, 252);
  doc.rect(metadataX, metadataY, metadataWidth, metadataHeight, "F");

  // Table border
  doc.setDrawColor(220, 220, 220);
  doc.setLineWidth(0.5);
  doc.rect(metadataX, metadataY, metadataWidth, metadataHeight, "S");

  // Table content
  doc.setFontSize(10);
  const tableX = metadataX + 10;
  const labelX = tableX;
  const valueX = tableX + 45; // Adjusted for narrower table
  let tableY = metadataY + 8;
  const tableRowHeight = 8;

  // Helper function to add table row (labels bold, values normal)
  const addTableRow = (label: string, value: string) => {
    doc.setFont(fontFamily, "bold");
    doc.setFontSize(bodyFontSize);
    doc.setTextColor(60, 60, 60);
    doc.text(label, labelX, tableY);

    doc.setFont(fontFamily, "normal");
    doc.setTextColor(80, 80, 80);
    const maxWidth = metadataX + metadataWidth - valueX - 8;
    const lines = doc.splitTextToSize(value || "", maxWidth);
    // Print first line at current Y aligned to valueX
    doc.text(lines[0] || "", valueX, tableY);
    // Additional lines below
    for (let i = 1; i < lines.length; i++) {
      tableY += tableRowHeight;
      doc.text(lines[i], valueX, tableY);
    }

    tableY += tableRowHeight;
  };

  // Company/Department row
  if (branding?.companyName || branding?.department) {
    const orgInfo = [branding?.companyName, branding?.department]
      .filter(Boolean)
      .join(" / ");
    addTableRow("Organization:", orgInfo);
  }

  // Prepared by row
  const preparedBy =
    branding?.metadata?.author ||
    branding?.coverPage?.author ||
    "Intune Documentation Tool";
  addTableRow("Prepared by:", preparedBy);

  // Contact Email row (if provided)
  if (branding?.contactEmail) {
    addTableRow("Contact:", branding.contactEmail);
  }

  // Website row (if provided)
  if (branding?.website) {
    addTableRow("Website:", branding.website);
  }

  // Generated on row - Simplified format: "31 Aug 2025 · 15:43"
  const dateTime = new Date();
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const day = dateTime.getDate();
  const month = monthNames[dateTime.getMonth()];
  const year = dateTime.getFullYear();
  const hours = dateTime.getHours().toString().padStart(2, "0");
  const minutes = dateTime.getMinutes().toString().padStart(2, "0");
  const formattedDateTime = `${day} ${month} ${year} · ${hours}:${minutes}`;
  addTableRow("Generated:", formattedDateTime);

  // Version row (using date as version)
  const version = `v${year}.${(dateTime.getMonth() + 1).toString().padStart(2, "0")}.${day.toString().padStart(2, "0")}`;
  addTableRow("Version:", version);

  // Classification row if provided
  if (branding?.metadata?.classification) {
    doc.setFont(fontFamily, "bold");
    const classColor: [number, number, number] =
      branding.metadata.classification === "confidential" ||
      branding.metadata.classification === "restricted"
        ? [220, 38, 38]
        : [80, 80, 80];
    doc.setTextColor(classColor[0], classColor[1], classColor[2]);
    doc.text("Classification:", labelX, tableY);
    doc.text(branding.metadata.classification.toUpperCase(), valueX, tableY);
  }

  // Page number at the very bottom
  doc.setFontSize(9);
  doc.setTextColor(150, 150, 150);
  doc.text("Page 1", pageWidth / 2, pageHeight - 10, { align: "center" });

  // === TABLE OF CONTENTS ===
  // Track sections and their page numbers for ToC
  const tocEntries: { title: string; pageNum: number }[] = [];

  // Check if ToC is enabled (default to true if not specified)
  const includeToC =
    branding?.documentSettings?.includeTableOfContents !== false;

  // Variables for ToC page reference (declared outside if block)
  let tocPageNumber = 0;
  let tocYStart = 0;

  if (includeToC) {
    // Add ToC page
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();

    // Save ToC page reference
    tocPageNumber = pageNumber;

    // ToC Title
    doc.setFontSize(20);
    doc.setFont(fontFamily, "bold");
    const [tocR, tocG, tocB] = hexToRgb(primaryColor);
    doc.setTextColor(tocR, tocG, tocB);
    doc.text("Table of Contents", pageWidth / 2, yPosition + 10, {
      align: "center",
    });
    yPosition += 25;

    // Decorative line under title
    doc.setDrawColor(tocR, tocG, tocB);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 15;

    // Save ToC content start position
    tocYStart = yPosition;

    // We'll fill in the ToC content at the end after collecting all page numbers
  }

  // Helper function to add tenant overview with enhanced visuals
  const addTenantOverview = () => {
    // Tenant Overview Page
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();

    // Track this section
    tocEntries.push({ title: "Tenant Overview", pageNum: pageNumber });

    // Start directly with Executive Summary
    addSectionHeader("Executive Summary");

    // === KEY METRICS WITH VISUAL INDICATORS ===
    doc.setFontSize(12);
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Key Metrics", margin, yPosition);
    yPosition += 10;

    // Calculate assignment rate
    const assignmentRate =
      analytics.totalConfigs > 0
        ? (analytics.assignedConfigs / analytics.totalConfigs) * 100
        : 0;

    // Create metrics cards without emoji icons
    const metricsData: Array<{
      label: string;
      value: string;
      color: [number, number, number];
    }> = [
      {
        label: "Total Configurations",
        value: analytics.totalConfigs.toString(),
        color: [52, 152, 219], // Blue
      },
      {
        label: "Assigned Policies",
        value: analytics.assignedConfigs.toString(),
        color: [39, 174, 96], // Green
      },
      {
        label: "Unassigned Policies",
        value: analytics.unassignedConfigs.toString(),
        color:
          analytics.unassignedConfigs > 0 ? [230, 126, 34] : [149, 165, 166], // Orange if > 0, gray if 0
      },
    ];

    // Draw metrics cards - improved layout
    let cardX = margin;
    const cardWidth = 55;
    const cardHeight = 25; // Reduced height for cleaner look
    const cardSpacing = 5;

    metricsData.forEach((metric) => {
      // Card background with subtle fill
      doc.setFillColor(250, 251, 252);
      doc.rect(cardX, yPosition, cardWidth, cardHeight, "F");

      // Top colored bar instead of full border
      doc.setFillColor(metric.color[0], metric.color[1], metric.color[2]);
      doc.rect(cardX, yPosition, cardWidth, 3, "F");

      // Card border - subtle
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.5);
      doc.rect(cardX, yPosition, cardWidth, cardHeight, "S");

      // Value - large and prominent
      doc.setFontSize(20);
      doc.setFont(fontFamily, "bold");
      doc.setTextColor(metric.color[0], metric.color[1], metric.color[2]);
      doc.text(metric.value, cardX + cardWidth / 2, yPosition + 12, {
        align: "center",
      });

      // Label - centered below value
      doc.setFontSize(9);
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(metric.label, cardX + cardWidth / 2, yPosition + 20, {
        align: "center",
      });

      cardX += cardWidth + cardSpacing;
    });

    yPosition += cardHeight + 15;

    // === ASSIGNMENT RATE VISUALIZATION ===
    doc.setFontSize(12);
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Assignment Coverage", margin, yPosition);
    yPosition += 8;

    // Progress bar background
    const progressBarWidth = 120;
    const progressBarHeight = 12;
    doc.setFillColor(240, 240, 240);
    doc.rect(margin, yPosition, progressBarWidth, progressBarHeight, "F");

    // Progress bar fill based on assignment rate
    const fillWidth = (assignmentRate / 100) * progressBarWidth;
    const progressColor: [number, number, number] =
      assignmentRate >= 80
        ? [39, 174, 96] // Green for good
        : assignmentRate >= 60
          ? [52, 152, 219] // Blue for moderate
          : assignmentRate >= 40
            ? [230, 126, 34] // Orange for low
            : [231, 76, 60]; // Red for critical

    doc.setFillColor(progressColor[0], progressColor[1], progressColor[2]);
    doc.rect(margin, yPosition, fillWidth, progressBarHeight, "F");

    // Progress bar border
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.5);
    doc.rect(margin, yPosition, progressBarWidth, progressBarHeight, "S");

    // Assignment rate text only
    doc.setFontSize(10);
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(progressColor[0], progressColor[1], progressColor[2]);
    doc.text(
      `${Math.round(assignmentRate)}%`,
      margin + progressBarWidth + 5,
      yPosition + 8,
    );

    yPosition += progressBarHeight + 15;

    // === POTENTIAL GAPS SECTION ===
    if (analytics.unassignedConfigs > 0 || analytics.staleConfigs > 0) {
      doc.setFontSize(12);
      doc.setFont(fontFamily, "bold");
      doc.setTextColor(0, 0, 0);
      doc.text("Potential Gaps", margin, yPosition);
      yPosition += 8;

      const risks: Array<{
        level: string;
        title: string;
        description: string;
        color: [number, number, number];
      }> = [];

      if (analytics.unassignedConfigs > 0) {
        const criticalRisk =
          analytics.unassignedConfigs >= analytics.totalConfigs * 0.3; // 30% threshold
        risks.push({
          level: criticalRisk ? "critical" : "warning",
          title: "Unassigned Configurations",
          description: `${analytics.unassignedConfigs} policies have no group assignments`,
          color: criticalRisk
            ? ([231, 76, 60] as [number, number, number])
            : ([230, 126, 34] as [number, number, number]),
        });
      }

      if (analytics.staleConfigs > 0) {
        const criticalRisk =
          analytics.staleConfigs >= analytics.totalConfigs * 0.5; // 50% threshold
        risks.push({
          level: criticalRisk ? "critical" : "warning",
          title: "Stale Configurations",
          description: `${analytics.staleConfigs} policies haven't been updated in 90+ days`,
          color: criticalRisk
            ? ([231, 76, 60] as [number, number, number])
            : ([241, 196, 15] as [number, number, number]),
        });
      }

      risks.forEach((risk) => {
        // Risk card with left border indicator
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, yPosition, pageWidth - 2 * margin, 18, "F");

        // Left color indicator bar
        doc.setFillColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.rect(margin, yPosition, 3, 18, "F");

        // Card border
        doc.setDrawColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.setLineWidth(0.5);
        doc.rect(margin, yPosition, pageWidth - 2 * margin, 18, "S");

        // Risk level indicator
        doc.setFillColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(8);
        doc.setFont(fontFamily, "bold");
        const levelText = risk.level.toUpperCase();
        const levelWidth = doc.getTextWidth(levelText) + 4;
        doc.rect(margin + 8, yPosition + 3, levelWidth, 5, "F");
        doc.text(levelText, margin + 10, yPosition + 6.5);

        // Risk title
        doc.setFontSize(10);
        doc.setFont(fontFamily, "bold");
        doc.setTextColor(risk.color[0], risk.color[1], risk.color[2]);
        doc.text(risk.title, margin + 15 + levelWidth, yPosition + 7);

        // Risk description
        doc.setFontSize(9);
        doc.setFont(fontFamily, "normal");
        doc.setTextColor(80, 80, 80);
        doc.text(risk.description, margin + 8, yPosition + 13);

        yPosition += 22;
      });

      yPosition += 5;
    }

    checkPageBreak(80);
  };

  // Call the enhanced tenant overview function
  addTenantOverview();

  if (data.fetchErrors?.length) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Collection Warnings", pageNum: pageNumber });
    addSectionHeader("Collection Warnings");
    addText(
      "The following resources were only partially collected or were unavailable. Successful sibling resources remain in this document.",
      9,
      "normal",
      [160, 90, 0],
    );
    yPosition += 4;

    for (const warning of data.fetchErrors) {
      addText(
        `${warning.partial ? "Partial data" : "Collection unavailable"}: ${warning.policyType}: ${warning.policyName}`,
        10,
        "bold",
        [160, 90, 0],
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
        [100, 100, 100],
      );
      yPosition += 4;
    }
  }

  // Continue with existing content but replace the old metrics section
  yPosition += 10;

  // === CONFIGURATION INVENTORY WITH ENHANCED FORMATTING ===

  // Enhanced table rows without emoji icons - define first
  const inventory = analytics.inventory.map((item) => ({
    type: item.label,
    count: item.total,
    assigned: item.assigned,
  }));

  // Check if we need to start a new page for Configuration Inventory
  // Calculate total height needed for the table
  const inventoryHeaderHeight = 12 + 10; // Title + table header
  const activeInventoryCount = inventory.filter(
    (item) => item.count > 0,
  ).length;
  const inventoryRowHeight = 9;
  const inventoryTotalHeight =
    inventoryHeaderHeight + activeInventoryCount * inventoryRowHeight + 20; // +20 for spacing

  // Check if table would overlap with footer (leave 40mm for footer to be safe)
  if (yPosition + inventoryTotalHeight > pageHeight - 40) {
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
  }

  doc.setFontSize(12);
  doc.setFont(fontFamily, "bold");
  doc.setTextColor(0, 0, 0);
  doc.text("Configuration Inventory", margin, yPosition);
  yPosition += 10;

  // Enhanced table header with color
  const tableWidth = 165;
  const [thr, thg, thb] = hexToRgb(primaryColor);
  doc.setFillColor(thr, thg, thb);
  doc.rect(margin, yPosition, tableWidth, 10, "F");

  doc.setFontSize(10);
  doc.setFont(fontFamily, "bold");
  doc.setTextColor(255, 255, 255);
  doc.text("Policy Type", margin + 3, yPosition + 7);
  doc.text("Total", margin + 85, yPosition + 7);
  doc.text("Assigned", margin + 110, yPosition + 7);
  doc.text("Unassigned", margin + 140, yPosition + 7);
  yPosition += 10;

  doc.setFont(fontFamily, "normal");
  doc.setFontSize(9);
  doc.setTextColor(0, 0, 0);

  const activeInventory = inventory.filter((item) => item.count > 0);
  activeInventory.forEach((item, index) => {
    const rowHeight = 9;

    // Check if we're too close to the bottom of the page (leave 40mm for footer to be safe)
    if (yPosition + rowHeight > pageHeight - 40) {
      // Start a new page
      doc.addPage();
      yPosition = margin;
      pageNumber++;
      addPageNumber();

      // Redraw table header on new page
      doc.setFillColor(thr, thg, thb);
      doc.rect(margin, yPosition, tableWidth, 10, "F");

      doc.setFontSize(10);
      doc.setFont(fontFamily, "bold");
      doc.setTextColor(255, 255, 255);
      doc.text("Policy Type", margin + 3, yPosition + 7);
      doc.text("Total", margin + 85, yPosition + 7);
      doc.text("Assigned", margin + 110, yPosition + 7);
      doc.text("Unassigned", margin + 140, yPosition + 7);
      yPosition += 10;

      // Reset text settings
      doc.setFont(fontFamily, "normal");
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
    }

    // Alternating row backgrounds
    if (index % 2 === 0) {
      doc.setFillColor(248, 249, 250);
      doc.rect(margin, yPosition, tableWidth, rowHeight, "F");
    }

    // Row border
    doc.setDrawColor(230, 230, 230);
    doc.setLineWidth(0.1);
    doc.line(
      margin,
      yPosition + rowHeight,
      margin + tableWidth,
      yPosition + rowHeight,
    );

    // Policy type
    doc.setFontSize(9);
    doc.setFont(fontFamily, "normal");
    doc.text(item.type, margin + 3, yPosition + 6);

    // Total count
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(52, 152, 219); // Blue
    doc.text(item.count.toString(), margin + 90, yPosition + 6);

    // Assigned count
    doc.setTextColor(39, 174, 96); // Green
    doc.text(item.assigned.toString(), margin + 120, yPosition + 6);

    // Unassigned count (red if > 0, gray if 0)
    const unassigned = item.count - item.assigned;
    doc.setTextColor(
      unassigned > 0 ? 231 : 149,
      unassigned > 0 ? 76 : 165,
      unassigned > 0 ? 60 : 166,
    );
    doc.text(unassigned.toString(), margin + 150, yPosition + 6);

    doc.setTextColor(0, 0, 0);
    doc.setFont(fontFamily, "normal");
    yPosition += rowHeight;
  });

  yPosition += 15;

  // === PLATFORM COVERAGE CHART ===
  if (Object.keys(analytics.platformCounts).length > 0 || data.deviceCounts) {
    // Combine configuration counts with device counts first to calculate space needed
    const platformData: Record<string, { configs: number; devices: number }> =
      {};

    // Add configuration counts
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

    // Sort platforms by total activity
    const sortedPlatforms = Object.entries(platformData)
      .sort(
        (a, b) => b[1].configs + b[1].devices - (a[1].configs + a[1].devices),
      )
      .slice(0, 5); // Show top 5 platforms

    // Calculate total space needed for Platform Coverage section
    const barHeight = 14;
    const barSpacing = 5;
    const platformChartHeight =
      10 + sortedPlatforms.length * (barHeight + barSpacing) + 20; // Title + bars + bottom margin

    // Check if entire Platform Coverage section fits
    checkPageBreak(platformChartHeight);

    doc.setFontSize(12);
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Platform Coverage", margin, yPosition);
    yPosition += 10;

    // Platform colors
    const platformColors: Record<string, [number, number, number]> = {
      Windows: [52, 152, 219], // Blue
      macOS: [155, 89, 182], // Purple
      iOS: [46, 204, 113], // Green
      Android: [230, 126, 34], // Orange
      Linux: [231, 76, 60], // Red
    };

    // Find maximum value for chart scaling
    const maxConfigs = Math.max(
      ...sortedPlatforms.map(([_, data]) => data.configs),
      1,
    );
    const chartWidth = 100; // Reduced from 120 to fit better

    sortedPlatforms.forEach(([platform, data], index) => {
      const barY = yPosition + index * (barHeight + barSpacing);

      const color: [number, number, number] = platformColors[platform] || [
        52, 152, 219,
      ];

      // Platform name - simple text, no colored box
      doc.setFontSize(9);
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(platform, margin, barY + 9);

      // Background bar - adjusted position since no colored box
      const barStartX = margin + 45;
      doc.setFillColor(245, 245, 245);
      doc.rect(barStartX, barY, chartWidth, barHeight, "F");

      // Data bar (configurations)
      if (data.configs > 0) {
        const barWidth = Math.min(
          (data.configs / maxConfigs) * chartWidth,
          chartWidth,
        );
        doc.setFillColor(color[0], color[1], color[2]);
        doc.rect(barStartX, barY, barWidth, barHeight, "F");
      }

      // Bar border
      doc.setDrawColor(220, 220, 220);
      doc.setLineWidth(0.3);
      doc.rect(barStartX, barY, chartWidth, barHeight, "S");

      // Value labels - positioned to right of bar, showing only configs
      doc.setFontSize(8);
      doc.setFont(fontFamily, "bold");
      doc.setTextColor(color[0], color[1], color[2]);

      // Show only configuration count
      const labelText = `${data.configs} configs`;

      // Position text to the right of the bar
      const textX = barStartX + chartWidth + 3;
      doc.text(labelText, textX, barY + 9);
    });

    yPosition += sortedPlatforms.length * (barHeight + barSpacing) + 15;

    // Check if we're too close to bottom after drawing platform coverage
    checkPageBreak(10);
  }

  // === TOP GROUPS TABLE WITH ENHANCED FORMATTING ===
  if (analytics.topGroups.length > 0) {
    checkPageBreak(80);
    doc.setFontSize(12);
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(0, 0, 0);
    doc.text("Top Assigned Groups", margin, yPosition);
    yPosition += 10;

    // Table header - adjusted width to fit page
    const groupTableWidth = pageWidth - 2 * margin; // Use full available width
    const [gthr, gthg, gthb] = hexToRgb(secondaryColor);
    doc.setFillColor(gthr, gthg, gthb);
    doc.rect(margin, yPosition, groupTableWidth, 9, "F");

    doc.setFontSize(9);
    doc.setFont(fontFamily, "bold");
    doc.setTextColor(255, 255, 255);
    doc.text("Rank", margin + 3, yPosition + 6);
    doc.text("Group Name", margin + 20, yPosition + 6);
    doc.text("Assignments", margin + 95, yPosition + 6);
    doc.text("Platforms", margin + 135, yPosition + 6);
    yPosition += 9;

    // Group data rows
    const topGroupsData = analytics.topGroups.slice(0, 5);
    doc.setFont(fontFamily, "normal");
    doc.setTextColor(0, 0, 0);

    topGroupsData.forEach(([groupId, count], index) => {
      const rowHeight = 10;

      // Alternating row backgrounds
      if (index % 2 === 0) {
        doc.setFillColor(248, 249, 250);
        doc.rect(margin, yPosition, groupTableWidth, rowHeight, "F");
      }

      // Row border
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.1);
      doc.line(
        margin,
        yPosition + rowHeight,
        margin + groupTableWidth,
        yPosition + rowHeight,
      );

      // Rank number with colored background for top 3
      if (index < 3) {
        const rankColors: Array<[number, number, number]> = [
          [255, 215, 0], // Gold
          [192, 192, 192], // Silver
          [205, 127, 50], // Bronze
        ];
        const rankColor = rankColors[index]!;
        doc.setFillColor(rankColor[0], rankColor[1], rankColor[2]);
        doc.circle(margin + 6, yPosition + 5, 3, "F");
        doc.setFontSize(7);
        doc.setFont(fontFamily, "bold");
        doc.setTextColor(255, 255, 255);
        doc.text((index + 1).toString(), margin + 6, yPosition + 6.5, {
          align: "center",
        });
      } else {
        doc.setFontSize(8);
        doc.setFont(fontFamily, "normal");
        doc.setTextColor(100, 100, 100);
        doc.text(`${index + 1}.`, margin + 3, yPosition + 6);
      }

      // Group name (truncate if too long)
      doc.setFontSize(9);
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(0, 0, 0);
      const groupName = data.groupNames?.get(groupId) || groupId;
      // Calculate max width for group name to avoid overflow
      const maxNameWidth = 70; // Reduced to ensure it fits
      const nameLines = doc.splitTextToSize(groupName, maxNameWidth);
      doc.text(nameLines[0], margin + 20, yPosition + 6);

      // Assignment count with visual indicator
      const barMaxWidth = 18; // Slightly reduced
      const barWidth = Math.min(
        (count / Math.max(...analytics.topGroups.map((g) => g[1]))) *
          barMaxWidth,
        barMaxWidth,
      );
      const barColor: [number, number, number] =
        count >= 10
          ? [39, 174, 96] // Green for high activity
          : count >= 5
            ? [52, 152, 219] // Blue for moderate
            : [230, 126, 34]; // Orange for low

      // Small bar chart
      doc.setFillColor(240, 240, 240);
      doc.rect(margin + 95, yPosition + 3, barMaxWidth, 4, "F");
      doc.setFillColor(barColor[0], barColor[1], barColor[2]);
      doc.rect(margin + 95, yPosition + 3, barWidth, 4, "F");

      // Count number
      doc.setFont(fontFamily, "bold");
      doc.setFontSize(8);
      doc.setTextColor(barColor[0], barColor[1], barColor[2]);
      doc.text(count.toString(), margin + 115, yPosition + 6);

      // Platform indicator
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text("Multi", margin + 140, yPosition + 6);

      doc.setTextColor(0, 0, 0);
      yPosition += rowHeight;
    });

    yPosition += 15;
  }

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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({
      title: "Settings Catalog Policies",
      pageNum: pageNumber,
    });
    addSectionHeader("Settings Catalog Policies");

    totalPolicies += data.settingsCatalog.length;

    data.settingsCatalog.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName || policy.name,
          enhanceAssignmentText(parseAssignments(policy.assignments)),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }

        // Extract and display settings
        if (policy.settings && policy.settings.length > 0) {
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
            addText("No settings configured", 9, "normal", [150, 150, 150]);
            yPosition += 5;
          }
        } else {
          addText("No settings configured", 9, "normal", [150, 150, 150]);
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Device Configurations", pageNum: pageNumber });
    addSectionHeader("Device Configurations");

    totalPolicies += data.deviceConfigurations.length;

    data.deviceConfigurations.forEach((config) => {
      try {
        addConfigHeader(
          config.displayName,
          enhanceAssignmentText(parseAssignments(config.assignments)),
          config.createdDateTime,
          config.lastModifiedDateTime,
        );

        if (config.description) {
          addText(config.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }

        // Parse and display configuration settings
        const categories = parseDeviceConfiguration(config);
        categories.forEach((category) => {
          if (category.settings.length > 0) {
            addText(category.category, 10, "bold");
            yPosition += 2;
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Administrative Templates", pageNum: pageNumber });
    addSectionHeader("Administrative Templates");

    totalPolicies += data.administrativeTemplates.length;

    data.administrativeTemplates.forEach((template) => {
      try {
        addConfigHeader(
          template.displayName,
          enhanceAssignmentText(parseAssignments(template.assignments)),
          template.createdDateTime,
          template.lastModifiedDateTime,
        );

        if (template.description) {
          addText(template.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }

        // Parse and display definition values
        if (template.definitionValues && template.definitionValues.length > 0) {
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
              addText(category, 10, "bold");
              yPosition += 2;
              addSettingsTable(categorySettings);
            },
          );
        } else {
          addText("No settings configured", 9, "normal", [150, 150, 150]);
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Compliance Policies", pageNum: pageNumber });
    addSectionHeader("Compliance Policies");

    totalPolicies += data.compliancePolicies.length;

    data.compliancePolicies.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName,
          enhanceAssignmentText(parseAssignments(policy.assignments)),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", [100, 100, 100]);
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
          addText(
            "No compliance rules configured",
            9,
            "normal",
            [150, 150, 150],
          );
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "App Protection Policies", pageNum: pageNumber });
    addSectionHeader("App Protection Policies");

    totalPolicies += data.appProtectionPolicies.length;

    data.appProtectionPolicies.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName,
          enhanceAssignmentText(parseAssignments(policy.assignments)),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }

        // Display platform type
        if (policy.platformType) {
          addText("Platform:", 10, "bold");
          yPosition += 1;
          addText(policy.platformType, 9, "normal", [80, 80, 80]);
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
          addText("Protection Settings:", 11, "bold");
          yPosition += 2;
          addSettingsTable(settings);
        } else {
          addText(
            "No protection settings configured",
            9,
            "normal",
            [150, 150, 150],
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Security Baselines", pageNum: pageNumber });
    addSectionHeader("Security Baselines");

    totalPolicies += data.securityBaselines.length;

    data.securityBaselines.forEach((baseline) => {
      try {
        addConfigHeader(
          baseline.displayName,
          enhanceAssignmentText(parseAssignments(baseline.assignments)),
          baseline.createdDateTime,
          baseline.lastModifiedDateTime,
        );

        if (baseline.description) {
          addText(baseline.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }

        // Parse and display baseline settings
        if (baseline.categories && baseline.categories.length > 0) {
          const categories = parseSecurityBaseline(baseline.categories);
          categories.forEach((category) => {
            if (category.settings.length > 0) {
              addText(category.category, 10, "bold");
              yPosition += 2;
              addSettingsTable(category.settings);
            }
          });
        } else {
          addText("No settings configured", 9, "normal", [150, 150, 150]);
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Scripts", pageNum: pageNumber });
    addSectionHeader("Scripts");

    totalPolicies += data.scripts.windows.length + data.scripts.macOS.length;

    // Windows PowerShell Scripts
    if (data.scripts.windows.length > 0) {
      addText("Windows PowerShell Scripts", 12, "bold");
      yPosition += 5;

      data.scripts.windows.forEach((script) => {
        try {
          addConfigHeader(
            script.displayName,
            enhanceAssignmentText(parseAssignments(script.assignments)),
            script.createdDateTime,
            script.lastModifiedDateTime,
          );

          const scriptInfo = [
            { name: "File Name", value: script.fileName || "N/A" },
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
              [100, 100, 100],
            );
            yPosition += 3;
          } else if (script.scriptContent) {
            addText("Script Content:", 9, "bold");
            yPosition += 2;

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

            doc.setFontSize(8);
            doc.setFont("courier", "normal");
            doc.setTextColor(50, 50, 50);

            // Split the full script into lines
            const lines = doc.splitTextToSize(scriptText, maxWidth - 10);

            // Add all lines with proper page breaks
            lines.forEach((line: string) => {
              checkPageBreak();
              doc.text(line, margin + 5, yPosition);
              yPosition += 4;
            });

            doc.setFont(fontFamily, "normal");
            doc.setTextColor(0, 0, 0);
            yPosition += 3;

            // Add script length info
            addText(
              `Total script length: ${scriptText.length} characters`,
              8,
              "normal",
              [100, 100, 100],
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
      addText("macOS Shell Scripts", 12, "bold");
      yPosition += 5;

      data.scripts.macOS.forEach((script) => {
        try {
          addConfigHeader(
            script.displayName,
            enhanceAssignmentText(parseAssignments(script.assignments)),
            script.createdDateTime,
            script.lastModifiedDateTime,
          );

          const scriptInfo = [
            { name: "File Name", value: script.fileName || "N/A" },
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
              [100, 100, 100],
            );
            yPosition += 3;
          } else if (script.scriptContent) {
            addText("Script Content:", 9, "bold");
            yPosition += 2;

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

            doc.setFontSize(8);
            doc.setFont("courier", "normal");
            doc.setTextColor(50, 50, 50);

            // Split the full script into lines
            const lines = doc.splitTextToSize(scriptText, maxWidth - 10);

            // Add all lines with proper page breaks
            lines.forEach((line: string) => {
              checkPageBreak();
              doc.text(line, margin + 5, yPosition);
              yPosition += 4;
            });

            doc.setFont(fontFamily, "normal");
            doc.setTextColor(0, 0, 0);
            yPosition += 3;

            // Add script length info
            addText(
              `Total script length: ${scriptText.length} characters`,
              8,
              "normal",
              [100, 100, 100],
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({
      title: "App Configuration Policies",
      pageNum: pageNumber,
    });
    addSectionHeader("App Configuration Policies");

    totalPolicies += data.appConfigurations.length;

    data.appConfigurations.forEach((config) => {
      try {
        addConfigHeader(
          config.displayName || config.name,
          enhanceAssignmentText(parseAssignments(config.assignments)),
          config.createdDateTime,
          config.lastModifiedDateTime,
        );

        if (config.description) {
          addText(config.description, 9, "italic", [100, 100, 100]);
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
          addText("Targeted Apps:", 10, "bold");
          yPosition += 2;
          config.targetedMobileApps.forEach((appId: string) => {
            addText(`• ${appId}`, 9, "normal", [100, 100, 100]);
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: "Windows Update Policies", pageNum: pageNumber });
    addSectionHeader("Windows Update Policies");

    totalPolicies += data.windowsUpdatePolicies.length;

    data.windowsUpdatePolicies.forEach((policy) => {
      try {
        addConfigHeader(
          policy.displayName || policy.name,
          parseAssignments(policy.assignments),
          policy.createdDateTime,
          policy.lastModifiedDateTime,
        );

        if (policy.description) {
          addText(policy.description, 9, "italic", [100, 100, 100]);
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
          addText("No settings configured", 9, "normal", [150, 150, 150]);
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({
      title: "Conditional Access Policies",
      pageNum: pageNumber,
    });
    addSectionHeader("Conditional Access Policies");

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
            [100, 100, 100],
          );
          yPosition += 2;
        }

        if (policy.description) {
          addText(policy.description, 9, "normal", [100, 100, 100]);
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
            [150, 150, 150],
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({
      title: "Enrollment Configurations",
      pageNum: pageNumber,
    });
    addSectionHeader("Enrollment Configurations");

    totalPolicies += data.enrollmentConfigurations.length;

    data.enrollmentConfigurations.forEach((config) => {
      try {
        addConfigHeader(
          config.displayName || config.name,
          enhanceAssignmentText(parseAssignments(config.assignments)),
          config.createdDateTime,
          config.lastModifiedDateTime,
        );

        if (config.description) {
          addText(config.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }

        // Add enrollment type
        if (config["@odata.type"]) {
          const enrollmentType = config["@odata.type"]
            .split(".")
            .pop()
            ?.replace(/([A-Z])/g, " $1")
            .trim();
          addText(`Type: ${enrollmentType}`, 9, "normal", [100, 100, 100]);
          yPosition += 2;
        }

        // Add priority if available
        if (config.priority !== undefined) {
          addText(`Priority: ${config.priority}`, 9, "normal", [100, 100, 100]);
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
    doc.addPage();
    yPosition = margin;
    pageNumber++;
    addPageNumber();
    tocEntries.push({ title: section.label, pageNum: pageNumber });
    addSectionHeader(section.label);

    if (section.endpoint) {
      addText(
        `Source: Microsoft Graph beta ${section.endpoint}`,
        8,
        "normal",
        [100, 100, 100],
      );
      yPosition += 2;
    }
    if (section.error) {
      addText(
        `${section.error.partial ? "Partial data" : "Collection unavailable"}: ${section.error.message}`,
        9,
        "normal",
        [160, 90, 0],
      );
      yPosition += 3;
    }

    totalPolicies += section.items.length;
    for (const item of section.items) {
      try {
        addConfigHeader(
          item.displayName || item.name || section.label,
          enhanceAssignmentText(parseAssignments(item.assignments)),
          item.createdDateTime,
          item.lastModifiedDateTime || item.modifiedDateTime,
        );
        if (item.description) {
          addText(item.description, 9, "italic", [100, 100, 100]);
          yPosition += 2;
        }
        const settings = parseDocumentableProperties(item);
        if (settings.length > 0) addSettingsTable(settings);
        else
          addText(
            "No additional settings returned",
            9,
            "normal",
            [150, 150, 150],
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
    // Save current page
    const currentPage = doc.internal.getCurrentPageInfo().pageNumber;

    // Go back to ToC page (page 2, after title page)
    doc.setPage(tocPageNumber);

    // Reset position for ToC content
    yPosition = tocYStart;

    // ToC entries styling
    doc.setFontSize(11);
    // const dotLeaderWidth = pageWidth - 2 * margin - 80; // Space for dots (unused)

    tocEntries.forEach((entry, index) => {
      // Check if we need a new page for ToC
      if (yPosition > pageHeight - 40) {
        doc.addPage();
        yPosition = margin;
        doc.setFontSize(11);
      }

      // Section number
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(60, 60, 60);
      const sectionNum = `${index + 1}.`;
      doc.text(sectionNum, margin, yPosition);

      // Section title
      doc.setFont(fontFamily, "normal");
      doc.setTextColor(60, 60, 60);
      doc.text(entry.title, margin + 10, yPosition);

      // Calculate position for dots and page number
      const titleWidth = doc.getTextWidth(entry.title);
      const pageNumText = entry.pageNum.toString();
      const pageNumWidth = doc.getTextWidth(pageNumText);

      // Draw dot leader
      const dotsStartX = margin + 10 + titleWidth + 5;
      const dotsEndX = pageWidth - margin - pageNumWidth - 5;
      const dotSpacing = 3;
      doc.setFillColor(180, 180, 180);

      for (let x = dotsStartX; x < dotsEndX; x += dotSpacing) {
        doc.circle(x, yPosition - 1, 0.3, "F");
      }

      // Page number
      doc.setFont(fontFamily, "bold");
      const [pnr, png, pnb] = hexToRgb(primaryColor);
      doc.setTextColor(pnr, png, pnb);
      doc.text(pageNumText, pageWidth - margin, yPosition, { align: "right" });

      yPosition += 8;
    });

    // Return to the page we were on
    doc.setPage(currentPage);
  }

  // Return PDF with error details
  return {
    buffer: new Uint8Array(doc.output("arraybuffer")),
    errors: exportErrors,
    totalPolicies,
    successfulPolicies,
  };
}
