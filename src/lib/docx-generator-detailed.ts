import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  ImageRun,
  Packer,
  PageNumber,
  Paragraph,
  ShadingType,
  Tab,
  TabStopPosition,
  TabStopType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  SectionType,
} from "docx";
import {
  analyzeConfigurations,
  type DetailedExportData,
  type PolicyExportError,
  type ExportGenerationResult,
} from "./configuration-analyzer";
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
import type { BrandingOptions } from "~/types/branding";
import { REDACTED_VALUE } from "./intune-policy-registry";
import {
  assessCompliance,
  compareControlIds,
  type ControlStatus,
} from "./compliance";
import {
  buildConditionalAccessReportRows,
  conditionalAccessStateLabel,
} from "./conditional-access-report";

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

/** Strip leading # from hex color; default to navy if missing. */
function hexToDocx(hex: string | undefined): string {
  if (!hex) return "003366";
  return hex.replace(/^#/, "") || "003366";
}

/** Map the branding font family name to a Word-compatible font name. */
function mapFont(family?: string): string {
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

/** Format a date string (or now) into "30 Mar 2026 - 15:43". */
function formatDocDate(dateStr?: string): string {
  const d = dateStr ? new Date(dateStr) : new Date();
  if (isNaN(d.getTime())) return "Unknown";
  const months = [
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
  const day = String(d.getDate()).padStart(2, "0");
  const mon = months[d.getMonth()] ?? "Jan";
  const year = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day} ${mon} ${year} - ${hh}:${mm}`;
}

/** Replace raw group IDs with resolved names inside an assignment text. */
function enhanceAssignmentText(
  text: string,
  groupNames?: Map<string, string>,
): string {
  if (!text) return text;
  if (groupNames && groupNames.size > 0) {
    groupNames.forEach((name, id) => {
      const reGroup = new RegExp(`(Group: )${id}`, "g");
      const reExcl = new RegExp(`(Excluded: )${id}`, "g");
      text = text.replace(reGroup, `$1${name}`).replace(reExcl, `$1${name}`);
    });
  }
  return text;
}

/** Build a version string from the current date: "v2026.03.30". */
function versionString(): string {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `v${yyyy}.${mm}.${dd}`;
}

// ---------------------------------------------------------------------------
// Reusable table builder
// ---------------------------------------------------------------------------

/**
 * Create a styled table with a primary-colored header row and alternating
 * row shading.
 */
function createSettingsTable(
  headers: string[],
  rows: string[][],
  branding?: BrandingOptions,
): Table {
  const primary = hexToDocx(branding?.colors?.primary);
  const fontName = mapFont(branding?.fonts?.family);
  const bodySizeHp = (branding?.fonts?.bodySize ?? 11) * 2; // half-points

  // Determine column widths -- distribute evenly
  const colPct = Math.floor(100 / headers.length);

  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map(
      (h) =>
        new TableCell({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: h,
                  bold: true,
                  color: "FFFFFF",
                  font: fontName,
                  size: bodySizeHp,
                }),
              ],
              alignment: AlignmentType.LEFT,
            }),
          ],
          shading: { type: ShadingType.SOLID, color: primary, fill: primary },
          width: { size: colPct, type: WidthType.PERCENTAGE },
        }),
    ),
  });

  const dataRows = rows.map((cells, idx) => {
    const isEven = idx % 2 === 0;
    const shadeFill = isEven ? "F5F5F5" : "FFFFFF";
    return new TableRow({
      children: cells.map(
        (cell) =>
          new TableCell({
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: cell ?? "",
                    font: fontName,
                    size: bodySizeHp,
                  }),
                ],
              }),
            ],
            shading: {
              type: ShadingType.SOLID,
              color: shadeFill,
              fill: shadeFill,
            },
            width: { size: colPct, type: WidthType.PERCENTAGE },
          }),
      ),
    });
  });

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...dataRows],
    borders: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
  });
}

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Extract base64 payload from a data URL. */
function extractBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx >= 0) return dataUrl.slice(commaIdx + 1);
  return dataUrl;
}

/** Convert mm to EMU. */
function mmToEmu(mm: number): number {
  return Math.round(mm * 36000);
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export async function generateDetailedDOCX(
  data: DetailedExportData,
): Promise<ExportGenerationResult> {
  const errors: PolicyExportError[] = [];
  let totalPolicies = 0;
  let successfulPolicies = 0;

  // Extract branding with fallbacks
  const branding = data.branding;
  const primaryHex = hexToDocx(branding?.colors?.primary);
  const secondaryHex = hexToDocx(branding?.colors?.secondary);
  const textHex = hexToDocx(branding?.colors?.text);
  const fontName = mapFont(branding?.fonts?.family);
  const headerSizeHp = (branding?.fonts?.headerSize ?? 14) * 2;
  const bodySizeHp = (branding?.fonts?.bodySize ?? 11) * 2;

  const companyName = branding?.companyName ?? "";
  const department = branding?.department ?? "";

  // -----------------------------------------------------------------------
  // Build sections
  // -----------------------------------------------------------------------
  const sections: any[] = [];

  // ===== 1. COVER PAGE =====
  const coverChildren: (Paragraph | Table)[] = [];

  // Top-left company name
  if (companyName) {
    coverChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: companyName,
            color: "888888",
            font: fontName,
            size: 20,
          }),
        ],
        alignment: AlignmentType.LEFT,
        spacing: { after: 0 },
      }),
    );
  }

  // Top-right department
  if (department) {
    coverChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: department,
            color: "888888",
            font: fontName,
            size: 20,
          }),
        ],
        alignment: AlignmentType.RIGHT,
        spacing: { after: 200 },
      }),
    );
  }

  // Classification badge
  const classification = branding?.metadata?.classification;
  let classText = "AUDIT READY";
  let classColor = "00A652"; // green
  if (classification) {
    switch (classification) {
      case "confidential":
        classText = "CONFIDENTIAL";
        classColor = "CC0000";
        break;
      case "restricted":
        classText = "RESTRICTED";
        classColor = "CC0000";
        break;
      case "internal":
        classText = "INTERNAL";
        classColor = "CC8800";
        break;
      case "public":
        classText = "PUBLIC";
        classColor = "00A652";
        break;
    }
  }

  coverChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: classText,
          bold: true,
          color: classColor,
          font: fontName,
          size: 22,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 600, after: 200 },
    }),
  );

  // Logo on cover
  if (branding?.logo?.dataUrl && branding.logo.position === "cover") {
    try {
      const logoBase64 = extractBase64(branding.logo.dataUrl);
      const logoW = branding.logo.width ?? 60;
      const logoH = branding.logo.height ?? 60;
      coverChildren.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: logoBase64,
              transformation: {
                width: mmToEmu(logoW),
                height: mmToEmu(logoH),
              },
            }),
          ],
          alignment: AlignmentType.CENTER,
          spacing: { before: 400, after: 400 },
        }),
      );
    } catch (e) {
      console.warn("Failed to add cover logo:", e);
    }
  }

  // Main title
  const titleText = branding?.coverPage?.title || "Microsoft Intune";
  coverChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: titleText,
          bold: true,
          color: primaryHex,
          font: fontName,
          size: 56,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { before: 400, after: 100 },
    }),
  );

  // Subtitle
  coverChildren.push(
    new Paragraph({
      children: [
        new TextRun({
          text: "Configuration Documentation",
          color: "888888",
          font: fontName,
          size: 36,
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
    }),
  );

  // Custom text
  if (branding?.coverPage?.customText) {
    coverChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: branding.coverPage.customText,
            font: fontName,
            size: bodySizeHp,
            color: textHex,
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 400 },
      }),
    );
  }

  // Metadata table
  const metaRows: string[][] = [];
  const orgLine = [companyName, department].filter(Boolean).join(" - ");
  if (orgLine) metaRows.push(["Organization", orgLine]);
  const authorName = branding?.coverPage?.author || branding?.metadata?.author;
  if (authorName) metaRows.push(["Prepared by", authorName]);
  if (branding?.contactEmail) metaRows.push(["Contact", branding.contactEmail]);
  if (branding?.website) metaRows.push(["Website", branding.website]);
  metaRows.push(["Generated", formatDocDate()]);
  metaRows.push(["Version", versionString()]);
  if (classification) {
    metaRows.push([
      "Classification",
      classification.charAt(0).toUpperCase() + classification.slice(1),
    ]);
  }

  if (metaRows.length > 0) {
    coverChildren.push(
      new Table({
        width: { size: 60, type: WidthType.PERCENTAGE },
        rows: metaRows.map(
          ([label, value]) =>
            new TableRow({
              children: [
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: label ?? "",
                          bold: true,
                          font: fontName,
                          size: bodySizeHp,
                          color: primaryHex,
                        }),
                      ],
                    }),
                  ],
                  width: { size: 35, type: WidthType.PERCENTAGE },
                  shading: {
                    type: ShadingType.SOLID,
                    color: "F5F5F5",
                    fill: "F5F5F5",
                  },
                  borders: {
                    top: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    bottom: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    left: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    right: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                  },
                }),
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: value ?? "",
                          font: fontName,
                          size: bodySizeHp,
                        }),
                      ],
                    }),
                  ],
                  width: { size: 65, type: WidthType.PERCENTAGE },
                  borders: {
                    top: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    bottom: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    left: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                    right: {
                      style: BorderStyle.SINGLE,
                      size: 1,
                      color: "DDDDDD",
                    },
                  },
                }),
              ],
            }),
        ),
        alignment: AlignmentType.CENTER,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          left: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          right: { style: BorderStyle.SINGLE, size: 1, color: "DDDDDD" },
          insideHorizontal: {
            style: BorderStyle.SINGLE,
            size: 1,
            color: "DDDDDD",
          },
          insideVertical: {
            style: BorderStyle.SINGLE,
            size: 1,
            color: "DDDDDD",
          },
        },
      }),
    );
  }

  sections.push({
    properties: {
      titlePage: true,
      type: SectionType.NEXT_PAGE,
    },
    children: coverChildren,
  });

  // -----------------------------------------------------------------------
  // Build shared headers / footers for subsequent pages
  // -----------------------------------------------------------------------
  const buildHeader = (): Header | undefined => {
    if (!branding?.header?.enabled && !branding?.logo) return undefined;

    const headerChildren: Paragraph[] = [];

    // Build a single paragraph with left text and right logo via tab stops
    const runs: (TextRun | ImageRun | Tab)[] = [];

    if (branding?.header?.text) {
      runs.push(
        new TextRun({
          text: branding.header.text,
          font: fontName,
          size: 18,
          color: "888888",
        }),
      );
    }

    if (
      (branding?.header?.includeLogo ||
        branding?.logo?.position === "header") &&
      branding?.logo?.dataUrl
    ) {
      try {
        const logoBase64 = extractBase64(branding.logo.dataUrl);
        const logoW = Math.min(branding.logo.width ?? 15, 25);
        const logoH = Math.min(branding.logo.height ?? 15, 25);
        if (runs.length > 0) {
          runs.push(new Tab());
        }
        runs.push(
          new ImageRun({
            data: logoBase64,
            transformation: {
              width: mmToEmu(logoW),
              height: mmToEmu(logoH),
            },
          }),
        );
      } catch (e) {
        console.warn("Failed to add header logo:", e);
      }
    }

    if (runs.length > 0) {
      headerChildren.push(
        new Paragraph({
          children: runs,
          tabStops: [
            {
              type: TabStopType.RIGHT,
              position: TabStopPosition.MAX,
            },
          ],
        }),
      );
    }

    if (headerChildren.length === 0) return undefined;
    return new Header({ children: headerChildren });
  };

  const buildFooter = (): Footer | undefined => {
    const footerRuns: (TextRun | Tab)[] = [];

    // Left: footer text
    if (branding?.footer?.enabled && branding.footer.text) {
      footerRuns.push(
        new TextRun({
          text: branding.footer.text,
          font: fontName,
          size: 16,
          color: "888888",
        }),
      );
    }

    // Center: page number
    footerRuns.push(new Tab());
    footerRuns.push(
      new TextRun({
        children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES],
        font: fontName,
        size: 16,
        color: "888888",
      }),
    );

    // Right: confidentiality notice
    if (branding?.footer?.confidentialityNotice) {
      footerRuns.push(new Tab());
      footerRuns.push(
        new TextRun({
          text: branding.footer.confidentialityNotice,
          font: fontName,
          size: 14,
          color: "AAAAAA",
          italics: true,
        }),
      );
    }

    return new Footer({
      children: [
        new Paragraph({
          children: footerRuns,
          tabStops: [
            { type: TabStopType.CENTER, position: TabStopPosition.MAX / 2 },
            { type: TabStopType.RIGHT, position: TabStopPosition.MAX },
          ],
        }),
      ],
    });
  };

  const defaultHeader = buildHeader();
  const defaultFooter = buildFooter();

  // Helper: wrap children in a content section (with page break, header, footer)
  const pushContentSection = (children: (Paragraph | Table)[]) => {
    const sectionProps: any = {
      type: SectionType.NEXT_PAGE,
    };
    if (defaultHeader) sectionProps.headers = { default: defaultHeader };
    if (defaultFooter) sectionProps.footers = { default: defaultFooter };

    sections.push({
      properties: sectionProps,
      children,
    });
  };

  // Helper: create a Heading 1 paragraph
  const heading1 = (text: string): Paragraph =>
    new Paragraph({
      children: [
        new TextRun({
          text,
          bold: true,
          color: primaryHex,
          font: fontName,
          size: headerSizeHp + 8,
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    });

  // Helper: create a Heading 2 paragraph
  const heading2 = (text: string): Paragraph =>
    new Paragraph({
      children: [
        new TextRun({
          text,
          bold: true,
          color: secondaryHex,
          font: fontName,
          size: headerSizeHp + 2,
        }),
      ],
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200, after: 80 },
    });

  // Helper: create a Heading 3 paragraph
  const heading3 = (text: string): Paragraph =>
    new Paragraph({
      children: [
        new TextRun({
          text,
          bold: true,
          color: primaryHex,
          font: fontName,
          size: headerSizeHp,
        }),
      ],
      heading: HeadingLevel.HEADING_3,
      spacing: { before: 160, after: 60 },
    });

  // Helper: normal body paragraph
  const bodyText = (text: string): Paragraph =>
    new Paragraph({
      children: [
        new TextRun({ text, font: fontName, size: bodySizeHp, color: textHex }),
      ],
      spacing: { after: 60 },
    });

  // Helper: small gray metadata paragraph
  const metaText = (text: string): Paragraph =>
    new Paragraph({
      children: [
        new TextRun({
          text,
          font: fontName,
          size: bodySizeHp - 2,
          color: "888888",
        }),
      ],
      spacing: { after: 40 },
    });

  // Helper: blank spacer
  const spacer = (): Paragraph => new Paragraph({ spacing: { after: 120 } });

  // ===== 2. TABLE OF CONTENTS =====
  if (branding?.documentSettings?.includeTableOfContents !== false) {
    const tocChildren: (Paragraph | Table | TableOfContents)[] = [];
    tocChildren.push(heading1("Table of Contents"));
    tocChildren.push(
      new TableOfContents("TOC", {
        hyperlink: true,
        headingStyleRange: "1-3",
      }),
    );
    tocChildren.push(spacer());
    tocChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Right-click and select 'Update Field' to populate page numbers.",
            font: fontName,
            size: bodySizeHp - 2,
            color: "888888",
            italics: true,
          }),
        ],
        spacing: { before: 200 },
      }),
    );
    pushContentSection(tocChildren);
  }

  // ===== 3. EXECUTIVE SUMMARY =====
  if (branding?.documentSettings?.includeAnalytics !== false) {
    try {
      const analytics = analyzeConfigurations(data);
      const summaryChildren: (Paragraph | Table)[] = [];

      summaryChildren.push(heading1("Executive Summary"));
      summaryChildren.push(spacer());

      // Key metrics table (3 columns)
      const coveragePercent =
        analytics.totalConfigs > 0
          ? Math.round(
              (analytics.assignedConfigs / analytics.totalConfigs) * 100,
            )
          : 0;

      summaryChildren.push(
        createSettingsTable(
          ["Total Configurations", "Assigned Policies", "Unassigned"],
          [
            [
              String(analytics.totalConfigs),
              String(analytics.assignedConfigs),
              String(analytics.unassignedConfigs),
            ],
          ],
          branding,
        ),
      );
      summaryChildren.push(spacer());

      // Assignment coverage
      let coverageColor = "00A652"; // green
      if (coveragePercent < 50) coverageColor = "CC0000";
      else if (coveragePercent < 80) coverageColor = "CC8800";

      summaryChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Assignment Coverage: ",
              bold: true,
              font: fontName,
              size: bodySizeHp,
            }),
            new TextRun({
              text: `${coveragePercent}%`,
              bold: true,
              font: fontName,
              size: bodySizeHp + 4,
              color: coverageColor,
            }),
          ],
          spacing: { after: 120 },
        }),
      );

      // Potential gaps
      if (analytics.unassignedConfigs > 0 || analytics.staleConfigs > 0) {
        summaryChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "Potential Gaps",
                bold: true,
                font: fontName,
                size: bodySizeHp + 2,
                color: "CC8800",
              }),
            ],
            spacing: { before: 120, after: 60 },
          }),
        );

        const gapRows: string[][] = [];
        if (analytics.unassignedConfigs > 0) {
          gapRows.push([
            "Unassigned Policies",
            `${analytics.unassignedConfigs} configuration(s) have no group assignment`,
          ]);
        }
        if (analytics.staleConfigs > 0) {
          gapRows.push([
            "Stale Configurations",
            `${analytics.staleConfigs} configuration(s) not modified in 90+ days`,
          ]);
        }
        summaryChildren.push(
          createSettingsTable(["Gap", "Details"], gapRows, branding),
        );
        summaryChildren.push(spacer());
      }

      // Configuration inventory by type
      summaryChildren.push(heading2("Configuration Inventory"));
      const inventoryRows: string[][] = [];
      analytics.inventory.forEach(({ label, total, assigned }) => {
        if (total > 0) {
          inventoryRows.push([
            label,
            String(total),
            String(assigned),
            String(total - assigned),
          ]);
        }
      });

      if (inventoryRows.length > 0) {
        summaryChildren.push(
          createSettingsTable(
            ["Policy Type", "Total", "Assigned", "Unassigned"],
            inventoryRows,
            branding,
          ),
        );
        summaryChildren.push(spacer());
      }

      // Platform coverage
      const platformEntries = Object.entries(analytics.platformCounts);
      if (platformEntries.length > 0) {
        summaryChildren.push(heading2("Platform Coverage"));
        summaryChildren.push(
          createSettingsTable(
            ["Platform", "Configurations"],
            platformEntries.map(([p, c]) => [p, String(c)]),
            branding,
          ),
        );
        summaryChildren.push(spacer());
      }

      // Top assigned groups
      if (analytics.topGroups.length > 0) {
        summaryChildren.push(heading2("Top Assigned Groups"));
        const groupRows = analytics.topGroups.map(([id, count], idx) => {
          const resolvedName =
            data.groupNames?.get(id) ??
            (id === "All Users" || id === "All Devices" ? id : id);
          return [String(idx + 1), resolvedName, String(count)];
        });
        summaryChildren.push(
          createSettingsTable(
            ["Rank", "Group Name", "Assignments"],
            groupRows,
            branding,
          ),
        );
        summaryChildren.push(spacer());
      }

      pushContentSection(summaryChildren);
    } catch (e) {
      console.error("Error generating executive summary:", e);
    }
  }

  // ===== 3b. COMPLIANCE EVIDENCE PREVIEW =====
  try {
    const complianceAssessment = assessCompliance(data);
    const complianceChildren: (Paragraph | Table)[] = [];
    const statusLabels: Record<ControlStatus, string> = {
      evidenceFound: "Configuration evidence",
      partialEvidence: "Partial configuration evidence",
      noEvidence: "No recognized configuration evidence",
    };
    const statusRank: Record<ControlStatus, number> = {
      evidenceFound: 0,
      partialEvidence: 1,
      noEvidence: 2,
    };

    complianceChildren.push(heading1("Compliance Evidence Preview"));
    complianceChildren.push(
      bodyText(
        "This preview maps the exported configuration to technical evidence for NIST SP 800-53 (Rev. 5), NIST CSF 2.0, and BSI IT-Grundschutz. Evidence is only claimed when a recognized Intune setting is configured with an enforcing value on an assigned policy.",
      ),
    );
    complianceChildren.push(spacer());

    for (const framework of complianceAssessment.frameworks) {
      complianceChildren.push(
        heading2(`${framework.framework.name} (${framework.framework.version})`),
      );
      complianceChildren.push(
        bodyText(
          `${framework.summary.withEvidence} with evidence, ${framework.summary.partial} partial, ${framework.summary.withoutEvidence} without evidence (${framework.summary.totalControls} technically assessable controls)`,
        ),
      );

      const maxRows = 8;
      const ranked = [...framework.controls].sort(
        (a, b) =>
          statusRank[a.status] - statusRank[b.status] ||
          compareControlIds(a.control.id, b.control.id),
      );
      complianceChildren.push(
        createSettingsTable(
          ["Control", "Title", "Status"],
          ranked
            .slice(0, maxRows)
            .map((assessed) => [
              assessed.control.id,
              assessed.control.tier
                ? `${assessed.control.title} (${assessed.control.tier})`
                : assessed.control.title,
              statusLabels[assessed.status],
            ]),
          branding,
        ),
      );
      if (ranked.length > maxRows) {
        complianceChildren.push(
          bodyText(
            `…and ${ranked.length - maxRows} more controls in the full report.`,
          ),
        );
      }
      complianceChildren.push(spacer());
    }

    complianceChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: complianceAssessment.disclaimer,
            font: fontName,
            size: bodySizeHp - 2,
            color: "6E6E6E",
            italics: true,
          }),
        ],
        spacing: { before: 120, after: 120 },
      }),
    );
    complianceChildren.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Generate the full requirement-level compliance report from the Compliance view in your dashboard: intunedocumentation.com/dashboard",
            font: fontName,
            size: bodySizeHp,
            bold: true,
          }),
        ],
      }),
    );

    pushContentSection(complianceChildren);
  } catch (e) {
    console.error("Skipping compliance preview section:", e);
  }

  if (data.fetchErrors?.length) {
    const warningRows = data.fetchErrors.map((warning) => [
      `${warning.partial ? "Partial data" : "Unavailable"}: ${warning.policyType}`,
      warning.policyName,
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
    ]);
    pushContentSection([
      heading1("Collection Warnings"),
      bodyText(
        "The following resources were only partially collected or were unavailable. Successful sibling resources remain in this document.",
      ),
      spacer(),
      createSettingsTable(
        ["Status", "Resource", "Details"],
        warningRows,
        branding,
      ),
    ]);
  }

  // ===== POLICY SECTION HELPERS =====

  /** Build assignment + description paragraphs for a policy. */
  const policyMeta = (policy: any): Paragraph[] => {
    const parts: Paragraph[] = [];

    // Created / Modified dates
    if (policy.createdDateTime) {
      parts.push(metaText(`Created: ${formatDocDate(policy.createdDateTime)}`));
    }
    if (policy.lastModifiedDateTime) {
      parts.push(
        metaText(
          `Last Modified: ${formatDocDate(policy.lastModifiedDateTime)}`,
        ),
      );
    }

    // Assignments
    const rawAssignment = parseAssignments(policy.assignments);
    const assignmentText = enhanceAssignmentText(
      rawAssignment,
      data.groupNames,
    );
    parts.push(
      new Paragraph({
        children: [
          new TextRun({
            text: "Assignments: ",
            bold: true,
            font: fontName,
            size: bodySizeHp,
            color: textHex,
          }),
          new TextRun({
            text: assignmentText,
            font: fontName,
            size: bodySizeHp,
            color: textHex,
          }),
        ],
        spacing: { after: 60 },
      }),
    );

    // Description
    if (policy.description) {
      parts.push(bodyText(policy.description));
    }

    if (policy.hasFetchError) {
      parts.push(
        bodyText(
          `Partial collection: ${policy.fetchErrorMessage || "Microsoft Graph did not return every detail for this resource."}`,
        ),
      );
    }

    parts.push(spacer());
    return parts;
  };

  // ===== 4. SETTINGS CATALOG =====
  if (data.settingsCatalog?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Settings Catalog Policies"));

    for (const policy of data.settingsCatalog) {
      totalPolicies++;
      try {
        const policyName =
          policy.displayName || policy.name || "Settings Catalog Policy";
        sectionChildren.push(heading2(policyName));
        sectionChildren.push(...policyMeta(policy));

        if (policy.settings?.length) {
          const formatted: Array<{
            name: string;
            value: string;
            description?: string;
          }> = [];
          for (const setting of policy.settings) {
            const extracted = extractSettingValue(setting);
            if (extracted.value === "Not configured") continue;
            formatted.push({
              name: extracted.name,
              value: extracted.value,
              description: extracted.description,
            });
            if (extracted.nestedSettings?.length) {
              formatted.push(...extracted.nestedSettings);
            }
          }

          if (formatted.length > 0) {
            sectionChildren.push(
              createSettingsTable(
                ["Setting", "Value", "Description"],
                formatted.map((s) => [s.name, s.value, s.description ?? ""]),
                branding,
              ),
            );
          } else {
            sectionChildren.push(bodyText("No settings configured"));
          }
        } else {
          sectionChildren.push(bodyText("No settings configured"));
        }
        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Settings Catalog",
          policyName: policy.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing settings catalog policy:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 5. DEVICE CONFIGURATIONS =====
  if (data.deviceConfigurations?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Device Configurations"));

    for (const config of data.deviceConfigurations) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(config.displayName || "Device Configuration"),
        );
        sectionChildren.push(...policyMeta(config));

        const categories = parseDeviceConfiguration(config);
        for (const cat of categories) {
          sectionChildren.push(heading3(cat.category));
          if (cat.settings.length > 0) {
            sectionChildren.push(
              createSettingsTable(
                ["Setting", "Value", "Description"],
                cat.settings.map((s) => [s.name, s.value, s.description ?? ""]),
                branding,
              ),
            );
          }
        }
        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Device Configuration",
          policyName: config.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing device configuration:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 6. ADMINISTRATIVE TEMPLATES =====
  if (data.administrativeTemplates?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Administrative Templates"));

    for (const template of data.administrativeTemplates) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(template.displayName || "Administrative Template"),
        );
        sectionChildren.push(...policyMeta(template));

        const defs = parseAdministrativeTemplate(
          template.definitionValues || [],
        );

        // Group by category
        const byCat: Record<
          string,
          Array<{ name: string; state: string; value: string }>
        > = {};
        for (const d of defs) {
          const cat = d.category || "General";
          if (!byCat[cat]) byCat[cat] = [];
          byCat[cat].push(d);
        }

        for (const [cat, items] of Object.entries(byCat)) {
          sectionChildren.push(heading3(cat));
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value"],
              items.map((i) => [`${i.name} (${i.state})`, i.value]),
              branding,
            ),
          );
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Administrative Template",
          policyName: template.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing administrative template:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 7. COMPLIANCE POLICIES =====
  if (data.compliancePolicies?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Compliance Policies"));

    for (const policy of data.compliancePolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "Compliance Policy"),
        );
        sectionChildren.push(...policyMeta(policy));

        const rules = parseComplianceRules(policy);
        if (rules.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Rule", "Value"],
              rules.map((r) => [
                `${r.rule} (${r.category})`,
                `${r.value} -- ${r.action}`,
              ]),
              branding,
            ),
          );
        } else {
          sectionChildren.push(bodyText("No compliance rules configured"));
        }
        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Compliance Policy",
          policyName: policy.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing compliance policy:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 8. APP PROTECTION POLICIES =====
  if (data.appProtectionPolicies?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("App Protection Policies"));

    for (const policy of data.appProtectionPolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "App Protection Policy"),
        );
        sectionChildren.push(...policyMeta(policy));

        if (policy.platformType) {
          sectionChildren.push(metaText(`Platform: ${policy.platformType}`));
        }

        const settings: Array<{ name: string; value: string }> = [];
        const addIf = (label: string, val: any) => {
          if (val !== undefined && val !== null) {
            const fv = formatValue(val);
            if (fv !== "Not configured")
              settings.push({ name: label, value: fv });
          }
        };

        // Data protection
        addIf("App Data Encryption Type", policy.appDataEncryptionType);
        addIf(
          "Allowed Data Storage Locations",
          policy.allowedDataStorageLocations,
        );
        addIf(
          "Allowed Inbound Data Transfer Sources",
          policy.allowedInboundDataTransferSources,
        );
        addIf(
          "Allowed Outbound Data Transfer Destinations",
          policy.allowedOutboundDataTransferDestinations,
        );
        addIf(
          "Allowed Outbound Clipboard Sharing Level",
          policy.allowedOutboundClipboardSharingLevel,
        );
        addIf("Block Data Backup", policy.dataBackupBlocked);
        addIf("Block Save As", policy.saveAsBlocked);
        addIf("Block Printing", policy.printBlocked);
        addIf(
          "Organizational Credentials Required",
          policy.organizationalCredentialsRequired,
        );
        addIf("Block Screen Capture", policy.screenCaptureBlocked);
        addIf("Encrypt App Data", policy.encryptAppData);
        addIf("Contact Sync Blocked", policy.contactSyncBlocked);
        addIf(
          "Disable App Encryption If Device Encryption Is Enabled",
          policy.disableAppEncryptionIfDeviceEncryptionIsEnabled,
        );

        // Access requirements
        addIf("PIN Required", policy.pinRequired);
        addIf("Minimum PIN Length", policy.minimumPinLength);
        addIf("Simple PIN Blocked", policy.simplePinBlocked);
        addIf("PIN Character Set", policy.pinCharacterSet);
        addIf("Block Fingerprint", policy.fingerprintBlocked);
        addIf("Block Face ID", policy.faceIdBlocked);

        // Conditional launch
        addIf("Device Compliance Required", policy.deviceComplianceRequired);
        addIf(
          "Managed Browser Required",
          policy.managedBrowserToOpenLinksRequired,
        );
        addIf(
          "Maximum Allowed Device Threat Level",
          policy.maximumAllowedDeviceThreatLevel,
        );
        addIf(
          "Mobile Threat Defense Remediation Action",
          policy.mobileThreatDefenseRemediationAction,
        );
        addIf(
          "Action If Unable to Authenticate User",
          policy.appActionIfUnableToAuthenticateUser,
        );

        // Version requirements - minimum
        addIf("Minimum Required SDK Version", policy.minimumRequiredSdkVersion);
        addIf("Minimum Required OS Version", policy.minimumRequiredOsVersion);
        addIf("Minimum Required App Version", policy.minimumRequiredAppVersion);

        // Version requirements - warning
        addIf("Minimum Warning OS Version", policy.minimumWarningOsVersion);
        addIf("Minimum Warning App Version", policy.minimumWarningAppVersion);

        // Version requirements - wipe
        addIf("Minimum Wipe SDK Version", policy.minimumWipeSdkVersion);
        addIf("Minimum Wipe OS Version", policy.minimumWipeOsVersion);
        addIf("Minimum Wipe App Version", policy.minimumWipeAppVersion);

        // Version requirements - maximum
        addIf("Maximum Required OS Version", policy.maximumRequiredOsVersion);
        addIf("Maximum Warning OS Version", policy.maximumWarningOsVersion);
        addIf("Maximum Wipe OS Version", policy.maximumWipeOsVersion);

        // Offline / grace periods
        addIf(
          "Period Offline Before Wipe Is Enforced",
          policy.periodOfflineBeforeWipeIsEnforced,
        );
        addIf(
          "Period Offline Before Access Check",
          policy.periodOfflineBeforeAccessCheck,
        );
        addIf(
          "Period Online Before Access Check",
          policy.periodOnlineBeforeAccessCheck,
        );

        // Additional
        addIf("Is Assigned", policy.isAssigned);
        addIf("Deployed App Count", policy.deployedAppCount);

        const existingSettingNames = new Set(settings.map((item) => item.name));
        settings.push(
          ...parseDocumentableProperties(policy).filter(
            (item) => !existingSettingNames.has(item.name),
          ),
        );

        if (settings.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value"],
              settings.map((s) => [s.name, s.value]),
              branding,
            ),
          );
        } else {
          sectionChildren.push(bodyText("No protection settings configured"));
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "App Protection Policy",
          policyName: policy.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing app protection policy:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 9. SECURITY BASELINES =====
  if (data.securityBaselines?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Security Baselines"));

    for (const baseline of data.securityBaselines) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(baseline.displayName || "Security Baseline"),
        );
        sectionChildren.push(...policyMeta(baseline));

        const cats = parseSecurityBaseline(baseline.categories || []);
        for (const cat of cats) {
          if (cat.settings.length === 0) continue;
          sectionChildren.push(heading3(cat.category));
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value", "Description"],
              cat.settings.map((s) => [s.name, s.value, s.description ?? ""]),
              branding,
            ),
          );
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Security Baseline",
          policyName: baseline.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing security baseline:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 10. SCRIPTS =====
  const scriptsTotal =
    (data.scripts?.windows?.length ?? 0) + (data.scripts?.macOS?.length ?? 0);
  if (scriptsTotal > 0) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Scripts"));

    // Windows scripts
    if (data.scripts?.windows?.length) {
      sectionChildren.push(heading2("Windows Scripts"));
      for (const script of data.scripts.windows) {
        totalPolicies++;
        try {
          sectionChildren.push(
            heading3(script.displayName || "Windows Script"),
          );
          if (script.description) {
            sectionChildren.push(bodyText(script.description));
          }

          const scriptMeta: string[][] = [];
          if (script.fileName) scriptMeta.push(["File Name", script.fileName]);
          if (script.runAsAccount !== undefined)
            scriptMeta.push([
              "Run As",
              script.runAsAccount === "system" ? "System" : "User",
            ]);
          if (script.enforceSignatureCheck !== undefined)
            scriptMeta.push([
              "Enforce Signature Check",
              formatValue(script.enforceSignatureCheck),
            ]);
          if (script.runAs32Bit !== undefined)
            scriptMeta.push(["Run As 32-bit", formatValue(script.runAs32Bit)]);

          if (scriptMeta.length > 0) {
            sectionChildren.push(
              createSettingsTable(["Property", "Value"], scriptMeta, branding),
            );
          }

          // Script content
          let content = script.scriptContent || "";
          if (!content && script.scriptContentBase64) {
            try {
              content = atob(script.scriptContentBase64);
            } catch {
              content = "(Base64 decode failed)";
            }
          }
          if (content === REDACTED_VALUE) {
            sectionChildren.push(
              bodyText("Script content omitted from the export for security."),
            );
          } else if (content) {
            sectionChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Script Content:",
                    bold: true,
                    font: fontName,
                    size: bodySizeHp,
                  }),
                ],
                spacing: { before: 120, after: 60 },
              }),
            );
            // Render in Courier New, preserving line breaks
            const lines = content.split("\n");
            for (const line of lines) {
              sectionChildren.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: line || " ",
                      font: "Courier New",
                      size: bodySizeHp - 4,
                    }),
                  ],
                  spacing: { after: 0 },
                  shading: {
                    type: ShadingType.SOLID,
                    color: "F5F5F5",
                    fill: "F5F5F5",
                  },
                }),
              );
            }
          }
          sectionChildren.push(spacer());
          successfulPolicies++;
        } catch (e: any) {
          errors.push({
            policyType: "Windows Script",
            policyName: script.displayName || "Unknown",
            error: e?.message ?? String(e),
          });
          console.error("Error processing Windows script:", e);
        }
      }
    }

    // macOS scripts
    if (data.scripts?.macOS?.length) {
      sectionChildren.push(heading2("macOS Scripts"));
      for (const script of data.scripts.macOS) {
        totalPolicies++;
        try {
          sectionChildren.push(heading3(script.displayName || "macOS Script"));
          if (script.description) {
            sectionChildren.push(bodyText(script.description));
          }

          const scriptMeta: string[][] = [];
          if (script.fileName) scriptMeta.push(["File Name", script.fileName]);
          if (script.runAsAccount !== undefined)
            scriptMeta.push([
              "Run As",
              script.runAsAccount === "system" ? "System" : "User",
            ]);
          if (script.blockExecutionNotifications !== undefined)
            scriptMeta.push([
              "Block Execution Notifications",
              formatValue(script.blockExecutionNotifications),
            ]);
          if (script.executionFrequency)
            scriptMeta.push(["Execution Frequency", script.executionFrequency]);
          if (script.retryCount !== undefined)
            scriptMeta.push(["Retry Count", String(script.retryCount)]);

          if (scriptMeta.length > 0) {
            sectionChildren.push(
              createSettingsTable(["Property", "Value"], scriptMeta, branding),
            );
          }

          // Script content
          let content = script.scriptContent || "";
          if (!content && script.scriptContentBase64) {
            try {
              content = atob(script.scriptContentBase64);
            } catch {
              content = "(Base64 decode failed)";
            }
          }
          if (content === REDACTED_VALUE) {
            sectionChildren.push(
              bodyText("Script content omitted from the export for security."),
            );
          } else if (content) {
            sectionChildren.push(
              new Paragraph({
                children: [
                  new TextRun({
                    text: "Script Content:",
                    bold: true,
                    font: fontName,
                    size: bodySizeHp,
                  }),
                ],
                spacing: { before: 120, after: 60 },
              }),
            );
            const lines = content.split("\n");
            for (const line of lines) {
              sectionChildren.push(
                new Paragraph({
                  children: [
                    new TextRun({
                      text: line || " ",
                      font: "Courier New",
                      size: bodySizeHp - 4,
                    }),
                  ],
                  spacing: { after: 0 },
                  shading: {
                    type: ShadingType.SOLID,
                    color: "F5F5F5",
                    fill: "F5F5F5",
                  },
                }),
              );
            }
          }
          sectionChildren.push(spacer());
          successfulPolicies++;
        } catch (e: any) {
          errors.push({
            policyType: "macOS Script",
            policyName: script.displayName || "Unknown",
            error: e?.message ?? String(e),
          });
          console.error("Error processing macOS script:", e);
        }
      }
    }

    pushContentSection(sectionChildren);
  }

  // ===== 11. APP CONFIGURATION POLICIES =====
  if (data.appConfigurations?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("App Configuration Policies"));

    for (const config of data.appConfigurations) {
      totalPolicies++;
      try {
        const configName =
          config.displayName || config.name || "Unnamed Configuration";
        sectionChildren.push(heading2(configName));
        sectionChildren.push(...policyMeta(config));

        const configSettings: Array<{ name: string; value: string }> = [];

        // Configuration type
        if (config["@odata.type"]) {
          configSettings.push({
            name: "Configuration Type",
            value: config["@odata.type"].replace("#microsoft.graph.", ""),
          });
        }

        if (config.description) {
          configSettings.push({
            name: "Description",
            value: config.description,
          });
        }

        // Targeted apps
        if (config.targetedMobileApps?.length) {
          configSettings.push({
            name: "Targeted Apps",
            value:
              config.targetedMobileApps.length === 1
                ? config.targetedMobileApps[0]
                : `${config.targetedMobileApps.length} apps`,
          });
        }

        // XML payload (managed app configurations)
        if (config.encodedSettingXml) {
          if (config.encodedSettingXml === REDACTED_VALUE) {
            configSettings.push({
              name: "Configuration Settings (XML)",
              value: "Omitted from the export for security",
            });
          } else
            try {
              const decoded = atob(config.encodedSettingXml);
              configSettings.push({
                name: "Configuration Settings (XML)",
                value:
                  decoded.length > 500
                    ? decoded.substring(0, 500) + "..."
                    : decoded,
              });
            } catch {
              configSettings.push({
                name: "Configuration Settings",
                value: "XML settings present (base64 encoded)",
              });
            }
        }

        // JSON payload (managed device configurations)
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
                const fv = formatValue(value);
                if (fv !== "Not configured") {
                  configSettings.push({ name: key, value: fv });
                }
              });
            } catch {
              configSettings.push({
                name: "Configuration Payload",
                value:
                  config.payloadJson.length > 200
                    ? config.payloadJson.substring(0, 200) + "..."
                    : config.payloadJson,
              });
            }
        }

        // Generic settings array
        if (config.settings && Array.isArray(config.settings)) {
          configSettings.push(...extractAppConfigurationSettings(config));
        }

        // Raw payload string
        if (config.payload && typeof config.payload === "string") {
          configSettings.push({
            name: "Payload",
            value:
              config.payload === REDACTED_VALUE
                ? "Omitted from the export for security"
                : config.payload.length > 200
                  ? config.payload.substring(0, 200) + "..."
                  : config.payload,
          });
        }

        // Permission actions
        if (config.permissionActions?.length) {
          configSettings.push({
            name: "Permission Actions",
            value: config.permissionActions.join(", "),
          });
        }

        if (configSettings.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value"],
              configSettings.map((s) => [s.name, s.value]),
              branding,
            ),
          );
        } else {
          sectionChildren.push(bodyText("No configuration settings found"));
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "App Configuration",
          policyName: config.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing app configuration:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 12. WINDOWS UPDATE POLICIES =====
  if (data.windowsUpdatePolicies?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Windows Update Policies"));

    for (const policy of data.windowsUpdatePolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "Windows Update Policy"),
        );
        sectionChildren.push(...policyMeta(policy));

        const settings: Array<{ name: string; value: string }> = [];
        const addIf = (label: string, val: any) => {
          if (val !== undefined && val !== null) {
            const fv = formatValue(val);
            if (fv !== "Not configured")
              settings.push({ name: label, value: fv });
          }
        };

        addIf("Delivery Optimization Mode", policy.deliveryOptimizationMode);
        addIf("Prerelease Features", policy.prereleaseFeatures);
        addIf("Automatic Update Mode", policy.automaticUpdateMode);
        addIf(
          "Microsoft Update Service Allowed",
          policy.microsoftUpdateServiceAllowed,
        );
        addIf("Drivers Excluded", policy.driversExcluded);
        addIf(
          "Quality Updates Deferral (Days)",
          policy.qualityUpdatesDeferralPeriodInDays,
        );
        addIf(
          "Feature Updates Deferral (Days)",
          policy.featureUpdatesDeferralPeriodInDays,
        );
        addIf(
          "Quality Updates Pause Start Date",
          policy.qualityUpdatesPauseStartDate,
        );
        addIf(
          "Feature Updates Pause Start Date",
          policy.featureUpdatesPauseStartDate,
        );
        addIf("Quality Updates Paused", policy.qualityUpdatesPaused);
        addIf("Feature Updates Paused", policy.featureUpdatesPaused);
        addIf("Business Ready Updates Only", policy.businessReadyUpdatesOnly);
        addIf("Skip Checks Before Restart", policy.skipChecksBeforeRestart);
        addIf("Update Weeks", policy.updateWeeks);
        addIf(
          "Installation Schedule",
          policy.installationSchedule
            ? JSON.stringify(policy.installationSchedule)
            : undefined,
        );
        addIf("User Pause Access", policy.userPauseAccess);
        addIf(
          "User Windows Update Scan Access",
          policy.userWindowsUpdateScanAccess,
        );
        addIf(
          "Auto Restart Notification Dismissal",
          policy.autoRestartNotificationDismissal,
        );
        addIf(
          "Deadline For Feature Updates (Days)",
          policy.deadlineForFeatureUpdatesInDays,
        );
        addIf(
          "Deadline For Quality Updates (Days)",
          policy.deadlineForQualityUpdatesInDays,
        );
        addIf("Deadline Grace Period (Days)", policy.deadlineGracePeriodInDays);
        addIf(
          "Postpone Reboot Until After Deadline",
          policy.postponeRebootUntilAfterDeadline,
        );
        addIf(
          "Engaged Restart Deadline (Days)",
          policy.engagedRestartDeadlineInDays,
        );
        addIf(
          "Engaged Restart Snooze Schedule (Days)",
          policy.engagedRestartSnoozeScheduleInDays,
        );
        addIf(
          "Engaged Restart Transition Schedule (Days)",
          policy.engagedRestartTransitionScheduleInDays,
        );

        if (settings.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value"],
              settings.map((s) => [s.name, s.value]),
              branding,
            ),
          );
        } else {
          sectionChildren.push(bodyText("No update settings configured"));
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Windows Update Policy",
          policyName: policy.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing Windows Update policy:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 13. ENROLLMENT CONFIGURATIONS =====
  if (data.enrollmentConfigurations?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Enrollment Configurations"));

    for (const config of data.enrollmentConfigurations) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(config.displayName || "Enrollment Configuration"),
        );
        sectionChildren.push(...policyMeta(config));

        const settings: Array<{ name: string; value: string }> = [];
        const addIf = (label: string, val: any) => {
          if (val !== undefined && val !== null) {
            const fv = formatValue(val);
            if (fv !== "Not configured")
              settings.push({ name: label, value: fv });
          }
        };

        // Type and priority
        if (config["@odata.type"]) {
          settings.push({
            name: "Type",
            value: config["@odata.type"].replace("#microsoft.graph.", ""),
          });
        }
        addIf("Priority", config.priority);

        // Platform restrictions
        const platformRestrictions = config.platformRestrictions;
        if (platformRestrictions) {
          const platforms = [
            "iosRestriction",
            "androidRestriction",
            "androidForWorkRestriction",
            "windowsRestriction",
            "macOSRestriction",
            "macRestriction",
          ] as const;

          for (const platformKey of platforms) {
            const restriction = platformRestrictions[platformKey];
            if (!restriction) continue;
            const platformLabel = platformKey
              .replace("Restriction", "")
              .replace(/([A-Z])/g, " $1")
              .trim();
            addIf(`${platformLabel} - Blocked`, restriction.platformBlocked);
            addIf(
              `${platformLabel} - Personal Devices Blocked`,
              restriction.personalDeviceEnrollmentBlocked,
            );
            addIf(
              `${platformLabel} - Min OS Version`,
              restriction.osMinimumVersion,
            );
            addIf(
              `${platformLabel} - Max OS Version`,
              restriction.osMaximumVersion,
            );
          }
        }

        // Device limit
        addIf("Device Limit", config.limit);
        addIf("Description", config.description);

        const existingSettingNames = new Set(settings.map((item) => item.name));
        settings.push(
          ...parseDocumentableProperties(config).filter(
            (item) => !existingSettingNames.has(item.name),
          ),
        );

        if (settings.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value"],
              settings.map((s) => [s.name, s.value]),
              branding,
            ),
          );
        } else {
          sectionChildren.push(bodyText("No enrollment settings configured"));
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Enrollment Configuration",
          policyName: config.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing enrollment configuration:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  // ===== 14. CONDITIONAL ACCESS POLICIES =====
  if (data.conditionalAccessPolicies?.length) {
    const sectionChildren: (Paragraph | Table)[] = [];
    sectionChildren.push(heading1("Conditional Access Policies"));

    for (const policy of data.conditionalAccessPolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "Conditional Access Policy"),
        );

        // State
        const stateLabel = conditionalAccessStateLabel(policy.state);

        sectionChildren.push(
          new Paragraph({
            children: [
              new TextRun({
                text: "State: ",
                bold: true,
                font: fontName,
                size: bodySizeHp,
              }),
              new TextRun({
                text: stateLabel,
                font: fontName,
                size: bodySizeHp,
                color:
                  stateLabel === "Enabled"
                    ? "00A652"
                    : stateLabel === "Disabled"
                      ? "CC0000"
                      : "CC8800",
              }),
            ],
            spacing: { after: 80 },
          }),
        );

        if (policy.createdDateTime) {
          sectionChildren.push(
            metaText(`Created: ${formatDocDate(policy.createdDateTime)}`),
          );
        }
        if (policy.modifiedDateTime) {
          sectionChildren.push(
            metaText(
              `Last Modified: ${formatDocDate(policy.modifiedDateTime)}`,
            ),
          );
        }

        if (policy.description) {
          sectionChildren.push(bodyText(policy.description));
        }

        // Conditions table
        const conditions = buildConditionalAccessReportRows(
          policy,
          data.groupNames,
        ).map((row) => [row.name, row.value]);

        if (conditions.length > 0) {
          sectionChildren.push(
            createSettingsTable(["Condition", "Value"], conditions, branding),
          );
        } else {
          sectionChildren.push(bodyText("No conditions configured"));
        }

        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: "Conditional Access Policy",
          policyName: policy.displayName || "Unknown",
          error: e?.message ?? String(e),
        });
        console.error("Error processing conditional access policy:", e);
      }
    }
    pushContentSection(sectionChildren);
  }

  const additionalSections = (data.sections || []).filter(
    (section) =>
      section.selectionPrefix.startsWith("additional-") &&
      (section.items.length > 0 || section.error),
  );
  for (const sourceSection of additionalSections) {
    const sectionChildren: (Paragraph | Table)[] = [
      heading1(sourceSection.label),
    ];
    if (sourceSection.endpoint) {
      sectionChildren.push(
        metaText(`Source: Microsoft Graph beta ${sourceSection.endpoint}`),
      );
    }
    if (sourceSection.error) {
      sectionChildren.push(
        bodyText(
          `${sourceSection.error.partial ? "Partial data" : "Collection unavailable"}: ${sourceSection.error.message}`,
        ),
      );
    }

    for (const item of sourceSection.items) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(item.displayName || item.name || sourceSection.label),
        );
        sectionChildren.push(...policyMeta(item));
        const settings = parseDocumentableProperties(item);
        if (settings.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value"],
              settings.map((setting) => [setting.name, setting.value]),
              branding,
            ),
          );
        } else {
          sectionChildren.push(bodyText("No additional settings returned"));
        }
        sectionChildren.push(spacer());
        successfulPolicies++;
      } catch (e: any) {
        errors.push({
          policyType: sourceSection.label,
          policyName: item.displayName || item.name || sourceSection.label,
          error: e?.message ?? String(e),
        });
      }
    }
    pushContentSection(sectionChildren);
  }

  // -----------------------------------------------------------------------
  // Build the Document
  // -----------------------------------------------------------------------
  const doc = new Document({
    features: {
      updateFields: true,
    },
    title: branding?.metadata?.title || "Intune Configuration Documentation",
    creator: branding?.metadata?.author || "IntuneDocumentation",
    subject:
      branding?.metadata?.subject || "Microsoft Intune Configuration Export",
    keywords:
      branding?.metadata?.keywords?.join(", ") ||
      "Intune, Configuration, Documentation",
    styles: {
      default: {
        document: {
          run: {
            font: fontName,
            size: bodySizeHp,
            color: textHex,
          },
        },
        heading1: {
          run: {
            font: fontName,
            size: headerSizeHp + 8,
            bold: true,
            color: primaryHex,
          },
          paragraph: {
            spacing: { before: 240, after: 120 },
          },
        },
        heading2: {
          run: {
            font: fontName,
            size: headerSizeHp + 2,
            bold: true,
            color: secondaryHex,
          },
          paragraph: {
            spacing: { before: 200, after: 80 },
          },
        },
        heading3: {
          run: {
            font: fontName,
            size: headerSizeHp,
            bold: true,
            color: primaryHex,
          },
          paragraph: {
            spacing: { before: 160, after: 60 },
          },
        },
      },
    },
    sections,
  });

  // -----------------------------------------------------------------------
  // Pack to buffer
  // -----------------------------------------------------------------------
  const buffer = await Packer.toBuffer(doc);

  return {
    buffer: new Uint8Array(buffer),
    errors,
    totalPolicies,
    successfulPolicies,
  };
}
