import { describe, expect, it, vi } from "vitest";
import { assessCapabilities, assessCompliance } from "../compliance/engine";
import { createEvidenceManifest } from "../compliance/manifest";
import { assignmentDetails } from "../compliance/assignments";
import { DetailedIntuneService } from "../intune-detailed-client";
import type { DetailedExportData } from "../configuration-analyzer";
import type { ComplianceCapability } from "../compliance/types";

const assigned = [
  { target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } },
];
const policy = (
  type: string,
  settings: Record<string, unknown>,
  id = "policy",
) => ({
  id,
  displayName: id,
  "@odata.type": `#microsoft.graph.${type}`,
  assignments: assigned,
  ...settings,
});
function data(...policies: any[]): DetailedExportData {
  return {
    settingsCatalog: [],
    deviceConfigurations: policies,
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  };
}
function capability(exportData: DetailedExportData, id: string) {
  return assessCapabilities(exportData).find(
    (result) => result.capability.id === id,
  )!;
}

describe("evidence integrity regressions", () => {
  it("surfaces contradictory behavior-monitoring settings across assigned policies", () => {
    const enabled = policy("windows10GeneralConfiguration", {
      defenderRequireBehaviorMonitoring: true,
    });
    const disabled = {
      ...policy("windows10GeneralConfiguration", {
        defenderRequireBehaviorMonitoring: false,
      }),
      id: "disabled",
    };
    expect(
      capability(data(enabled, disabled), "windows-behavior-monitoring").status,
    ).toBe("conflictingEvidence");
  });
  it.each([
    [{ rtpEnabled: true }, "requirementAssigned"],
    [{ defenderEnabled: true, rtpEnabled: false }, "noEvidence"],
    [{ antivirusRequired: true }, "noEvidence"],
  ])("uses real-time protection semantics for %j", (settings, status) => {
    expect(
      capability(
        data(policy("windows10CompliancePolicy", settings)),
        "windows-realtime-antimalware",
      ).status,
    ).toBe(status);
  });
  it("records antivirus presence without claiming Defender real-time protection", () => {
    const result = capability(
      data(policy("windows10CompliancePolicy", { antivirusRequired: true })),
      "windows-antivirus-required",
    );
    expect(result.status).toBe("requirementAssigned");
    expect(result.evidence[0]?.kind).toBe("complianceRequirement");
  });
  it("recognizes fully managed Android integrity requirements", () => {
    const result = capability(
      data(
        policy("androidDeviceOwnerCompliancePolicy", {
          securityBlockJailbrokenDevices: true,
        }),
      ),
      "android-device-integrity",
    );
    expect(result.status).toBe("requirementAssigned");
  });
  it("keeps disabled firewall profiles visible in the capability and framework", () => {
    const exportData = data(
      policy("windows10EndpointProtectionConfiguration", {
        firewallProfileDomain: { firewallEnabled: "allowed" },
        firewallProfilePublic: { firewallEnabled: "blocked" },
      }),
    );
    expect(capability(exportData, "windows-firewall").status).toBe(
      "conflictingEvidence",
    );
    const iso = assessCompliance(exportData).frameworks.find(
      (framework) => framework.framework.id === "iso-27001-2022",
    )!;
    expect(
      iso.controls.find((control) => control.control.id === "8.20")?.status,
    ).toBe("conflictingEvidence");
  });
  it("requires all firewall profiles on the same policy", () => {
    const domain = policy(
      "windows10EndpointProtectionConfiguration",
      { firewallProfileDomain: { firewallEnabled: "allowed" } },
      "domain",
    );
    const other = policy(
      "windows10EndpointProtectionConfiguration",
      {
        firewallProfilePrivate: { firewallEnabled: "allowed" },
        firewallProfilePublic: { firewallEnabled: "allowed" },
      },
      "other",
    );
    expect(capability(data(domain, other), "windows-firewall").status).toBe(
      "partialConfiguration",
    );
    expect(
      capability(
        data({
          ...domain,
          firewallProfilePrivate: { firewallEnabled: "allowed" },
          firewallProfilePublic: { firewallEnabled: "allowed" },
        }),
        "windows-firewall",
      ).status,
    ).toBe("enforced");
  });
  it("does not drop disabled duplicate catalog values", () => {
    const id = "device_vendor_msft_bitlocker_requiredeviceencryption";
    const result = capability(
      data(
        policy("deviceManagementConfigurationPolicy", {
          settings: [0, 1].map((value) => ({
            settingInstance: {
              settingDefinitionId: id,
              choiceSettingValue: { value: `${id}_${value}` },
            },
          })),
        }),
      ),
      "windows-disk-encryption",
    );
    expect(result.status).toBe("conflictingEvidence");
    expect(result.evidence.map((item) => item.verdict).sort()).toEqual([
      "disabled",
      "enforced",
    ]);
  });
  it("preserves filters and exclusions in portable evidence", () => {
    const result = capability(
      data(
        policy("windows10CompliancePolicy", {
          bitLockerEnabled: true,
          assignments: [
            {
              target: {
                ...assigned[0]!.target,
                deviceAndAppManagementAssignmentFilterId: "corporate-windows",
                deviceAndAppManagementAssignmentFilterType: "include",
              },
            },
            {
              target: {
                "@odata.type":
                  "#microsoft.graph.exclusionGroupAssignmentTarget",
                groupId: "exempt",
              },
            },
          ],
        }),
      ),
      "windows-disk-encryption",
    );
    const assignment = result.evidence[0]!.assignment;
    expect(assignment).toMatchObject({
      state: "assigned",
      exclusions: ["Group: exempt"],
      filters: [{ id: "corporate-windows", mode: "include" }],
      coverage: "unverified",
    });
    expect(assignmentDetails(assignment).join(" ")).toContain(
      "Excluded: Group: exempt",
    );
  });
  it.each([
    undefined,
    [{ target: { "@odata.type": "#microsoft.graph.futureAssignmentTarget" } }],
  ])("preserves unknown assignment state for %j", (assignments) => {
    expect(
      capability(
        data(
          policy("windows10CompliancePolicy", {
            bitLockerEnabled: true,
            assignments,
          }),
        ),
        "windows-disk-encryption",
      ).status,
    ).toBe("assignmentUnknown");
  });
  it("retains grace periods and the Conditional Access dependency", () => {
    const result = capability(
      data(
        policy("iosCompliancePolicy", {
          securityBlockJailbrokenDevices: true,
          scheduledActionsForRule: [
            {
              scheduledActionConfigurations: [
                { actionType: "block", gracePeriodHours: 720 },
              ],
            },
          ],
        }),
      ),
      "ios-jailbreak-block",
    );
    expect(result.evidence[0]?.note).toContain("720 hours");
    expect(result.evidence[0]?.note).toContain("Conditional Access");
    expect(result.status).toBe("requirementAssigned");
  });
  it("uses explicit platform scope and leaves unsupported controls unassessed", () => {
    const exportData = data(
      policy("windows10CompliancePolicy", { bitLockerEnabled: true }),
    );
    exportData.assessmentScope = { platforms: ["windows"] };
    const result = assessCompliance(exportData);
    const nist = result.frameworks.find(
      (framework) => framework.framework.id === "nist-800-53-r5",
    )!;
    expect(
      nist.controls.find((control) => control.control.id === "SC-28")
        ?.capabilityIds,
    ).toEqual(["windows-disk-encryption"]);
    const bsi = result.frameworks.find(
      (framework) => framework.framework.id === "bsi-it-grundschutz",
    )!;
    expect(
      bsi.controls.find((control) => control.control.id === "SYS.2.4.A6")
        ?.status,
    ).toBe("notApplicable");
    exportData.assessmentScope = { platforms: ["ios"] };
    const iosNist = assessCompliance(exportData).frameworks.find(
      (framework) => framework.framework.id === "nist-800-53-r5",
    )!;
    expect(
      iosNist.controls.find((control) => control.control.id === "SC-7")?.status,
    ).toBe("notAssessed");
  });
  it("does not infer scope from empty platform inventory or policy absence", () => {
    const exportData = data();
    exportData.deviceCounts = { windows: 20, macos: 0, android: 0, ios: 0 };
    expect(capability(exportData, "macos-disk-encryption").status).toBe(
      "noEvidence",
    );
  });
  it("filters Def Stan levels without changing other frameworks", () => {
    const result = assessCompliance(data(), { defStanRiskLevel: 0 });
    const defStan = result.frameworks.find(
      (framework) => framework.framework.id === "def-stan-05-138-i4",
    )!;
    expect(defStan.summary.applicableControls).toBe(0);
    expect(defStan.summary.notApplicable).toBe(defStan.summary.totalControls);
    expect(
      result.frameworks.find(
        (framework) => framework.framework.id === "iso-27001-2022",
      )?.summary.notApplicable,
    ).toBe(0);
  });
  it("keeps minimum OS evidence partial even when a value is present", () => {
    const bsi = assessCompliance(
      data(policy("macOSCompliancePolicy", { osMinimumVersion: "10.1" })),
    ).frameworks.find(
      (framework) => framework.framework.id === "bsi-it-grundschutz",
    )!;
    const control = bsi.controls.find(
      (control) => control.control.id === "SYS.2.4.A6",
    )!;
    expect(control.status).toBe("partialEvidence");
    expect(control.unassessedAspects.join(" ")).toContain("support");
  });
  it("reports collection failures as not assessed rather than absent", () => {
    const exportData = data();
    exportData.fetchErrors = [
      {
        policyId: "N/A",
        policyName: "Settings Catalog",
        policyType: "Settings Catalog",
        error: "Forbidden",
      },
    ];
    const result = assessCompliance(exportData);
    expect(
      result.collectionCoverage.find((row) => row.family === "settingsCatalog")
        ?.status,
    ).toBe("incomplete");
    expect(capability(exportData, "windows-disk-encryption").status).toBe(
      "collectionIncomplete",
    );
    expect(
      result.frameworks[0]!.controls.find(
        (control) => control.control.id === "SC-28",
      )?.status,
    ).toBe("notAssessed");
  });
});

describe("compound detectors and legacy representations", () => {
  it.each([
    ["full", "monday", "enforced"],
    ["quick", "everyday", "enforced"],
    ["disabled", "monday", "disabledByPolicy"],
    ["full", "noScheduledScan", "disabledByPolicy"],
    ["userDefined", "monday", "noEvidence"],
  ])("evaluates periodic scans %s/%s", (scan, day, status) => {
    expect(
      capability(
        data(
          policy("windows10GeneralConfiguration", {
            defenderScanType: scan,
            defenderSystemScanSchedule: day,
            defenderScheduledScanTime: "02:00:00",
          }),
        ),
        "windows-periodic-antimalware-scan",
      ).status,
    ).toBe(status);
  });
  it.each([
    [2, 7, 2, false, "enforced"],
    [8, 7, 0, false, "disabledByPolicy"],
    [0, 7, 0, true, "disabledByPolicy"],
    [undefined, 7, 0, false, "noEvidence"],
  ])(
    "checks the complete quality-update timing tuple",
    (deferral, deadline, grace, paused, status) => {
      expect(
        capability(
          data(
            policy("windowsUpdateForBusinessConfiguration", {
              automaticUpdateMode: "autoInstallAtMaintenanceTime",
              qualityUpdatesDeferralPeriodInDays: deferral,
              deadlineForQualityUpdatesInDays: deadline,
              deadlineGracePeriodInDays: grace,
              qualityUpdatesPaused: paused,
            }),
          ),
          "windows-quality-update-deadline",
        ).status,
      ).toBe(status);
    },
  );
  it.each([
    "auditComponentsAndStoreApps",
    "auditComponentsStoreAppsAndSmartlocker",
  ])("does not count application-control audit mode %s", (mode) => {
    expect(
      capability(
        data(
          policy("windows10EndpointProtectionConfiguration", {
            appLockerApplicationControl: mode,
          }),
        ),
        "windows-application-control",
      ).status,
    ).toBe("disabledByPolicy");
  });
  it.each([
    ["enabled", "AND", ["mfa", "compliantDevice"], "enforced"],
    ["enabled", "OR", ["mfa"], "enforced"],
    ["enabled", "OR", ["mfa", "compliantDevice"], "noEvidence"],
    ["enabledForReportingButNotEnforced", "AND", ["mfa"], "noEvidence"],
    ["disabled", "AND", ["mfa"], "noEvidence"],
  ])(
    "evaluates enabled CA requirements without optional OR grants",
    (state, operator, builtInControls, status) => {
      const exportData = data();
      exportData.conditionalAccessPolicies = [
        {
          id: "ca",
          state,
          grantControls: { operator, builtInControls },
          conditions: {
            users: { includeUsers: ["All"], excludeGroups: ["emergency"] },
            applications: { includeApplications: ["All"] },
          },
        },
      ];
      const result = capability(exportData, "tenant-mfa-required");
      expect(result.status).toBe(status);
      if (status === "enforced")
        expect(result.evidence[0]?.assignment.targets.join(" ")).toContain(
          "emergency",
        );
    },
  );
  it("does not accept an OR alternative in authentication strength as mandatory MFA", () => {
    const exportData = data();
    exportData.conditionalAccessPolicies = [
      policy("conditionalAccessPolicy", {
        state: "enabled",
        grantControls: {
          operator: "OR",
          builtInControls: ["mfa"],
          authenticationStrength: { id: "strength" },
        },
        conditions: {
          users: { includeUsers: ["All"] },
          applications: { includeApplications: ["All"] },
        },
      }),
    ];
    expect(capability(exportData, "tenant-mfa-required").status).toBe(
      "noEvidence",
    );
  });
  it("detects verified OMA-URI settings without coercing strings to numbers", () => {
    const uri = "./Device/Vendor/MSFT/BitLocker/RequireDeviceEncryption";
    expect(
      capability(
        data(
          policy("windows10CustomConfiguration", {
            omaSettings: [{ omaUri: uri, value: 1 }],
          }),
        ),
        "windows-disk-encryption",
      ).status,
    ).toBe("enforced");
    expect(
      capability(
        data(
          policy("windows10CustomConfiguration", {
            omaSettings: [{ omaUri: uri, value: "1" }],
          }),
        ),
        "windows-disk-encryption",
      ).status,
    ).toBe("noEvidence");
  });
  it.each(["administrativeTemplate", "securityBaseline"] as const)(
    "matches exact verified %s identifiers only",
    (source) => {
      const rule: ComplianceCapability = {
        id: "fixture",
        name: "Fixture",
        description: "Adapter test",
        platform: "windows",
        signals: [
          {
            source,
            settingId: "verified-definition",
            enforcedWhen: { kind: "equals", value: true },
          },
        ],
      };
      const exportData = data(
        policy("fixture", {
          definitionValues: [
            { definition: { id: "verified-definition" }, enabled: true },
          ],
          categories: [
            {
              settings: [
                { definitionId: "verified-definition", valueJson: "true" },
              ],
            },
          ],
        }),
      );
      expect(assessCapabilities(exportData, [rule])[0]?.status).toBe(
        "enforced",
      );
      rule.signals = [
        {
          source,
          settingId: "lookalike",
          enforcedWhen: { kind: "equals", value: true },
        },
      ];
      expect(assessCapabilities(exportData, [rule])[0]?.status).toBe(
        "noEvidence",
      );
    },
  );
});

describe("collection and reproducibility", () => {
  it("reports incomplete policy metadata even when a legacy export has no error ledger", () => {
    const exportData = data(
      policy("windows10GeneralConfiguration", {
        passwordRequired: true,
        collectionStatus: { assignments: "incomplete" },
      }),
    );
    exportData.collectedAt = "2026-09-04T10:00:00Z";
    const result = assessCompliance(exportData);
    expect(
      result.collectionCoverage.find(
        (row) => row.family === "deviceConfigurations",
      )?.status,
    ).toBe("incomplete");
    expect(
      result.capabilities.find(
        (item) => item.capability.id === "windows-password-required",
      )?.status,
    ).toBe("assignmentUnknown");
  });
  it.each([
    ["getWindowsScriptsDetailed", "/deviceManagement/deviceManagementScripts"],
    ["getMacOSScriptsDetailed", "/deviceManagement/deviceShellScripts"],
    [
      "getAppConfigurationsDetailed",
      "/deviceAppManagement/mobileAppConfigurations",
    ],
  ])(
    "retains detail and assignment failures in %s",
    async (method, endpoint) => {
      const service = new DetailedIntuneService("test-token") as any;
      service.retryWithBackoff = (action: () => Promise<unknown>) => action();
      service.client = {
        api: vi.fn((url: string) => {
          const request: any = {
            version: () => request,
            select: () => request,
            top: () => request,
            get: async () => {
              if (url === endpoint)
                return { value: [{ id: "policy", displayName: "Policy" }] };
              throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
            },
          };
          return request;
        }),
      };
      const policies = await service[method]();
      expect(policies[0].collectionStatus).toEqual({
        details: "incomplete",
        assignments: "incomplete",
      });
      expect(service.getFetchErrors()).toHaveLength(2);
      expect(service.getFetchErrors()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            statusCode: 403,
            endpoint: `${endpoint}('policy')/assignments`,
          }),
          expect.objectContaining({
            statusCode: 403,
            endpoint: `${endpoint}('policy')`,
          }),
        ]),
      );
    },
  );
  it.each([
    [
      "getDeviceConfigurationsDetailed",
      "/deviceManagement/deviceConfigurations",
      "windows10GeneralConfiguration",
    ],
    [
      "getCompliancePoliciesDetailed",
      "/deviceManagement/deviceCompliancePolicies",
      "windows10CompliancePolicy",
    ],
  ])(
    "preserves failed assignment requests in %s",
    async (method, endpoint, type) => {
      const service = new DetailedIntuneService("test-token") as any;
      service.retryWithBackoff = (action: () => Promise<unknown>) => action();
      service.client = {
        api: vi.fn((url: string) => {
          const request: any = {
            version: () => request,
            top: () => request,
            expand: () => request,
            get: async () => {
              if (url === endpoint)
                return { value: [policy(type, { passwordRequired: true })] };
              if (url.endsWith("/assignments"))
                throw Object.assign(new Error("Forbidden"), {
                  statusCode: 403,
                });
              return { value: [] };
            },
          };
          return request;
        }),
      };
      const policies = await service[method]();
      expect(policies[0].collectionStatus.assignments).toBe("incomplete");
      expect(service.getFetchErrors()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            statusCode: 403,
            endpoint: expect.stringContaining("/assignments"),
          }),
        ]),
      );
      expect(
        capability(data(...policies), "windows-password-required").status,
      ).toBe("assignmentUnknown");
    },
  );
  it("fingerprints source snapshots and preserves policy provenance", async () => {
    const exportData = data(
      policy("windows10GeneralConfiguration", {
        passwordRequired: true,
        version: 3,
        lastModifiedDateTime: "2026-09-01T00:00:00Z",
      }),
    );
    exportData.collectedAt = "2026-09-04T10:00:00Z";
    const first = await createEvidenceManifest(exportData);
    const second = await createEvidenceManifest(exportData, {
      platforms: ["windows"],
    });
    expect(first.snapshotSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(second.snapshotSha256).toBe(first.snapshotSha256);
    expect(second.rulesetSha256).toBe(first.rulesetSha256);
    expect(first.assessment.provenance.collectedAt).toBe(
      exportData.collectedAt,
    );
    expect(
      first.assessment.capabilities.find(
        (result) => result.capability.id === "windows-password-required",
      )?.evidence[0],
    ).toMatchObject({
      policyVersion: "3",
      policyModifiedAt: "2026-09-01T00:00:00Z",
    });
    exportData.deviceConfigurations[0].passwordRequired = false;
    expect((await createEvidenceManifest(exportData)).snapshotSha256).not.toBe(
      first.snapshotSha256,
    );
  });
});
