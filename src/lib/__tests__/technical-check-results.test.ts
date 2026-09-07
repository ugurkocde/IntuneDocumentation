import { describe, expect, it } from "vitest";
import { assessCompliance, assessCapabilities } from "../compliance";
import type { DetailedExportData } from "../configuration-analyzer";

function data(): DetailedExportData {
  return {
    collectedAt: "2026-09-07T12:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    appProtectionPolicies: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
  };
}
const id =
  "device_vendor_msft_policy_config_office16v2~policy~l_microsoftofficemachine~l_securitysettingsmachine_l_disablevbaforofficeapplications";
function configured(value: string) {
  const input = data();
  input.settingsCatalog = [
    {
      id: "macro",
      name: "Office policy",
      settings: [
        {
          settingInstance: {
            settingDefinitionId: id,
            choiceSettingValue: { value: `${id}_${value}` },
          },
        },
      ],
      assignments: [],
    } as any,
  ];
  return input;
}
const find = (input: DetailedExportData) =>
  assessCapabilities(input).find(
    (row) => row.capability.id === "windows-office-macros-disabled",
  )!;

describe("independent assessment and configuration results", () => {
  it("does not call a present setting with unreadable data missing", () => {
    const input = data();
    input.settingsCatalog = [
      {
        id: "unreadable",
        settings: [{ settingInstance: { settingDefinitionId: id } }],
      } as any,
    ];
    expect(find(input).checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
    expect(find(input).checks[0]!.reason).toContain("present");
  });
  it("checks unassigned settings without claiming deployment", () => {
    const result = find(configured("1"));
    expect(result.status).toBe("configuredNotAssigned");
    expect(result.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "matches",
      assignment: { state: "notAssigned" },
    });
  });
  it("retains expected and actual values when they differ", () => {
    const result = find(configured("0"));
    expect(result.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
      actualValue: JSON.stringify(`${id}_0`),
    });
    expect(result.checks[0]!.expectedValue).toContain(`${id}_1`);
  });
  it("only calls an absent setting missing after a complete collection", () => {
    expect(find(data()).checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "missing",
    });
    const unknown = data();
    delete unknown.collectedAt;
    expect(find(unknown).checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
    const failed = data();
    failed.fetchErrors = [
      {
        policyId: "x",
        policyName: "Policy",
        policyType: "Settings Catalog",
        familyKey: "settingsCatalog",
        error: "Forbidden",
      },
    ];
    expect(find(failed).checks[0]).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
    expect(find(failed).checks[0]!.reason).toContain("Forbidden");
  });
  it("preserves a checked match alongside incomplete collection", () => {
    const input = configured("1");
    input.collectionSkippedFamilies = ["securityBaselines"];
    expect(
      find(input).checks.map((row) => [row.assessmentStatus, row.result]),
    ).toEqual([
      ["checked", "matches"],
      ["unableToCheck", null],
    ]);
  });
  it("marks excluded platforms separately", () => {
    const input = configured("1");
    input.assessmentScope = { platforms: ["macos"] };
    expect(
      find(input).checks.every(
        (row) => row.assessmentStatus === "outsideScope" && row.result === null,
      ),
    ).toBe(true);
  });
  it("compares a valid value omitted by the legacy counter-evidence predicate", () => {
    const input = data();
    input.deviceConfigurations = [
      {
        id: "version",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        passwordMinimumLength: 3,
      } as any,
    ];
    const capability = {
      id: "test",
      name: "Minimum length",
      description: "At least eight",
      platform: "windows" as const,
      signals: [
        {
          source: "graphProperty" as const,
          odataTypes: ["windows10GeneralConfiguration"],
          propertyPath: "passwordMinimumLength",
          enforcedWhen: { kind: "atLeast" as const, value: 8 },
        },
      ],
    };
    expect(assessCapabilities(input, [capability])[0]!.checks[0]).toMatchObject(
      {
        assessmentStatus: "checked",
        result: "different",
        expectedValue: "At least 8",
        actualValue: "3",
      },
    );
    input.deviceConfigurations[0]!.passwordMinimumLength = {
      unexpected: true,
    };
    expect(assessCapabilities(input, [capability])[0]!.checks[0]).toMatchObject(
      { assessmentStatus: "unableToCheck", result: null },
    );
  });
  it("reports report-only MFA as a different configuration, not a missing policy", () => {
    const input = data();
    input.conditionalAccessPolicies = [
      {
        id: "mfa",
        state: "enabledForReportingButNotEnforced",
        grantControls: { operator: "AND", builtInControls: ["mfa"] },
        conditions: {
          users: { includeUsers: ["All"] },
          applications: { includeApplications: ["All"] },
        },
      } as any,
    ];
    const result = assessCapabilities(input).find(
      (row) => row.capability.id === "tenant-mfa-required",
    )!;
    expect(result.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
    });
    expect(result.checks[0]!.actualValue).toContain(
      "enabledForReportingButNotEnforced",
    );
  });
  it("gives every listed requirement in all ten frameworks checks or an explicit unavailable reason", () => {
    const assessment = assessCompliance(data());
    expect(assessment.frameworks).toHaveLength(10);
    const capabilities = new Map(
      assessment.capabilities.map((row) => [row.capability.id, row]),
    );
    for (const framework of assessment.frameworks)
      for (const control of framework.controls) {
        if (control.status === "notApplicable") continue;
        if (!control.capabilityIds.length) {
          expect(
            control.unavailableCheck,
            `${framework.framework.id}/${control.control.id}`,
          ).toMatchObject({ assessmentStatus: "unableToCheck", result: null });
          expect(control.unavailableCheck!.reason).toBeTruthy();
        } else
          for (const capabilityId of control.capabilityIds)
            expect(
              capabilities.get(capabilityId)!.checks.length,
            ).toBeGreaterThan(0);
      }
  });
  it.each(["1", "0"])(
    "uses the same %s comparison in every framework mapping",
    (value) => {
      const assessment = assessCompliance(configured(value));
      for (const framework of assessment.frameworks) {
        expect(
          framework.controls.some((control) =>
            control.capabilityIds.includes("windows-office-macros-disabled"),
          ),
          framework.framework.id,
        ).toBe(true);
      }
      expect(find(configured(value)).checks[0]!.result).toBe(
        value === "1" ? "matches" : "different",
      );
    },
  );
});
