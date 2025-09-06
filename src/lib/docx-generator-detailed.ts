import {
  AlignmentType,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  extractSettingValue,
  parseAdministrativeTemplate,
  parseAssignments,
  parseComplianceRules,
  parseDeviceConfiguration,
  parseSecurityBaseline,
} from "./configuration-parser";
import type { BrandingOptions } from "~/types/branding";

interface DetailedDocxData {
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  compliancePolicies: any[];
  securityBaselines: any[];
  scripts: {
    windows: any[];
    macOS: any[];
  };
  appConfigurations?: any[];
  windowsUpdatePolicies?: any[];
  enrollmentConfigurations?: any[];
  conditionalAccessPolicies?: any[];
  groupNames?: Map<string, string>;
  deviceCounts?: Record<string, number>;
  branding?: BrandingOptions;
}

function enhanceAssignmentText(text: string, groupNames?: Map<string, string>): string {
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

export async function generateDetailedDOCX(data: DetailedDocxData): Promise<Uint8Array> {
  const doc = new Document({
    sections: [],
  });

  const company = data.branding?.companyName || "";
  const titleText = company
    ? `${company} - Intune Configuration Report`
    : "Intune Configuration Report";

  // Cover / Title section
  doc.addSection({
    properties: {},
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: titleText, bold: true }),
        ],
        heading: HeadingLevel.TITLE,
      }),
      new Paragraph({
        text: new Date().toLocaleString(),
        alignment: AlignmentType.LEFT,
      }),
    ],
  });

  // Helper to push a section with a heading
  const addSection = (title: string, children: Paragraph[] | (Paragraph | Table)[]) => {
    doc.addSection({
      properties: {},
      children: [
        new Paragraph({
          text: title,
          heading: HeadingLevel.HEADING_1,
        }),
        ...children,
      ],
    });
  };

  // Settings Catalog
  if (data.settingsCatalog?.length) {
    const children: (Paragraph | Table)[] = [];
    data.settingsCatalog.forEach((policy) => {
      children.push(
        new Paragraph({
          text: policy.displayName || policy.name || "Settings Catalog Policy",
          heading: HeadingLevel.HEADING_2,
        })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(policy.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));
      if (policy.description) {
        children.push(new Paragraph({ text: policy.description }));
      }

      // Settings table
      if (policy.settings?.length) {
        const rows: TableRow[] = [];
        // Header row
        rows.push(
          new TableRow({
            children: ["Setting", "Value", "Description"].map(
              (h) =>
                new TableCell({
                  children: [
                    new Paragraph({
                      children: [new TextRun({ text: h, bold: true })],
                    }),
                  ],
                })
            ),
          })
        );
        const formatted = policy.settings.map((s: any) => extractSettingValue(s));
        formatted.forEach((s: any) => {
          rows.push(
            new TableRow({
              children: [s.name, s.value, s.description || ""].map(
                (t) => new TableCell({ children: [new Paragraph(String(t))] })
              ),
            })
          );
        });
        children.push(
          new Table({
            columnWidths: [5000, 3000, 5000],
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows,
          })
        );
      } else {
        children.push(new Paragraph({ text: "No settings configured" }));
      }
    });
    addSection("Settings Catalog Policies", children);
  }

  // Device Configurations
  if (data.deviceConfigurations?.length) {
    const children: (Paragraph | Table)[] = [];
    data.deviceConfigurations.forEach((config) => {
      children.push(
        new Paragraph({ text: config.displayName || "Device Configuration", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(config.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));
      if (config.description) children.push(new Paragraph({ text: config.description }));

      const categories = parseDeviceConfiguration(config);
      categories.forEach((cat) => {
        children.push(
          new Paragraph({ text: cat.category, heading: HeadingLevel.HEADING_3 })
        );
        const rows: TableRow[] = [
          new TableRow({
            children: ["Setting", "Value", "Description"].map((h) =>
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
              })
            ),
          }),
        ];
        cat.settings.forEach((s) => {
          rows.push(
            new TableRow({
              children: [s.name, s.value, s.description || ""].map((t) =>
                new TableCell({ children: [new Paragraph(String(t))] })
              ),
            })
          );
        });
        children.push(
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
        );
      });
    });
    addSection("Device Configurations", children);
  }

  // Administrative Templates
  if (data.administrativeTemplates?.length) {
    const children: (Paragraph | Table)[] = [];
    data.administrativeTemplates.forEach((template) => {
      children.push(
        new Paragraph({ text: template.displayName || "Administrative Template", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(template.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      const defs = parseAdministrativeTemplate(template.definitionValues || []);
      const rows: TableRow[] = [
        new TableRow({
          children: ["Setting", "State", "Value", "Category"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
      ];
      defs.forEach((d) => {
        rows.push(
          new TableRow({
            children: [d.name, d.state, d.value, d.category].map((t) =>
              new TableCell({ children: [new Paragraph(String(t))] })
            ),
          })
        );
      });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    });
    addSection("Administrative Templates", children);
  }

  // Compliance Policies
  if (data.compliancePolicies?.length) {
    const children: (Paragraph | Table)[] = [];
    data.compliancePolicies.forEach((policy) => {
      children.push(
        new Paragraph({ text: policy.displayName || "Compliance Policy", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(policy.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      const rules = parseComplianceRules(policy);
      const rows: TableRow[] = [
        new TableRow({
          children: ["Category", "Rule", "Value", "Action"].map((h) =>
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
          ),
        }),
      ];
      rules.forEach((r) => {
        rows.push(
          new TableRow({
            children: [r.category, r.rule, r.value, r.action].map((t) =>
              new TableCell({ children: [new Paragraph(String(t))] })
            ),
          })
        );
      });
      children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
    });
    addSection("Compliance Policies", children);
  }

  // Security Baselines
  if (data.securityBaselines?.length) {
    const children: (Paragraph | Table)[] = [];
    data.securityBaselines.forEach((baseline) => {
      children.push(
        new Paragraph({ text: baseline.displayName || "Security Baseline", heading: HeadingLevel.HEADING_2 })
      );
      const assn = enhanceAssignmentText(
        parseAssignments(baseline.assignments),
        data.groupNames
      );
      children.push(new Paragraph({ text: `Assignments: ${assn}` }));

      const cats = parseSecurityBaseline(baseline.categories || []);
      cats.forEach((cat) => {
        children.push(new Paragraph({ text: cat.category, heading: HeadingLevel.HEADING_3 }));
        const rows: TableRow[] = [
          new TableRow({
            children: ["Setting", "Value", "Description"].map((h) =>
              new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] })
            ),
          }),
        ];
        cat.settings.forEach((s) => {
          rows.push(
            new TableRow({
              children: [s.name, s.value, s.description || ""].map((t) =>
                new TableCell({ children: [new Paragraph(String(t))] })
              ),
            })
          );
        });
        children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
      });
    });
    addSection("Security Baselines", children);
  }

  // Scripts
  const scriptsCount = (data.scripts?.windows?.length || 0) + (data.scripts?.macOS?.length || 0);
  if (scriptsCount > 0) {
    const children: Paragraph[] = [];
    if (data.scripts?.windows?.length) {
      children.push(new Paragraph({ text: "Windows Scripts", heading: HeadingLevel.HEADING_2 }));
      data.scripts.windows.forEach((s: any) => {
        children.push(new Paragraph({ text: s.displayName || "Windows Script", heading: HeadingLevel.HEADING_3 }));
        if (s.description) children.push(new Paragraph({ text: s.description }));
      });
    }
    if (data.scripts?.macOS?.length) {
      children.push(new Paragraph({ text: "macOS Scripts", heading: HeadingLevel.HEADING_2 }));
      data.scripts.macOS.forEach((s: any) => {
        children.push(new Paragraph({ text: s.displayName || "macOS Script", heading: HeadingLevel.HEADING_3 }));
        if (s.description) children.push(new Paragraph({ text: s.description }));
      });
    }
    addSection("Scripts", children);
  }

  // Optional sections - simple listing for now
  const simpleListSection = (title: string, items?: any[]) => {
    if (!items || items.length === 0) return;
    const children: Paragraph[] = [];
    items.forEach((i) => {
      children.push(new Paragraph({ text: i.displayName || i.name || "Item", bullet: { level: 0 } }));
    });
    addSection(title, children);
  };
  simpleListSection("App Configurations", data.appConfigurations);
  simpleListSection("Windows Update Policies", data.windowsUpdatePolicies);
  simpleListSection("Enrollment Configurations", data.enrollmentConfigurations);
  simpleListSection("Conditional Access Policies", data.conditionalAccessPolicies);

  const buffer = await Packer.toBuffer(doc);
  return new Uint8Array(buffer);
}

