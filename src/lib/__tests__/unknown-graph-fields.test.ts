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
