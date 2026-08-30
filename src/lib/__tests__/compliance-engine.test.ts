import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import {
  assessCapabilities,
  assessCompliance,
  assessFramework,
  BSI_IT_GRUNDSCHUTZ,
  compareControlIds,
  ISO_27001,
  NIST_800_53,
  NIST_CSF,
  SOC_2,
} from "../compliance";
import { defenderForEndpointPolicyFixture } from "./fixtures/intune-beta";

function emptyExportData(): DetailedExportData {
  return {
    settingsCatalog: [],
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

const allDevicesAssignment = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

function bitLockerCatalogPolicy(choiceSuffix: "_1" | "_0", assignments: any[]) {
  return {
    id: "bitlocker-policy",
    name: "BitLocker baseline",
    configType: "Settings Catalog",
    platforms: "windows10",
    settings: [
      {
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId:
            "device_vendor_msft_bitlocker_requiredeviceencryption",
          choiceSettingValue: {
            value: `device_vendor_msft_bitlocker_requiredeviceencryption${choiceSuffix}`,
            children: [],
          },
        },
      },
    ],
    assignments,
  };
}

function capabilityResult(data: DetailedExportData, capabilityId: string) {
  const result = assessCapabilities(data).find(
    (item) => item.capability.id === capabilityId,
  );
  if (!result) throw new Error(`unknown capability ${capabilityId}`);
  return result;
}

describe("compliance engine", () => {
  it("reports enforced when a settings catalog value enforces and the policy is assigned", () => {
    const data = emptyExportData();
    data.settingsCatalog = [bitLockerCatalogPolicy("_1", allDevicesAssignment)];

    const result = capabilityResult(data, "windows-disk-encryption");
    expect(result.status).toBe("enforced");
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      verdict: "enforced",
      policyName: "BitLocker baseline",
      settingId: "device_vendor_msft_bitlocker_requiredeviceencryption",
      assignment: { state: "assigned", targets: ["All Devices"] },
    });
  });

  it("reports counter-evidence, not coverage, when the setting is configured to off", () => {
    const data = emptyExportData();
    data.settingsCatalog = [bitLockerCatalogPolicy("_0", allDevicesAssignment)];

    const result = capabilityResult(data, "windows-disk-encryption");
    expect(result.status).toBe("disabledByPolicy");
    expect(result.evidence[0]?.verdict).toBe("disabled");
  });

  it("downgrades enforcing but unassigned policies to configuredNotAssigned", () => {
    const data = emptyExportData();
    data.settingsCatalog = [bitLockerCatalogPolicy("_1", [])];

    expect(capabilityResult(data, "windows-disk-encryption").status).toBe(
      "configuredNotAssigned",
    );
  });

  it("treats exclusion-only assignments as not assigned", () => {
    const data = emptyExportData();
    data.settingsCatalog = [
      bitLockerCatalogPolicy("_1", [
        {
          id: "assignment-1",
          target: {
            "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
            groupId: "group-1",
          },
        },
      ]),
    ];

    expect(capabilityResult(data, "windows-disk-encryption").status).toBe(
      "configuredNotAssigned",
    );
  });

  it("resolves assigned group ids from Map and serialized object lookups", () => {
    for (const groupNames of [
      new Map([["group-1", "Security Operations"]]),
      { "group-1": "Security Operations" },
    ]) {
      const data = {
        ...emptyExportData(),
        groupNames,
        settingsCatalog: [
          bitLockerCatalogPolicy("_1", [
            {
              id: "assignment-1",
              target: {
                "@odata.type": "#microsoft.graph.groupAssignmentTarget",
                groupId: "group-1",
              },
            },
          ]),
        ],
      } as unknown as DetailedExportData;

      expect(
        capabilityResult(data, "windows-disk-encryption").evidence[0]
          ?.assignment.targets,
      ).toEqual(["Group: Security Operations"]);
    }
  });

  it("detects unknown-source blocking on the verified Android resource types", () => {
    const data = emptyExportData();
    data.deviceConfigurations = [
      {
        id: "aosp-config",
        displayName: "AOSP restrictions",
        "@odata.type": "#microsoft.graph.aospDeviceOwnerDeviceConfiguration",
        appsBlockInstallFromUnknownSources: true,
        assignments: allDevicesAssignment,
      },
    ];

    expect(
      capabilityResult(data, "android-app-source-restriction").status,
    ).toBe("enforced");

    const workProfile = emptyExportData();
    workProfile.deviceConfigurations = [
      {
        id: "work-profile-config",
        displayName: "Work profile restrictions",
        "@odata.type":
          "#microsoft.graph.androidWorkProfileGeneralDeviceConfiguration",
        workProfileBlockPersonalAppInstallsFromUnknownSources: true,
        assignments: allDevicesAssignment,
      },
    ];
    expect(
      capabilityResult(workProfile, "android-app-source-restriction").status,
    ).toBe("enforced");
  });

  it("does not infer coverage from policy names, descriptions, or unrelated settings", () => {
    const data = emptyExportData();
    // A Defender exclusions policy mentions "defender" in its definition id and
    // the old substring approach counted it as antimalware coverage.
    data.settingsCatalog = [
      structuredClone(defenderForEndpointPolicyFixture),
      {
        id: "keyword-policy",
        name: "Enable BitLocker everywhere",
        description: "bitlocker firewall defender password",
        configType: "Settings Catalog",
        settings: [],
        assignments: allDevicesAssignment,
      },
    ];

    for (const result of assessCapabilities(data)) {
      expect(result.status).toBe("noEvidence");
      expect(result.evidence).toHaveLength(0);
    }
  });

  it("understands inverted CSP semantics (DeviceLock 0 = password required)", () => {
    const data = emptyExportData();
    data.settingsCatalog = [
      {
        id: "devicelock",
        name: "Device lock",
        configType: "Settings Catalog",
        settings: [
          {
            id: "0",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
              settingDefinitionId:
                "device_vendor_msft_policy_config_devicelock_devicepasswordenabled",
              choiceSettingValue: {
                value:
                  "device_vendor_msft_policy_config_devicelock_devicepasswordenabled_0",
              },
            },
          },
        ],
        assignments: allDevicesAssignment,
      },
    ];

    expect(capabilityResult(data, "windows-password-required").status).toBe(
      "enforced",
    );
  });

  it("evaluates typed graph properties by exact odata type and value", () => {
    const data = emptyExportData();
    data.compliancePolicies = [
      {
        id: "win-compliance",
        displayName: "Windows compliance",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        configType: "Compliance Policy",
        bitLockerEnabled: true,
        defenderEnabled: false,
        osMinimumVersion: "10.0.22631",
        scheduledActionsForRule: [
          {
            scheduledActionConfigurations: [
              { actionType: "block", gracePeriodHours: 0 },
            ],
          },
        ],
        assignments: allDevicesAssignment,
      },
    ];

    expect(capabilityResult(data, "windows-disk-encryption").status).toBe(
      "enforced",
    );
    expect(capabilityResult(data, "windows-minimum-os-version").status).toBe(
      "enforced",
    );

    // Graph returns false for unset compliance booleans, so false is
    // ambiguous and must not be treated as counter-evidence.
    const antimalware = capabilityResult(data, "windows-realtime-antimalware");
    expect(antimalware.status).toBe("noEvidence");
    expect(antimalware.evidence).toHaveLength(0);

    const encryption = capabilityResult(data, "windows-disk-encryption");
    expect(encryption.evidence[0]?.note).toContain("block action");

    // Same properties on a different policy type must not match.
    const crossType = emptyExportData();
    crossType.deviceConfigurations = [
      {
        id: "not-windows",
        displayName: "Android policy with lookalike property",
        "@odata.type": "#microsoft.graph.androidGeneralDeviceConfiguration",
        bitLockerEnabled: true,
        assignments: allDevicesAssignment,
      },
    ];
    expect(capabilityResult(crossType, "windows-disk-encryption").status).toBe(
      "noEvidence",
    );
  });

  it("assesses Secure Boot and code integrity as separate capabilities", () => {
    const data = emptyExportData();
    data.compliancePolicies = [
      {
        id: "win-integrity",
        displayName: "Windows integrity",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        secureBootEnabled: true,
        codeIntegrityEnabled: true,
        assignments: allDevicesAssignment,
      },
    ];

    expect(capabilityResult(data, "windows-secure-boot").status).toBe(
      "enforced",
    );
    expect(capabilityResult(data, "windows-code-integrity").status).toBe(
      "enforced",
    );
    expect(
      assessCapabilities(data).some(
        (result) => result.capability.id === "windows-boot-integrity",
      ),
    ).toBe(false);
  });

  it("ignores present values that match neither enforced nor disabled expectations", () => {
    const data = emptyExportData();
    data.windowsUpdatePolicies = [
      {
        id: "update-ring",
        displayName: "Notify-only ring",
        "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
        automaticUpdateMode: "notifyDownload",
        assignments: allDevicesAssignment,
      },
    ];

    const result = capabilityResult(data, "windows-automatic-updates");
    expect(result.status).toBe("noEvidence");
    expect(result.evidence).toHaveLength(0);
  });

  it("finds settings nested inside group and choice children", () => {
    const data = emptyExportData();
    data.settingsCatalog = [
      {
        id: "nested",
        name: "Firewall policy",
        configType: "Settings Catalog",
        settings: [
          {
            id: "0",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
              settingDefinitionId:
                "vendor_msft_firewall_mdmstore_domainprofile",
              groupSettingCollectionValue: [
                {
                  children: [
                    {
                      "@odata.type":
                        "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                      settingDefinitionId:
                        "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall",
                      choiceSettingValue: {
                        value:
                          "vendor_msft_firewall_mdmstore_domainprofile_enablefirewall_true",
                      },
                    },
                  ],
                },
              ],
            },
          },
        ],
        assignments: allDevicesAssignment,
      },
    ];

    expect(capabilityResult(data, "windows-firewall").status).toBe("enforced");
  });

  it("treats an empty osMinimumVersion as no evidence", () => {
    const data = emptyExportData();
    data.compliancePolicies = [
      {
        id: "empty-min",
        displayName: "macOS compliance",
        "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
        osMinimumVersion: "",
        assignments: allDevicesAssignment,
      },
    ];

    expect(capabilityResult(data, "macos-minimum-os-version").status).toBe(
      "noEvidence",
    );
  });
});

describe("framework assessment", () => {
  it("sorts control ids naturally by numeric segments", () => {
    expect(["SYS.2.2.3.A14", "SYS.2.2.3.A4"].sort(compareControlIds)).toEqual([
      "SYS.2.2.3.A4",
      "SYS.2.2.3.A14",
    ]);
    expect(["SC-28", "SC-7"].sort(compareControlIds)).toEqual([
      "SC-7",
      "SC-28",
    ]);
    expect(["PR.DS-01", "PR.AA-03"].sort(compareControlIds)).toEqual([
      "PR.AA-03",
      "PR.DS-01",
    ]);
  });

  it("aggregates capability results into per-control evidence statuses", () => {
    const data = emptyExportData();
    data.settingsCatalog = [bitLockerCatalogPolicy("_1", allDevicesAssignment)];

    const capabilities = assessCapabilities(data);
    const nist = assessFramework(capabilities, NIST_800_53);

    const sc28 = nist.controls.find((c) => c.control.id === "SC-28");
    expect(sc28?.status).toBe("partialEvidence");
    expect(sc28?.enforcedCapabilityIds).toEqual(["windows-disk-encryption"]);

    const ia5 = nist.controls.find((c) => c.control.id === "IA-5");
    expect(ia5?.status).toBe("noEvidence");

    const csf = assessFramework(capabilities, NIST_CSF);
    const prDs01 = csf.controls.find((c) => c.control.id === "PR.DS-01");
    expect(prDs01?.status).toBe("partialEvidence");
    expect(prDs01?.enforcedCapabilityIds).toEqual(["windows-disk-encryption"]);

    const bsi = assessFramework(capabilities, BSI_IT_GRUNDSCHUTZ);
    const con1 = bsi.controls.find((c) => c.control.id === "CON.1");
    expect(con1?.status).toBe("partialEvidence");
    expect(con1?.enforcedCapabilityIds).toEqual(["windows-disk-encryption"]);
  });

  it("only reports evidenceFound when every mapped capability is enforced", () => {
    const data = emptyExportData();
    data.compliancePolicies = [
      {
        id: "win",
        displayName: "Win",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        osMinimumVersion: "10.0",
        assignments: allDevicesAssignment,
      },
      {
        id: "mac",
        displayName: "Mac",
        "@odata.type": "#microsoft.graph.macOSCompliancePolicy",
        osMinimumVersion: "14.0",
        assignments: allDevicesAssignment,
      },
      {
        id: "ios",
        displayName: "iOS",
        "@odata.type": "#microsoft.graph.iosCompliancePolicy",
        osMinimumVersion: "17.0",
        assignments: allDevicesAssignment,
      },
      {
        id: "android",
        displayName: "Android",
        "@odata.type": "#microsoft.graph.androidCompliancePolicy",
        osMinimumVersion: "13.0",
        assignments: allDevicesAssignment,
      },
    ];

    const nist = assessFramework(assessCapabilities(data), NIST_800_53);
    const si2 = nist.controls.find((c) => c.control.id === "SI-2");
    // windows-automatic-updates also maps to SI-2 and is not enforced here.
    expect(si2?.status).toBe("partialEvidence");
    expect(si2?.enforcedCapabilityIds).toHaveLength(4);
  });

  it("assesses BSI mobile requirements at requirement level", () => {
    const data = emptyExportData();
    data.deviceConfigurations = [
      {
        id: "android-config",
        displayName: "Android baseline",
        "@odata.type": "#microsoft.graph.aospDeviceOwnerDeviceConfiguration",
        appsBlockInstallFromUnknownSources: true,
        assignments: allDevicesAssignment,
      },
    ];
    data.compliancePolicies = [
      {
        id: "ios-compliance",
        displayName: "iOS compliance",
        "@odata.type": "#microsoft.graph.iosCompliancePolicy",
        securityBlockJailbrokenDevices: true,
        assignments: allDevicesAssignment,
      },
    ];

    const bsi = assessFramework(assessCapabilities(data), BSI_IT_GRUNDSCHUTZ);

    // SYS.3.2.1.A8 is fully evidenced (only the Android capability maps to it).
    const a8 = bsi.controls.find((c) => c.control.id === "SYS.3.2.1.A8");
    expect(a8?.status).toBe("evidenceFound");
    expect(a8?.control.tier).toBe("Basis-Anforderung");

    // SYS.3.2.2.A17 needs both iOS and Android integrity; only iOS is enforced.
    const a17 = bsi.controls.find((c) => c.control.id === "SYS.3.2.2.A17");
    expect(a17?.status).toBe("partialEvidence");
    expect(a17?.enforcedCapabilityIds).toEqual(["ios-jailbreak-block"]);

    const a4 = bsi.controls.find((c) => c.control.id === "SYS.3.2.1.A4");
    expect(a4?.status).toBe("noEvidence");
  });

  it("assesses BSI Windows and macOS requirements at requirement level", () => {
    const data = emptyExportData();
    data.deviceConfigurations = [
      {
        id: "win-general",
        displayName: "Windows restrictions",
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        diagnosticsDataSubmissionMode: "none",
        cortanaBlocked: true,
        microsoftAccountBlocked: false,
        assignments: allDevicesAssignment,
      },
      {
        id: "mac-endpoint",
        displayName: "macOS endpoint protection",
        "@odata.type": "#microsoft.graph.macOSEndpointProtectionConfiguration",
        gatekeeperAllowedAppSource: "macAppStoreAndIdentifiedDevelopers",
        fileVaultEnabled: true,
        assignments: allDevicesAssignment,
      },
    ];

    const capabilities = assessCapabilities(data);
    const bsi = assessFramework(capabilities, BSI_IT_GRUNDSCHUTZ);

    expect(
      bsi.controls.find((c) => c.control.id === "SYS.2.2.3.A4")?.status,
    ).toBe("evidenceFound");
    expect(
      bsi.controls.find((c) => c.control.id === "SYS.2.2.3.A14")?.status,
    ).toBe("evidenceFound");
    // microsoftAccountBlocked: false is counter-evidence, not coverage.
    expect(
      bsi.controls.find((c) => c.control.id === "SYS.2.2.3.A6")?.status,
    ).toBe("noEvidence");
    // SYS.2.4.A2 needs SIP (compliance policy) and Gatekeeper; only Gatekeeper here.
    expect(
      bsi.controls.find((c) => c.control.id === "SYS.2.4.A2")?.status,
    ).toBe("partialEvidence");
    expect(
      bsi.controls.find((c) => c.control.id === "SYS.2.4.A4")?.status,
    ).toBe("evidenceFound");
  });

  it("produces a full assessment with disclaimer and all frameworks", () => {
    const data = emptyExportData();
    const assessment = assessCompliance(data);

    expect(assessment.disclaimer).toContain("not a compliance certification");
    expect(assessment.frameworks.map((f) => f.framework.id)).toEqual([
      "nist-800-53-r5",
      "nist-csf-2",
      "bsi-it-grundschutz",
      "iso-27001-2022",
      "soc2-tsc",
    ]);
    for (const framework of assessment.frameworks) {
      expect(framework.summary.withoutEvidence).toBe(
        framework.summary.totalControls,
      );
    }
  });

  it("keeps capability catalog and framework mappings consistent", () => {
    const capabilityIds = new Set(
      assessCapabilities(emptyExportData()).map((r) => r.capability.id),
    );

    for (const framework of [
      NIST_800_53,
      NIST_CSF,
      BSI_IT_GRUNDSCHUTZ,
      ISO_27001,
      SOC_2,
    ]) {
      for (const [capabilityId, controlIds] of Object.entries(
        framework.mappings,
      )) {
        expect(capabilityIds.has(capabilityId)).toBe(true);
        for (const controlId of controlIds) {
          expect(framework.controls[controlId]).toBeDefined();
        }
      }
      for (const capabilityId of capabilityIds) {
        expect(framework.mappings[capabilityId]).toBeDefined();
      }
    }
  });
});
