import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { defenderForEndpointPolicyFixture } from "./fixtures/intune-beta";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

function createExportData(): DetailedExportData {
  const policy = structuredClone(defenderForEndpointPolicyFixture);

  return {
    settingsCatalog: [policy],
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
  };
}

describe("Defender policy exports", () => {
  it("renders a Defender-managed policy through the ordinary PDF policy path", async () => {
    const result = await generateDetailedPDF(createExportData());
    const renderedText = extractPdfStreamText(result.buffer);

    expect(Buffer.from(result.buffer).subarray(0, 4).toString()).toBe("%PDF");
    expect(renderedText).toContain("Settings Catalog Policies");
    expect(renderedText).toContain("Endpoint antivirus policy");
    expect(renderedText).toContain("Excluded file extensions");
    expect(renderedText).toContain(".sample");
    expect(renderedText).not.toContain("Defender for Endpoint Policies");
    expect(result.errors).toEqual([]);
    expect(result.totalPolicies).toBe(1);
    expect(result.successfulPolicies).toBe(1);
  });

  it("includes the compliance evidence preview section in the PDF", async () => {
    const result = await generateDetailedPDF(createExportData());
    const renderedText = extractPdfStreamText(result.buffer);

    expect(renderedText).toContain("Compliance Evidence Preview");
    expect(renderedText).toContain("BSI IT-Grundschutz");
    expect(renderedText).toContain("not a compliance certi");
    expect(renderedText).toContain("intunedocumentation.com/dashboard");
    // The exclusions-only Defender fixture must not produce evidence claims.
    expect(renderedText).not.toContain("Evidence found");
    expect(renderedText).toContain("Rev. 2");
    expect(renderedText).toContain("Rev. 3");
    expect(renderedText).toContain("12 of 110 published requirements");
    expect(renderedText).toContain("11 of 97 published requirements");
  });

  it.each(["PDF", "Word"])(
    "omits the compliance evidence preview from the %s export when disabled",
    async (format) => {
      const data = createExportData();
      data.includeComplianceEvidence = false;
      const result =
        format === "PDF"
          ? await generateDetailedPDF(data)
          : await generateDetailedDOCX(data);
      const text =
        format === "PDF"
          ? extractPdfStreamText(result.buffer)
          : extractZipEntry(result.buffer, "word/document.xml");

      expect(text).not.toContain("Compliance Evidence Preview");
      expect(text).not.toContain("BSI IT-Grundschutz");
      expect(result.errors).toEqual([]);
    },
  );

  it("renders a Defender-managed policy through the ordinary Word policy path", async () => {
    const result = await generateDetailedDOCX(createExportData());
    const documentXml = extractZipEntry(result.buffer, "word/document.xml");

    expect([...result.buffer.subarray(0, 4)]).toEqual([80, 75, 3, 4]);
    expect(documentXml).toContain("Settings Catalog Policies");
    expect(documentXml).toContain("Endpoint antivirus policy");
    expect(documentXml).toContain("Excluded file extensions");
    expect(documentXml).toContain(".sample");
    expect(documentXml).not.toContain("Defender for Endpoint Policies");
    expect(result.errors).toEqual([]);
    expect(result.totalPolicies).toBe(1);
    expect(result.successfulPolicies).toBe(1);
  });

  it("includes the compliance evidence preview section in the Word export", async () => {
    const result = await generateDetailedDOCX(createExportData());
    const documentXml = extractZipEntry(result.buffer, "word/document.xml");

    expect(documentXml).toContain("Compliance Evidence Preview");
    expect(documentXml).toContain("Rev. 2");
    expect(documentXml).toContain("Rev. 3");
    expect(documentXml).toContain("12 of 110 published requirements");
    expect(documentXml).toContain("11 of 97 published requirements");
    expect(documentXml).toContain("BSI IT-Grundschutz");
    expect(documentXml).toContain("not a compliance certification");
    expect(documentXml).toContain("intunedocumentation.com/dashboard");
    // The exclusions-only Defender fixture must not produce evidence claims.
    expect(documentXml).not.toContain(">Configuration evidence<");
  });
});

it.each(["PDF", "Word"])(
  "preserves parsed baseline and list values in %s output",
  async (format) => {
    const data = createExportData();
    data.settingsCatalog = [];
    data.securityBaselines = [
      {
        id: "baseline",
        displayName: "Baseline example",
        settings: [
          { definitionId: "sample", valueJson: '"baseline-value-example"' },
        ],
        categories: [{ id: "category", displayName: "Security" }],
        assignments: [],
        collectionStatus: { assignments: "incomplete" },
      },
    ] as any;
    data.administrativeTemplates = [
      {
        id: "template",
        displayName: "List example",
        assignments: [],
        definitionValues: [
          {
            enabled: true,
            definition: { displayName: "Sites" },
            presentationValues: [
              { values: [{ name: "Site", value: "list-value-example" }] },
            ],
          },
        ],
      },
    ] as any;
    const result =
      format === "PDF"
        ? await generateDetailedPDF(data)
        : await generateDetailedDOCX(data);
    const text =
      format === "PDF"
        ? extractPdfStreamText(result.buffer)
        : extractZipEntry(result.buffer, "word/document.xml");
    expect(text).toContain("baseline-value-example");
    expect(text).toContain("list-value-example");
    expect(text).toContain("Assignments unavailable");
    expect(result.errors).toEqual([]);
  },
);

it.each(["PDF", "Word"])(
  "carries Essential Eight Level 3 into the full %s preview",
  async (format) => {
    const data = createExportData();
    data.assessmentScope = { essentialEightMaturityLevel: 3 };
    const result =
      format === "PDF"
        ? await generateDetailedPDF(data)
        : await generateDetailedDOCX(data);
    const text =
      format === "PDF"
        ? extractPdfStreamText(result.buffer)
        : extractZipEntry(result.buffer, "word/document.xml");
    expect(text).toContain("target Maturity Level 3");
    expect(text).toContain("149 published requirement entries");
    expect(text).toContain(
      "Application control is implemented on workstations.",
    );
    expect(text).not.toContain(
      "Application control is implemented on internet-facing servers.",
    );
    expect(text).not.toContain("target Maturity Level 1");
    expect(result.errors).toEqual([]);
  },
);

it("provides populated Word contents links with valid section bookmarks", async () => {
  const result = await generateDetailedDOCX(createExportData());
  const xml = extractZipEntry(result.buffer, "word/document.xml");
  const anchors = [...xml.matchAll(/w:hyperlink[^>]*w:anchor="([^"]+)"/g)].map(
    (match) => match[1],
  );
  expect(anchors.length).toBeGreaterThan(1);
  for (const anchor of anchors) expect(xml).toContain(`w:name="${anchor}"`);
  expect(new Set(anchors).size).toBe(anchors.length);
  expect(xml).not.toContain("Update Field");
  expect(extractZipEntry(result.buffer, "word/settings.xml")).not.toContain(
    "w:updateFields",
  );
  expect(xml).not.toMatch(/w:instrText[^>]*>\s*TOC/);
});

it.each(["PDF", "Word"])(
  "reports unavailable assignments separately in the full %s summary",
  async (format) => {
    const data = createExportData();
    data.settingsCatalog = [
      {
        id: "unknown",
        name: "Unreadable policy",
        settings: [],
        assignments: [],
        collectionStatus: { assignments: "incomplete" },
      },
    ];
    const result =
      format === "PDF"
        ? await generateDetailedPDF(data)
        : await generateDetailedDOCX(data);
    const text =
      format === "PDF"
        ? extractPdfStreamText(result.buffer)
        : extractZipEntry(result.buffer, "word/document.xml");
    expect(text).toContain("Unknown");
    expect(text).not.toContain("have no group assignment");
    expect(text).toContain("Assignments unavailable");
  },
);
