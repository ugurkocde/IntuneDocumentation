import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance, NIST_800_171_R3 } from "../compliance";
import { createEvidenceManifest } from "../compliance/manifest";
import {
  complianceReportFileName,
  generateComplianceReportPDF,
} from "../compliance/report-pdf";
import { extractPdfStreamText } from "./helpers/pdf-text";

function policy(type: string, values: Record<string, unknown>) {
  return {
    id: type,
    displayName: type,
    "@odata.type": `#microsoft.graph.${type}`,
    assignments: [
      {
        target: {
          "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
        },
      },
    ],
    ...values,
  };
}

function data(...policies: ReturnType<typeof policy>[]): DetailedExportData {
  return {
    collectedAt: "2026-09-05T00:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: policies,
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  };
}

function assessment(exportData: DetailedExportData) {
  return assessCompliance(exportData).frameworks.find(
    (item) => item.framework.id === "nist-800-171-r3",
  )!;
}

describe("NIST SP 800-171 Revision 3", () => {
  it("keeps revision metadata and published coverage separate in the evidence record", async () => {
    const { assessment: result } = await createEvidenceManifest(data());
    const r2 = result.frameworks.find(
      (item) => item.framework.id === "nist-800-171-r2",
    )!;
    const r3 = result.frameworks.find(
      (item) => item.framework.id === "nist-800-171-r3",
    )!;
    expect(r2.framework.version).toContain("CMMC");
    expect(r2.framework.totalRequirements).toBe(110);
    expect(r3.framework.version).toBe("Rev. 3 (May 2024)");
    expect(r3.framework.totalRequirements).toBe(97);
    expect(r2.summary.totalControls).toBe(11);
    expect(r3.summary.totalControls).toBe(11);
    expect(r3.framework.source?.url).toBe(
      "https://csrc.nist.gov/pubs/sp/800/171/r3/final",
    );
    for (const withdrawn of ["03.01.19", "03.04.09", "03.13.16", "03.14.05"])
      expect(
        r3.controls.some((control) => control.control.id === withdrawn),
      ).toBe(false);
  });

  it("maps storage encryption to the revised requirements without claiming transmission coverage", () => {
    const r3 = assessment(
      data(
        policy("windows10EndpointProtectionConfiguration", {
          bitLockerEncryptDevice: true,
        }),
      ),
    );
    for (const id of ["03.01.18", "03.13.08"])
      expect(r3.controls.find((item) => item.control.id === id)?.status).toBe(
        "partialEvidence",
      );
    expect(
      r3.controls
        .find((item) => item.control.id === "03.13.08")
        ?.unassessedAspects.join(" "),
    ).toContain("transmission");
    expect(r3.controls.every((item) => item.status !== "evidenceFound")).toBe(
      true,
    );
  });

  it("keeps ordinary credential requirements separate from MFA", () => {
    const exportData = data(
      policy("windows10GeneralConfiguration", { passwordRequired: true }),
    );
    expect(
      assessment(exportData).controls.find(
        (item) => item.control.id === "03.05.03",
      )?.status,
    ).toBe("noEvidence");
    exportData.conditionalAccessPolicies = [
      policy("conditionalAccessPolicy", {
        state: "enabled",
        conditions: {
          users: { includeUsers: ["All"] },
          applications: { includeApplications: ["All"] },
        },
        grantControls: { operator: "AND", builtInControls: ["mfa"] },
      }),
    ];
    expect(
      assessment(exportData).controls.find(
        (item) => item.control.id === "03.05.03",
      )?.status,
    ).toBe("partialEvidence");
  });

  it("folds periodic scans into malicious-code protection while retaining the scan-frequency gap", () => {
    const r3 = assessment(
      data(
        policy("windows10GeneralConfiguration", {
          defenderScanType: "quick",
          defenderSystemScanSchedule: "everyday",
          defenderScheduledScanTime: "02:00:00",
        }),
      ),
    );
    const malware = r3.controls.find((item) => item.control.id === "03.14.02")!;
    expect(malware.enforcedCapabilityIds).toContain(
      "windows-periodic-antimalware-scan",
    );
    expect(malware.status).toBe("partialEvidence");
    expect(malware.unassessedAspects.join(" ")).toContain(
      "organization-defined scan frequency",
    );
  });

  it("does not treat app-store restrictions as an executable allow list", () => {
    const r3 = assessment(
      data(
        policy("macOSEndpointProtectionConfiguration", {
          gatekeeperAllowedAppSource: "macAppStoreAndIdentifiedDevelopers",
        }),
      ),
    );
    expect(
      r3.controls.find((item) => item.control.id === "03.04.08")?.status,
    ).toBe("noEvidence");
    expect(NIST_800_171_R3.mappings["macos-gatekeeper"]).toEqual([]);
    expect(NIST_800_171_R3.mappings["windows-application-control"]).toEqual([
      "03.04.08",
    ]);
    expect(
      NIST_800_171_R3.controls["03.14.01"]?.unassessedAspects?.join(" "),
    ).toContain("organization-defined remediation period");
  });

  it("exports the correct revision, coverage and requirement families in its dedicated PDF", async () => {
    const bytes = await generateComplianceReportPDF(
      data(
        policy("windows10EndpointProtectionConfiguration", {
          bitLockerEncryptDevice: true,
        }),
      ),
      { frameworkId: "nist-800-171-r3" },
    );
    const text = extractPdfStreamText(bytes);
    expect(complianceReportFileName("nist-800-171-r3")).toContain(
      "NIST-800-171-R3",
    );
    expect(text).toContain("Rev. 3");
    expect(text).toContain("11 of 97 published requirements");
    expect(text).toContain("03.13.08");
    expect(text).toContain("03.14.02");
    expect(text).toContain("(03.13) Tj");
    expect(text).not.toContain("03.14.05");
    expect(text).not.toContain("NIST-800-171-R2");
  });
});
