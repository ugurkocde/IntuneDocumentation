import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCompliance,
  HIPAA_OUTSIDE_INTUNE_SCOPE,
  HIPAA_SECURITY_RULE,
} from "../compliance";
import { frameworkCoverageLabel } from "../compliance/presentation";
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
    collectedAt: "2026-10-09T00:00:00Z",
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
    (item) => item.framework.id === "hipaa-security-rule",
  )!;
}

function status(exportData: DetailedExportData, controlId: string) {
  return assessment(exportData).controls.find(
    (item) => item.control.id === controlId,
  )?.status;
}

const bitLocker = () =>
  data(
    policy("windows10EndpointProtectionConfiguration", {
      bitLockerEncryptDevice: true,
    }),
  );

describe("HIPAA Security Rule", () => {
  it("lists only mapped safeguards with their Appendix A tier and the published total", () => {
    const hipaa = assessment(data());
    expect(hipaa.framework.totalRequirements).toBe(54);
    expect(hipaa.controls.map((item) => item.control.id)).toEqual([
      "164.308(a)(5)(ii)(B)",
      "164.308(a)(5)(ii)(D)",
      "164.310(b)",
      "164.310(c)",
      "164.312(a)(1)",
      "164.312(a)(2)(iv)",
      "164.312(b)",
      "164.312(c)(1)",
      "164.312(d)",
    ]);
    expect(HIPAA_SECURITY_RULE.controls["164.312(a)(2)(iv)"]?.tier).toBe(
      "Addressable",
    );
    expect(HIPAA_SECURITY_RULE.controls["164.312(b)"]?.tier).toBe("Required");
    expect(HIPAA_SECURITY_RULE.controls["164.312(a)(1)"]?.tier).toBe(
      "Standard",
    );
    for (const control of Object.values(HIPAA_SECURITY_RULE.controls)) {
      expect(control.evidenceStrength).toBe("supporting");
      expect(control.unassessedAspects?.length).toBeGreaterThan(0);
    }
    expect(frameworkCoverageLabel(hipaa)).toContain(
      "9 of 54 published requirements",
    );
  });

  it("maps encryption to workstation security and encryption, not device and media controls", () => {
    const exportData = bitLocker();
    expect(status(exportData, "164.312(a)(2)(iv)")).toBe("partialEvidence");
    expect(status(exportData, "164.310(c)")).toBe("partialEvidence");
    expect(
      assessment(exportData).controls.some(
        (item) => item.control.id === "164.310(d)(1)",
      ),
    ).toBe(false);
    expect(
      assessment(exportData).controls.every(
        (item) => item.status !== "evidenceFound",
      ),
    ).toBe(true);
  });

  it("lists every unmapped Appendix A row once, apart from the mapped controls", () => {
    const ids = HIPAA_OUTSIDE_INTUNE_SCOPE.map((measure) => measure.id);
    expect(new Set(ids).size).toBe(45);
    expect(ids.length + Object.keys(HIPAA_SECURITY_RULE.controls).length).toBe(
      HIPAA_SECURITY_RULE.totalRequirements,
    );
    for (const id of ids)
      expect(HIPAA_SECURITY_RULE.controls[id]).toBeUndefined();
    expect(
      HIPAA_OUTSIDE_INTUNE_SCOPE.filter((measure) => measure.notEvaluated).map(
        (measure) => measure.id,
      ),
    ).toEqual([
      "164.312(a)(2)(i)",
      "164.312(a)(2)(iii)",
      "164.312(e)(1)",
      "164.312(e)(2)(i)",
      "164.312(e)(2)(ii)",
    ]);
    for (const measure of HIPAA_OUTSIDE_INTUNE_SCOPE)
      expect(measure.title.de.length).toBeGreaterThan(0);
  });

  it("keeps updates and host firewalls unmapped", () => {
    for (const capabilityId of [
      "windows-automatic-updates",
      "windows-quality-update-deadline",
      "windows-minimum-os-version",
      "windows-firewall",
      "macos-firewall",
    ])
      expect(HIPAA_SECURITY_RULE.mappings[capabilityId]).toEqual([]);
  });

  it("supports person or entity authentication with Conditional Access MFA", () => {
    const exportData = data();
    expect(status(exportData, "164.312(d)")).toBe("noEvidence");
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
    expect(status(exportData, "164.312(d)")).toBe("partialEvidence");
    expect(status(exportData, "164.312(a)(1)")).toBe("noEvidence");
  });

  it("states that platform integrity is indirect evidence for 164.312(c)(1)", () => {
    expect(
      HIPAA_SECURITY_RULE.controls["164.312(c)(1)"]?.unassessedAspects?.join(
        " ",
      ),
    ).toContain("not ePHI itself");
    expect(HIPAA_SECURITY_RULE.mappings["windows-secure-boot"]).toEqual([
      "164.312(c)(1)",
    ]);
  });

  it("exports the rule, coverage and safeguard sections in its dedicated PDF", async () => {
    const bytes = await generateComplianceReportPDF(bitLocker(), {
      frameworkId: "hipaa-security-rule",
    });
    const text = extractPdfStreamText(bytes);
    expect(complianceReportFileName("hipaa-security-rule")).toContain(
      "HIPAA-Security-Rule",
    );
    expect(text).toContain("HIPAA Security Rule");
    expect(text).toContain("9 of 54 published requirements");
    // PDF text strings escape parentheses.
    expect(text).toContain("164.312\\(a\\)\\(2\\)\\(iv\\)");
    expect(text).toContain("Technical safeguards");
    expect(text).toContain("Addressable");
    expect(text.toLowerCase()).not.toContain("hitrust");
  });
});
