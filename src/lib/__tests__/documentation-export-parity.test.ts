import { DOMParser } from "@xmldom/xmldom";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { BrandingOptions } from "~/types/branding";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import { headerLogoSize } from "../docx-design";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import {
  DOCUMENT_PRODUCT_LINE,
  DOCUMENT_SOURCE_NOTE,
  formatDocumentDate,
} from "../documentation-glance";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { readPdfPageTexts } from "./helpers/pdf-outline";

// The same option gives the same result in the PDF and the Word export.

const RENDER_DATE = new Date("2026-10-21T09:00:00Z");
// A valid 2x2 PNG; jsPDF verifies the PNG checksum.
const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNgSDvDsCyIgcE47f///wAekQXBjgK93AAAAABJRU5ErkJggg==";
const PT_PER_MM = 72 / 25.4;

const EMPTY: DetailedExportData = {
  settingsCatalog: [],
  deviceConfigurations: [],
  administrativeTemplates: [],
  compliancePolicies: [],
  securityBaselines: [],
  scripts: { windows: [], macOS: [] },
  includeComplianceEvidence: false,
};

function contoso(branding?: BrandingOptions): DetailedExportData {
  return {
    ...structuredClone(CONTOSO_TENANT),
    tenantLabel: "ffc10f05...",
    ...(branding ? { branding } : {}),
  };
}

/** Text runs of each PDF page, unescaped, one per line. */
async function pdf(data: DetailedExportData) {
  const result = await generateDetailedPDF(data, {
    audience: "desktop",
    renderDate: RENDER_DATE,
  });
  const pages = readPdfPageTexts(result.buffer).map((page) =>
    [...page.matchAll(/\((.*?)\) Tj/g)]
      .map((match) => (match[1] ?? "").replace(/\\([()\\])/g, "$1"))
      .join("\n"),
  );
  return { pages, streams: readPdfPageTexts(result.buffer) };
}

const textContent = (xml: string | undefined) =>
  new DOMParser().parseFromString(xml ?? "<x/>", "text/xml").documentElement
    ?.textContent ?? "";

/** Body text, the cover table text and the header and footer parts. */
async function word(data: DetailedExportData) {
  const result = await generateDetailedDOCX(data, {
    audience: "desktop",
    renderDate: RENDER_DATE,
  });
  const archive = await JSZip.loadAsync(result.buffer);
  const xml = new Map<string, string>();
  for (const entry of Object.values(archive.files))
    if (!entry.dir && entry.name.endsWith(".xml"))
      xml.set(entry.name, await entry.async("string"));
  const documentXml = xml.get("word/document.xml") ?? "";
  const document = new DOMParser().parseFromString(documentXml, "text/xml");
  const cover = document.getElementsByTagName("w:tbl")[0];
  const partsOf = (kind: string) =>
    [...xml].filter(([name]) =>
      new RegExp(`^word/${kind}\\d*\\.xml$`).test(name),
    );
  return {
    text: document.documentElement?.textContent ?? "",
    cover: cover?.textContent ?? "",
    footers: partsOf("footer").map(([, content]) => textContent(content)),
    headers: partsOf("header").map(([, content]) => content),
  };
}

describe("documentation export parity", () => {
  it("leaves out the glance and the Executive Summary without analytics", async () => {
    const data = contoso({
      documentSettings: {
        includeAnalytics: false,
        includeTableOfContents: true,
        format: "detailed",
      },
    });
    const { pages } = await pdf(data);
    const pdfText = pages.join("\n");
    expect(pdfText).not.toContain("AT A GLANCE");
    expect(pdfText).not.toContain("Executive Summary");
    expect(pages[1]).toContain("Table of Contents");
    expect(pages[0]).toContain("DOCUMENT CONTROL");

    const { text } = await word(data);
    expect(text).not.toContain("At a glance");
    expect(text).not.toContain("Executive Summary");
    expect(text).toContain("Table of Contents");
  });

  it("leads a scoped cover with Configuration Documentation", async () => {
    const data: DetailedExportData = {
      ...contoso({ coverPage: { enabled: true, subtitle: "Custom tagline" } }),
      documentScope: {
        title: "Win Ring 3",
        subtitle: "Settings Catalog",
        compact: true,
      },
    };
    const [cover = ""] = (await pdf(data)).pages;
    expect(cover).toContain("Settings Catalog");
    expect(cover).toContain("Configuration Documentation");
    expect(cover).not.toContain("Custom tagline");

    const { cover: wordCover } = await word(data);
    expect(wordCover).toContain("Settings Catalog");
    expect(wordCover).toContain("Configuration Documentation");
    expect(wordCover).not.toContain("Custom tagline");
  });

  it("shows the confidentiality notice and the product line in the cover footer", async () => {
    const notice = "Restricted to the Fabrikam audit team";
    const data = contoso({
      footer: { enabled: true, confidentialityNotice: notice },
    });
    const [cover = "", content = ""] = (await pdf(data)).pages;
    for (const text of [notice, DOCUMENT_PRODUCT_LINE, DOCUMENT_SOURCE_NOTE])
      expect(cover).toContain(text);
    expect(content).toContain(notice);
    expect(content).toContain(DOCUMENT_PRODUCT_LINE);

    const { footers } = await word(data);
    expect(footers).toHaveLength(2);
    for (const footer of footers) {
      expect(footer).toContain(notice);
      expect(footer).toContain(DOCUMENT_PRODUCT_LINE);
    }
    expect(footers.join("\n")).toContain(DOCUMENT_SOURCE_NOTE);
  });

  it("names the metadata author before the cover author", async () => {
    const data = contoso({
      metadata: { author: "Metadata Author" },
      coverPage: { enabled: true, author: "Cover Author" },
    });
    const [cover = ""] = (await pdf(data)).pages;
    expect(cover).toContain("Metadata Author");
    expect(cover).not.toContain("Cover Author");
    const { cover: wordCover } = await word(data);
    expect(wordCover).toContain("Prepared byMetadata Author");
    expect(wordCover).not.toContain("Cover Author");
  });

  it("formats the cover and policy dates the same", async () => {
    const data = contoso();
    const created = data.settingsCatalog.find(
      (policy) => policy.createdDateTime,
    )?.createdDateTime;
    expect(created).toBeDefined();
    const expected = [
      "8 Oct 2026 · 09:00",
      "21 Oct 2026 · 09:00",
      `Created: ${formatDocumentDate(created, true)}`,
    ];
    const pdfText = (await pdf(data)).pages.join("\n");
    const { text } = await word(data);
    for (const value of expected) {
      expect(pdfText).toContain(value);
      expect(text).toContain(value);
    }
  });

  it("honours header.includeLogo with one header logo size", async () => {
    const logo = {
      dataUrl: LOGO_DATA_URL,
      position: "cover" as const,
      width: 60,
      height: 15,
    };
    const data = contoso({
      logo,
      header: { enabled: false, includeLogo: true },
    });
    const size = headerLogoSize(logo);
    expect(size).toEqual({ widthMm: 36, heightMm: 9 });

    const { streams } = await pdf(data);
    for (const page of streams.slice(1)) {
      const match = /([\d.]+) 0 0 ([\d.]+) [\d.]+ [\d.]+ cm\n\/I\d+ Do/.exec(
        page,
      );
      expect(Number(match?.[1]) / PT_PER_MM).toBeCloseTo(size.widthMm, 1);
      expect(Number(match?.[2]) / PT_PER_MM).toBeCloseTo(size.heightMm, 1);
    }

    const { headers } = await word(data);
    const extent = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(headers.join(""));
    expect(Number(extent?.[1]) / 36000).toBeCloseTo(size.widthMm, 1);
    expect(Number(extent?.[2]) / 36000).toBeCloseTo(size.heightMm, 1);
  });

  it("shows n/a, not 0%, when every assignment is unknown", async () => {
    const unknown = (id: string) => ({
      id,
      name: `Policy ${id}`,
      settings: [],
      assignments: [],
      collectionStatus: { assignments: "incomplete" as const },
    });
    const data: DetailedExportData = {
      ...EMPTY,
      settingsCatalog: [unknown("a"), unknown("b")],
    };
    const analytics = analyzeConfigurations(data, RENDER_DATE);
    expect(analytics.unknownAssignmentConfigs).toBe(2);
    expect(analytics.assignedConfigs + analytics.unassignedConfigs).toBe(0);

    const [cover = ""] = (await pdf(data)).pages;
    expect(cover.split("\n")).toContain("n/a");
    expect(cover).toContain("0 of 2 assignable");
    expect(cover).not.toContain("0%");

    const { text } = await word(data);
    expect(text).toContain("n/a");
    expect(text).toContain(
      "the assignments of 2 configurations could not be read",
    );
    expect(text).not.toContain("0%");
  });

  it("writes no spaced hyphen in generated enrollment and baseline labels", async () => {
    const restriction = {
      platformBlocked: false,
      personalDeviceEnrollmentBlocked: true,
      osMinimumVersion: "17.0",
      osMaximumVersion: "26.0",
    };
    // Names are tenant data and exempt; these contain no hyphen.
    const data: DetailedExportData = {
      ...EMPTY,
      enrollmentConfigurations: [
        {
          id: "restrictions",
          displayName: "Platform restrictions",
          "@odata.type":
            "#microsoft.graph.deviceEnrollmentPlatformRestrictionsConfiguration",
          priority: 1,
          limit: 5,
          iosRestriction: restriction,
          androidRestriction: restriction,
          windowsRestriction: restriction,
          macOSRestriction: restriction,
          platformRestrictions: {
            iosRestriction: restriction,
            androidForWorkRestriction: restriction,
            macOSRestriction: restriction,
            macRestriction: restriction,
          },
          assignments: [],
        },
      ],
      securityBaselines: [
        {
          id: "baseline",
          displayName: "Defender baseline",
          settings: [
            {
              definitionId:
                "device_vendor_msft_defender_configuration_enablenetworkprotection",
              valueJson: "true",
            },
          ],
          assignments: [],
        },
      ],
    };
    const pdfText = (await pdf(data)).pages.join("\n");
    expect(pdfText).toContain("iOS Personal Devices");
    expect(pdfText).not.toMatch(/ - /);
    const { text } = await word(data);
    expect(text).toContain("iOS: Personal Devices Blocked");
    expect(text).not.toMatch(/ - /);
  });
});
