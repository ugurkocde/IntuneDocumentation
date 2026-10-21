import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import type { ConfigurationSectionData } from "../../../../src/lib/configuration-sections";
import { assessCompliance } from "../../../../src/lib/compliance";
import { projectSnapshot, type SnapshotProjection } from "../../../../src/lib/snapshots/projection";
import { compareProjections, managementChanges } from "./history";

// Round 14: a field Graph omitted in one of two collections is a collection
// gap in the management change counts, never evidence gained or lost and
// never an Entra setting change. Shapes as Graph beta returned them in the
// lab tenant on 21 October 2026.

const assigned = [{ id: "a-1", target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }];

function mfaPolicy(): Record<string, any> {
  return {
    id: "ca-mfa",
    displayName: "CA - Require MFA",
    state: "enabled",
    conditions: {
      users: { includeUsers: ["All"], excludeUsers: [], includeGroups: [], excludeGroups: [], includeRoles: [], excludeRoles: [] },
      applications: { includeApplications: ["All"], excludeApplications: [], includeUserActions: [] },
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
  };
}

function ring(): Record<string, any> {
  return {
    "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
    id: "ring-1",
    displayName: "Ring 1",
    automaticUpdateMode: "autoInstallAndRebootAtScheduledTime",
    qualityUpdatesDeferralPeriodInDays: 0,
    deadlineForQualityUpdatesInDays: 2,
    deadlineGracePeriodInDays: 0,
    qualityUpdatesPaused: false,
    assignments: assigned,
  };
}

function identity(edit?: (methods: Record<string, any>, defaults: Record<string, any>) => void) {
  const methods: Record<string, any> = {
    policyMigrationState: "migrationComplete",
    registrationEnforcement: {
      authenticationMethodsRegistrationCampaign: {
        snoozeDurationInDays: 1,
        enforceRegistrationAfterAllowedSnoozes: false,
        state: "default",
        includeTargets: [{ targetType: "group", id: "all_users" }],
        excludeTargets: [],
      },
    },
    authenticationMethodConfigurations: [
      { id: "Fido2", state: "disabled", includeTargets: [{ targetType: "group", id: "all_users" }], excludeTargets: [] },
      { id: "Sms", state: "disabled", includeTargets: [{ targetType: "group", id: "all_users" }], excludeTargets: [] },
      {
        id: "X509Certificate",
        state: "enabled",
        includeTargets: [{ targetType: "group", id: "all_users" }],
        excludeTargets: [],
        authenticationModeConfiguration: { x509CertificateAuthenticationDefaultMode: "x509CertificateMultiFactor" },
      },
    ],
  };
  const defaults: Record<string, any> = { isEnabled: false };
  edit?.(methods, defaults);
  return {
    status: { authenticationMethods: "collected", securityDefaults: "collected" },
    authenticationMethods: methods,
    securityDefaults: defaults,
  } as DetailedExportData["tenantIdentityPolicies"];
}

const method = (methods: Record<string, any>, id: string) =>
  methods.authenticationMethodConfigurations.find((entry: { id: string }) => entry.id === id);

function section(key: string, items: unknown[]): ConfigurationSectionData {
  return { key, familyKey: key, label: key, selectionPrefix: key, items } as ConfigurationSectionData;
}

function snapshot(
  collectedAt: string,
  parts: {
    conditionalAccess?: Record<string, any>[];
    deviceConfigurations?: Record<string, any>[];
    tenantIdentityPolicies?: DetailedExportData["tenantIdentityPolicies"];
  },
): SnapshotProjection {
  const conditionalAccess = parts.conditionalAccess ?? [];
  const deviceConfigurations = parts.deviceConfigurations ?? [];
  const data: DetailedExportData = {
    collectedAt,
    settingsCatalog: [],
    deviceConfigurations,
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    conditionalAccessPolicies: conditionalAccess,
    tenantIdentityPolicies: parts.tenantIdentityPolicies ?? identity(),
    sections: [
      section("deviceConfigurations", deviceConfigurations),
      section("conditionalAccessPolicies", conditionalAccess),
    ],
    fetchErrors: [],
  };
  return JSON.parse(JSON.stringify(projectSnapshot(data, assessCompliance(data), new Map())));
}

type Parts = Parameters<typeof snapshot>[1];

// Every framework's counts between the two collections.
function counts(fromParts: Parts, toParts: Parts) {
  const from = snapshot("2026-10-20T09:00:00Z", fromParts);
  const to = snapshot("2026-10-21T09:00:00Z", toParts);
  const compared = compareProjections(from, to);
  return compared.assessments.frameworks.map((framework) => managementChanges(from, to, compared, framework.id));
}

// Both directions: no measure gains or loses evidence, and at least one
// framework reports the collection gap opening, then closing.
function expectGapNotChange(definite: Parts, unknown: Parts) {
  for (const [from, to, gap] of [
    [definite, unknown, "opened"],
    [unknown, definite, "closed"],
  ] as const) {
    const all = counts(from, to);
    for (const result of all) {
      expect(result.improved, result.toRuleset).toBe(0);
      expect(result.regressed).toBe(0);
    }
    expect(all.some((result) => result.collectionGaps[gap] > 0)).toBe(true);
  }
}

describe("management changes when Graph omitted a field", () => {
  it("counts an omitted Conditional Access state as a collection gap", () => {
    const omitted = mfaPolicy();
    delete omitted.state;
    expectGapNotChange({ conditionalAccess: [mfaPolicy()] }, { conditionalAccess: [omitted] });
  });

  it("counts an omitted Conditional Access application list as a collection gap", () => {
    const omitted = mfaPolicy();
    delete omitted.conditions.applications.includeApplications;
    expectGapNotChange({ conditionalAccess: [mfaPolicy()] }, { conditionalAccess: [omitted] });
  });

  it("counts an update ring whose fields were all omitted as a collection gap", () => {
    const omitted = ring();
    for (const key of [
      "qualityUpdatesDeferralPeriodInDays",
      "deadlineForQualityUpdatesInDays",
      "deadlineGracePeriodInDays",
      "qualityUpdatesPaused",
      "automaticUpdateMode",
    ])
      delete omitted[key];
    expectGapNotChange({ deviceConfigurations: [ring()] }, { deviceConfigurations: [omitted] });
  });

  it.each([
    [
      "the certificate default mode",
      identity((methods) => {
        method(methods, "X509Certificate").authenticationModeConfiguration = {};
      }),
    ],
    [
      "an include target list",
      identity((methods) => {
        delete method(methods, "X509Certificate").includeTargets;
      }),
    ],
    [
      "the security defaults state",
      identity((_methods, defaults) => {
        delete defaults.isEnabled;
      }),
    ],
  ])("counts %s as an Entra gap, never an Entra change", (_label, unknown) => {
    for (const [from, to] of [
      [identity(), unknown],
      [unknown, identity()],
    ]) {
      for (const result of counts({ tenantIdentityPolicies: from }, { tenantIdentityPolicies: to })) {
        expect(result.identity).toEqual({ compared: 2, changes: 0, notCompared: 1 });
        expect(result.improved).toBe(0);
        expect(result.regressed).toBe(0);
      }
    }
  });

  it("counts one policy once when each side misses a different setting", () => {
    const earlier = identity((methods) => {
      delete method(methods, "Sms").includeTargets;
    });
    const later = identity((methods) => {
      method(methods, "X509Certificate").authenticationModeConfiguration = {};
    });
    const [result] = counts({ tenantIdentityPolicies: earlier }, { tenantIdentityPolicies: later });
    expect(result!.identity).toEqual({ compared: 2, changes: 0, notCompared: 1 });
  });

  it("still counts an Entra setting Graph returned with another value", () => {
    const changed = identity((methods) => {
      method(methods, "Sms").state = "enabled";
    });
    const [result] = counts({ tenantIdentityPolicies: identity() }, { tenantIdentityPolicies: changed });
    expect(result!.identity).toEqual({ compared: 2, changes: 1, notCompared: 0 });
  });
});
