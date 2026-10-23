import {
  CONTROL_STATUS_LABELS,
  CONTROL_STATUS_ORDER,
  frameworkCoverageLabel,
} from "./compliance/presentation";
import {
  Document,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  type Table,
  Bookmark,
  BookmarkStart,
  BookmarkEnd,
  TextRun,
  SectionType,
  BorderStyle,
} from "docx";
import {
  analyzeConfigurations,
  type ConfigurationAnalytics,
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
  ASSIGNMENTS_NOT_APPLICABLE,
  formatValue,
  isUnsetValue,
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
import type { BrandingOptions } from "~/types/branding";
import { normalizeDocx } from "./docx-compatibility";
import {
  ADDITIONAL_FAMILY_LABELS,
  REDACTED_VALUE,
} from "./intune-policy-registry";
import { assessCompliance, compareControlIds } from "./compliance";
import { unlistedSources } from "./compliance/graph-rows";
import { withoutDesktopOnlyFrameworks } from "./compliance/framework-availability";
import {
  buildConditionalAccessReportRows,
  conditionalAccessStateLabel,
} from "./conditional-access-report";
import {
  COVER_PAGE_MARGINS,
  contentsRow,
  coverFooter,
  coverNoticeFits,
  coverLogoSize,
  coverTable,
  coverTitle,
  dataTable,
  eyebrowParagraph,
  glancePage,
  headerLogoSize,
  imageSize,
  mmToPixels,
  paragraphStyles,
  runningFooter,
  runningHeader,
  wordTheme,
  WORD_PALETTE,
} from "./docx-design";
import {
  DOCUMENT_PRODUCT_LINE,
  DOCUMENT_SOURCE_NOTE,
  buildGlanceModel,
  formatDocumentDate,
  plural,
  summaryNotes,
} from "./documentation-glance";
import { dateParts } from "./compliance/pdf-kit";

// ---------------------------------------------------------------------------
// Helper utilities
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Reusable table builder
// ---------------------------------------------------------------------------

/**
 * Data table in the export design: primary header row, zebra rows and fixed
 * column widths (see dataTable).
 */
function createSettingsTable(
  headers: string[],
  rows: string[][],
  branding?: BrandingOptions,
  percentages?: number[],
): Table {
  return dataTable(wordTheme(branding), headers, rows, percentages);
}

/** Setting, value and description columns, as wide as in the PDF. */
const SETTING_COLUMNS = [28, 36, 36];

// ---------------------------------------------------------------------------
// Image helpers
// ---------------------------------------------------------------------------

/** Extract base64 payload from a data URL. */
function extractBase64(dataUrl: string): string {
  const commaIdx = dataUrl.indexOf(",");
  if (commaIdx >= 0) return dataUrl.slice(commaIdx + 1);
  return dataUrl;
}

// docx creates a new ID counter for each Bookmark, so every default ID is 1.
// Supply matching start/end IDs from the document's section counter instead.
class SectionBookmark extends Bookmark {
  readonly start: BookmarkStart;
  readonly end: BookmarkEnd;

  constructor(anchor: string, numericId: number, text: TextRun) {
    super({ id: anchor, children: [text] });
    this.start = new BookmarkStart(anchor, numericId);
    this.end = new BookmarkEnd(numericId);
  }
}

// ---------------------------------------------------------------------------
// Main export function
// ---------------------------------------------------------------------------

export interface DetailedDocxOptions {
  /**
   * "web" (the default) leaves desktop-only frameworks such as NIS2 and DORA
   * out of the compliance evidence preview. The desktop app passes "desktop"
   * to keep every framework.
   */
  audience?: "desktop" | "web";
  /**
   * Fixed render time for the generated date, the version and the age of
   * configurations, read in UTC as in the PDF export.
   */
  renderDate?: Date;
}

export async function generateDetailedDOCX(
  data: DetailedExportData,
  options: DetailedDocxOptions = {},
): Promise<ExportGenerationResult> {
  const errors: PolicyExportError[] = [];
  let totalPolicies = 0;
  let successfulPolicies = 0;
  const generatedAt = options.renderDate
    ? new Date(options.renderDate.getTime())
    : new Date();
  // Fixed render dates read calendar fields in UTC, as in the PDF.
  const fixedDate = options.renderDate !== undefined;
  const formatDate = (value?: string) => formatDocumentDate(value, fixedDate);

  // Branding over the evidence report palette, font and sizes.
  const branding = data.branding;
  const theme = wordTheme(branding);
  const primaryHex = theme.primary;
  const secondaryHex = theme.secondary;
  const textHex = theme.text;
  const fontName = theme.font;
  const headerSizeHp = theme.headerSizeHp;
  const bodySizeHp = theme.bodySizeHp;

  const companyName = branding?.companyName ?? "";
  const department = branding?.department ?? "";

  // Opt in: a scoped export titles the cover for its scope, and a compact
  // one leaves out the summary sections.
  const scope = data.documentScope;
  const compactScope = scope?.compact === true;

  // -----------------------------------------------------------------------
  // Build sections
  // -----------------------------------------------------------------------
  const sections: any[] = [];

  // ===== 1. COVER PAGE =====
  // As in the PDF, the notice belongs to the footer and shows only with it.
  const confidentialityNotice = branding?.footer?.enabled
    ? branding.footer.confidentialityNotice || undefined
    : undefined;
  // A notice too long for the cover stays off it; content pages print it.
  const coverNotice = coverNoticeFits(confidentialityNotice)
    ? confidentialityNotice
    : undefined;
  const classification = branding?.metadata?.classification;
  const classificationLabel = classification
    ? classification.charAt(0).toUpperCase() + classification.slice(1)
    : undefined;
  const titleText =
    scope?.title || branding?.coverPage?.title || "Microsoft Intune";

  let coverLogo:
    | { data: string; widthMm: number; heightMm: number }
    | undefined;
  if (branding?.logo?.dataUrl && branding.logo.position === "cover") {
    const logoBase64 = extractBase64(branding.logo.dataUrl);
    coverLogo = {
      data: logoBase64,
      ...coverLogoSize(branding.logo, imageSize(logoBase64)),
    };
  }

  // Only a real collection time is shown; the export time is not one.
  const collectedAt = formatDate(data.collectedAt);
  const { year, month, day } = dateParts(generatedAt, fixedDate);
  const version = `v${year}.${month}.${day}`;
  const coverFacts: Array<[string, string]> = [
    ...(collectedAt
      ? [["Data collected", collectedAt] as [string, string]]
      : []),
    ["Generated", formatDocumentDate(generatedAt, fixedDate) ?? ""],
    ...(classificationLabel
      ? [["Classification", classificationLabel] as [string, string]]
      : []),
  ];

  sections.push({
    properties: {
      titlePage: true,
      type: SectionType.NEXT_PAGE,
      page: { margin: COVER_PAGE_MARGINS },
    },
    footers: {
      first: coverFooter(
        theme,
        DOCUMENT_PRODUCT_LINE,
        DOCUMENT_SOURCE_NOTE,
        coverNotice,
      ),
    },
    children: [
      coverTable(theme, {
        productName: "Intune Documentation",
        eyebrow: "Intune Configuration Export",
        title: titleText,
        subtitle: scope?.subtitle || "Configuration Documentation",
        // As in the PDF: a single configuration reads "Configuration
        // Documentation" here, and a three line title leaves no room.
        description:
          coverTitle(titleText, theme.font).lines > 2
            ? ""
            : scope?.subtitle
              ? "Configuration Documentation"
              : branding?.coverPage?.subtitle ||
                "Comprehensive export of Intune policies, profiles, and assignments",
        tenantEyebrow: "Tenant",
        tenant: data.tenantLabel,
        facts: coverFacts,
        logo: coverLogo,
        companyName: companyName || undefined,
        note: branding?.coverPage?.customText,
        footerNotice: coverNotice,
        controlHeading: "Document control",
        control: [
          {
            label: "Organization",
            value: [companyName, department].filter(Boolean).join(" / "),
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
        ],
      }),
    ],
  });

  // -----------------------------------------------------------------------
  // Running header and footer of the content pages
  // -----------------------------------------------------------------------
  let headerLogo: ImageRun | undefined;
  if (
    (branding?.header?.includeLogo || branding?.logo?.position === "header") &&
    branding?.logo?.dataUrl
  ) {
    try {
      const logoBase64 = extractBase64(branding.logo.dataUrl);
      const { widthMm, heightMm } = headerLogoSize(
        branding.logo,
        imageSize(logoBase64),
      );
      headerLogo = new ImageRun({
        data: logoBase64,
        transformation: {
          width: mmToPixels(widthMm),
          height: mmToPixels(heightMm),
        },
      });
    } catch (e) {
      console.warn("Failed to add header logo:", e);
    }
  }
  // Same running title as the PDF.
  const runningTitle =
    scope?.title ||
    `${branding?.coverPage?.title || "Microsoft Intune"} Configuration Documentation`;
  const contentHeader = runningHeader(
    theme,
    runningTitle,
    branding?.header?.enabled && branding.header.text
      ? branding.header.text
      : data.tenantLabel,
    headerLogo,
  );
  const contentFooter = runningFooter(
    theme,
    branding?.footer?.enabled && branding.footer.text
      ? branding.footer.text
      : DOCUMENT_PRODUCT_LINE,
    confidentialityNotice,
  );

  const spacers = new WeakSet<Paragraph>();
  const contentsEntries: { title: string; anchor: string }[] = [];
  let contentsChildren: Paragraph[] | undefined;
  let bookmarkId = 0;

  // Helper: wrap children in a content section on a new page. Only the first
  // content section carries the running header and footer; later sections
  // inherit them, so the package holds one header and one footer part.
  let chromeAttached = false;
  const pushContentSection = (children: (Paragraph | Table)[]) => {
    while (
      children.length &&
      spacers.has(children[children.length - 1] as Paragraph)
    )
      children.pop();
    sections.push({
      properties: { type: SectionType.NEXT_PAGE },
      ...(chromeAttached
        ? {}
        : {
            headers: { default: contentHeader },
            footers: { default: contentFooter },
          }),
      children,
    });
    chromeAttached = true;
  };

  // Helper: numbered eyebrow with the family label, as in the PDF, and a
  // Heading 1 title with its contents anchor
  const heading1 = (text: string, group: string): Paragraph[] => {
    const anchor = `section_${contentsEntries.length + 1}`;
    contentsEntries.push({ title: text, anchor });
    return [
      eyebrowParagraph(
        theme,
        `${String(contentsEntries.length).padStart(2, "0")}  ${group}`,
      ),
      new Paragraph({
        children: [
          new SectionBookmark(
            anchor,
            ++bookmarkId,
            new TextRun({
              text,
              color: primaryHex,
              font: fontName,
              size: headerSizeHp + 12,
            }),
          ),
        ],
        heading: HeadingLevel.HEADING_1,
        keepNext: true,
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 8, color: primaryHex },
        },
        spacing: { before: 0, after: 200 },
      }),
    ];
  };

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
      keepNext: true,
      spacing: { before: 280, after: 80 },
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
      keepNext: true,
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
          color: WORD_PALETTE.muted,
        }),
      ],
      spacing: { after: 40 },
    });

  // Helper: blank spacer
  const spacer = (): Paragraph => {
    const paragraph = new Paragraph({ spacing: { after: 120 } });
    spacers.add(paragraph);
    return paragraph;
  };

  let analytics: ConfigurationAnalytics | undefined;
  if (!compactScope && branding?.documentSettings?.includeAnalytics !== false) {
    try {
      analytics = analyzeConfigurations(data, generatedAt);
    } catch (e) {
      console.error("Error analyzing configurations:", e);
    }
  }

  const glance = analytics ? buildGlanceModel(data, analytics) : undefined;

  // ===== 2. AT A GLANCE =====
  if (glance) {
    try {
      pushContentSection(glancePage(theme, glance));
    } catch (e) {
      console.error("Error generating the at a glance page:", e);
    }
  }

  // ===== 3. TABLE OF CONTENTS =====
  if (
    !compactScope &&
    branding?.documentSettings?.includeTableOfContents !== false
  ) {
    contentsChildren = [
      eyebrowParagraph(theme, "Contents"),
      new Paragraph({
        children: [
          new TextRun({
            text: "Table of Contents",
            color: primaryHex,
            font: fontName,
            size: headerSizeHp + 12,
          }),
        ],
        heading: HeadingLevel.HEADING_1,
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 8, color: primaryHex },
        },
        spacing: { before: 0, after: 200 },
      }),
    ];
    pushContentSection(contentsChildren);
  }

  // ===== 4. EXECUTIVE SUMMARY =====
  if (analytics && glance) {
    try {
      const summaryChildren: (Paragraph | Table)[] = [];

      summaryChildren.push(...heading1("Executive Summary", "Tenant Overview"));
      summaryChildren.push(spacer());

      // Key metrics table
      summaryChildren.push(
        createSettingsTable(
          ["Total configurations", "Assigned", "Not assigned", "Unknown"],
          [
            [
              String(analytics.totalConfigs),
              String(analytics.assignedConfigs),
              String(analytics.unassignedConfigs),
              String(analytics.unknownAssignmentConfigs),
            ],
          ],
          branding,
        ),
      );
      summaryChildren.push(spacer());

      // Assigned share over the configurations that take assignments, n/a
      // when no assignment is known, as on the glance page.
      summaryChildren.push(
        new Paragraph({
          children: [
            new TextRun({
              text: "Assigned share: ",
              bold: true,
              font: fontName,
              size: bodySizeHp,
            }),
            new TextRun({
              text:
                glance.assignedShare !== null
                  ? `${Math.round(glance.assignedShare * 100)}% (${glance.assigned} of ${plural(glance.assignmentApplicable, "configuration that takes", "configurations that take")} assignments)`
                  : glance.assignmentApplicable === 0
                    ? "n/a (no configuration takes assignments)"
                    : `n/a (the assignments of ${plural(glance.assignmentApplicable, "configuration", "configurations")} could not be read or resolved)`,
              font: fontName,
              size: bodySizeHp,
            }),
          ],
          spacing: { after: 60 },
        }),
      );
      summaryChildren.push(
        metaText("Unknown assignments are not counted as assigned."),
      );
      for (const note of summaryNotes(analytics))
        summaryChildren.push(bodyText(note));
      summaryChildren.push(spacer());

      // Configuration inventory by type
      summaryChildren.push(heading2("Configuration Inventory"));
      const inventoryRows: string[][] = [];
      analytics.inventory.forEach(
        ({ label, total, assigned, unassigned, unknown, notApplicable }) => {
          if (total > 0) {
            inventoryRows.push([
              label,
              String(total),
              notApplicable === total ? "n/a" : String(assigned),
              notApplicable === total ? "n/a" : String(unassigned),
              notApplicable === total ? "n/a" : String(unknown),
            ]);
          }
        },
      );

      if (inventoryRows.length > 0) {
        summaryChildren.push(
          createSettingsTable(
            ["Policy type", "Total", "Assigned", "Not assigned", "Unknown"],
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
  if (data.includeComplianceEvidence !== false) {
    try {
      const complianceAssessment =
        options.audience === "desktop"
          ? assessCompliance(data)
          : withoutDesktopOnlyFrameworks(assessCompliance(data));
      const complianceChildren: (Paragraph | Table)[] = [];
      const statusLabels = CONTROL_STATUS_LABELS;
      const statusRank = CONTROL_STATUS_ORDER;

      complianceChildren.push(
        ...heading1("Compliance Evidence Preview", "Compliance evidence"),
      );
      complianceChildren.push(
        bodyText(
          "This preview maps the exported configuration to technical evidence for each supported compliance framework. Supporting evidence may describe configuration or a compliance requirement. Device state, effective access and the remaining control requirements are assessed separately.",
        ),
      );
      complianceChildren.push(spacer());

      for (const framework of complianceAssessment.frameworks) {
        complianceChildren.push(
          heading2(
            `${framework.framework.name} (${framework.framework.version})`,
          ),
        );
        const coverageLabel = frameworkCoverageLabel(framework);
        if (coverageLabel) complianceChildren.push(bodyText(coverageLabel));
        complianceChildren.push(
          bodyText(
            `${framework.summary.withEvidence} with evidence, ${framework.summary.partial} partial, ${framework.summary.withoutEvidence} without evidence (${framework.summary.applicableControls} entries in scope; ${framework.summary.notApplicable} outside scope; ${framework.summary.notAssessed} not assessed; ${framework.summary.conflicting} mixed evidence)`,
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
                framework.framework.id === "essential-eight"
                  ? `${assessed.control.title}: ${assessed.control.summary}`
                  : assessed.control.tier
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
              color: WORD_PALETTE.muted,
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
      ...heading1("Collection Warnings", "Collection"),
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
  const policyMeta = (policy: any, family: string): Paragraph[] => {
    const parts: Paragraph[] = [];

    // Created / Modified dates
    const created = formatDate(policy.createdDateTime);
    if (created) parts.push(metaText(`Created: ${created}`));
    const modified = formatDate(policy.lastModifiedDateTime);
    if (modified) parts.push(metaText(`Last Modified: ${modified}`));

    // Assignments
    const assignmentText = assignable(policy)
      ? enhanceAssignmentText(
          parseAssignments(
            policy.assignments,
            assignmentStatus(
              policy,
              itemFetchErrors(data.fetchErrors, policy, family),
            ),
          ),
          data.groupNames,
        )
      : ASSIGNMENTS_NOT_APPLICABLE;
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
    sectionChildren.push(
      ...heading1("Settings Catalog Policies", "Device configuration"),
    );

    for (const policy of data.settingsCatalog) {
      totalPolicies++;
      try {
        const policyName =
          policy.displayName || policy.name || "Settings Catalog Policy";
        sectionChildren.push(heading2(policyName));
        sectionChildren.push(...policyMeta(policy, "settingsCatalog"));

        if (Array.isArray(policy.settings) && policy.settings.length) {
          const formatted: Array<{
            name: string;
            value: string;
            description?: string;
          }> = [];
          for (const setting of policy.settings) {
            const extracted = extractSettingValue(setting);
            if (!extracted.configured) continue;
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
                SETTING_COLUMNS,
              ),
            );
          } else {
            sectionChildren.push(bodyText("No settings configured"));
          }
        } else {
          sectionChildren.push(
            bodyText(
              settingsUnavailable(policy, "settingsCatalog")
                ? SETTINGS_UNAVAILABLE
                : "No settings configured",
            ),
          );
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
    sectionChildren.push(
      ...heading1("Device Configurations", "Device configuration"),
    );

    for (const config of data.deviceConfigurations) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(config.displayName || "Device Configuration"),
        );
        sectionChildren.push(...policyMeta(config, "deviceConfigurations"));

        const categories = parseDeviceConfiguration(config);
        for (const cat of categories) {
          sectionChildren.push(heading3(cat.category));
          if (cat.settings.length > 0) {
            sectionChildren.push(
              createSettingsTable(
                ["Setting", "Value", "Description"],
                cat.settings.map((s) => [s.name, s.value, s.description ?? ""]),
                branding,
                SETTING_COLUMNS,
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
    sectionChildren.push(
      ...heading1("Administrative Templates", "Device configuration"),
    );

    for (const template of data.administrativeTemplates) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(template.displayName || "Administrative Template"),
        );
        sectionChildren.push(
          ...policyMeta(template, "administrativeTemplates"),
        );

        if (unlistedSources(template, "administrativeTemplates").size)
          sectionChildren.push(bodyText(SETTINGS_UNAVAILABLE));
        const defs = parseAdministrativeTemplate(
          Array.isArray(template.definitionValues)
            ? template.definitionValues
            : [],
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
    sectionChildren.push(
      ...heading1("Compliance Policies", "Device compliance"),
    );

    for (const policy of data.compliancePolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "Compliance Policy"),
        );
        sectionChildren.push(...policyMeta(policy, "compliancePolicies"));

        const rules = parseComplianceRules(policy);
        if (rules.length > 0) {
          sectionChildren.push(
            createSettingsTable(
              ["Rule", "Value"],
              rules.map((r) => [
                `${r.rule} (${r.category})`,
                `${r.value} (Action: ${r.action})`,
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
    sectionChildren.push(
      ...heading1("App Protection Policies", "App management"),
    );

    for (const policy of data.appProtectionPolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "App Protection Policy"),
        );
        sectionChildren.push(...policyMeta(policy, "appProtectionPolicies"));

        if (policy.platformType) {
          sectionChildren.push(metaText(`Platform: ${policy.platformType}`));
        }

        const settings: Array<{ name: string; value: string }> = [];
        const addIf = (label: string, val: any) => {
          if (!isUnsetValue(val))
            settings.push({ name: label, value: formatValue(val) });
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
    sectionChildren.push(
      ...heading1("Security Baselines", "Endpoint security"),
    );

    for (const baseline of data.securityBaselines) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(baseline.displayName || "Security Baseline"),
        );
        sectionChildren.push(...policyMeta(baseline, "securityBaselines"));

        if (baseline.collectionStatus?.settings === "incomplete") {
          sectionChildren.push(
            bodyText("Baseline settings collection incomplete"),
          );
        }
        const unlisted = unlistedSources(baseline, "securityBaselines").size;
        if (unlisted) sectionChildren.push(bodyText(SETTINGS_UNAVAILABLE));
        const cats = unlisted
          ? []
          : parseSecurityBaseline(baseline.categories || [], baseline.settings);
        for (const cat of cats) {
          if (cat.settings.length === 0) continue;
          sectionChildren.push(heading3(cat.category));
          sectionChildren.push(
            createSettingsTable(
              ["Setting", "Value", "Description"],
              cat.settings.map((s) => [s.name, s.value, s.description ?? ""]),
              branding,
              SETTING_COLUMNS,
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
    sectionChildren.push(...heading1("Scripts", "Scripts"));

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
          const content = script.scriptContent || "";
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
                    color: WORD_PALETTE.panel,
                    fill: WORD_PALETTE.panel,
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
          const content = script.scriptContent || "";
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
                    color: WORD_PALETTE.panel,
                    fill: WORD_PALETTE.panel,
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
    sectionChildren.push(
      ...heading1("App Configuration Policies", "App management"),
    );

    for (const config of data.appConfigurations) {
      totalPolicies++;
      try {
        const configName =
          config.displayName || config.name || "Unnamed Configuration";
        sectionChildren.push(heading2(configName));
        sectionChildren.push(...policyMeta(config, "appConfigurations"));

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
                if (!isUnsetValue(value)) {
                  configSettings.push({ name: key, value: formatValue(value) });
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
    sectionChildren.push(...heading1("Windows Update Policies", "Updates"));

    for (const policy of data.windowsUpdatePolicies) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(policy.displayName || "Windows Update Policy"),
        );
        sectionChildren.push(...policyMeta(policy, "windowsUpdatePolicies"));

        const settings: Array<{ name: string; value: string }> = [];
        const addIf = (label: string, val: any) => {
          if (!isUnsetValue(val))
            settings.push({ name: label, value: formatValue(val) });
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
    sectionChildren.push(
      ...heading1("Enrollment Configurations", "Enrollment"),
    );

    for (const config of data.enrollmentConfigurations) {
      totalPolicies++;
      try {
        sectionChildren.push(
          heading2(config.displayName || "Enrollment Configuration"),
        );
        sectionChildren.push(...policyMeta(config, "enrollmentConfigurations"));

        const settings: Array<{ name: string; value: string }> = [];
        const addIf = (label: string, val: any) => {
          if (!isUnsetValue(val))
            settings.push({ name: label, value: formatValue(val) });
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
            ["iosRestriction", "iOS"],
            ["androidRestriction", "Android"],
            ["androidForWorkRestriction", "Android for Work"],
            ["windowsRestriction", "Windows"],
            ["macOSRestriction", "macOS"],
            ["macRestriction", "Mac"],
          ] as const;

          for (const [platformKey, platformLabel] of platforms) {
            const restriction = platformRestrictions[platformKey];
            if (!restriction) continue;
            addIf(`${platformLabel}: Blocked`, restriction.platformBlocked);
            addIf(
              `${platformLabel}: Personal Devices Blocked`,
              restriction.personalDeviceEnrollmentBlocked,
            );
            addIf(
              `${platformLabel}: Min OS Version`,
              restriction.osMinimumVersion,
            );
            addIf(
              `${platformLabel}: Max OS Version`,
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
    sectionChildren.push(
      ...heading1("Conditional Access Policies", "Identity and access"),
    );

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
                color: textHex,
              }),
            ],
            spacing: { after: 80 },
          }),
        );

        const created = formatDate(policy.createdDateTime);
        if (created) sectionChildren.push(metaText(`Created: ${created}`));
        const modified = formatDate(policy.modifiedDateTime);
        if (modified)
          sectionChildren.push(metaText(`Last Modified: ${modified}`));

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
      ...heading1(
        sourceSection.label,
        ADDITIONAL_FAMILY_LABELS[
          sourceSection.familyKey as keyof typeof ADDITIONAL_FAMILY_LABELS
        ] ?? "Additional configuration",
      ),
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
        sectionChildren.push(...policyMeta(item, sourceSection.familyKey));
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
  // Each contents row links to its section bookmark without a TOC field, so
  // the links work in every viewer. The PAGEREF page numbers are filled in
  // when the viewer updates fields (LibreOffice on open, Word on update or
  // print); viewers without field support show the rows without numbers.
  if (contentsChildren) {
    contentsEntries.forEach((entry, index) =>
      contentsChildren?.push(contentsRow(entry.title, entry.anchor, index)),
    );
  }
  const doc = new Document({
    title:
      branding?.metadata?.title ||
      scope?.title ||
      "Intune Configuration Documentation",
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
            size: headerSizeHp + 12,
            bold: false,
            color: primaryHex,
          },
          paragraph: {
            spacing: { before: 0, after: 200 },
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
      paragraphStyles: paragraphStyles(theme),
    },
    sections,
  });

  // -----------------------------------------------------------------------
  // Pack to buffer
  // -----------------------------------------------------------------------
  const buffer = await Packer.toBuffer(doc);

  return {
    buffer: await normalizeDocx(new Uint8Array(buffer)),
    errors,
    totalPolicies,
    successfulPolicies,
  };
}
