import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCapabilities,
  assessCompliance,
  NIS2,
  NIS2_OUTSIDE_INTUNE_SCOPE,
  nis2MeasureFromCode,
} from "../compliance";
import {
  complianceReportFileName,
  generateComplianceReportPDF,
} from "../compliance/report-pdf";
import { extractPdfStreamText } from "./helpers/pdf-text";

function data(...deviceConfigurations: unknown[]): DetailedExportData {
  return {
    collectedAt: "2026-10-01T00:00:00Z",
    settingsCatalog: [],
    deviceConfigurations,
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  } as DetailedExportData;
}

const bitLocker = {
  id: "endpoint-protection",
  displayName: "Endpoint protection",
  "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
  bitLockerEncryptDevice: true,
  assignments: [
    {
      target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
    },
  ],
};

const letters = "abcdefghij".split("");

function nis2(exportData: DetailedExportData) {
  return assessCompliance(exportData).frameworks.find(
    (framework) => framework.framework.id === "nis2-2022-2555",
  )!;
}

describe("NIS2 Art. 21(2)", () => {
  it("lists the ten published measures with national aliases", () => {
    expect(NIS2.totalRequirements).toBe(10);
    expect(Object.keys(NIS2.controls)).toEqual(
      letters.map((letter) => `21.2.${letter}`),
    );
    letters.forEach((letter, index) => {
      const control = NIS2.controls[`21.2.${letter}`]!;
      expect(control.evidenceStrength).toBe("supporting");
      expect(control.granularity).toBe("requirement");
      expect(control.aliases).toEqual([
        { scheme: "DK", id: `NIS2-loven § 6, stk. 1, nr. ${index + 1}` },
        { scheme: "DE", id: `§ 30 Abs. 2 Nr. ${index + 1} BSIG` },
      ]);
    });
  });

  it("maps only real capabilities and covers every capability", () => {
    const capabilityIds = new Set(
      assessCapabilities(data()).map((row) => row.capability.id),
    );
    expect(Object.keys(NIS2.mappings).sort()).toEqual(
      [...capabilityIds].sort(),
    );
    for (const controlIds of Object.values(NIS2.mappings))
      for (const controlId of controlIds)
        expect(NIS2.controls[controlId]).toBeDefined();
  });

  it("assesses only the measures with device-management evidence", () => {
    const framework = nis2(data());
    expect(framework.framework.totalRequirements).toBe(10);
    expect(framework.controls.map((control) => control.control.id)).toEqual([
      "21.2.b",
      "21.2.e",
      "21.2.g",
      "21.2.h",
      "21.2.i",
      "21.2.j",
    ]);
    expect(NIS2.mappings["tenant-mfa-required"]).toEqual(["21.2.j"]);
    expect(NIS2.mappings["windows-disk-encryption"]).toEqual(["21.2.h"]);
  });

  it("names exactly the unmapped measures as outside Intune scope", () => {
    const mapped = new Set(Object.values(NIS2.mappings).flat());
    const outside = NIS2_OUTSIDE_INTUNE_SCOPE.map((measure) => measure.id);
    expect(outside).toEqual(["21.2.a", "21.2.c", "21.2.d", "21.2.f"]);
    expect(outside).toEqual(
      Object.keys(NIS2.controls).filter((id) => !mapped.has(id)),
    );
    expect(outside).toHaveLength(NIS2.totalRequirements! - mapped.size);
    for (const measure of NIS2_OUTSIDE_INTUNE_SCOPE) {
      expect(measure.title.en).not.toBe("");
      expect(measure.title.de).not.toBe("");
    }
  });

  it("reports encryption evidence as supporting evidence for point (h)", () => {
    const control = nis2(data(bitLocker)).controls.find(
      (item) => item.control.id === "21.2.h",
    )!;
    expect(control.status).toBe("partialEvidence");
    expect(control.enforcedCapabilityIds).toEqual(["windows-disk-encryption"]);
  });

  it("renders the existing compliance report for NIS2", async () => {
    const text = extractPdfStreamText(
      await generateComplianceReportPDF(data(bitLocker), {
        frameworkId: "nis2-2022-2555",
      }),
    );
    expect(complianceReportFileName("nis2-2022-2555")).toContain("NIS2");
    expect(text).toContain("21.2.h");
    expect(text).not.toContain("21.2.a");
  });
});

describe("nis2MeasureFromCode", () => {
  it.each([
    ["21.2.j", "21.2.j"],
    ["21(2)(j)", "21.2.j"],
    ["Art. 21(2)(b)", "21.2.b"],
    ["j", "21.2.j"],
    ["(J)", "21.2.j"],
    [" (a) ", "21.2.a"],
    ["10B", "21.2.j"],
    ["1A", "21.2.a"],
    ["7", "21.2.g"],
    ["Nr. 10", "21.2.j"],
    ["nr. 8", "21.2.h"],
  ])("normalizes %s", (code, expected) => {
    expect(nis2MeasureFromCode(code)).toBe(expected);
  });

  it.each(["", "k", "11", "0", "21.2.k", "21.3.a", "8.1", "abc"])(
    "rejects %s",
    (code) => {
      expect(nis2MeasureFromCode(code)).toBeNull();
    },
  );
});
