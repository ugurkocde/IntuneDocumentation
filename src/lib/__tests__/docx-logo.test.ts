import { DOMParser } from "@xmldom/xmldom";
import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { extractZipEntry } from "./helpers/zip";

const LOGO_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";

describe("Word cover logos", () => {
  it.each([
    { name: "default", dimensions: {}, widthMm: 60, heightMm: 60 },
    {
      name: "custom",
      dimensions: { width: 60, height: 30 },
      widthMm: 60,
      heightMm: 30,
    },
  ])("preserves the $name logo's physical dimensions", async (options) => {
    const data: DetailedExportData = {
      settingsCatalog: [],
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
      includeComplianceEvidence: false,
      branding: {
        logo: {
          dataUrl: LOGO_DATA_URL,
          position: "cover",
          ...options.dimensions,
        },
      },
    };
    const result = await generateDetailedDOCX(data);
    const xml = extractZipEntry(result.buffer, "word/document.xml");
    const document = new DOMParser().parseFromString(xml, "text/xml");
    const extents = document.getElementsByTagNameNS(
      "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing",
      "extent",
    );

    expect(extents.length).toBe(1);
    // The exported OOXML uses 36,000 EMUs per millimeter.
    expect(Number(extents[0]?.getAttribute("cx"))).toBe(
      options.widthMm * 36000,
    );
    expect(Number(extents[0]?.getAttribute("cy"))).toBe(
      options.heightMm * 36000,
    );
    expect(xml).toContain("Microsoft Intune");
    expect(result.errors).toEqual([]);
  });
});
