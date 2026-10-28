import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "~/lib/configuration-analyzer";
import type { ConfigurationSectionData } from "~/lib/configuration-sections";
import { CONTOSO_TENANT } from "~/lib/compliance/demo/contoso-tenant";
import { assessCompliance } from "~/lib/compliance/engine";
import {
  compactAssessment,
  projectSnapshot,
  restoreCollection,
  SNAPSHOT_FORMAT,
  type SnapshotSource,
} from "~/lib/snapshots/projection";

const CANARY = "CANARY-SECRET-7f3a";

function section(
  key: string,
  items: unknown[],
  familyKey = key,
): ConfigurationSectionData {
  return { key, familyKey, label: key, selectionPrefix: key, items };
}

// The legacy arrays and scripts as sections, the shape the desktop collects.
function withSections(data: DetailedExportData): DetailedExportData {
  return {
    ...data,
    sections: [
      section("settingsCatalog", data.settingsCatalog),
      section("deviceConfigurations", data.deviceConfigurations),
      section("administrativeTemplates", data.administrativeTemplates),
      section("securityBaselines", data.securityBaselines),
      section("compliancePolicies", data.compliancePolicies),
      section("appProtectionPolicies", data.appProtectionPolicies ?? []),
      section("windowsScripts", data.scripts.windows, "scripts"),
      section("macOSScripts", data.scripts.macOS, "scripts"),
      section("appConfigurations", data.appConfigurations ?? []),
      section("windowsUpdatePolicies", data.windowsUpdatePolicies ?? []),
      section("enrollmentConfigurations", data.enrollmentConfigurations ?? []),
      section(
        "conditionalAccessPolicies",
        data.conditionalAccessPolicies ?? [],
      ),
    ],
  };
}

const assignment = {
  intent: "required",
  target: {
    "@odata.type": "#microsoft.graph.groupAssignmentTarget",
    groupId: "group-1",
    deviceAndAppManagementAssignmentFilterType: "none",
    secretTargetProperty: CANARY,
  },
};

// One item per section type, each with a canary in a property the
// projection must drop.
function canaryCollection(): SnapshotSource & DetailedExportData {
  const sections: ConfigurationSectionData[] = [
    section("settingsCatalog", [
      {
        id: "catalog-1",
        name: "Catalog",
        description: CANARY,
        unknownGraphProperty: CANARY,
        assignments: [assignment],
        settings: [
          {
            id: "0",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
              settingDefinitionId: "vendor_msft_wifi_presharedkey",
              simpleSettingValue: {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
                value: CANARY,
                valueState: "notEncrypted",
              },
              extra: CANARY,
            },
            settingDefinitions: [
              {
                id: "vendor_msft_wifi_presharedkey",
                displayName: "Pre-shared key",
                description: CANARY,
                helpText: CANARY,
              },
            ],
          },
        ],
      },
    ]),
    section("deviceConfigurations", [
      {
        id: "device-1",
        "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
        displayName: "Custom",
        wifiPreSharedKey: CANARY,
        omaSettings: [
          {
            "@odata.type": "#microsoft.graph.omaSettingString",
            omaUri: "./Vendor/MSFT/Custom/Token",
            displayName: "Token",
            value: CANARY,
          },
        ],
      },
    ]),
    section("administrativeTemplates", [
      {
        id: "admx-1",
        displayName: "ADMX",
        unknownGraphProperty: CANARY,
        definitionValues: [
          {
            enabled: true,
            definition: {
              id: "def-1",
              displayName: "Proxy",
              explainText: CANARY,
            },
            presentationValues: [
              {
                value: "proxy.contoso.com",
                presentation: {
                  id: "pres-1",
                  label: "Server",
                  helpText: CANARY,
                },
                secretField: CANARY,
              },
            ],
          },
        ],
      },
    ]),
    section("securityBaselines", [
      {
        id: "intent-1",
        displayName: "Intent",
        templateId: "template-1",
        unknownGraphProperty: CANARY,
        settings: [
          {
            definitionId: "deviceConfiguration--x",
            valueJson: "true",
            hint: CANARY,
          },
        ],
      },
    ]),
    section("compliancePolicies", [
      {
        id: "compliance-1",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        displayName: "Compliance",
        bitLockerEnabled: true,
        unknownGraphProperty: CANARY,
        scheduledActionsForRule: [
          {
            ruleName: "PasswordRequired",
            scheduledActionConfigurations: [
              {
                actionType: "block",
                gracePeriodHours: 12,
                notificationMessageCCList: [CANARY],
              },
            ],
          },
        ],
      },
    ]),
    section("appProtectionPolicies", [
      {
        id: "mam-1",
        "@odata.type": "#microsoft.graph.iosManagedAppProtection",
        displayName: "MAM",
        customBrowserProtocol: CANARY,
      },
    ]),
    section(
      "windowsScripts",
      [
        {
          id: "script-1",
          displayName: "Script",
          fileName: "install.ps1",
          scriptContent: Buffer.from(`$token = "${CANARY}"`).toString("base64"),
        },
      ],
      "scripts",
    ),
    section(
      "macOSScripts",
      [{ id: "script-2", displayName: "Shell", scriptContent: CANARY }],
      "scripts",
    ),
    section("appConfigurations", [
      {
        id: "app-config-1",
        "@odata.type": "#microsoft.graph.iosMobileAppConfiguration",
        displayName: "App config",
        settings: [
          {
            appConfigKey: "serverUrl",
            appConfigKeyType: "stringType",
            appConfigKeyValue: CANARY,
          },
        ],
        encodedSettingXml: CANARY,
        payloadJson: CANARY,
      },
    ]),
    section("windowsUpdatePolicies", [
      {
        id: "ring-1",
        "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
        displayName: "Ring",
        qualityUpdatesDeferralPeriodInDays: 3,
        businessReadyUpdatesOnly: CANARY,
      },
    ]),
    section("enrollmentConfigurations", [
      {
        id: "esp-1",
        displayName: "ESP",
        customErrorMessage: CANARY,
        priority: 1,
      },
    ]),
    section("conditionalAccessPolicies", [
      {
        id: "ca-1",
        displayName: "CA",
        state: "enabled",
        conditions: {
          users: { includeUsers: ["All"], note: CANARY },
          applications: {
            includeApplications: ["All"],
            applicationFilter: { mode: "exclude", rule: "x", extra: CANARY },
          },
          locations: { includeLocations: ["All"], label: CANARY },
          futureCondition: { value: CANARY },
          // Not a field of the allowlist even though every object has it.
          constructor: CANARY,
        },
        grantControls: {
          operator: "OR",
          builtInControls: ["mfa"],
          "authenticationStrength@odata.context": CANARY,
          authenticationStrength: {
            id: "00000000-0000-0000-0000-000000000002",
            requirementsSatisfied: "mfa",
            combinationConfigurations: [{ secret: CANARY }],
          },
          futureGrant: CANARY,
        },
        sessionControls: { secret: CANARY },
      },
    ]),
    section("deviceHealthScripts", [
      {
        id: "remediation-1",
        displayName: "Remediation",
        detectionScriptContent: CANARY,
        remediationScriptContent: CANARY,
        detectionScriptParameters: [{ name: CANARY }],
      },
    ]),
    section("mobileApps", [
      {
        id: "app-1",
        displayName: "App",
        "@odata.type": "#microsoft.graph.win32LobApp",
        largeIcon: { value: CANARY },
        installCommandLine: CANARY,
        assignments: [assignment],
      },
    ]),
  ];
  return {
    collectedAt: "2026-10-18T10:00:00Z",
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    sections,
    fetchErrors: [],
    tenantIdentityPolicies: {
      authenticationMethods: {
        policyMigrationState: "migrationComplete",
        reportSuspiciousActivitySettings: { voiceReportingCode: CANARY },
        registrationEnforcement: {
          other: CANARY,
          authenticationMethodsRegistrationCampaign: {
            snoozeDurationInDays: 1,
            enforceRegistrationAfterAllowedSnoozes: false,
            state: "enabled",
            note: CANARY,
            excludeTargets: [{ id: "user-1", targetType: "user", note: CANARY }],
            includeTargets: [
              {
                id: "group-1",
                targetType: "group",
                targetedAuthenticationMethod: "FIDO2",
                note: CANARY,
              },
            ],
          },
        },
        authenticationMethodConfigurations: [
          {
            "@odata.type":
              "#microsoft.graph.smsAuthenticationMethodConfiguration",
            id: "Sms",
            state: "enabled",
            includeTargets: [
              { targetType: "group", id: "all_users", note: CANARY },
            ],
            telecomProviderSettings: CANARY,
          },
        ],
      },
      securityDefaults: { isEnabled: false, description: CANARY },
      authorization: {
        allowInvitesFrom: "everyone",
        clientSecret: CANARY,
        defaultUserRolePermissions: {
          allowedToCreateApps: true,
          other: CANARY,
        },
      },
      status: {
        authenticationMethods: "collected",
        securityDefaults: "collected",
        authorization: "collected",
      },
    },
    policyDeviceStatus: {
      collectedAt: "2026-10-18T10:00:00Z",
      sources: { configurationPolicies: "collected" },
      rows: [
        {
          policyId: "catalog-1",
          policyName: "Catalog",
          source: "configurationPolicies",
          succeeded: 3,
          error: 1,
          conflict: 0,
          notApplicable: null,
          pending: 2,
          userPrincipalName: CANARY,
        },
      ],
    },
  } as unknown as SnapshotSource & DetailedExportData;
}

// Keyed like the store's fingerprints.
const fingerprint = (digest: string) =>
  createHmac("sha256", "test key").update(digest).digest("hex").slice(0, 32);

function project(collection: SnapshotSource & DetailedExportData) {
  return projectSnapshot(
    collection,
    assessCompliance(collection),
    new Map([["group-1", "Finance"]]),
    fingerprint,
  );
}

describe("projectSnapshot", () => {
  it("keeps no canary secret from any section type", () => {
    const collection = canaryCollection();
    expect(JSON.stringify(collection)).toContain(CANARY);
    const projection = project(collection);
    for (const section of projection.sections) {
      expect(JSON.stringify(section), section.key).not.toContain(CANARY);
    }
    expect(JSON.stringify(projection)).not.toContain(CANARY);
    // The base64 script body is gone as well.
    expect(JSON.stringify(projection)).not.toContain(
      Buffer.from(`$token = "${CANARY}"`).toString("base64").slice(0, 20),
    );
  });

  it("keeps identity, assignments and the fields the engine reads", () => {
    const projection = project(canaryCollection());
    expect(projection.format).toBe(SNAPSHOT_FORMAT);
    const item = (key: string) =>
      projection.sections.find((entry) => entry.key === key)!.items[0]!;
    expect(item("settingsCatalog").data).toMatchObject({
      id: "catalog-1",
      name: "Catalog",
      assignments: [
        {
          intent: "required",
          target: {
            "@odata.type": "#microsoft.graph.groupAssignmentTarget",
            groupId: "group-1",
            deviceAndAppManagementAssignmentFilterType: "none",
          },
        },
      ],
      settings: [
        {
          settingInstance: {
            settingDefinitionId: "vendor_msft_wifi_presharedkey",
            simpleSettingValue: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
            },
          },
          settingDefinitions: [
            {
              id: "vendor_msft_wifi_presharedkey",
              displayName: "Pre-shared key",
            },
          ],
        },
      ],
    });
    expect(item("compliancePolicies").data).toMatchObject({
      bitLockerEnabled: true,
      scheduledActionsForRule: [
        {
          ruleName: "PasswordRequired",
          scheduledActionConfigurations: [
            { actionType: "block", gracePeriodHours: 12 },
          ],
        },
      ],
    });
    expect(
      item("windowsUpdatePolicies").data.qualityUpdatesDeferralPeriodInDays,
    ).toBe(3);
    // Exactly the allowlisted fields, nested ones included.
    expect(item("conditionalAccessPolicies").data).toMatchObject({
      state: "enabled",
      conditions: {
        users: { includeUsers: ["All"] },
        applications: {
          includeApplications: ["All"],
          applicationFilter: { mode: "exclude", rule: "x" },
        },
        locations: { includeLocations: ["All"] },
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["mfa"],
        authenticationStrength: {
          id: "00000000-0000-0000-0000-000000000002",
          requirementsSatisfied: "mfa",
        },
      },
    });
    const ca = item("conditionalAccessPolicies").data as Record<
      string,
      Record<string, unknown>
    >;
    expect(Object.keys(ca.conditions!)).toEqual([
      "users",
      "applications",
      "locations",
    ]);
    expect(Object.keys(ca.grantControls!)).toEqual([
      "operator",
      "builtInControls",
      "authenticationStrength",
    ]);
    expect(
      item("conditionalAccessPolicies").data.sessionControls,
    ).toBeUndefined();
    expect(item("deviceConfigurations").data.omaSettings).toEqual([
      {
        "@odata.type": "#microsoft.graph.omaSettingString",
        omaUri: "./Vendor/MSFT/Custom/Token",
        displayName: "Token",
      },
    ]);
    expect(item("windowsScripts").data.fileName).toBe("install.ps1");
    expect(item("windowsScripts").fingerprints?.scriptContent).toMatch(
      /^[0-9a-f]{32}$/,
    );
    expect(item("deviceHealthScripts").fingerprints).toEqual({
      detectionScriptContent: expect.stringMatching(/^[0-9a-f]{32}$/),
      remediationScriptContent: expect.stringMatching(/^[0-9a-f]{32}$/),
    });
    expect(item("appConfigurations").data.settings).toBeUndefined();
    expect(item("enrollmentConfigurations").data).toEqual({
      id: "esp-1",
      displayName: "ESP",
      priority: 1,
    });
    expect(projection.groupNames).toEqual({ "group-1": "Finance" });
  });

  it("keeps the documented identity policy fields and device status rows", () => {
    const projection = project(canaryCollection());
    expect(projection.tenantIdentityPolicies).toEqual({
      authenticationMethods: {
        policyMigrationState: "migrationComplete",
        authenticationMethodConfigurations: [
          {
            "@odata.type":
              "#microsoft.graph.smsAuthenticationMethodConfiguration",
            id: "Sms",
            state: "enabled",
            includeTargets: [{ targetType: "group", id: "all_users" }],
            // The collection omitted excludeTargets, so none is invented.
          },
        ],
        registrationEnforcement: {
          authenticationMethodsRegistrationCampaign: {
            snoozeDurationInDays: 1,
            enforceRegistrationAfterAllowedSnoozes: false,
            state: "enabled",
            includeTargets: [
              {
                targetType: "group",
                id: "group-1",
                targetedAuthenticationMethod: "FIDO2",
              },
            ],
            excludeTargets: [{ targetType: "user", id: "user-1" }],
          },
        },
      },
      securityDefaults: { isEnabled: false },
      // An older collection's authorization policy is not evaluated and is
      // dropped with its status.
      status: {
        authenticationMethods: "collected",
        securityDefaults: "collected",
      },
    });
    expect(projection.policyDeviceStatus?.rows).toEqual([
      {
        policyId: "catalog-1",
        policyName: "Catalog",
        source: "configurationPolicies",
        succeeded: 3,
        error: 1,
        conflict: 0,
        notApplicable: null,
        pending: 2,
      },
    ]);
  });

  it("leaves the optional collection fields out when absent", () => {
    const collection = canaryCollection();
    delete collection.tenantIdentityPolicies;
    delete collection.policyDeviceStatus;
    const projection = project(collection);
    expect("tenantIdentityPolicies" in projection).toBe(false);
    expect("policyDeviceStatus" in projection).toBe(false);
  });

  it("marks failed families, incomplete items and a partial collection", () => {
    const collection = canaryCollection();
    collection.sections![1]!.items.push({
      id: "device-2",
      displayName: "Broken",
      hasFetchError: true,
    });
    collection.fetchErrors = [
      {
        policyId: "N/A",
        policyName: "Compliance Policies",
        policyType: "Compliance Policies",
        familyKey: "compliancePolicies",
        error: "Forbidden",
      },
      {
        policyId: "collection-Windows PowerShell Scripts",
        policyName: "Windows PowerShell Scripts",
        policyType: "Windows PowerShell Scripts",
        familyKey: "scripts",
        error: "Timeout",
      },
      {
        policyId: "admx-1",
        policyName: "ADMX",
        policyType: "Administrative Template",
        familyKey: "administrativeTemplates",
        error: "Presentation values failed",
      },
    ];
    collection.sections!.push({
      ...section("roleScopeTags", []),
      error: { message: "Forbidden" },
    });
    collection.collectionSkippedFamilies = ["conditionalAccessPolicies"];
    const projection = project(collection);
    const status = Object.fromEntries(
      projection.sections.map((entry) => [entry.key, entry.status]),
    );
    expect(projection.partial).toBe(true);
    expect(status).toMatchObject({
      compliancePolicies: "failed",
      windowsScripts: "failed",
      macOSScripts: "failed",
      roleScopeTags: "failed",
      conditionalAccessPolicies: "skipped",
      settingsCatalog: "complete",
      administrativeTemplates: "complete",
    });
    const items = (key: string) =>
      projection.sections.find((entry) => entry.key === key)!.items;
    expect(
      items("deviceConfigurations").map((item) => item.incomplete),
    ).toEqual([undefined, true]);
    expect(items("administrativeTemplates")[0]!.incomplete).toBe(true);
  });

  it("is not partial for a clean collection", () => {
    expect(project(canaryCollection()).partial).toBe(false);
  });

  it("is partial when only a family was skipped", () => {
    const collection = canaryCollection();
    collection.collectionSkippedFamilies = ["conditionalAccessPolicies"];
    expect(project(collection).partial).toBe(true);
  });

  it("is partial when an Entra identity policy was not collected", () => {
    for (const gap of ["failed", "skipped", "permissionDenied"] as const) {
      const collection = canaryCollection();
      const identity = collection.tenantIdentityPolicies as {
        status: Record<string, string>;
      };
      identity.status.securityDefaults = gap;
      expect(project(collection).partial, gap).toBe(true);
    }
  });

  it("stores the assessment made at collection time", () => {
    const collection = canaryCollection();
    const assessment = assessCompliance(collection);
    const projection = projectSnapshot(collection, assessment, new Map());
    expect(projection.rulesetVersion).toBe(
      assessment.provenance.rulesetVersion,
    );
    expect(
      projection.assessment.capabilities.map((item) => item.status),
    ).toEqual(assessment.capabilities.map((item) => item.status));
    expect(projection.assessment.frameworks.map((item) => item.id)).toEqual(
      assessment.frameworks.map((item) => item.framework.id),
    );
    const framework = projection.assessment.frameworks[0]!;
    expect(framework.controls[0]).toEqual({
      id: assessment.frameworks[0]!.controls[0]!.control.id,
      title: assessment.frameworks[0]!.controls[0]!.control.title,
      status: assessment.frameworks[0]!.controls[0]!.status,
      capabilityIds: assessment.frameworks[0]!.controls[0]!.capabilityIds,
    });
    // Capability definitions and signals are not stored.
    expect(JSON.stringify(projection.assessment)).not.toContain("signals");
  });
});

describe("restoreCollection", () => {
  it("assesses a restored snapshot like the original collection", () => {
    const original = withSections(CONTOSO_TENANT);
    const before = assessCompliance(original);
    const projection = projectSnapshot(
      original,
      before,
      CONTOSO_TENANT.groupNames ?? new Map(),
    );
    const restored = restoreCollection(
      JSON.parse(JSON.stringify(projection)),
    ) as unknown as DetailedExportData;
    const after = assessCompliance(restored);
    expect(
      before.capabilities.filter((item) => item.evidence.length).length,
    ).toBeGreaterThan(10);
    expect(
      after.capabilities.map((item) => [item.capability.id, item.status]),
    ).toEqual(
      before.capabilities.map((item) => [item.capability.id, item.status]),
    );
    expect(
      after.frameworks.map((framework) =>
        framework.controls.map((control) => control.status),
      ),
    ).toEqual(
      before.frameworks.map((framework) =>
        framework.controls.map((control) => control.status),
      ),
    );
    expect(
      after.capabilities.flatMap((item) =>
        item.evidence.map((evidence) => [
          evidence.policyId,
          evidence.settingId,
          evidence.observedValue,
          evidence.assignment.targets,
        ]),
      ),
    ).toEqual(
      before.capabilities.flatMap((item) =>
        item.evidence.map((evidence) => [
          evidence.policyId,
          evidence.settingId,
          evidence.observedValue,
          evidence.assignment.targets,
        ]),
      ),
    );
    // What a snapshot stores, checks included, is the same for both.
    expect(compactAssessment(after).capabilities).toEqual(
      compactAssessment(before).capabilities,
    );
  });

  it("assesses restored tenant identity policies like the originals", () => {
    const collection = canaryCollection();
    const before = assessCompliance(collection);
    const restored = restoreCollection(
      JSON.parse(
        JSON.stringify(projectSnapshot(collection, before, new Map())),
      ),
    ) as unknown as DetailedExportData;
    const statuses = (assessment: ReturnType<typeof assessCompliance>) =>
      assessment.capabilities
        .filter((item) => item.capability.platform === "tenant")
        .map((item) => [item.capability.id, item.status, item.evidence.length]);
    expect(statuses(assessCompliance(restored))).toEqual(statuses(before));
  });

  it("rebuilds the legacy arrays, scripts and group names", () => {
    const projection = project(canaryCollection());
    const restored = restoreCollection(projection);
    expect(restored.settingsCatalog).toHaveLength(1);
    expect(restored.scripts.windows).toHaveLength(1);
    expect(restored.scripts.macOS).toHaveLength(1);
    expect(restored.groupNames.get("group-1")).toBe("Finance");
    expect(restored.sections.map((entry) => entry.key)).toEqual(
      projection.sections.map((entry) => entry.key),
    );
    expect(restored.tenantIdentityPolicies?.securityDefaults).toEqual({
      isEnabled: false,
    });
  });
});
