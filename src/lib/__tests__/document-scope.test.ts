import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { estimatePdfPageCount } from "../pdf-page-estimate";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { readPdfPageTexts } from "./helpers/pdf-outline";
import { extractZipEntry } from "./helpers/zip";

const RING_GROUP = "0f6c3c52-6a4f-4c7c-9d0e-6f1f2b3c4d5e";

function policy(id: string, name: string, groupId: string) {
  return {
    id,
    name,
    description: `${name} description`,
    platforms: "windows10",
    technologies: "mdm",
    createdDateTime: "2026-01-02T10:00:00Z",
    lastModifiedDateTime: "2026-02-03T10:00:00Z",
    assignments: [
      {
        target: {
          "@odata.type": "#microsoft.graph.groupAssignmentTarget",
          groupId,
        },
      },
    ],
    settings: [],
  };
}

function exportData(
  documentScope?: DetailedExportData["documentScope"],
  items = [
    policy("ring-3", "Win - WUfB - Ring 3", RING_GROUP),
    policy("edge", "Edge baseline", "11111111-2222-3333-4444-555555555555"),
  ],
): DetailedExportData {
  return {
    settingsCatalog: items,
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
    groupNames: new Map([[RING_GROUP, "SG Ring 3 devices"]]),
    includeComplianceEvidence: false,
    ...(documentScope ? { documentScope } : {}),
  };
}

// The document text with jsPDF string escapes removed.
async function pdfPages(data: DetailedExportData): Promise<string[]> {
  const result = await generateDetailedPDF(data);
  return readPdfPageTexts(result.buffer).map((page) =>
    page.replace(/\\([()\\])/g, "$1"),
  );
}

async function docxText(data: DetailedExportData): Promise<string> {
  const result = await generateDetailedDOCX(data);
  return extractZipEntry(result.buffer, "word/document.xml");
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-23T10:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("detailed documents without a document scope", () => {
  it("keep the full PDF layout", async () => {
    const pages = await pdfPages(exportData());
    const text = pages.join("\n");
    expect(pages[0]).toContain("Microsoft Intune");
    expect(pages[0]).toContain(
      "Comprehensive export of Intune policies, profiles, and assignments",
    );
    expect(pages[1]).toContain("Table of Contents");
    expect(text).toContain("Executive Summary");
    expect(text).toContain("Configuration Inventory");
    expect(text).toContain("Win - WUfB - Ring 3");
    expect(text).toContain("Edge baseline");
  });

  it("render the same PDF pages as an empty scope", async () => {
    expect(await pdfPages(exportData({}))).toEqual(
      await pdfPages(exportData()),
    );
  });

  it("keep the full Word layout", async () => {
    const text = await docxText(exportData());
    expect(text).toContain("Microsoft Intune");
    expect(text).toContain("Table of Contents");
    expect(text).toContain("Executive Summary");
    expect(await docxText(exportData({}))).toEqual(text);
  });

  it("keep the page estimate", () => {
    const data = exportData();
    expect(estimatePdfPageCount({ ...data, documentScope: {} })).toEqual(
      estimatePdfPageCount(data),
    );
  });
});

describe("detailed documents with a compact document scope", () => {
  const scope = {
    title: "Win - WUfB - Ring 3",
    subtitle: "Settings Catalog",
    compact: true,
  };
  const single = () =>
    exportData(scope, [policy("ring-3", "Win - WUfB - Ring 3", RING_GROUP)]);

  it("title the PDF cover and go straight to the item", async () => {
    const pages = await pdfPages(single());
    const text = pages.join("\n");
    expect(pages[0]).toContain("Win - WUfB - Ring 3");
    expect(pages[0]).toContain("Settings Catalog");
    expect(pages[0]).not.toContain("Microsoft Intune");
    expect(text).not.toContain("Table of Contents");
    expect(text).not.toContain("Executive Summary");
    expect(text).not.toContain("Configuration Inventory");
    expect(text).not.toContain("Compliance Evidence");
    expect(text).not.toContain("Edge baseline");
    expect(pages[1]).toContain("Settings Catalog Policies");
    expect(pages[1]).toContain("SG Ring 3 devices");
  });

  it("title the Word cover and skip the summary", async () => {
    const text = await docxText(single());
    expect(text).toContain("Win - WUfB - Ring 3");
    expect(text).toContain("SG Ring 3 devices");
    expect(text).not.toContain("Microsoft Intune");
    expect(text).not.toContain("Table of Contents");
    expect(text).not.toContain("Executive Summary");
    expect(text).not.toContain("Compliance Evidence");
    expect(text).not.toContain("Edge baseline");
  });

  it("wrap a long PDF cover title to three lines", async () => {
    const title = `${"Very long configuration name ".repeat(8)}end`;
    const pages = await pdfPages(
      exportData({ ...scope, title }, [policy("long", title, RING_GROUP)]),
    );
    expect(pages[0]).toContain("...");
    expect(pages[0]).not.toContain("end)");
  });

  it("estimate only the cover as fixed pages", () => {
    const data = single();
    const full = estimatePdfPageCount({ ...data, documentScope: undefined });
    const compact = estimatePdfPageCount(data);
    expect(full.pages - compact.pages).toBe(3);
  });
});
