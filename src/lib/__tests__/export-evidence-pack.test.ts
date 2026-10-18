import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { COMPLIANCE_DISCLAIMER, createEvidenceManifest } from "../compliance";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  buildEvidencePack,
  NO_PURVIEW_TEMPLATE,
  safeFileName,
} from "../compliance/export";
import { parseCsv } from "./helpers/export-sheet";

const SAFE_NAME = /^[A-Za-z0-9._-]+$/;
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\.|$)/i;
const reportPdf = new TextEncoder().encode("%PDF-1.4 placeholder");

async function pack(frameworkId: string, reportFileName: string) {
  const manifest = await createEvidenceManifest(CONTOSO_TENANT);
  const bytes = await buildEvidencePack(
    manifest.assessment,
    manifest,
    frameworkId,
    {
      reportPdf,
      reportFileName,
      tenant: "Müller GmbH",
      generatedAt: "2026-10-18T09:00:00Z",
    },
  );
  return { manifest, zip: await JSZip.loadAsync(bytes) };
}

describe("safeFileName", () => {
  it.each([
    [
      "Bericht Müller GmbH: Prüfung/2026?.pdf",
      "Bericht_Mueller_GmbH_Pruefung_2026.pdf",
    ],
    ["Straße Größe.json", "Strasse_Groesse.json"],
    ["Café résumé.PDF", "Cafe_resume.pdf"],
    ["CON.pdf", "_CON.pdf"],
    ["nul", "_nul"],
    ["lpt1.report.pdf", "_lpt1.report.pdf"],
    ['<>:"|?*.pdf', "file.pdf"],
    ["  trailing dots... .pdf", "trailing_dots.pdf"],
  ])("%j becomes %j", (input, expected) => {
    const name = safeFileName(input);
    expect(name).toBe(expected);
    expect(name).toMatch(SAFE_NAME);
  });
});

describe("buildEvidencePack", () => {
  it("holds the report PDF, the JSON record, index.csv and README.txt", async () => {
    const { manifest, zip } = await pack(
      "iso-27001-2022",
      "Compliance-Report-ISO-Müller GmbH-2026-10-18-0900.pdf",
    );
    const names = Object.keys(zip.files).sort();
    expect(names).toEqual(
      [
        "Compliance-Report-ISO-Mueller_GmbH-2026-10-18-0900.pdf",
        "README.txt",
        "evidence-record.json",
        "index.csv",
      ].sort(),
    );
    for (const name of names) {
      expect(name).toMatch(SAFE_NAME);
      expect(name).not.toMatch(RESERVED);
    }
    const pdfName = "Compliance-Report-ISO-Mueller_GmbH-2026-10-18-0900.pdf";
    expect(await zip.file(pdfName)!.async("uint8array")).toEqual(reportPdf);
    const record = JSON.parse(
      await zip.file("evidence-record.json")!.async("string"),
    );
    expect(record.snapshotSha256).toBe(manifest.snapshotSha256);
    expect(record.rulesetSha256).toBe(manifest.rulesetSha256);

    const framework = manifest.assessment.frameworks.find(
      (item) => item.framework.id === "iso-27001-2022",
    )!;
    const index = parseCsv(await zip.file("index.csv")!.async("string"));
    expect(index[0]).toEqual([
      "Framework",
      "Purview template",
      "Control ID",
      "Control title",
      "Status",
      "Assigned evidence",
      "Counter-evidence",
      "Evidence not assigned or unknown",
      "Where to find it",
      "Note",
    ]);
    expect(index).toHaveLength(framework.controls.length + 1);
    expect(index.slice(1).map((row) => row[2])).toEqual(
      framework.controls.map((control) => control.control.id),
    );
    for (const row of index.slice(1)) {
      expect(row[1]).toBe("ISO/IEC 27001:2022");
      for (const cell of row.slice(5, 8))
        expect(Number.isInteger(Number(cell))).toBe(true);
      expect(row[8]).toBe(`${pdfName}, section for control ${row[2]}`);
    }

    const readme = await zip.file("README.txt")!.async("string");
    for (const text of [
      "Evidence tab",
      "Add evidence, then Document",
      "Select Done",
      ".pdf and .zip",
      "as published by the regulation",
      "not a compliance verdict",
      COMPLIANCE_DISCLAIMER,
      `Ruleset version: ${manifest.assessment.provenance.rulesetVersion}`,
      `Collected at: ${manifest.assessment.provenance.collectedAt}`,
      "Scope: all supported platforms",
      "Template: ISO/IEC 27001:2022",
      manifest.snapshotSha256,
      "Müller GmbH",
    ])
      expect(readme).toContain(text);
    expect(readme).not.toMatch(/[\u2013\u2014]/);
  });

  it("states when Purview has no template", async () => {
    const { zip } = await pack("bsi-it-grundschutz", "Bericht.pdf");
    const index = parseCsv(await zip.file("index.csv")!.async("string"));
    expect(index.slice(1).every((row) => row[1] === NO_PURVIEW_TEMPLATE)).toBe(
      true,
    );
    expect(await zip.file("README.txt")!.async("string")).toContain(
      `${NO_PURVIEW_TEMPLATE}.`,
    );
  });

  it("rejects an unknown framework", async () => {
    const manifest = await createEvidenceManifest(CONTOSO_TENANT);
    await expect(
      buildEvidencePack(manifest.assessment, manifest, "unknown", {
        reportPdf,
        reportFileName: "x.pdf",
      }),
    ).rejects.toThrow("Unknown compliance framework");
  });

  it("throws for an assessed framework without Purview template data", async () => {
    const manifest = await createEvidenceManifest(CONTOSO_TENANT);
    const assessment = structuredClone(manifest.assessment);
    assessment.frameworks[0]!.framework.id = "custom-framework";
    await expect(
      buildEvidencePack(assessment, manifest, "custom-framework", {
        reportPdf,
        reportFileName: "x.pdf",
      }),
    ).rejects.toThrow("No Purview template mapping");
  });

  it("notes not assessed controls apart from controls without evidence", async () => {
    const incomplete = {
      ...CONTOSO_TENANT,
      collectionSkippedFamilies: ["settingsCatalog", "compliancePolicies"],
    };
    const statuses = new Set<string>();
    for (const [frameworkId, data] of [
      ["nis2-2022-2555", CONTOSO_TENANT],
      ["dora-2022-2554", CONTOSO_TENANT],
      ["essential-eight", CONTOSO_TENANT],
      ["iso-27001-2022", incomplete],
      ["nis2-2022-2555", incomplete],
    ] as const) {
      const manifest = await createEvidenceManifest(data);
      const zip = await JSZip.loadAsync(
        await buildEvidencePack(manifest.assessment, manifest, frameworkId, {
          reportPdf,
          reportFileName: "report.pdf",
        }),
      );
      const framework = manifest.assessment.frameworks.find(
        (item) => item.framework.id === frameworkId,
      )!;
      const rows = parseCsv(await zip.file("index.csv")!.async("string"));
      framework.controls.forEach((control, index) => {
        statuses.add(control.status);
        const note = rows[index + 1]![9]!;
        if (control.status === "notAssessed")
          expect(note).toContain("Not assessed, see the PDF for the reason.");
        if (control.status === "noEvidence")
          expect(note).toContain("No policy evidence found");
        else expect(note, frameworkId).not.toContain("No policy evidence");
      });
    }
    expect(statuses).toContain("notAssessed");
    expect(statuses).toContain("noEvidence");
  });
});
