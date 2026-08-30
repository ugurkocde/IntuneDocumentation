import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";
import type { DetailedExportData } from "../configuration-analyzer";
import { generateDetailedDOCX } from "../docx-generator-detailed";
import { generateDetailedPDF } from "../pdf-generator-detailed";
import { defenderForEndpointPolicyFixture } from "./fixtures/intune-beta";
import { extractPdfStreamText } from "./helpers/pdf-text";

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

function extractZipEntry(bytes: Uint8Array, targetName: string): string {
  const archive = Buffer.from(bytes);
  const endOfCentralDirectory = archive.lastIndexOf(
    Buffer.from([0x50, 0x4b, 0x05, 0x06]),
  );
  if (endOfCentralDirectory < 0) throw new Error("ZIP directory not found");

  const entryCount = archive.readUInt16LE(endOfCentralDirectory + 10);
  let directoryOffset = archive.readUInt32LE(endOfCentralDirectory + 16);

  for (let index = 0; index < entryCount; index++) {
    if (archive.readUInt32LE(directoryOffset) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory entry");
    }

    const compressionMethod = archive.readUInt16LE(directoryOffset + 10);
    const compressedSize = archive.readUInt32LE(directoryOffset + 20);
    const fileNameLength = archive.readUInt16LE(directoryOffset + 28);
    const extraLength = archive.readUInt16LE(directoryOffset + 30);
    const commentLength = archive.readUInt16LE(directoryOffset + 32);
    const localHeaderOffset = archive.readUInt32LE(directoryOffset + 42);
    const fileName = archive
      .subarray(directoryOffset + 46, directoryOffset + 46 + fileNameLength)
      .toString("utf8");

    if (fileName === targetName) {
      if (archive.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
        throw new Error("Invalid ZIP local file header");
      }
      const localFileNameLength = archive.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = archive.readUInt16LE(localHeaderOffset + 28);
      const dataOffset =
        localHeaderOffset + 30 + localFileNameLength + localExtraLength;
      const compressed = archive.subarray(
        dataOffset,
        dataOffset + compressedSize,
      );

      if (compressionMethod === 0) return compressed.toString("utf8");
      if (compressionMethod === 8) {
        return inflateRawSync(compressed).toString("utf8");
      }
      throw new Error(
        `Unsupported ZIP compression method: ${compressionMethod}`,
      );
    }

    directoryOffset += 46 + fileNameLength + extraLength + commentLength;
  }

  throw new Error(`ZIP entry not found: ${targetName}`);
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
  });

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
    expect(documentXml).toContain("BSI IT-Grundschutz");
    expect(documentXml).toContain("not a compliance certification");
    expect(documentXml).toContain("intunedocumentation.com/dashboard");
    // The exclusions-only Defender fixture must not produce evidence claims.
    expect(documentXml).not.toContain(">Configuration evidence<");
  });
});
