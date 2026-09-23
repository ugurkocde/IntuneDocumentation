import { describe, expect, it, vi } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import * as manifest from "../compliance/manifest";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import type { ControlAssessment } from "../compliance/types";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import {
  readPdfOutline,
  readPdfPageTexts,
  type ParsedOutlineNode,
} from "./helpers/pdf-outline";

vi.mock("../compliance/manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof manifest>();
  return {
    ...actual,
    createEvidenceManifest: vi.fn(actual.createEvidenceManifest),
  };
});

const pad = (value: number) => String(value).padStart(2, "0");

function createExportData(additionalSections = 0): DetailedExportData {
  return {
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    includeComplianceEvidence: false,
    sections: Array.from({ length: additionalSections }, (_, index) => ({
      key: `additional-test-${index}`,
      familyKey: "test",
      label: `Additional section ${pad(index + 1)}`,
      selectionPrefix: `additional-test-${index}`,
      items: [
        {
          id: `item-${index}`,
          displayName: `Extra policy ${pad(index + 1)}`,
          enabled: true,
        },
      ],
    })),
  };
}

function flatten(nodes: readonly ParsedOutlineNode[]): ParsedOutlineNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

describe("detailed PDF with a multi page table of contents", () => {
  it("continues the contents directly after its first page and shifts every target", async () => {
    const result = await generateDetailedPDF(createExportData(40));
    const pages = readPdfPageTexts(result.buffer);
    const { outline, linkPages } = readPdfOutline(result.buffer);

    // Cover, two contents pages, then the tenant overview.
    expect(pages[0]).toContain("Configuration Documentation");
    expect(pages[1]).toContain("Table of Contents");
    expect(pages[1]).toContain("(Tenant Overview) Tj");
    expect(pages[2]).toContain("(Additional section 40) Tj");
    expect(pages[2]).not.toContain("Executive Summary");
    expect(pages[3]).toContain("Executive Summary");
    expect(outline[0]?.page).toBe(4);

    // Every bookmark and link opens the page that renders its section.
    const headingFor = (title: string) =>
      title === "Tenant Overview" ? "Executive Summary" : title;
    expect(outline).toHaveLength(41);
    for (const section of outline) {
      expect(section.page).toBeGreaterThan(3);
      expect(pages[(section.page ?? 0) - 1]).toContain(
        `(${headingFor(section.title)}) Tj`,
      );
      for (const policy of section.children) {
        expect(pages[(policy.page ?? 0) - 1]).toContain(`(${policy.title}) Tj`);
      }
    }
    expect(linkPages).toEqual(outline.map((section) => section.page));

    // The rendered contents numbers match the final page order.
    expect(pages[2]).toMatch(new RegExp(`\\(${outline[40]?.page}\\) Tj`));

    // Footers follow the final page order.
    pages.slice(1).forEach((text, index) => {
      expect(text).toContain(`(Page ${index + 2}) Tj`);
    });
  });

  it("keeps a single contents page when the entries fit", async () => {
    const result = await generateDetailedPDF(createExportData(3));
    const pages = readPdfPageTexts(result.buffer);
    const { outline } = readPdfOutline(result.buffer);

    expect(pages[1]).toContain("Table of Contents");
    expect(pages[2]).toContain("Executive Summary");
    expect(outline[0]?.page).toBe(3);
  });
});

describe("compliance report with a multi page table of contents", () => {
  it("continues the contents directly after its first page and shifts every target", async () => {
    const actual = await vi.importActual<typeof manifest>(
      "../compliance/manifest",
    );
    vi.mocked(manifest.createEvidenceManifest).mockImplementationOnce(
      async (...args) => {
        const result = await actual.createEvidenceManifest(...args);
        const framework = result.assessment.frameworks.find(
          (item) => item.framework.id === "nist-800-53-r5",
        );
        const syntheticControls: ControlAssessment[] = Array.from(
          { length: 60 },
          (_, index) => ({
            control: {
              id: `ZZ-${index + 1}`,
              title: `Synthetic control ${pad(index + 1)}`,
              summary: "Synthetic control used to lengthen the contents.",
            },
            capabilityIds: [],
            enforcedCapabilityIds: [],
            status: "noEvidence",
            unassessedAspects: [],
            excludedCapabilityIds: [],
          }),
        );
        framework?.controls.push(...syntheticControls);
        return result;
      },
    );

    const report = await generateComplianceReportPDF(createExportData(), {
      frameworkId: "nist-800-53-r5",
    });
    const pages = readPdfPageTexts(report);
    const { outline, linkPages } = readPdfOutline(report);
    const tocPages = pages
      .map((text, index) => (text.includes("Table of Contents") ? index : -1))
      .filter((index) => index >= 0);

    // Cover, the disclaimer page that opens the contents, one continuation
    // page, then the summary.
    expect(pages[0]).toContain("Technical Evidence Report");
    expect(tocPages).toEqual([1, 2]);
    expect(pages[3]).toContain("(Summary) Tj");
    expect(outline[0]?.page).toBe(4);

    // Every bookmark and link opens the page that renders its entry.
    const entries = flatten(outline);
    expect(entries.map((entry) => entry.title)).toContain(
      "ZZ-60 Synthetic control 60",
    );
    for (const entry of entries) {
      expect(entry.page).toBeGreaterThan(3);
      expect(pages[(entry.page ?? 0) - 1]).toContain(entry.title);
    }

    // Links follow the contents order, which lists sections and controls but
    // not the family bookmarks.
    const families = new Set(
      outline.flatMap((section) =>
        section.children.filter((child) => child.children.length > 0),
      ),
    );
    expect(linkPages).toEqual(
      entries
        .filter((entry) => !families.has(entry))
        .map((entry) => entry.page),
    );

    pages.slice(1).forEach((text, index) => {
      expect(text).toContain(`Page ${index + 2} of ${pages.length}`);
    });
  });
});
