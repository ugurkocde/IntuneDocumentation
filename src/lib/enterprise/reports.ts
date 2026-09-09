import { jsPDF } from "jspdf";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";
import { type DetailedExportData } from "~/lib/configuration-analyzer";
import { generateDetailedPDF } from "~/lib/pdf-generator-detailed";
import { generateDetailedDOCX } from "~/lib/docx-generator-detailed";
import { exportSections } from "./collector";
import { type Snapshot } from "./domain";
export async function generateReport(
  snapshot: Snapshot,
  format: "pdf" | "docx",
  template: string,
  company: string,
  summary: {
    findings: number;
    changes: number;
    reviews: number;
    trend: string[];
  },
  brandColor?: string,
) {
  if (template === "detailed") {
    const sections = exportSections(snapshot);
    const values = (key: string) => snapshot.sections[key]?.data ?? [];
    const data: DetailedExportData = {
      collectedAt: snapshot.capturedAt,
      sections,
      settingsCatalog: values("settingsCatalog"),
      deviceConfigurations: values("deviceConfigurations"),
      administrativeTemplates: values("administrativeTemplates"),
      compliancePolicies: values("compliancePolicies"),
      securityBaselines: values("securityBaselines"),
      scripts: {
        windows: values("windowsScripts"),
        macOS: values("macOSScripts"),
      },
      branding: {
        companyName: company,
        colors: {
          primary: brandColor ?? "#136c55",
          secondary: brandColor ?? "#136c55",
          accent: "#b1dc7c",
          text: "#18352b",
        },
      },
      fetchErrors: sections
        .filter((s) => s.error)
        .map((s) => ({
          policyId: s.key,
          policyName: s.label,
          policyType: s.label,
          familyKey: s.familyKey,
          error: s.error!.message,
          partial: true,
        })),
    };
    return format === "pdf"
      ? generateDetailedPDF(data)
      : generateDetailedDOCX(data);
  }
  const incomplete = Object.entries(snapshot.sections)
    .filter(([, s]) => s.status !== "complete")
    .map(([key]) => key);
  const lines = [
    company,
    template === "qbr"
      ? "Quarterly configuration review"
      : "Executive configuration report",
    `Evidence captured: ${snapshot.capturedAt}`,
    `Policies documented: ${Object.values(snapshot.sections).reduce((n, s) => n + s.data.length, 0)}`,
    `Findings recorded for this snapshot: ${summary.findings}`,
    `Configuration changes: ${summary.changes}`,
    `Sign-offs recorded at report generation: ${summary.reviews}`,
    "Collection coverage",
    incomplete.length
      ? `Incomplete sections: ${incomplete.join(", ")}`
      : "All requested sections completed.",
    "History",
    ...summary.trend,
    "Interpretation",
    "This report documents configured policies. It is not certification, proof of operational controls, or effective device compliance. Missing access remains unknown. Change discovery time does not establish who made a change.",
    "Next review",
    "Review open findings, validate approved exceptions, and confirm the next baseline with the customer.",
  ];
  if (format === "docx") {
    const doc = new Document({
      sections: [
        {
          children: lines.map(
            (line, index) =>
              new Paragraph({
                heading: index === 1 ? HeadingLevel.TITLE : undefined,
                children: [new TextRun(line)],
              }),
          ),
        },
      ],
    });
    return {
      buffer: new Uint8Array(await Packer.toBuffer(doc)),
      errors: [],
      totalPolicies: 0,
      successfulPolicies: 0,
    };
  }
  const doc = new jsPDF();
  let y = 24;
  for (const [index, line] of lines.entries()) {
    doc.setFontSize(index === 1 ? 20 : 11);
    const wrapped = doc.splitTextToSize(line, 175) as string[];
    for (const part of wrapped) {
      if (y > 275) {
        doc.addPage();
        y = 24;
      }
      doc.text(part, 18, y);
      y += 7;
    }
    y += 4;
  }
  return {
    buffer: new Uint8Array(doc.output("arraybuffer")),
    errors: [],
    totalPolicies: 0,
    successfulPolicies: 0,
  };
}
