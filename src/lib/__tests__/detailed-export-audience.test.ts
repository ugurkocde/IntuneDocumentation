import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { extractPdfStreamText } from "./helpers/pdf-text";
import { extractZipEntry } from "./helpers/zip";

function exportData(): DetailedExportData {
  return {
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
  };
}

async function previewText(
  format: string,
  audience?: "desktop" | "web",
): Promise<string> {
  const options = audience ? { audience } : undefined;
  const result =
    format === "PDF"
      ? await generateDetailedPDF(exportData(), options)
      : await generateDetailedDOCX(exportData(), options);
  const text =
    format === "PDF"
      ? extractPdfStreamText(result.buffer)
      : extractZipEntry(result.buffer, "word/document.xml");
  expect(text).toContain("Compliance Evidence Preview");
  expect(text).toContain("NCSC Cyber Essentials");
  return text;
}

describe("compliance evidence preview audience", () => {
  it.each(["PDF", "Word"])(
    "leaves NIS2 and DORA out of the web %s preview by default",
    async (format) => {
      const text = await previewText(format);
      expect(text).not.toContain("NIS2");
      expect(text).not.toContain("DORA");
    },
  );

  it.each(["PDF", "Word"])(
    "keeps NIS2 and DORA in the desktop %s preview",
    async (format) => {
      const text = await previewText(format, "desktop");
      expect(text).toContain("NIS2");
      expect(text).toContain("DORA");
    },
  );
});
