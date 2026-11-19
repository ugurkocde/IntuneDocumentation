import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCapabilities,
  assessCompliance,
  isDesktopOnlyFramework,
  NCA_ECC,
  NCA_ECC_OUTSIDE_INTUNE_SCOPE,
  NCA_ECC_REQUIREMENT_IDS,
  NCA_ECC_SOURCE_ATTRIBUTION,
} from "../compliance";
import { purviewTemplateFor } from "../compliance/export";
import { createEvidenceManifest } from "../compliance/manifest";
import {
  complianceReportFileName,
  generateComplianceReportPDF,
} from "../compliance/report-pdf";
import { SAMPLE_REPORTS } from "../compliance/samples";
import { extractPdfStreamText } from "./helpers/pdf-text";

function data(...compliancePolicies: unknown[]): DetailedExportData {
  return {
    collectedAt: "2026-11-19T00:00:00Z",
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

function ecc(exportData: DetailedExportData) {
  return assessCompliance(exportData).frameworks.find(
    (framework) => framework.framework.id === "nca-ecc-2-2024",
  )!;
}

const CONTROL_IDS = [
  "ECC 2-2-3-2",
  "ECC 2-2-3-4",
  "ECC 2-3-2",
  "ECC 2-3-3-1",
  "ECC 2-3-3-3",
  "ECC 2-6-3-1",
  "ECC 2-6-3-2",
  "ECC 2-8-3-3",
  "ECC 2-10-3-4",
  "ECC 2-12-3-1",
];

// Short phrases of the English ECC-2:2024 text. Titles and summaries are our
// own paraphrases, so none of them may appear in shipped text.
const NCA_PHRASES = [
  "shall be implemented",
  "as a minimum",
  "Bring Your Own Device",
  "Need-to-Know",
  "privileged access management",
  "impact assessment of authentication failure",
  "modern and advanced protection technologies",
  "patch management for systems, applications, and devices",
  "separation and encryption of the entity",
  "controlled and restricted use based on",
  "activation of cybersecurity event logs",
  "before being applied",
  "encryption of data in-transit and at-rest",
];

describe("NCA Essential Cybersecurity Controls (ECC-2:2024)", () => {
  it("lists supporting controls, each with unassessed aspects", () => {
    expect(NCA_ECC.id).toBe("nca-ecc-2-2024");
    expect(NCA_ECC.name).toBe("NCA ECC");
    expect(NCA_ECC.version).toBe("ECC-2:2024");
    expect(Object.keys(NCA_ECC.controls)).toEqual(CONTROL_IDS);
    for (const control of Object.values(NCA_ECC.controls)) {
      expect(control.evidenceStrength).toBe("supporting");
      expect(control.granularity).toBe(
        control.id === "ECC 2-3-2" ? "theme" : "requirement",
      );
      expect(control.unassessedAspects).toHaveLength(1);
      expect(control.id).toMatch(/^ECC [1-4](-\d+){2,3}$/);
      expect(control.title.length).toBeLessThan(70);
      expect(NCA_ECC_REQUIREMENT_IDS).toContain(control.id);
    }
  });

  it("counts 108 main controls and 92 subcontrols", () => {
    expect(NCA_ECC.totalRequirements).toBe(200);
    expect(new Set(NCA_ECC_REQUIREMENT_IDS).size).toBe(200);
    const depth = (id: string) => id.split("-").length;
    expect(
      NCA_ECC_REQUIREMENT_IDS.filter((id) => depth(id) === 3),
    ).toHaveLength(108);
    expect(
      NCA_ECC_REQUIREMENT_IDS.filter((id) => depth(id) === 4),
    ).toHaveLength(92);
    // The PDF prints subcontrols with dots; IDs use dashes throughout.
    expect(NCA_ECC_REQUIREMENT_IDS).toContain("ECC 2-5-3-9");
    expect(NCA_ECC_REQUIREMENT_IDS).toContain("ECC 1-7-1");
    expect(NCA_ECC_REQUIREMENT_IDS).not.toContain("ECC 1-7-2");
    expect(NCA_ECC_REQUIREMENT_IDS.at(-1)).toBe("ECC 4-2-4");
  });

  it("names the NCA as the source and the Arabic text as binding", () => {
    expect(NCA_ECC_SOURCE_ATTRIBUTION).toContain(
      "National Cybersecurity Authority",
    );
    expect(NCA_ECC_SOURCE_ATTRIBUTION).toContain("ECC-2:2024");
    expect(NCA_ECC_SOURCE_ATTRIBUTION).toContain(
      "only the Arabic text is binding",
    );
    expect(NCA_ECC.note).toContain(NCA_ECC_SOURCE_ATTRIBUTION);
    expect(NCA_ECC.source).toEqual({
      url: "https://nca.gov.sa/en/regulatory-documents/controls-list/ecc/",
      verifiedAt: "2026-11-19",
    });
  });

  it("ships no NCA requirement wording", () => {
    const shipped = [
      NCA_ECC.note ?? "",
      ...Object.values(NCA_ECC.controls).flatMap((control) => [
        control.title,
        control.summary,
        ...(control.unassessedAspects ?? []),
      ]),
      ...NCA_ECC_OUTSIDE_INTUNE_SCOPE.map((measure) => measure.title.en),
    ].map((text) => text.toLowerCase());
    for (const phrase of NCA_PHRASES)
      for (const text of shipped)
        expect(text, phrase).not.toContain(phrase.toLowerCase());
  });

  it("maps only real capabilities and covers every capability", () => {
    const capabilityIds = new Set(
      assessCapabilities(data()).map((row) => row.capability.id),
    );
    expect(Object.keys(NCA_ECC.mappings).sort()).toEqual(
      [...capabilityIds].sort(),
    );
    const used = new Set(Object.values(NCA_ECC.mappings).flat());
    for (const controlId of used)
      expect(NCA_ECC.controls[controlId]).toBeDefined();
    for (const controlId of Object.keys(NCA_ECC.controls))
      expect(used.has(controlId), controlId).toBe(true);

    const m = NCA_ECC.mappings;
    for (const id of [
      "windows-telemetry-minimized",
      "windows-cortana-disabled",
      "windows-microsoft-account-blocked",
      "windows-office-v3-signatures",
      // A minimum version requirement is not patch deployment.
      "windows-minimum-os-version",
      "macos-minimum-os-version",
      "ios-minimum-os-version",
      "android-minimum-os-version",
    ])
      expect(m[id], id).toEqual([]);
    expect(m["windows-firewall"]).toEqual(["ECC 2-3-2"]);
    expect(m["windows-credential-guard"]).toEqual(["ECC 2-3-2"]);
    expect(m["ios-jailbreak-block"]).toEqual(["ECC 2-6-3-2"]);
    expect(m["android-device-integrity"]).toEqual(["ECC 2-6-3-2"]);
    expect(m["windows-realtime-antimalware"]).toEqual(["ECC 2-3-3-1"]);
    expect(m["windows-application-control"]).toEqual(["ECC 2-3-3-1"]);
    expect(m["macos-gatekeeper"]).toEqual(["ECC 2-3-3-1"]);
    expect(m["android-app-source-restriction"]).toEqual(["ECC 2-3-3-1"]);
    expect(m["ios-passcode-required"]).toEqual(["ECC 2-6-3-2"]);
    expect(m["android-inactivity-lock"]).toEqual(["ECC 2-6-3-2"]);
    expect(m["tenant-compliant-device-required"]).toEqual(["ECC 2-6-3-2"]);
    for (const id of [
      "windows-disk-encryption",
      "macos-disk-encryption",
      "android-storage-encryption",
    ])
      expect(m[id], id).toEqual(["ECC 2-6-3-1", "ECC 2-8-3-3"]);
    expect(m["ios-app-data-transfer"]).toEqual(["ECC 2-6-3-1", "ECC 2-6-3-2"]);
    expect(m["android-app-data-transfer"]).toEqual([
      "ECC 2-6-3-1",
      "ECC 2-6-3-2",
    ]);
    expect(m["windows-automatic-updates"]).toEqual([
      "ECC 2-3-3-3",
      "ECC 2-10-3-4",
    ]);
    expect(m["windows-quality-update-deadline"]).toEqual([
      "ECC 2-3-3-3",
      "ECC 2-10-3-4",
    ]);
    expect(m["windows-powershell-transcription"]).toEqual(["ECC 2-12-3-1"]);
    expect(m["windows-process-creation-logging"]).toEqual(["ECC 2-12-3-1"]);
    expect(m["windows-laps-management"]).toEqual(["ECC 2-2-3-4"]);
    for (const id of [
      "tenant-mfa-required",
      "tenant-mfa-all-apps",
      "tenant-phishing-resistant-mfa",
      "tenant-phishing-resistant-method-enabled",
      "tenant-weak-methods-disabled",
      "tenant-security-defaults-enabled",
    ])
      expect(m[id], id).toEqual(["ECC 2-2-3-2"]);
  });

  it("names every other subdomain as outside Intune scope", () => {
    const ids = NCA_ECC_OUTSIDE_INTUNE_SCOPE.map((measure) => measure.id);
    expect(ids).toEqual([
      ...Array.from({ length: 10 }, (_, index) => `ECC 1-${index + 1}`),
      ...Array.from({ length: 15 }, (_, index) => `ECC 2-${index + 1}`),
      "ECC 3-1",
      "ECC 4-1",
      "ECC 4-2",
    ]);
    for (const measure of NCA_ECC_OUTSIDE_INTUNE_SCOPE) {
      expect(measure.title.en).not.toBe("");
      expect(measure.title.de).not.toBe("");
      expect(measure.notEvaluated).toBeUndefined();
      expect(NCA_ECC.controls[measure.id]).toBeUndefined();
    }
    // Rows of subdomains with mapped controls name only the other controls.
    for (const subdomain of ["2-2", "2-3", "2-6", "2-8", "2-10", "2-12"])
      expect(
        NCA_ECC_OUTSIDE_INTUNE_SCOPE.find(
          (measure) => measure.id === `ECC ${subdomain}`,
        )?.title.en,
      ).toMatch(/^Other /);
  });

  it("reports a configured session lock as partial supporting evidence", () => {
    const control = ecc(data(macLock)).controls.find(
      (item) => item.control.id === "ECC 2-6-3-2",
    )!;
    expect(control.status).toBe("partialEvidence");
    expect(control.enforcedCapabilityIds).toEqual(["macos-inactivity-lock"]);
    expect(
      ecc(data()).controls.find((item) => item.control.id === "ECC 2-6-3-2")
        ?.status,
    ).toBe("noEvidence");
  });

  it("names the Purview template and asks to check its ECC version", () => {
    const template = purviewTemplateFor("nca-ecc-2-2024");
    expect(template?.displayName).toBe(
      "Saudi Arabia - National Cybersecurity Authority (NCA)",
    );
    expect(template?.note).toContain("ECC-2:2024");
    expect(template?.verifiedAt).toBe("2026-11-19");
  });

  it("renders the framework report grouped by subdomain with the attribution", async () => {
    const text = extractPdfStreamText(
      await generateComplianceReportPDF(data(macLock), {
        frameworkId: "nca-ecc-2-2024",
      }),
    );
    expect(complianceReportFileName("nca-ecc-2-2024")).toContain("NCA-ECC");
    expect(text).toContain("(ECC 2-6-3-2) Tj");
    expect(text).toContain("Restricting how mobile devices are used");
    expect(text).toContain("Mobile device security");
    expect(text).toContain("Arabic");
  });

  it("is desktop only: absent from the web evidence record, present on desktop", async () => {
    expect(isDesktopOnlyFramework("nca-ecc-2-2024")).toBe(true);
    expect(
      SAMPLE_REPORTS.find((sample) => sample.frameworkId === "nca-ecc-2-2024")
        ?.desktopOnly,
    ).toBe(true);

    const desktop = await createEvidenceManifest(data(macLock));
    const web = await createEvidenceManifest(data(macLock), undefined, {
      audience: "web",
    });
    const ids = (manifest: typeof desktop) =>
      manifest.assessment.frameworks.map((framework) => framework.framework.id);
    expect(ids(desktop)).toContain("nca-ecc-2-2024");
    expect(ids(web)).not.toContain("nca-ecc-2-2024");
    expect(web.rulesetSha256).toBe(desktop.rulesetSha256);
    expect(JSON.stringify(web.assessment)).not.toContain("nca-ecc-2-2024");
  });
});
