import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { evaluatePolicyCheck } from "../compliance/policy-checks";
import type { DetailedExportData } from "../configuration-analyzer";

const allUsers = [
  {
    target: {
      "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget",
    },
  },
];
function empty(): DetailedExportData {
  return {
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    conditionalAccessPolicies: [],
    windowsUpdatePolicies: [],
    appProtectionPolicies: [],
    appConfigurations: [],
    enrollmentConfigurations: [],
    assessmentScope: { essentialEightMaturityLevel: 1, defStanRiskLevel: 3 },
  };
}
const disableVba =
  "device_vendor_msft_policy_config_office16v2~policy~l_microsoftofficemachine~l_securitysettingsmachine_l_disablevbaforofficeapplications";
const vbaWarnings =
  "user_vendor_msft_policy_config_word16v2~policy~l_microsoftofficeword~l_wordoptions~l_security~l_trustcenter_l_vbawarningspolicy";
const vbaChoice = `${vbaWarnings}_l_empty19`;
function setting(id: string, suffix: string, children: any[] = []) {
  return {
    settingDefinitionId: id,
    choiceSettingValue: { value: `${id}_${suffix}`, children },
  };
}
function policy(instances: any[], assigned = true) {
  return {
    id: "catalog",
    name: "An ordinary policy",
    settings: instances.map((settingInstance) => ({ settingInstance })),
    assignments: assigned ? allUsers : [],
  };
}
function result(instances: any[], assigned = true) {
  const data = empty();
  data.settingsCatalog = [policy(instances, assigned) as any];
  return assessCompliance(data);
}
const matrix = [
  ["nist-800-53-r5", "CM-6"],
  ["nist-csf-2", "PR.PS-01"],
  ["bsi-it-grundschutz", "SYS.2.1"],
  ["iso-27001-2022", "8.9"],
  ["soc2-tsc", "CC6.8"],
  ["def-stan-05-138-i4", "2418"],
  ["cyber-essentials-v3", "Secure configuration"],
  ["nist-800-171-r2", "3.4.2"],
  ["nist-800-171-r3", "03.04.02"],
  ["essential-eight", "ML1-MAC-01"],
];
describe("working detectors across every framework", () => {
  it.each(matrix)(
    "%s recognizes assigned Settings Catalog evidence for %s",
    (frameworkId, controlId) => {
      const assessment = result([setting(disableVba, "1")]);
      const framework = assessment.frameworks.find(
        (f) => f.framework.id === frameworkId,
      )!;
      expect(framework, frameworkId).toBeDefined();
      const control = framework.controls.find(
        (c) => c.control.id === controlId,
      )!;
      expect(control.status).toBe("partialEvidence");
      expect(control.enforcedCapabilityIds).toContain(
        "windows-office-macros-disabled",
      );
      const nonEnforcing = result([setting(disableVba, "0")])
        .frameworks.find((f) => f.framework.id === frameworkId)!
        .controls.find((c) => c.control.id === controlId)!;
      expect(nonEnforcing.enforcedCapabilityIds).not.toContain(
        "windows-office-macros-disabled",
      );
      expect(nonEnforcing.status).not.toBe("partialEvidence");
    },
  );
  it("covers every framework exposed by the assessment", () => {
    expect(
      result([])
        .frameworks.map((f) => f.framework.id)
        .sort(),
    ).toEqual(matrix.map((row) => row[0]).sort());
  });
  it("only displays controls backed by policy detectors in every framework", () => {
    const assessment = result([]);
    const supportedIds = new Set(
      assessment.capabilities
        .filter((row) => row.capability.signals.length > 0)
        .map((row) => row.capability.id),
    );
    for (const framework of assessment.frameworks) {
      expect(framework.controls.length).toBeGreaterThan(0);
      for (const control of framework.controls) {
        expect(
          [...control.capabilityIds, ...control.excludedCapabilityIds].some(
            (id) => supportedIds.has(id),
          ),
          `${framework.framework.id}: ${control.control.id}`,
        ).toBe(true);
      }
    }
  });
  it("requires assignment and never detects from a policy name", () => {
    const unassigned = result(
      [setting(disableVba, "1")],
      false,
    ).capabilities.find(
      (c) => c.capability.id === "windows-office-macros-disabled",
    )!;
    expect(unassigned.status).toBe("configuredNotAssigned");
    const data = empty();
    data.settingsCatalog = [
      { ...policy([]), name: "Disable VBA for Office applications" } as any,
    ];
    expect(
      assessCompliance(data).capabilities.find(
        (c) => c.capability.id === "windows-office-macros-disabled",
      )!.evidence,
    ).toEqual([]);
  });
  it("reads nested dropdown values only beneath the enabled policy", () => {
    const positive = result([
      setting(vbaWarnings, "1", [setting(vbaChoice, "4")]),
    ]);
    expect(
      positive.capabilities.find(
        (c) => c.capability.id === "windows-office-macros-disabled",
      )!.status,
    ).toBe("enforced");
    for (const instances of [
      [setting(vbaChoice, "4")],
      [setting(vbaWarnings, "0", [setting(vbaChoice, "4")])],
      [setting(vbaWarnings, "1", [setting(vbaChoice, "2")])],
    ]) {
      expect(
        result(instances).capabilities.find(
          (c) => c.capability.id === "windows-office-macros-disabled",
        )!.status,
      ).not.toBe("enforced");
    }
  });
  it("does not combine a parent option and dropdown from different policies", () => {
    const data = empty();
    data.settingsCatalog = [
      policy([setting(vbaWarnings, "1")]) as any,
      { ...policy([setting(vbaChoice, "4")]), id: "other" } as any,
    ];
    expect(
      assessCompliance(data).capabilities.find(
        (c) => c.capability.id === "windows-office-macros-disabled",
      )!.status,
    ).not.toBe("enforced");
  });
  it("reads Administrative Template dropdowns by exact definition and presentation", () => {
    const data = empty();
    const definition = {
      enabled: true,
      definition: { id: "e92ea21b-8d97-4cc3-80c9-dd396c3d61e4" },
      presentationValues: [
        {
          presentation: { id: "e3040ad3-0f64-4b3b-8a39-20cca3793183" },
          value: "4",
        },
      ],
    };
    const config = {
      id: "template",
      displayName: "Office controls",
      definitionValues: [definition],
      assignments: allUsers,
    };
    data.administrativeTemplates = [config as any];
    expect(
      assessCompliance(data).capabilities.find(
        (c) => c.capability.id === "windows-office-macros-disabled",
      )!.status,
    ).toBe("enforced");
    definition.enabled = false;
    expect(
      assessCompliance(data).capabilities.find(
        (c) => c.capability.id === "windows-office-macros-disabled",
      )!.status,
    ).not.toBe("enforced");
    definition.enabled = true;
    definition.presentationValues[0]!.presentation.id = "wrong";
    expect(
      assessCompliance(data).capabilities.find(
        (c) => c.capability.id === "windows-office-macros-disabled",
      )!.status,
    ).not.toBe("enforced");
  });
  it.each(["block", "audit", "warn", "off"])(
    "recognizes the actual Settings Catalog ASR %s option",
    (mode) => {
      const id =
        "device_vendor_msft_policy_config_defender_attacksurfacereductionrules_blockallofficeapplicationsfromcreatingchildprocesses";
      const capability = result([setting(id, mode)]).capabilities.find(
        (c) => c.capability.id === "windows-office-child-process-block",
      )!;
      expect(capability.status).toBe(
        mode === "block" ? "enforced" : "disabledByPolicy",
      );
    },
  );
  it("excludes external requirements from the policy assessment", () => {
    const framework = result([]).frameworks.find(
      (f) => f.framework.id === "essential-eight",
    )!;
    const backup = framework.controls.find((c) => c.control.id === "ML1-BK-04");
    expect(backup).toBeUndefined();
    expect(
      framework.controls.find((c) => c.control.id === "ML1-PA-05"),
    ).toBeUndefined();
  });
});

function ca(grants: Record<string, unknown>): Record<string, any> {
  return {
    "@odata.type": "#microsoft.graph.conditionalAccessPolicy",
    state: "enabled",
    conditions: {
      users: { includeUsers: ["All"] },
      applications: { includeApplications: ["All"] },
    },
    grantControls: { operator: "AND", ...grants },
  };
}
describe("authentication-strength detectors", () => {
  it("recognizes phishing-resistant built-in strength without legacy mfa grants", () => {
    const policy = ca({
      authenticationStrength: { id: "00000000-0000-0000-0000-000000000004" },
    });
    expect(evaluatePolicyCheck(policy, "conditionalAccessMfa")?.verdict).toBe(
      "enforced",
    );
    expect(
      evaluatePolicyCheck(policy, "conditionalAccessPhishingResistantMfa")
        ?.verdict,
    ).toBe("enforced");
    expect(
      evaluatePolicyCheck(policy, "conditionalAccessMfaAllApps")?.verdict,
    ).toBe("enforced");
  });
  it("rejects report-only policies, MFA bypass alternatives and app exclusions", () => {
    expect(
      evaluatePolicyCheck(
        {
          ...ca({ builtInControls: ["mfa"] }),
          state: "enabledForReportingButNotEnforced",
        },
        "conditionalAccessMfa",
      ),
    ).toBeUndefined();
    expect(
      evaluatePolicyCheck(
        ca({
          operator: "OR",
          builtInControls: ["compliantDevice"],
          authenticationStrength: {
            id: "00000000-0000-0000-0000-000000000004",
          },
        }),
        "conditionalAccessMfa",
      ),
    ).toBeUndefined();
    const scoped = ca({ builtInControls: ["mfa"] });
    scoped.conditions.applications.excludeApplications = ["some-app"];
    expect(
      evaluatePolicyCheck(scoped, "conditionalAccessMfaAllApps"),
    ).toBeUndefined();
  });
  it("does not call ordinary MFA or a mixed custom strength phishing-resistant", () => {
    expect(
      evaluatePolicyCheck(
        ca({ builtInControls: ["mfa"] }),
        "conditionalAccessPhishingResistantMfa",
      ),
    ).toBeUndefined();
    expect(
      evaluatePolicyCheck(
        ca({
          authenticationStrength: {
            requirementsSatisfied: "mfa",
            allowedCombinations: ["fido2", "password,sms"],
          },
        }),
        "conditionalAccessPhishingResistantMfa",
      ),
    ).toBeUndefined();
  });
});

describe("additional verified policy detectors", () => {
  it.each([
    [
      "windows-lsa-protection",
      "device_vendor_msft_policy_config_localsecurityauthority_configurelsaprotectedprocess",
      "1",
      "0",
    ],
    [
      "windows-lsa-protection",
      "device_vendor_msft_policy_config_localsecurityauthority_configurelsaprotectedprocess",
      "2",
      "0",
    ],
    [
      "windows-laps-management",
      "device_vendor_msft_laps_policies_backupdirectory",
      "1",
      "0",
    ],
    [
      "windows-laps-management",
      "device_vendor_msft_laps_policies_backupdirectory",
      "2",
      "0",
    ],
  ])(
    "compares %s using its actual Graph choices",
    (capabilityId, settingId, on, off) => {
      expect(
        result([setting(settingId, on)]).capabilities.find(
          (row) => row.capability.id === capabilityId,
        )!.status,
      ).toBe("enforced");
      expect(
        result([setting(settingId, off)]).capabilities.find(
          (row) => row.capability.id === capabilityId,
        )!.status,
      ).toBe("disabledByPolicy");
    },
  );
  it("requires the exact Remote Credential Guard option and enabled parent", () => {
    const parent =
      "device_vendor_msft_policy_config_admx_credssp_restrictedremoteadministration";
    const child = `${parent}_restrictedremoteadministrationdrop`;
    const status = (instances: any[]) =>
      result(instances).capabilities.find(
        (row) => row.capability.id === "windows-remote-credential-guard",
      )!.status;
    expect(status([setting(parent, "1", [setting(child, "2")])])).toBe(
      "enforced",
    );
    for (const value of ["1", "3"])
      expect(status([setting(parent, "1", [setting(child, value)])])).not.toBe(
        "enforced",
      );
    expect(status([setting(parent, "0", [setting(child, "2")])])).not.toBe(
      "enforced",
    );
    expect(status([setting(child, "2")])).not.toBe("enforced");
  });
  it("requires both process creation settings on the same assigned policy", () => {
    const audit =
      "device_vendor_msft_policy_config_audit_detailedtracking_auditprocesscreation";
    const command =
      "device_vendor_msft_policy_config_admx_auditsettings_includecmdline";
    const status = (input: ReturnType<typeof empty>) =>
      assessCompliance(input).capabilities.find(
        (row) => row.capability.id === "windows-process-creation-logging",
      )!.status;
    expect(
      result([setting(audit, "1"), setting(command, "1")]).capabilities.find(
        (row) => row.capability.id === "windows-process-creation-logging",
      )!.status,
    ).toBe("enforced");
    const input = empty();
    input.settingsCatalog = [
      policy([setting(audit, "1")]) as any,
      { ...policy([setting(command, "1")]), id: "other" } as any,
    ];
    expect(status(input)).toBe("partialConfiguration");
    expect(
      result([setting(audit, "2"), setting(command, "1")]).capabilities.find(
        (row) => row.capability.id === "windows-process-creation-logging",
      )!.status,
    ).not.toBe("enforced");
  });
  it("requires the wildcard and enabled parent for all-module logging", () => {
    const parent =
      "device_vendor_msft_policy_config_admx_powershellexecutionpolicy_enablemodulelogging";
    const child = (value: string) => ({
      settingDefinitionId: `${parent}_listbox_modulenames`,
      simpleSettingCollectionValue: [{ value }],
    });
    const status = (instances: any[]) =>
      result(instances).capabilities.find(
        (row) => row.capability.id === "windows-powershell-module-logging",
      )!.status;
    expect(status([setting(parent, "1", [child("*")])])).toBe("enforced");
    expect(
      status([
        setting(parent, "1", [child("Microsoft.PowerShell.Management")]),
      ]),
    ).not.toBe("enforced");
    expect(status([setting(parent, "0", [child("*")])])).not.toBe("enforced");
  });
});
