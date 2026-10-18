import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCapabilities,
  assessCompliance,
  DORA,
  DORA_OUTSIDE_INTUNE_SCOPE,
  DORA_SOURCE_ATTRIBUTION,
  isDesktopOnlyFramework,
} from "../compliance";
import { createEvidenceManifest } from "../compliance/manifest";
import {
  complianceReportFileName,
  generateComplianceReportPDF,
} from "../compliance/report-pdf";
import { SAMPLE_REPORTS } from "../compliance/samples";
import { extractPdfStreamText } from "./helpers/pdf-text";

function data(...compliancePolicies: unknown[]): DetailedExportData {
  return {
    collectedAt: "2026-10-18T00:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies,
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  } as DetailedExportData;
}

const macLock = {
  id: "mac-compliance",
  displayName: "MAC - Compliance",
  "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
  passwordMinutesOfInactivityBeforeLock: 5,
  assignments: [
    {
      target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
    },
  ],
};

function dora(exportData: DetailedExportData) {
  return assessCompliance(exportData).frameworks.find(
    (framework) => framework.framework.id === "dora-2022-2554",
  )!;
}

describe("DORA and RTS (EU) 2024/1774", () => {
  it("lists supporting controls, each with unassessed aspects", () => {
    expect(DORA.id).toBe("dora-2022-2554");
    expect(DORA.totalRequirements).toBeUndefined();
    for (const control of Object.values(DORA.controls)) {
      expect(control.evidenceStrength).toBe("supporting");
      expect(control.granularity).toBe("requirement");
      expect(control.unassessedAspects?.length).toBeGreaterThan(0);
      expect(control.id).toMatch(/^(DORA|RTS) \d+(\([0-9a-z]+\))+$/);
      expect(control.title.length).toBeLessThan(70);
    }
    // Art. 9(2) holds the data protection duty; 9(3) is about transfers.
    expect(DORA.controls["DORA 9(2)"]).toBeDefined();
    expect(DORA.controls["DORA 9(3)(a)"]).toBeUndefined();
    expect(Object.keys(DORA.controls)).toEqual(
      expect.arrayContaining([
        "DORA 9(4)(c)",
        "DORA 9(4)(d)",
        "DORA 9(4)(f)",
        "DORA 10(1)",
        "RTS 6(2)(a)",
        "RTS 10(4)(c)",
        "RTS 11(2)(b)",
        "RTS 11(2)(c)",
        "RTS 11(2)(d)",
        "RTS 13(d)",
        "RTS 13(l)",
        "RTS 21(e)(ii)",
        "RTS 21(f)(ii)",
      ]),
    );
  });

  it("names EUR-Lex as the source and the Official Journal as authentic", () => {
    expect(DORA_SOURCE_ATTRIBUTION).toBe(
      "Source: EUR-Lex, Regulation (EU) 2022/2554 and Commission Delegated Regulation (EU) 2024/1774. Titles paraphrased; only the Official Journal text is authentic.",
    );
    expect(DORA.note).toContain(DORA_SOURCE_ATTRIBUTION);
    expect(DORA.source?.url).toBe(
      "https://eur-lex.europa.eu/eli/reg/2022/2554/oj",
    );
  });

  it("maps only real capabilities and covers every capability", () => {
    const capabilityIds = new Set(
      assessCapabilities(data()).map((row) => row.capability.id),
    );
    expect(Object.keys(DORA.mappings).sort()).toEqual(
      [...capabilityIds].sort(),
    );
    const used = new Set(Object.values(DORA.mappings).flat());
    for (const controlId of used)
      expect(DORA.controls[controlId]).toBeDefined();
    // Every listed control is backed by at least one mapping.
    for (const controlId of Object.keys(DORA.controls))
      expect(used.has(controlId), controlId).toBe(true);
    expect(DORA.mappings["windows-inactivity-lock"]).toContain("RTS 13(l)");
    expect(DORA.mappings["tenant-compliant-device-required"]).toContain(
      "RTS 13(d)",
    );
    expect(DORA.mappings["tenant-phishing-resistant-method-enabled"]).toContain(
      "RTS 21(f)(ii)",
    );
    // A minimum version is not patch deployment.
    expect(DORA.mappings["windows-minimum-os-version"]).toEqual([]);
  });

  it("names organisational provisions as outside Intune scope", () => {
    const ids = DORA_OUTSIDE_INTUNE_SCOPE.map((measure) => measure.id);
    expect(ids).toEqual([
      "DORA 5",
      "DORA 6",
      "DORA 8",
      "DORA 11 to 14",
      "DORA 17 to 23",
      "DORA 24 to 27",
      "DORA 28 to 30",
      "DORA 45",
    ]);
    for (const measure of DORA_OUTSIDE_INTUNE_SCOPE) {
      expect(measure.title.en).not.toBe("");
      expect(measure.title.de).not.toBe("");
      expect(DORA.controls[measure.id]).toBeUndefined();
    }
  });

  it("reports a configured session lock as partial supporting evidence", () => {
    const control = dora(data(macLock)).controls.find(
      (item) => item.control.id === "RTS 13(l)",
    )!;
    expect(control.status).toBe("partialEvidence");
    expect(control.enforcedCapabilityIds).toEqual(["macos-inactivity-lock"]);
    expect(
      dora(data()).controls.find((item) => item.control.id === "RTS 13(l)")
        ?.status,
    ).toBe("noEvidence");
  });

  it("renders the framework report in English with the attribution", async () => {
    const text = extractPdfStreamText(
      await generateComplianceReportPDF(data(macLock), {
        frameworkId: "dora-2022-2554",
      }),
    );
    expect(complianceReportFileName("dora-2022-2554")).toContain("DORA");
    // PDF text strings escape parentheses.
    expect(text).toContain("RTS 13\\(l\\)");
    expect(text).toContain("Session lock after inactivity");
    expect(text).toContain("Official Journal");
  });

  it("is desktop only: absent from the web evidence record, present on desktop", async () => {
    expect(isDesktopOnlyFramework("dora-2022-2554")).toBe(true);
    expect(isDesktopOnlyFramework("nis2-2022-2555")).toBe(true);
    expect(isDesktopOnlyFramework("iso-27001-2022")).toBe(false);
    expect(
      SAMPLE_REPORTS.find((sample) => sample.frameworkId === "dora-2022-2554")
        ?.desktopOnly,
    ).toBe(true);

    const desktop = await createEvidenceManifest(data(macLock));
    const web = await createEvidenceManifest(data(macLock), undefined, {
      audience: "web",
    });
    const ids = (manifest: typeof desktop) =>
      manifest.assessment.frameworks.map((framework) => framework.framework.id);
    expect(ids(desktop)).toContain("dora-2022-2554");
    expect(ids(desktop)).toContain("nis2-2022-2555");
    expect(ids(web)).not.toContain("dora-2022-2554");
    expect(ids(web)).not.toContain("nis2-2022-2555");
    expect(ids(web)).toEqual(
      ids(desktop).filter((id) => !isDesktopOnlyFramework(id)),
    );
    // The ruleset and snapshot fingerprints do not depend on the audience.
    expect(web.rulesetSha256).toBe(desktop.rulesetSha256);
    expect(web.snapshotSha256).toBe(desktop.snapshotSha256);
    expect(JSON.stringify(web.assessment)).not.toContain("dora-2022-2554");
  });
});
