import { describe, expect, it } from "vitest";
import type { ConfigurationSectionData } from "../configuration-sections";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance } from "../compliance";
import type { CapabilityResult } from "../compliance/types";
import {
  diffAssessments,
  diffIdentity,
  diffSnapshots,
} from "../snapshots/diff";
import {
  compactAssessment,
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import { compareSettings, projectionSettings } from "../snapshots/reference";
import { COMPLIANCE_CAPABILITIES } from "../compliance/capabilities";
import { graphPropertyValues } from "../compliance/documented-values";
import { generateFixPack } from "../compliance/fix-pack";
import { summarizeAssignments } from "../compliance/assignments";

// Round 14: a field Graph did not return is unknown. It never becomes a
// different or missing result, evidence added or removed, or a change.
// Explicit values, explicit nulls and documented not configured enums stay
// definite. The full shapes below are what Graph beta returned in the lab
// tenant on 21 October 2026.

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

/** An enabled MFA policy for all users and all apps, as Graph returns it. */
function mfaPolicy(): Record<string, any> {
  return {
    id: "ca-mfa",
    displayName: "CA - Require MFA",
    state: "enabled",
    conditions: {
      clientAppTypes: ["all"],
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeUserActions: [],
      },
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

/** An assigned update ring within the 14 day threshold. */
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

/** An assigned Windows compliance policy requiring BitLocker. */
function compliance(): Record<string, any> {
  return {
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    id: "compliance-1",
    displayName: "Windows compliance",
    bitLockerEnabled: true,
    storageRequireEncryption: false,
    assignments: assigned,
  };
}

function section(key: string, items: unknown[]): ConfigurationSectionData {
  return {
    key,
    familyKey: key,
    label: key,
    selectionPrefix: key,
    items,
  } as ConfigurationSectionData;
}

function data(
  parts: {
    conditionalAccess?: Record<string, any>[];
    deviceConfigurations?: Record<string, any>[];
    compliancePolicies?: Record<string, any>[];
  } = {},
): DetailedExportData {
  const conditionalAccess = parts.conditionalAccess ?? [];
  const deviceConfigurations = parts.deviceConfigurations ?? [];
  const compliancePolicies = parts.compliancePolicies ?? [];
  return {
    collectedAt: "2026-10-21T09:00:00Z",
    settingsCatalog: [],
    deviceConfigurations,
    administrativeTemplates: [],
    compliancePolicies,
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    conditionalAccessPolicies: conditionalAccess,
    sections: [
      section("deviceConfigurations", deviceConfigurations),
      section("compliancePolicies", compliancePolicies),
      section("conditionalAccessPolicies", conditionalAccess),
    ],
    fetchErrors: [],
  };
}

function capability(exportData: DetailedExportData, id: string) {
  return assessCompliance(exportData).capabilities.find(
    (result) => result.capability.id === id,
  )!;
}

function policyChecks(result: CapabilityResult) {
  return result.checks.filter((check) => check.policyId);
}

function projection(exportData: DetailedExportData): SnapshotProjection {
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(exportData, assessCompliance(exportData), new Map()),
    ),
  );
}

/**
 * History both ways between a definite and an unknown collection: the
 * capability is not compared and every control move it causes is a
 * collection gap on the unknown side, never evidence gained or lost.
 */
function expectGapBothWays(
  definite: DetailedExportData,
  unknown: DetailedExportData,
  capabilityId: string,
) {
  const stored = (exportData: DetailedExportData) =>
    compactAssessment(assessCompliance(exportData));
  for (const [from, to, side] of [
    [definite, unknown, "after"],
    [unknown, definite, "before"],
  ] as const) {
    const changes = diffAssessments(stored(from), stored(to))
      .frameworks.flatMap((framework) => framework.changes)
      .filter((change) =>
        change.causes.some((cause) => cause.capabilityId === capabilityId),
      );
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) {
      expect(change.incomplete[side]).toBe(true);
      expect(
        change.causes.find((cause) => cause.capabilityId === capabilityId),
      ).toMatchObject({
        notCompared: true,
        evidenceAdded: [],
        evidenceRemoved: [],
        checksChanged: [],
      });
    }
  }
}

describe("Conditional Access state Graph omitted", () => {
  const omitted = () => {
    const policy = mfaPolicy();
    delete policy.state;
    return policy;
  };

  it("is an unknown assignment, not a policy that does not apply", () => {
    const result = capability(
      data({ conditionalAccess: [omitted()] }),
      "tenant-mfa-required",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
        assignment: expect.objectContaining({ state: "unknown" }),
      }),
    ]);
  });

  it("is an unknown assignment for a state Graph did not document", () => {
    const result = capability(
      data({
        conditionalAccess: [{ ...mfaPolicy(), state: "someFutureState" }],
      }),
      "tenant-mfa-required",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        assignment: expect.objectContaining({ state: "unknown" }),
      }),
    ]);
  });

  it("keeps documented states definite", () => {
    for (const state of ["disabled", "enabledForReportingButNotEnforced"]) {
      const result = capability(
        data({ conditionalAccess: [{ ...mfaPolicy(), state }] }),
        "tenant-mfa-required",
      );
      expect(policyChecks(result)).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "different",
          assignment: expect.objectContaining({ state: "notAssigned" }),
        }),
      ]);
    }
  });

  it("is a collection gap in history in both directions", () => {
    expectGapBothWays(
      data({ conditionalAccess: [mfaPolicy()] }),
      data({ conditionalAccess: [omitted()] }),
      "tenant-mfa-required",
    );
  });
});

describe("Conditional Access targets Graph omitted", () => {
  it("is unable to check when includeApplications is missing from the applications object", () => {
    const policy = mfaPolicy();
    delete policy.conditions.applications.includeApplications;
    const result = capability(
      data({ conditionalAccess: [policy] }),
      "tenant-mfa-required",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
    expectGapBothWays(
      data({ conditionalAccess: [mfaPolicy()] }),
      data({ conditionalAccess: [policy] }),
      "tenant-mfa-required",
    );
  });

  it("is unable to check when a user include list is missing", () => {
    for (const key of ["includeUsers", "includeGroups", "includeRoles"]) {
      const policy = mfaPolicy();
      // Targets nobody through the lists that were returned.
      policy.conditions.users.includeUsers = ["None"];
      delete policy.conditions.users[key];
      const result = capability(
        data({ conditionalAccess: [policy] }),
        "tenant-mfa-required",
      );
      expect(policyChecks(result), key).toEqual([
        expect.objectContaining({
          assessmentStatus: "unableToCheck",
          result: null,
        }),
      ]);
    }
  });

  it("still reads a policy that targets nobody as a different configuration", () => {
    const policy = mfaPolicy();
    policy.conditions.users.includeUsers = ["None"];
    const result = capability(
      data({ conditionalAccess: [policy] }),
      "tenant-mfa-required",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
  });

  it("never reads an omitted app exclusion list as no exclusions", () => {
    const policy = mfaPolicy();
    delete policy.conditions.applications.excludeApplications;
    const result = capability(
      data({ conditionalAccess: [policy] }),
      "tenant-mfa-all-apps",
    );
    expect(result.evidence).toEqual([]);
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
  });
});

describe("Conditional Access grant controls Graph omitted", () => {
  it("never reads an omitted OR grant list as empty", () => {
    for (const key of [
      "builtInControls",
      "customAuthenticationFactors",
      "termsOfUse",
      "authenticationStrength",
    ]) {
      const policy = mfaPolicy();
      delete policy.grantControls[key];
      const result = capability(
        data({ conditionalAccess: [policy] }),
        "tenant-mfa-required",
      );
      expect(result.evidence, key).toEqual([]);
      expect(policyChecks(result), key).toEqual([
        expect.objectContaining({
          assessmentStatus: "unableToCheck",
          result: null,
        }),
      ]);
    }
  });

  it("is unable to check when the grant controls are omitted, and no candidate when they are null", () => {
    const omitted = mfaPolicy();
    delete omitted.grantControls;
    expect(
      policyChecks(
        capability(
          data({ conditionalAccess: [omitted] }),
          "tenant-mfa-required",
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
    // Session controls only: Graph returns grantControls null.
    expect(
      policyChecks(
        capability(
          data({
            conditionalAccess: [{ ...mfaPolicy(), grantControls: null }],
          }),
          "tenant-mfa-required",
        ),
      ),
    ).toEqual([]);
  });

  it("still finds MFA under AND when another grant list is omitted", () => {
    const policy = mfaPolicy();
    policy.grantControls.operator = "AND";
    delete policy.grantControls.termsOfUse;
    expect(
      capability(data({ conditionalAccess: [policy] }), "tenant-mfa-required")
        .status,
    ).toBe("enforced");
  });
});

describe("quality update ring fields Graph omitted", () => {
  const omitted = () => {
    const policy = ring();
    for (const key of [
      "qualityUpdatesDeferralPeriodInDays",
      "deadlineForQualityUpdatesInDays",
      "deadlineGracePeriodInDays",
      "qualityUpdatesPaused",
      "automaticUpdateMode",
    ])
      delete policy[key];
    return policy;
  };

  it("shows no omitted field as null in the actual value", () => {
    const [check] = policyChecks(
      capability(
        data({ deviceConfigurations: [omitted()] }),
        "windows-quality-update-deadline",
      ),
    );
    expect(check!.actualValue).toBe("{}");
  });

  it("is unable to check, not missing, when every field is omitted", () => {
    const result = capability(
      data({ deviceConfigurations: [omitted()] }),
      "windows-quality-update-deadline",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        policyName: "Ring 1",
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
    expect(result.checks.some((check) => check.result === "missing")).toBe(
      false,
    );
    expectGapBothWays(
      data({ deviceConfigurations: [ring()] }),
      data({ deviceConfigurations: [omitted()] }),
      "windows-quality-update-deadline",
    );
  });

  it("keeps a ring whose fields are all null definite", () => {
    const policy = ring();
    for (const key of [
      "qualityUpdatesDeferralPeriodInDays",
      "deadlineForQualityUpdatesInDays",
      "deadlineGracePeriodInDays",
      "qualityUpdatesPaused",
      "automaticUpdateMode",
    ])
      policy[key] = null;
    const result = capability(
      data({ deviceConfigurations: [policy] }),
      "windows-quality-update-deadline",
    );
    expect(policyChecks(result)).toEqual([]);
    expect(result.checks).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "missing",
      }),
    ]);
  });
});

describe("scheduled scan fields Graph omitted", () => {
  it("is unable to check when every scan field is omitted", () => {
    const profile = {
      "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      id: "dr",
      displayName: "DR",
      assignments: assigned,
    };
    expect(
      policyChecks(
        capability(
          data({ deviceConfigurations: [profile] }),
          "windows-periodic-antimalware-scan",
        ),
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
  });

  const endpoint = (fields: Record<string, unknown>) => ({
    "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
    id: "ep",
    displayName: "EP",
    ...fields,
    assignments: assigned,
  });
  const scheduled = {
    defenderScanType: "quick",
    defenderScheduledScanDay: "everyday",
    defenderScheduledScanTime: "02:00:00.0000000",
  };

  it("is a collection gap in history in both directions", () => {
    expectGapBothWays(
      data({ deviceConfigurations: [endpoint(scheduled)] }),
      data({ deviceConfigurations: [endpoint({})] }),
      "windows-periodic-antimalware-scan",
    );
  });

  it("is unable to check when one field is omitted, and leaves it out of the actual value", () => {
    const partial: Record<string, unknown> = { ...scheduled };
    delete partial.defenderScheduledScanDay;
    const [check] = policyChecks(
      capability(
        data({ deviceConfigurations: [endpoint(partial)] }),
        "windows-periodic-antimalware-scan",
      ),
    );
    expect(check).toMatchObject({
      assessmentStatus: "unableToCheck",
      result: null,
    });
    expect(JSON.parse(check!.actualValue!)).toEqual({
      scan: "quick",
      time: "02:00:00.0000000",
    });
  });

  it("keeps a profile whose scan fields are all null definite", () => {
    const result = capability(
      data({
        deviceConfigurations: [
          endpoint({
            defenderScanType: null,
            defenderScheduledScanDay: null,
            defenderScheduledScanTime: null,
          }),
        ],
      }),
      "windows-periodic-antimalware-scan",
    );
    expect(policyChecks(result)).toEqual([]);
    expect(result.checks).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "missing",
      }),
    ]);
  });
});

describe("template properties Graph omitted", () => {
  const omitted = () => {
    const policy = compliance();
    delete policy.bitLockerEnabled;
    return policy;
  };

  it("is unable to check, never removed evidence", () => {
    const result = capability(
      data({ compliancePolicies: [omitted()] }),
      "windows-disk-encryption",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        settingId: "bitLockerEnabled",
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
    expectGapBothWays(
      data({ compliancePolicies: [compliance()] }),
      data({ compliancePolicies: [omitted()] }),
      "windows-disk-encryption",
    );
  });

  it("keeps an explicit null as not configured", () => {
    const result = capability(
      data({
        compliancePolicies: [{ ...compliance(), bitLockerEnabled: null }],
      }),
      "windows-disk-encryption",
    );
    expect(policyChecks(result)).toEqual([]);
  });

  it("keeps a null parent as not configured through the snapshot", () => {
    const profile = {
      "@odata.type":
        "#microsoft.graph.windows10EndpointProtectionConfiguration",
      id: "ep",
      displayName: "EP",
      firewallProfileDomain: null,
      assignments: assigned,
    };
    const stored = projection(data({ deviceConfigurations: [profile] }));
    expect(stored.sections[0]!.items[0]!.data.firewallProfileDomain).toBeNull();
  });

  it("is unable to check when a custom profile has no OMA-URI rows", () => {
    const profile = {
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      id: "custom",
      displayName: "Custom",
      assignments: assigned,
    };
    const result = capability(
      data({ deviceConfigurations: [profile] }),
      "windows-disk-encryption",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
  });
});

describe("policy changes with a property Graph omitted", () => {
  it("does not compare the policy instead of reporting the value removed or added", () => {
    const definite = projection(data({ compliancePolicies: [compliance()] }));
    const policy = compliance();
    delete policy.bitLockerEnabled;
    const unknown = projection(data({ compliancePolicies: [policy] }));
    for (const [from, to] of [
      [definite, unknown],
      [unknown, definite],
    ]) {
      const diff = diffSnapshots(from!, to!);
      expect(diff.totals).toMatchObject({
        settingChanges: 0,
        notComparedItems: 1,
      });
      expect(diff.notComparedItems).toEqual([
        expect.objectContaining({ id: "compliance-1" }),
      ]);
    }
  });

  it("still reports a value Graph returned as null", () => {
    const definite = projection(data({ compliancePolicies: [compliance()] }));
    const unset = projection(
      data({
        compliancePolicies: [{ ...compliance(), bitLockerEnabled: null }],
      }),
    );
    const diff = diffSnapshots(definite, unset);
    expect(diff.totals).toMatchObject({
      settingChanges: 1,
      notComparedItems: 0,
    });
  });

  it("does not compare a Conditional Access policy whose target list was omitted", () => {
    const policy = mfaPolicy();
    delete policy.conditions.applications.includeApplications;
    const diff = diffSnapshots(
      projection(data({ conditionalAccess: [mfaPolicy()] })),
      projection(data({ conditionalAccess: [policy] })),
    );
    expect(diff.totals).toMatchObject({
      settingChanges: 0,
      notComparedItems: 1,
    });
  });
});

describe("reference comparison with a property Graph omitted", () => {
  it("is not comparable, never missing", () => {
    const policy = compliance();
    delete policy.bitLockerEnabled;
    const comparison = compareSettings(
      projectionSettings(
        projection(data({ compliancePolicies: [compliance()] })),
      ),
      projectionSettings(projection(data({ compliancePolicies: [policy] }))),
    );
    expect(comparison.totals.missing).toBe(0);
    const row = comparison.groups
      .flatMap((group) => group.rows)
      .find((entry) => entry.setting === "bitLockerEnabled")!;
    expect(row.status).toBe("notComparable");
  });

  // Both directions: no different, missing or extra row, and at least one
  // not comparable row.
  function expectNotComparable(
    definite: DetailedExportData,
    unknown: DetailedExportData,
  ) {
    for (const [reference, current] of [
      [definite, unknown],
      [unknown, definite],
    ]) {
      const comparison = compareSettings(
        projectionSettings(projection(reference!)),
        projectionSettings(projection(current!)),
      );
      expect(comparison.totals).toMatchObject({
        different: 0,
        missing: 0,
        extra: 0,
      });
      expect(comparison.totals.notComparable).toBeGreaterThan(0);
    }
  }

  it("is not comparable when a Conditional Access state or target list is omitted", () => {
    const noState = mfaPolicy();
    delete noState.state;
    expectNotComparable(
      data({ conditionalAccess: [mfaPolicy()] }),
      data({ conditionalAccess: [noState] }),
    );
    const noApps = mfaPolicy();
    delete noApps.conditions.applications.includeApplications;
    expectNotComparable(
      data({ conditionalAccess: [mfaPolicy()] }),
      data({ conditionalAccess: [noApps] }),
    );
  });

  it("is not comparable when a nested property's parent is omitted", () => {
    const profile = (firewall?: Record<string, unknown> | null) => ({
      "@odata.type":
        "#microsoft.graph.windows10EndpointProtectionConfiguration",
      id: "ep",
      displayName: "EP",
      ...(firewall === undefined ? {} : { firewallProfileDomain: firewall }),
      assignments: assigned,
    });
    expectNotComparable(
      data({ deviceConfigurations: [profile({ firewallEnabled: true })] }),
      data({ deviceConfigurations: [profile()] }),
    );
  });
});

// --- Entra identity settings -------------------------------------------------

const allUsers = [{ targetType: "group", id: "all_users" }];

function identity(edit?: (methods: Record<string, any>) => void) {
  const methods: Record<string, any> = {
    policyMigrationState: "migrationComplete",
    registrationEnforcement: {
      authenticationMethodsRegistrationCampaign: {
        snoozeDurationInDays: 1,
        enforceRegistrationAfterAllowedSnoozes: false,
        state: "default",
        includeTargets: allUsers,
        excludeTargets: [],
      },
    },
    authenticationMethodConfigurations: [
      {
        id: "Sms",
        state: "enabled",
        includeTargets: allUsers,
        excludeTargets: [],
      },
      {
        id: "X509Certificate",
        state: "enabled",
        includeTargets: allUsers,
        excludeTargets: [],
        authenticationModeConfiguration: {
          x509CertificateAuthenticationDefaultMode:
            "x509CertificateMultiFactor",
        },
      },
    ],
  };
  edit?.(methods);
  return {
    status: {
      authenticationMethods: "collected",
      securityDefaults: "collected",
    },
    authenticationMethods: methods,
    securityDefaults: { isEnabled: false },
  } as DetailedExportData["tenantIdentityPolicies"];
}

const method = (methods: Record<string, any>, id: string) =>
  methods.authenticationMethodConfigurations.find(
    (entry: { id: string }) => entry.id === id,
  );

function identityProjection(
  policies: DetailedExportData["tenantIdentityPolicies"],
): SnapshotProjection {
  return projection({ ...data(), tenantIdentityPolicies: policies });
}

describe("Entra settings Graph omitted", () => {
  const cases: Array<
    [string, DetailedExportData["tenantIdentityPolicies"], string]
  > = [
    [
      "the certificate default mode",
      identity((methods) => {
        method(methods, "X509Certificate").authenticationModeConfiguration = {};
      }),
      "Certificate-based authentication: Default authentication mode",
    ],
    [
      "an include target list",
      identity((methods) => {
        delete method(methods, "Sms").includeTargets;
      }),
      "SMS: Include target",
    ],
    [
      "an exclude target list",
      identity((methods) => {
        delete method(methods, "Sms").excludeTargets;
      }),
      "SMS: Exclude target",
    ],
    [
      "a method state",
      identity((methods) => {
        delete method(methods, "Sms").state;
      }),
      "SMS: State",
    ],
    [
      "the security defaults state",
      (() => {
        const policies = identity()!;
        policies.securityDefaults = {};
        return policies;
      })(),
      "Security defaults turned on",
    ],
  ];

  it.each(cases)(
    "never reads %s as a change, in both directions",
    (_label, unknown, setting) => {
      const definite = identityProjection(identity());
      const other = identityProjection(unknown);
      for (const [from, to, side] of [
        [definite, other, "to"],
        [other, definite, "from"],
      ] as const) {
        const diff = diffIdentity(from, to);
        expect(diff.changes).toEqual([]);
        expect(diff.total).toBe(0);
        expect(diff.notCompared).toEqual([
          expect.objectContaining({
            side,
            settings: [expect.stringContaining(setting)],
          }),
        ]);
      }
    },
  );

  it("keeps an omitted target list absent and an empty one empty in the snapshot", () => {
    const stored = identityProjection(
      identity((methods) => {
        delete method(methods, "Sms").includeTargets;
      }),
    );
    const configurations = stored.tenantIdentityPolicies!.authenticationMethods!
      .authenticationMethodConfigurations as Record<string, unknown>[];
    expect(configurations[0]).not.toHaveProperty("includeTargets");
    expect(configurations[0]!.excludeTargets).toEqual([]);
  });

  it("names the side each unreadable setting is missing from", () => {
    const diff = diffIdentity(
      identityProjection(
        identity((methods) => {
          delete method(methods, "Sms").includeTargets;
        }),
      ),
      identityProjection(
        identity((methods) => {
          method(methods, "X509Certificate").authenticationModeConfiguration =
            {};
        }),
      ),
    );
    expect(diff.total).toBe(0);
    expect(diff.notCompared).toEqual([
      expect.objectContaining({
        side: "from",
        settings: ["SMS: Include target"],
      }),
      expect.objectContaining({
        side: "to",
        settings: [
          "Certificate-based authentication: Default authentication mode",
        ],
      }),
    ]);
  });

  it("still reports a real change next to an unreadable setting", () => {
    const unknown = identity((methods) => {
      method(methods, "X509Certificate").authenticationModeConfiguration = {};
      method(methods, "Sms").state = "disabled";
    });
    const diff = diffIdentity(
      identityProjection(identity()),
      identityProjection(unknown),
    );
    expect(diff.changes).toEqual([
      expect.objectContaining({
        key: expect.stringContaining("method:sms:state"),
        before: "enabled",
        after: "disabled",
      }),
    ]);
    expect(diff.notCompared).toHaveLength(1);
  });

  it("reads an explicit null as a value, not as unreadable", () => {
    const unset = identity((methods) => {
      method(
        methods,
        "X509Certificate",
      ).authenticationModeConfiguration.x509CertificateAuthenticationDefaultMode =
        null;
    });
    const diff = diffIdentity(
      identityProjection(identity()),
      identityProjection(unset),
    );
    expect(diff.notCompared).toEqual([]);
    expect(diff.changes).toEqual([
      expect.objectContaining({
        change: "changed",
        before: "x509CertificateMultiFactor",
        after: "Not set",
      }),
    ]);
  });

  it("is not comparable in a reference comparison, never missing", () => {
    const comparison = compareSettings(
      projectionSettings(identityProjection(identity())),
      projectionSettings(
        identityProjection(
          identity((methods) => {
            method(methods, "X509Certificate").authenticationModeConfiguration =
              {};
          }),
        ),
      ),
    );
    expect(comparison.identity.totals).toMatchObject({
      missing: 0,
      extra: 0,
      different: 0,
    });
    expect(
      comparison.identity.groups
        .flatMap((group) => group.rows)
        .find((row) =>
          row.setting.endsWith("x509CertificateAuthenticationDefaultMode"),
        )?.status,
    ).toBe("notComparable");
  });
});

// --- Round 15: only documented values are definite ---------------------------

// A value is definite only when it is present, of the expected type and one
// of the values Microsoft Graph documents for the field. Anything else, such
// as unknownFutureValue, is unknown. A documented value that decides a
// result keeps it definite, whatever unrelated field Graph omitted.

describe("Conditional Access authentication strength in a reference comparison", () => {
  const strength = () => {
    const policy = mfaPolicy();
    policy.grantControls.authenticationStrength = {
      id: "00000000-0000-0000-0000-000000000002",
      displayName: "Multifactor authentication",
      policyType: "builtIn",
      requirementsSatisfied: "mfa",
      allowedCombinations: ["windowsHelloForBusiness", "fido2"],
    };
    return policy;
  };
  const compare = (
    reference: Record<string, any>,
    current: Record<string, any>,
  ) =>
    compareSettings(
      projectionSettings(projection(data({ conditionalAccess: [reference] }))),
      projectionSettings(projection(data({ conditionalAccess: [current] }))),
    );

  it.each([
    [
      "the whole strength",
      (policy: Record<string, any>) =>
        delete policy.grantControls.authenticationStrength,
      ["Allowed Combinations", "Policy Type", "Requirements Satisfied"],
    ],
    [
      "only requirementsSatisfied",
      (policy: Record<string, any>) =>
        delete policy.grantControls.authenticationStrength
          .requirementsSatisfied,
      ["Requirements Satisfied"],
    ],
  ])(
    "is not comparable when Graph omitted %s, in both directions",
    (_label, omit, unreadable) => {
      const unknown = strength();
      omit(unknown);
      for (const [reference, current] of [
        [strength(), unknown],
        [unknown, strength()],
      ]) {
        const comparison = compare(reference!, current!);
        expect(comparison.totals).toMatchObject({
          different: 0,
          missing: 0,
          extra: 0,
        });
        // Each unreadable field under the key its value has.
        expect(
          comparison.groups
            .flatMap((group) => group.rows)
            .filter((row) => row.status === "notComparable")
            .map((row) => row.setting.split(" / ").pop())
            .sort(),
        ).toEqual(unreadable);
      }
    },
  );

  it("keeps an explicit null strength definite", () => {
    const comparison = compare(strength(), mfaPolicy());
    expect(comparison.totals.missing).toBe(3);
    expect(comparison.totals.notComparable).toBe(0);
  });
});

describe("policy check fields with a value Graph does not document", () => {
  const ringWith = (fields: Record<string, unknown>) => {
    const policy = { ...ring(), ...fields };
    for (const [key, value] of Object.entries(fields))
      if (value === undefined) delete policy[key];
    return policy;
  };
  const endpoint = (fields: Record<string, unknown>) => ({
    "@odata.type": "#microsoft.graph.windows10EndpointProtectionConfiguration",
    id: "ep",
    displayName: "EP",
    defenderScanType: "quick",
    defenderScheduledScanDay: "everyday",
    defenderScheduledScanTime: "02:00:00.0000000",
    ...fields,
    assignments: assigned,
  });
  const checkOf = (policy: Record<string, any>, id: string) =>
    policyChecks(capability(data({ deviceConfigurations: [policy] }), id));

  it.each([
    [
      "automaticUpdateMode",
      ringWith({ automaticUpdateMode: "unknownFutureValue" }),
    ],
    [
      "automaticUpdateMode of another type",
      ringWith({ automaticUpdateMode: 4 }),
    ],
  ])("is unable to check for an undocumented %s", (_label, policy) => {
    expect(checkOf(policy, "windows-quality-update-deadline")).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
  });

  it("is a collection gap in history in both directions", () => {
    expectGapBothWays(
      data({ deviceConfigurations: [ring()] }),
      data({
        deviceConfigurations: [
          ringWith({ automaticUpdateMode: "unknownFutureValue" }),
        ],
      }),
      "windows-quality-update-deadline",
    );
    expectGapBothWays(
      data({ deviceConfigurations: [endpoint({})] }),
      data({
        deviceConfigurations: [
          endpoint({ defenderScanType: "unknownFutureValue" }),
        ],
      }),
      "windows-periodic-antimalware-scan",
    );
  });

  it("keeps a documented manual mode definite, also with the timing omitted", () => {
    for (const policy of [
      ringWith({ automaticUpdateMode: "notifyDownload" }),
      ringWith({
        automaticUpdateMode: "notifyDownload",
        qualityUpdatesDeferralPeriodInDays: undefined,
        qualityUpdatesPaused: undefined,
      }),
    ])
      expect(checkOf(policy, "windows-quality-update-deadline")).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "different",
        }),
      ]);
  });

  it("keeps a ring over 14 days definite whatever its mode", () => {
    expect(
      checkOf(
        ringWith({
          automaticUpdateMode: "unknownFutureValue",
          deadlineForQualityUpdatesInDays: 30,
        }),
        "windows-quality-update-deadline",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
  });

  it.each([
    ["scan type", { defenderScanType: "unknownFutureValue" }],
    ["scan day", { defenderScheduledScanDay: "unknownFutureValue" }],
    ["scan time", { defenderScheduledScanTime: "every night" }],
  ])("is unable to check for an undocumented %s", (_label, fields) => {
    expect(
      checkOf(endpoint(fields), "windows-periodic-antimalware-scan"),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
  });

  it("keeps documented scan values definite", () => {
    expect(
      checkOf(
        endpoint({ defenderScanType: "userDefined" }),
        "windows-periodic-antimalware-scan",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
    // A disabled scan is counter-evidence whatever the day.
    expect(
      checkOf(
        endpoint({
          defenderScanType: "disabled",
          defenderScheduledScanDay: "unknownFutureValue",
        }),
        "windows-periodic-antimalware-scan",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
  });
});

describe("Graph property signals with a value Graph does not document", () => {
  const settingCheck = (policy: Record<string, any>) =>
    policyChecks(
      capability(
        data({ deviceConfigurations: [policy] }),
        "windows-automatic-updates",
      ),
    ).filter((check) => check.settingId === "automaticUpdateMode");

  it("is unable to check, never a different value", () => {
    expect(
      settingCheck({ ...ring(), automaticUpdateMode: "unknownFutureValue" }),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
    expectGapBothWays(
      data({ deviceConfigurations: [ring()] }),
      data({
        deviceConfigurations: [
          { ...ring(), automaticUpdateMode: "unknownFutureValue" },
        ],
      }),
      "windows-automatic-updates",
    );
  });

  it("keeps documented values definite, the not configured default included", () => {
    for (const mode of ["notifyDownload", "userDefined"])
      expect(settingCheck({ ...ring(), automaticUpdateMode: mode })).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "different",
        }),
      ]);
  });

  it("documents every enum value a Graph property signal expects", () => {
    for (const capabilityDefinition of COMPLIANCE_CAPABILITIES)
      for (const signal of capabilityDefinition.signals) {
        if (signal.source !== "graphProperty") continue;
        const expected = [signal.enforcedWhen, signal.disabledWhen].flatMap(
          (expectation) =>
            !expectation
              ? []
              : expectation.kind === "equals"
                ? [expectation.value]
                : expectation.kind === "oneOf"
                  ? [...expectation.values]
                  : [],
        );
        const strings = expected.filter((value) => typeof value === "string");
        if (!strings.length) continue;
        const documented = graphPropertyValues(signal.propertyPath);
        expect(documented, signal.propertyPath).toBeDefined();
        // The enforcing values must be documented; the disabled ones of a
        // shared expectation may name a member of a sibling enum.
        const enforcing =
          signal.enforcedWhen.kind === "equals"
            ? [signal.enforcedWhen.value]
            : signal.enforcedWhen.kind === "oneOf"
              ? signal.enforcedWhen.values
              : [];
        for (const value of enforcing)
          expect(documented, `${signal.propertyPath} ${value}`).toContain(
            value,
          );
      }
  });
});

describe("Graph property numbers outside their documented type", () => {
  it.each([14.5, 3_000_000_000])(
    "is unable to check %s minutes, and no evidence",
    (minutes) => {
      const result = capability(
        data({
          compliancePolicies: [
            { ...compliance(), passwordMinutesOfInactivityBeforeLock: minutes },
          ],
        }),
        "windows-inactivity-lock",
      );
      expect(policyChecks(result)).toEqual([
        expect.objectContaining({
          assessmentStatus: "unableToCheck",
          result: null,
        }),
      ]);
      expect(result.evidence).toEqual([]);
    },
  );

  it("keeps an Int32 value definite", () => {
    const result = capability(
      data({
        compliancePolicies: [
          { ...compliance(), passwordMinutesOfInactivityBeforeLock: 15 },
        ],
      }),
      "windows-inactivity-lock",
    );
    expect(policyChecks(result)).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "matches",
      }),
    ]);
    expect(result.evidence).toHaveLength(1);
  });
});

describe("Conditional Access grants with a value Graph does not document", () => {
  const grants = (controls: Record<string, unknown>) => {
    const policy = mfaPolicy();
    Object.assign(policy.grantControls, controls);
    return policy;
  };
  const checksOf = (policy: Record<string, any>, id: string) =>
    policyChecks(capability(data({ conditionalAccess: [policy] }), id));
  const custom = (strength: Record<string, unknown>) => ({
    builtInControls: [],
    authenticationStrength: { id: "custom-strength", ...strength },
  });

  it.each([
    [
      "an OR control",
      grants({ builtInControls: ["mfa", "unknownFutureValue"] }),
      "tenant-mfa-required",
    ],
    [
      "a strength requirement",
      grants(custom({ requirementsSatisfied: "unknownFutureValue" })),
      "tenant-mfa-required",
    ],
    [
      "an omitted strength requirement next to MFA",
      grants({
        builtInControls: ["mfa"],
        authenticationStrength: { id: "custom-strength" },
      }),
      "tenant-mfa-required",
    ],
    [
      "an allowed combination",
      grants(custom({ allowedCombinations: ["fido2", "unknownFutureValue"] })),
      "tenant-phishing-resistant-mfa",
    ],
  ])("is unable to check for %s", (_label, policy, id) => {
    expect(checksOf(policy, id)).toEqual([
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ]);
  });

  it("is a collection gap in history in both directions", () => {
    expectGapBothWays(
      data({ conditionalAccess: [mfaPolicy()] }),
      data({
        conditionalAccess: [
          grants({ builtInControls: ["mfa", "unknownFutureValue"] }),
        ],
      }),
      "tenant-mfa-required",
    );
  });

  it("keeps a result a documented value decides definite", () => {
    // Under OR, a compliant device alternative bypasses MFA whatever the
    // undocumented control is.
    expect(
      checksOf(
        grants({
          builtInControls: ["mfa", "compliantDevice", "unknownFutureValue"],
        }),
        "tenant-mfa-required",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
    // Under AND, MFA is required whatever else is.
    expect(
      checksOf(
        grants({
          operator: "AND",
          builtInControls: ["mfa", "unknownFutureValue"],
        }),
        "tenant-mfa-required",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "matches",
      }),
    ]);
    // A built-in strength that is not phishing resistant needs no list.
    expect(
      checksOf(
        grants({
          builtInControls: [],
          authenticationStrength: {
            id: "00000000-0000-0000-0000-000000000002",
          },
        }),
        "tenant-phishing-resistant-mfa",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
    expect(
      checksOf(
        grants(custom({ allowedCombinations: ["password,sms"] })),
        "tenant-phishing-resistant-mfa",
      ),
    ).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
  });

  it("keeps a disabled policy definite when a target list is omitted", () => {
    const policy = mfaPolicy();
    policy.state = "disabled";
    delete policy.conditions.users.includeGroups;
    expect(checksOf(policy, "tenant-mfa-required")).toEqual([
      expect.objectContaining({
        assessmentStatus: "checked",
        result: "different",
      }),
    ]);
  });
});

describe("Entra method states Graph does not document", () => {
  const methodsPolicy = (edit?: (configs: Record<string, any>[]) => void) => {
    const configs: Record<string, any>[] = [
      {
        id: "Fido2",
        state: "disabled",
        includeTargets: allUsers,
        excludeTargets: [],
      },
      {
        id: "Sms",
        state: "disabled",
        includeTargets: allUsers,
        excludeTargets: [],
      },
      {
        id: "Voice",
        state: "disabled",
        includeTargets: allUsers,
        excludeTargets: [],
      },
      { id: "Email", state: "enabled", includeTargets: [], excludeTargets: [] },
      {
        id: "X509Certificate",
        state: "disabled",
        includeTargets: allUsers,
        excludeTargets: [],
        authenticationModeConfiguration: {
          x509CertificateAuthenticationDefaultMode:
            "x509CertificateSingleFactor",
        },
      },
    ];
    edit?.(configs);
    return {
      ...data(),
      tenantIdentityPolicies: {
        status: {
          authenticationMethods: "collected",
          securityDefaults: "collected",
        },
        authenticationMethods: { authenticationMethodConfigurations: configs },
        securityDefaults: { isEnabled: false },
      },
    } as DetailedExportData;
  };
  const find = (configs: Record<string, any>[], id: string) =>
    configs.find((entry) => entry.id === id)!;
  const rows = (exportData: DetailedExportData, capabilityId: string) =>
    capability(exportData, capabilityId).checks.map((check) => [
      check.settingId.split("/").pop(),
      check.assessmentStatus,
      check.result,
    ]);

  it("is unable to check for an undocumented state, also with targets", () => {
    const unknown = methodsPolicy((configs) => {
      find(configs, "Sms").state = "unknownFutureValue";
    });
    expect(rows(unknown, "tenant-weak-methods-disabled")).toContainEqual([
      "Sms",
      "unableToCheck",
      null,
    ]);
    expect(
      capability(unknown, "tenant-weak-methods-disabled").evidence,
    ).toEqual([]);
    expectGapBothWays(methodsPolicy(), unknown, "tenant-weak-methods-disabled");
  });

  it("keeps a documented disabled state definite without targets", () => {
    const omitted = methodsPolicy((configs) => {
      for (const id of ["Sms", "Fido2", "X509Certificate"])
        delete find(configs, id).includeTargets;
    });
    expect(rows(omitted, "tenant-weak-methods-disabled")).toEqual([
      ["Sms", "checked", "matches"],
      ["Voice", "checked", "matches"],
      ["Email", "checked", "matches"],
    ]);
    expect(rows(omitted, "tenant-phishing-resistant-method-enabled")).toEqual([
      ["Fido2", "checked", "different"],
      ["X509Certificate", "checked", "different"],
    ]);
  });

  it("never reads an include target without an id as a user group", () => {
    const noId = [{ targetType: "group", id: "" }];
    const fido = methodsPolicy((configs) => {
      find(configs, "Fido2").state = "enabled";
      find(configs, "Fido2").includeTargets = noId;
    });
    expect(rows(fido, "tenant-phishing-resistant-method-enabled")).toEqual([
      ["Fido2", "unableToCheck", null],
      ["X509Certificate", "checked", null],
    ]);
    const phishing = capability(
      fido,
      "tenant-phishing-resistant-method-enabled",
    );
    expect(phishing.evidence).toEqual([]);
    expect(phishing.status).not.toBe("enforced");
    const sms = methodsPolicy((configs) => {
      find(configs, "Sms").state = "enabled";
      find(configs, "Sms").includeTargets = noId;
    });
    expect(rows(sms, "tenant-weak-methods-disabled")).toEqual([
      ["Sms", "unableToCheck", null],
      ["Voice", "checked", "matches"],
      ["Email", "checked", "matches"],
    ]);
    const weak = capability(sms, "tenant-weak-methods-disabled");
    expect(weak.evidence).toEqual([]);
    expect(weak.status).not.toBe("disabledByPolicy");
    // A target with an id still counts.
    const named = methodsPolicy((configs) => {
      find(configs, "Sms").state = "enabled";
      find(configs, "Sms").includeTargets = [
        { targetType: "group", id: "group-1" },
      ];
    });
    expect(capability(named, "tenant-weak-methods-disabled").status).toBe(
      "disabledByPolicy",
    );
  });

  it("is unable to check an enabled method without readable targets", () => {
    for (const edit of [
      (config: Record<string, any>) => delete config.includeTargets,
      (config: Record<string, any>) => {
        config.includeTargets = [{ targetType: "unknownFutureValue", id: "x" }];
      },
    ]) {
      const unknown = methodsPolicy((configs) => {
        find(configs, "Fido2").state = "enabled";
        edit(find(configs, "Fido2"));
        find(configs, "X509Certificate").state = "unknownFutureValue";
      });
      expect(rows(unknown, "tenant-phishing-resistant-method-enabled")).toEqual(
        [
          ["Fido2", "unableToCheck", null],
          ["X509Certificate", "unableToCheck", null],
        ],
      );
    }
  });
});

describe("Entra settings with a value Graph does not document", () => {
  const cases: Array<
    [string, DetailedExportData["tenantIdentityPolicies"], string]
  > = [
    [
      "security defaults returned as text",
      (() => {
        const policies = identity()!;
        policies.securityDefaults = { isEnabled: "true" };
        return policies;
      })(),
      "Security defaults turned on",
    ],
    [
      "an undocumented method state",
      identity((methods) => {
        method(methods, "Sms").state = "unknownFutureValue";
      }),
      "SMS: State",
    ],
    [
      "an undocumented default mode",
      identity((methods) => {
        method(methods, "X509Certificate").authenticationModeConfiguration = {
          x509CertificateAuthenticationDefaultMode: "unknownFutureValue",
        };
      }),
      "Certificate-based authentication: Default authentication mode",
    ],
    [
      "an undocumented target type",
      identity((methods) => {
        method(methods, "Sms").includeTargets = [
          { targetType: "unknownFutureValue", id: "all_users" },
        ];
      }),
      "SMS: Include target",
    ],
    [
      "a target without an id",
      identity((methods) => {
        method(methods, "Sms").includeTargets = [
          { targetType: "group", id: "" },
        ];
      }),
      "SMS: Include target",
    ],
    [
      "a target that is no object",
      identity((methods) => {
        method(methods, "Sms").includeTargets = [...allUsers, "group-1"];
      }),
      "SMS: Include target",
    ],
    [
      "a snooze duration out of range",
      identity((methods) => {
        methods.registrationEnforcement.authenticationMethodsRegistrationCampaign.snoozeDurationInDays = 99;
      }),
      "Registration campaign: Days users can postpone",
    ],
  ];

  it.each(cases)(
    "never reads %s as a change, in both directions",
    (_label, unknown, setting) => {
      const definite = identityProjection(identity());
      const other = identityProjection(unknown);
      for (const [from, to, side] of [
        [definite, other, "to"],
        [other, definite, "from"],
      ] as const) {
        const diff = diffIdentity(from, to);
        expect(diff.changes).toEqual([]);
        expect(diff.total).toBe(0);
        expect(diff.notCompared).toEqual([
          expect.objectContaining({
            side,
            settings: [expect.stringContaining(setting)],
          }),
        ]);
      }
    },
  );

  it("keeps documented values comparable, in another casing where Graph uses one", () => {
    const campaign = identity((methods) => {
      methods.policyMigrationState = "migrationInProgress";
      methods.registrationEnforcement.authenticationMethodsRegistrationCampaign.includeTargets =
        [
          {
            targetType: "group",
            id: "all_users",
            targetedAuthenticationMethod: "FIDO2",
          },
        ];
    });
    const diff = diffIdentity(
      identityProjection(identity()),
      identityProjection(campaign),
    );
    expect(diff.notCompared).toEqual([]);
    expect(diff.changes.map((change) => change.key)).toEqual([
      expect.stringContaining("policyMigrationState"),
      expect.stringContaining("campaign:includeTargets"),
    ]);
  });
});

describe("policy changes with a null property Graph omitted", () => {
  it("does not compare the policy instead of hiding the gap, in both directions", () => {
    const unset = projection(
      data({
        compliancePolicies: [{ ...compliance(), bitLockerEnabled: null }],
      }),
    );
    const policy = compliance();
    delete policy.bitLockerEnabled;
    const omitted = projection(data({ compliancePolicies: [policy] }));
    for (const [from, to] of [
      [unset, omitted],
      [omitted, unset],
    ]) {
      const diff = diffSnapshots(from!, to!);
      expect(diff.totals).toMatchObject({
        settingChanges: 0,
        notComparedItems: 1,
      });
    }
    // Null on both sides is no change and no gap.
    expect(diffSnapshots(unset, unset).totals).toMatchObject({
      settingChanges: 0,
      notComparedItems: 0,
    });
  });
});

describe("identifiers Graph returned empty", () => {
  const catalogPolicy = (
    id: string | undefined,
    instances: Record<string, unknown>[],
  ) => ({
    ...(id === undefined ? {} : { id }),
    name: `Synthetic catalog ${id ?? "without id"}`,
    platforms: "windows10",
    technologies: "mdm",
    configType: "Settings Catalog",
    settings: instances.map((settingInstance, index) => ({
      id: String(index),
      settingInstance,
    })),
    assignments: assigned,
    collectionStatus: { settings: "complete", assignments: "complete" },
  });
  const firewall = (profile: string) => ({
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
    settingDefinitionId: `vendor_msft_firewall_mdmstore_${profile}profile_enablefirewall`,
    choiceSettingValue: {
      value: `vendor_msft_firewall_mdmstore_${profile}profile_enablefirewall_true`,
      children: [],
    },
  });
  const withCatalog = (
    items: Record<string, unknown>[],
    parts: Parameters<typeof data>[0] = {},
  ): DetailedExportData => {
    const base = data(parts);
    return {
      ...base,
      settingsCatalog: items,
      sections: [...base.sections!, section("settingsCatalog", items)],
    } as DetailedExportData;
  };

  describe("Conditional Access lists with an empty entry", () => {
    const ca = (edit: (policy: Record<string, any>) => void) => {
      const policy = mfaPolicy();
      edit(policy);
      return policyChecks(
        capability(
          data({ conditionalAccess: [policy] }),
          "tenant-mfa-required",
        ),
      );
    };
    const allApps = (edit: (policy: Record<string, any>) => void) => {
      const policy = mfaPolicy();
      edit(policy);
      return policyChecks(
        capability(
          data({ conditionalAccess: [policy] }),
          "tenant-mfa-all-apps",
        ),
      );
    };
    const unable = [
      expect.objectContaining({
        assessmentStatus: "unableToCheck",
        result: null,
      }),
    ];

    it("never reads an empty user, group or role entry as a target", () => {
      for (const key of ["includeUsers", "includeGroups", "includeRoles"])
        expect(
          ca((policy) => {
            policy.conditions.users.includeUsers = [];
            policy.conditions.users[key] = [""];
          }),
        ).toEqual(unable);
      // A named target next to it still decides.
      expect(
        capability(
          data({
            conditionalAccess: [
              (() => {
                const policy = mfaPolicy();
                policy.conditions.users.includeUsers = ["", "All"];
                return policy;
              })(),
            ],
          }),
          "tenant-mfa-required",
        ).status,
      ).toBe("enforced");
    });

    it("never reads an empty application entry as not all apps or as an exclusion", () => {
      expect(
        allApps((policy) => {
          policy.conditions.applications.includeApplications = [""];
        }),
      ).toEqual(unable);
      expect(
        allApps((policy) => {
          policy.conditions.applications.excludeApplications = [""];
        }),
      ).toEqual(unable);
      // A named exclusion still differs.
      expect(
        allApps((policy) => {
          policy.conditions.applications.excludeApplications = ["", "app-1"];
        }),
      ).toEqual([
        expect.objectContaining({
          assessmentStatus: "checked",
          result: "different",
        }),
      ]);
    });
  });

  describe("a setting row without its identifier", () => {
    const missingChecks = (exportData: DetailedExportData, id: string) =>
      capability(exportData, id).checks.filter(
        (check) => check.result === "missing",
      );

    it("never proves a setting missing from a policy that may hold it", () => {
      const hidden: Array<[string, DetailedExportData]> = [
        [
          "a catalog root without a definition id",
          withCatalog([
            catalogPolicy("catalog-1", [
              { ...firewall("domain"), settingDefinitionId: "" },
            ]),
          ]),
        ],
        [
          "a catalog child without a definition id",
          withCatalog([
            catalogPolicy("catalog-1", [
              {
                ...firewall("public"),
                choiceSettingValue: {
                  value:
                    "vendor_msft_firewall_mdmstore_publicprofile_enablefirewall_true",
                  children: [
                    { ...firewall("domain"), settingDefinitionId: "" },
                  ],
                },
              },
            ]),
          ]),
        ],
        [
          "a catalog row without an instance",
          withCatalog([
            {
              ...catalogPolicy("catalog-1", [firewall("public")]),
              settings: [
                { id: "0", settingInstance: firewall("public") },
                { id: "1" },
              ],
            },
          ]),
        ],
        [
          "a custom OMA-URI row without a URI",
          data({
            deviceConfigurations: [
              {
                "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
                id: "custom-1",
                displayName: "Synthetic custom",
                omaSettings: [{ omaUri: "", value: true }],
                assignments: assigned,
              },
            ],
          }),
        ],
      ];
      expect(missingChecks(data(), "windows-firewall").length).toBeGreaterThan(
        0,
      );
      for (const [label, exportData] of hidden) {
        const result = capability(exportData, "windows-firewall");
        expect(missingChecks(exportData, "windows-firewall"), label).toEqual(
          [],
        );
        expect(result.checks, label).toContainEqual(
          expect.objectContaining({
            assessmentStatus: "unableToCheck",
            result: null,
          }),
        );
        expect(result.status, label).not.toBe("enforced");
      }
    });

    it("never proves an administrative template setting missing", () => {
      const signal = COMPLIANCE_CAPABILITIES.find((item) =>
        item.signals.some((entry) => entry.source === "administrativeTemplate"),
      )!;
      expect(missingChecks(data(), signal.id).length).toBeGreaterThan(0);
      const template = data();
      template.sections!.push(
        section("administrativeTemplates", [
          {
            id: "template-1",
            displayName: "Synthetic template",
            definitionValues: [{ enabled: true, definition: { id: "" } }],
            assignments: assigned,
          },
        ]),
      );
      expect(missingChecks(template, signal.id)).toEqual([]);
    });

    it("generates no fix pack draft for a setting such a row may hold", () => {
      const drafted = (exportData: DetailedExportData) =>
        generateFixPack(assessCompliance(exportData), {
          collection: exportData,
        }).policies.map((policy) => policy.capabilityId);
      expect(drafted(withCatalog([]))).toContain("windows-lsa-protection");
      expect(
        drafted(
          withCatalog([
            catalogPolicy("catalog-1", [
              { ...firewall("domain"), settingDefinitionId: "" },
            ]),
          ]),
        ),
      ).not.toContain("windows-lsa-protection");
    });

    it("still proves a setting missing next to identified rows", () => {
      const named = withCatalog([
        catalogPolicy("catalog-1", [firewall("public")]),
      ]);
      expect(missingChecks(named, "windows-firewall").length).toBeGreaterThan(
        0,
      );
    });
  });

  it("never reads an assignment with an empty filter type or filter id as unfiltered", () => {
    const target = (filter: Record<string, unknown>) => [
      {
        target: {
          "@odata.type": "#microsoft.graph.groupAssignmentTarget",
          groupId: "group-1",
          ...filter,
        },
      },
    ];
    for (const filter of [
      { deviceAndAppManagementAssignmentFilterType: "" },
      {
        deviceAndAppManagementAssignmentFilterId: "",
        deviceAndAppManagementAssignmentFilterType: "include",
      },
    ])
      expect(summarizeAssignments(target(filter)).state).toBe("unknown");
    for (const filter of [
      {},
      { deviceAndAppManagementAssignmentFilterType: "none" },
      {
        deviceAndAppManagementAssignmentFilterId: "filter-1",
        deviceAndAppManagementAssignmentFilterType: "include",
      },
    ])
      expect(summarizeAssignments(target(filter)).state).toBe("assigned");
  });

  describe("required setting groups on policies without an id", () => {
    const status = (items: Record<string, unknown>[]) =>
      capability(withCatalog(items), "windows-firewall").status;

    it("never assembles the groups from two policies without an id", () => {
      for (const id of ["", undefined])
        expect(
          status([
            catalogPolicy(id, [firewall("domain")]),
            catalogPolicy(id, [firewall("private"), firewall("public")]),
          ]),
        ).toBe("partialConfiguration");
    });

    it("still reads one policy without an id that holds every group", () => {
      expect(
        status([
          catalogPolicy("", [
            firewall("domain"),
            firewall("private"),
            firewall("public"),
          ]),
        ]),
      ).toBe("enforced");
    });
  });

  describe("snapshot comparison", () => {
    const group = (groupId: string) => [
      {
        id: "assignment-1",
        target: {
          "@odata.type": "#microsoft.graph.groupAssignmentTarget",
          groupId,
        },
      },
    ];
    const custom = (omaUri: string) => ({
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      id: "custom-1",
      displayName: "Synthetic custom",
      omaSettings: [
        {
          "@odata.type": "#microsoft.graph.omaSettingInteger",
          omaUri,
          displayName: "Synthetic row",
          value: 1,
        },
      ],
      assignments: assigned,
    });
    const intents = (definitionId: unknown) => {
      const base = data();
      const items = [
        {
          id: "intent-1",
          displayName: "Synthetic intent",
          settings: [{ definitionId, valueJson: "true" }],
          assignments: assigned,
        },
      ];
      return {
        ...base,
        securityBaselines: items,
        sections: [...base.sections!, section("securityBaselines", items)],
      } as DetailedExportData;
    };
    const cases: Array<[string, DetailedExportData, DetailedExportData]> = [
      [
        "a catalog root without a definition id",
        withCatalog([catalogPolicy("catalog-1", [firewall("domain")])]),
        withCatalog([
          catalogPolicy("catalog-1", [
            { ...firewall("domain"), settingDefinitionId: "" },
          ]),
        ]),
      ],
      [
        "a catalog child that is no instance",
        withCatalog([catalogPolicy("catalog-1", [firewall("public")])]),
        withCatalog([
          catalogPolicy("catalog-1", [
            {
              ...firewall("public"),
              choiceSettingValue: {
                value:
                  "vendor_msft_firewall_mdmstore_publicprofile_enablefirewall_true",
                children: ["synthetic"],
              },
            },
          ]),
        ]),
      ],
      [
        "an intent setting without a definition id",
        intents("synthetic_intent_setting"),
        intents(""),
      ],
      [
        "a catalog row that is no record",
        withCatalog([catalogPolicy("catalog-1", [firewall("public")])]),
        withCatalog([
          {
            ...catalogPolicy("catalog-1", [firewall("public")]),
            settings: [
              { id: "0", settingInstance: firewall("public") },
              "synthetic",
            ],
          },
        ]),
      ],
      [
        "a custom OMA-URI row without a URI",
        data({
          deviceConfigurations: [
            custom("./Device/Vendor/MSFT/Policy/Config/System/AllowTelemetry"),
          ],
        }),
        data({ deviceConfigurations: [custom("")] }),
      ],
    ];
    const assignmentCases: Array<
      [string, DetailedExportData, DetailedExportData]
    > = [
      [
        "a group target without a group id",
        withCatalog([
          {
            ...catalogPolicy("catalog-1", [firewall("public")]),
            assignments: group("group-1"),
          },
        ]),
        withCatalog([
          {
            ...catalogPolicy("catalog-1", [firewall("public")]),
            assignments: group(""),
          },
        ]),
      ],
      [
        "an assignment target without a type",
        withCatalog([catalogPolicy("catalog-1", [firewall("public")])]),
        withCatalog([
          {
            ...catalogPolicy("catalog-1", [firewall("public")]),
            assignments: [{ id: "assignment-1", target: {} }],
          },
        ]),
      ],
    ];

    it.each([...cases, ...assignmentCases])(
      "does not compare a policy with %s, in both directions",
      (_label, definite, unknown) => {
        for (const [from, to] of [
          [definite, unknown],
          [unknown, definite],
        ]) {
          const diff = diffSnapshots(projection(from!), projection(to!));
          expect(diff.policies).toEqual([]);
          expect(diff.totals).toMatchObject({
            settingChanges: 0,
            assignmentChanges: 0,
          });
          expect(diff.totals.notComparedItems).toBeGreaterThan(0);
        }
      },
    );

    it.each(cases)(
      "does not compare the family of a policy with %s against a reference",
      (_label, definite, unknown) => {
        for (const [reference, current] of [
          [definite, unknown],
          [unknown, definite],
        ]) {
          const comparison = compareSettings(
            projectionSettings(projection(reference!)),
            projectionSettings(projection(current!)),
          );
          expect(comparison.totals).toMatchObject({
            different: 0,
            missing: 0,
            extra: 0,
          });
          expect(comparison.notCompared.length).toBeGreaterThan(0);
        }
      },
    );

    it("never pairs two policies without an id", () => {
      const named = (name: string) =>
        withCatalog([{ ...catalogPolicy("", [firewall("public")]), name }]);
      const diff = diffSnapshots(
        projection(named("Synthetic first")),
        projection(named("Synthetic second")),
      );
      expect(diff.policies).toEqual([]);
      expect(diff.totals.renamed).toBe(0);
      expect(diff.totals.notComparedItems).toBe(1);
    });

    it("still reports a change between identified policies", () => {
      const diff = diffSnapshots(
        projection(
          withCatalog([
            {
              ...catalogPolicy("catalog-1", [firewall("public")]),
              assignments: group("group-1"),
            },
          ]),
        ),
        projection(
          withCatalog([
            {
              ...catalogPolicy("catalog-1", [firewall("domain")]),
              assignments: group("group-2"),
            },
          ]),
        ),
      );
      expect(diff.totals).toMatchObject({
        notComparedItems: 0,
        assignmentChanges: 2,
      });
      expect(diff.totals.settingChanges).toBeGreaterThan(0);
    });

    it("does not compare the methods policy with a method configuration without an id", () => {
      for (const edit of [
        (methods: Record<string, any>) => {
          method(methods, "Sms").id = "";
        },
        (methods: Record<string, any>) => {
          methods.authenticationMethodConfigurations.push("synthetic");
        },
      ]) {
        const definite = identityProjection(identity());
        const unknown = identityProjection(identity(edit));
        for (const [from, to] of [
          [definite, unknown],
          [unknown, definite],
        ] as const) {
          const diff = diffIdentity(from, to);
          expect(diff.changes).toEqual([]);
          expect(diff.notCompared).toContainEqual(
            expect.objectContaining({ policy: "authenticationMethods" }),
          );
        }
      }
    });
  });
});
