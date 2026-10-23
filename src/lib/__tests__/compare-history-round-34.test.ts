import { describe, expect, it } from "vitest";
import {
  documentedPropertyValue,
  MAX_SETTING_DEPTH,
  unidentifiedSources,
  unreadableAssignment,
  unreadableSources,
} from "../compliance/graph-rows";
import type { ComplianceAssessment } from "../compliance/types";
import type { ConfigurationSectionData } from "../configuration-sections";
import { flattenItemSettings } from "../settings-flatten";
import { diffAssessments, diffSnapshots } from "../snapshots/diff";
import { identityCollected } from "../snapshots/identity";
import {
  compactAssessment,
  projectSnapshot,
  type SnapshotProjection,
  type StoredAssessment,
  type StoredCapability,
} from "../snapshots/projection";
import {
  compareSettings,
  createReference,
  parseReference,
  projectionSettings,
  serializeReference,
  type SettingComparison,
} from "../snapshots/reference";

// Round 34 review findings on Compare and History and the sweep of their
// categories: identity, discriminators, limits, typed leaves and
// transformations. Shapes follow Graph beta (msgraph skill schemas, Graph
// beta $metadata and the lab tenant, 23 October 2026) with synthetic names,
// ids and values.

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

interface Family {
  key: string;
  familyKey: string;
}

const family = (key: string, familyKey = key): Family => ({ key, familyKey });

function project(at: Family, items: unknown[]): SnapshotProjection {
  const section = {
    key: at.key,
    familyKey: at.familyKey,
    label: at.key,
    selectionPrefix: at.key,
    items,
  } as ConfigurationSectionData;
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(
        { collectedAt: "2026-10-23T09:00:00Z", sections: [section] },
        ASSESSMENT,
        new Map(),
        (digest) => `synthetic:${digest}`,
      ),
    ),
  );
}

function compareItems(at: Family, reference: unknown[], current: unknown[]) {
  const result = compareSettings(
    projectionSettings(project(at, reference)),
    projectionSettings(project(at, current)),
  );
  const rows = result.groups.flatMap((group) => group.rows);
  return {
    statuses: Object.fromEntries(
      rows.map((row) => [row.setting, row.status]),
    ) as Record<string, SettingComparison>,
    notCompared: result.notCompared.map((entry) => entry.family),
  };
}

const compare = (at: Family, reference: unknown, current: unknown) =>
  compareItems(at, [reference], [current]);

const historyItems = (at: Family, from: unknown[], to: unknown[]) =>
  diffSnapshots(project(at, from), project(at, to));

const history = (at: Family, from: unknown, to: unknown) =>
  historyItems(at, [from], [to]);

const changes = (diff: ReturnType<typeof diffSnapshots>) =>
  diff.policies.flatMap((policy) =>
    policy.settings.map((row) => [row.definitionId ?? row.name, row.change]),
  );

// Not definite in either view, in both directions: not comparable or not
// compared in Compare, and the policy not compared in History.
function expectUnknown(
  at: Family,
  setting: string,
  [a, b]: [unknown, unknown],
) {
  for (const [from, to] of [
    [a, b],
    [b, a],
  ]) {
    const result = compare(at, from, to);
    if (!result.notCompared.includes(at.key))
      expect(result.statuses[setting], setting).toBe("notComparable");
    const diff = history(at, from, to);
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
  }
}

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];
const complete = { settings: "complete", assignments: "complete" };
const SIMPLE =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance";
const SIMPLE_COLLECTION =
  "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance";
const CHOICE =
  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance";
const GROUP =
  "#microsoft.graph.deviceManagementConfigurationGroupSettingInstance";
const STRING_VALUE =
  "#microsoft.graph.deviceManagementConfigurationStringSettingValue";
const SECRET_VALUE =
  "#microsoft.graph.deviceManagementConfigurationSecretSettingValue";

const CATALOG = family("settingsCatalog");
const catalog = (
  instances: unknown[],
  extra: Record<string, unknown> = {},
) => ({
  id: "catalog-1",
  name: "Synthetic catalog policy",
  platforms: "windows10",
  technologies: "mdm",
  assignments: assigned,
  collectionStatus: complete,
  settings: instances.map((settingInstance, index) => ({
    id: String(index),
    settingInstance,
  })),
  ...extra,
});
const simple = (definition: string, value: unknown, type = STRING_VALUE) => ({
  "@odata.type": SIMPLE,
  settingDefinitionId: definition,
  simpleSettingValue: { "@odata.type": type, value },
});

describe("finding 1: rows without their id never make another row added or removed", () => {
  const ENROLLMENT = family("enrollmentConfigurations");
  const limit = (id: unknown, priority = 1) => ({
    "@odata.type": "#microsoft.graph.deviceEnrollmentLimitConfiguration",
    ...(id === undefined ? {} : { id }),
    displayName: "Synthetic enrollment limit",
    priority,
    assignments: assigned,
    collectionStatus: { assignments: "complete" },
  });

  it("reads a policy as not compared, not removed or added, when the other side lost its id", () => {
    for (const [from, to] of [
      [limit("enrollment-1"), limit(undefined)],
      [limit(undefined), limit("enrollment-1")],
    ]) {
      const diff = history(ENROLLMENT, from, to);
      expect(diff.policies).toEqual([]);
      expect(diff.totals.added + diff.totals.removed).toBe(0);
      expect(diff.notComparedItems.length).toBeGreaterThan(0);
    }
  });

  it("keeps a policy Graph returned with an id of another type unpaired", () => {
    for (const [from, to] of [
      [limit("5"), limit(5)],
      [limit(5), limit("5")],
    ]) {
      const diff = history(ENROLLMENT, from, to);
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems.length).toBeGreaterThan(0);
    }
  });

  it("keeps an item Graph returned as no record as an unknown policy", () => {
    const stored = project(ENROLLMENT, [limit("enrollment-1"), 42]).sections[0]!
      .items;
    expect(stored).toHaveLength(2);
    expect(stored[1]!.incomplete).toBe(true);
    // The other policy is no longer reported as removed.
    const diff = historyItems(
      ENROLLMENT,
      [limit("enrollment-1"), limit("enrollment-2")],
      [limit("enrollment-1"), 42],
    );
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems.map((item) => item.id)).toContain(
      "enrollment-2",
    );
    // Compare does not read the family as holding one policy fewer.
    expect(
      compareItems(
        ENROLLMENT,
        [limit("enrollment-1")],
        [limit("enrollment-1"), 42],
      ).notCompared,
    ).toContain(ENROLLMENT.key);
  });

  it("does not pair items that share an id", () => {
    const diff = historyItems(
      ENROLLMENT,
      [limit("enrollment-1", 1)],
      [limit("enrollment-1", 2), limit("enrollment-1", 3)],
    );
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(2);
  });

  it("still reads identified policies as added, removed and changed", () => {
    const diff = historyItems(
      ENROLLMENT,
      [limit("enrollment-1", 1), limit("enrollment-2")],
      [limit("enrollment-1", 2), limit("enrollment-3")],
    );
    expect(
      diff.policies.map((policy) => [policy.id, policy.kind]).sort(),
    ).toEqual([
      ["enrollment-1", "changed"],
      ["enrollment-2", "removed"],
      ["enrollment-3", "added"],
    ]);
  });

  it("reads authentication methods with a repeated id as not collected", () => {
    const identity = (ids: string[]) => ({
      status: { authenticationMethods: "collected" as const },
      authenticationMethods: {
        authenticationMethodConfigurations: ids.map((id) => ({
          "@odata.type":
            "#microsoft.graph.smsAuthenticationMethodConfiguration",
          id,
          state: "enabled",
        })),
      },
    });
    expect(
      identityCollected(identity(["Sms", "Fido2"]), "authenticationMethods"),
    ).toBe(true);
    expect(
      identityCollected(identity(["Sms", "sms"]), "authenticationMethods"),
    ).toBe(false);
  });
});

describe("finding 2: a type field selects how a row is read", () => {
  const COMPLIANCE = family("compliancePolicies");
  const compliance = (type: string, passwordRequired = true) => ({
    "@odata.type": type,
    id: "compliance-1",
    displayName: "Synthetic compliance policy",
    assignments: assigned,
    collectionStatus: { assignments: "complete" },
    passwordRequired,
    passwordMinutesOfInactivityBeforeLock: 15,
    osMinimumVersion: "10.0.19045",
  });
  const WINDOWS = "#microsoft.graph.windows10CompliancePolicy";

  it("reads a policy of an undocumented type as incomplete, never missing settings", () => {
    for (const [a, b] of [
      [compliance(WINDOWS), compliance("garbage")],
      [compliance("garbage"), compliance(WINDOWS)],
      [
        compliance(WINDOWS),
        compliance("#microsoft.graph.deviceCompliancePolicy"),
      ],
    ]) {
      const result = compare(COMPLIANCE, a, b);
      expect(result.notCompared).toContain(COMPLIANCE.key);
      expect(Object.values(result.statuses)).not.toContain("missing");
      const diff = history(COMPLIANCE, a, b);
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
  });

  it("keeps every type the lab tenant returns definite", () => {
    const typed: Array<[Family, string]> = [
      [COMPLIANCE, WINDOWS],
      [COMPLIANCE, "#microsoft.graph.iosCompliancePolicy"],
      [COMPLIANCE, "#microsoft.graph.macOSCompliancePolicy"],
      [
        family("deviceConfigurations"),
        "#microsoft.graph.macOSCustomConfiguration",
      ],
      [
        family("deviceConfigurations"),
        "#microsoft.graph.windowsHealthMonitoringConfiguration",
      ],
      [
        family("windowsUpdatePolicies"),
        "#microsoft.graph.windowsUpdateForBusinessConfiguration",
      ],
      [
        family("enrollmentConfigurations"),
        "#microsoft.graph.deviceEnrollmentPlatformRestrictionsConfiguration",
      ],
      [
        family("enrollmentConfigurations"),
        "#microsoft.graph.windowsRestoreDeviceEnrollmentConfiguration",
      ],
    ];
    for (const [at, type] of typed) {
      const item = project(at, [{ ...compliance(type), id: "item-1" }])
        .sections[0]!.items[0]!;
      expect(item.incomplete, type).toBeUndefined();
    }
    expect(
      compare(COMPLIANCE, compliance(WINDOWS), compliance(WINDOWS, false))
        .statuses.passwordRequired,
    ).toBe("different");
  });

  it("reads Settings Catalog platforms Graph does not document as unknown", () => {
    const value = simple("synthetic_setting", "a");
    const result = compare(
      CATALOG,
      catalog([value]),
      catalog([value], { platforms: "garbage" }),
    );
    expect(result.notCompared).toContain(CATALOG.key);
    expect(Object.values(result.statuses)).toEqual([]);
    for (const platforms of ["windows10", "macOS", "iOS", "linux", "none"])
      expect(
        compare(
          CATALOG,
          catalog([value], { platforms }),
          catalog([value], { platforms }),
        ).notCompared,
        platforms,
      ).toEqual([]);
  });

  it("reads a Settings Catalog instance of an undocumented or mismatched type as unknown", () => {
    const valid = simple("synthetic_setting", "a");
    expectUnknown(CATALOG, "synthetic_setting", [
      catalog([valid]),
      catalog([{ ...valid, "@odata.type": "garbage" }]),
    ]);
    // A simple instance carrying a choice value, whose children are read by
    // the choice type only.
    expectUnknown(CATALOG, "synthetic_setting", [
      catalog([valid]),
      catalog([
        {
          ...valid,
          choiceSettingValue: {
            value: "synthetic_setting_1",
            children: [simple("synthetic_child", "b")],
          },
        },
      ]),
    ]);
    const choice = (option: string) => ({
      "@odata.type": CHOICE,
      settingDefinitionId: "synthetic_choice",
      choiceSettingValue: { value: option, children: [] },
    });
    expect(
      changes(
        history(
          CATALOG,
          catalog([choice("synthetic_choice_0")]),
          catalog([choice("synthetic_choice_1")]),
        ),
      ),
    ).toEqual([["synthetic_choice", "changed"]]);
  });

  it("reads an external tenants record by its documented subtype only", () => {
    const CA = family("conditionalAccessPolicies");
    const ca = (type: string, membershipKind = "all", members?: string[]) => ({
      id: "ca-1",
      displayName: "Synthetic CA policy",
      state: "enabled",
      conditions: {
        clientAppTypes: ["all"],
        signInRiskLevels: [],
        userRiskLevels: [],
        users: {
          includeUsers: [],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
          includeGuestsOrExternalUsers: {
            guestOrExternalUserTypes: "b2bCollaborationGuest",
            externalTenants: {
              "@odata.type": type,
              membershipKind,
              ...(members ? { members } : {}),
            },
          },
        },
        applications: { includeApplications: ["All"], excludeApplications: [] },
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["mfa"],
        customAuthenticationFactors: [],
        termsOfUse: [],
        authenticationStrength: null,
      },
    });
    const ALL = "#microsoft.graph.conditionalAccessAllExternalTenants";
    const ENUMERATED =
      "#microsoft.graph.conditionalAccessEnumeratedExternalTenants";
    const tenant = "00000000-0000-0000-0000-000000000001";
    for (const unknown of [
      ca("garbage"),
      // The enumerated type with the membership kind of all tenants.
      ca(ENUMERATED, "all"),
      ca(ALL, "enumerated", [tenant]),
    ]) {
      expectUnknown(CA, "unused", [ca(ALL), unknown]);
      expect(compare(CA, ca(ALL), unknown).notCompared).toContain(CA.key);
    }
    expect(history(CA, ca(ALL), ca(ALL)).notComparedItems).toEqual([]);
    expect(compare(CA, ca(ALL), ca(ALL)).notCompared).toEqual([]);
    expect(
      history(CA, ca(ALL), ca(ENUMERATED, "enumerated", [tenant])).policies,
    ).toHaveLength(1);
  });
});

describe("finding 3: one depth limit for projection, flattening, Compare and History", () => {
  // A chain of group settings with a value at depth, the root at depth 0.
  const chain = (depth: number, value: unknown) => {
    let node: Record<string, unknown> = simple("synthetic_leaf", value);
    for (let level = depth - 1; level >= 0; level--)
      node = {
        "@odata.type": GROUP,
        settingDefinitionId: `synthetic_group_${level}`,
        groupSettingValue: { children: [node] },
      };
    return node;
  };

  it("reads a change at every kept depth, also below 12", () => {
    for (const depth of [12, 13, MAX_SETTING_DEPTH]) {
      const from = catalog([chain(depth, "a")]);
      const to = catalog([chain(depth, "b")]);
      expect(changes(history(CATALOG, from, to)), String(depth)).toEqual([
        ["synthetic_leaf", "changed"],
      ]);
      expect(
        compare(CATALOG, from, to).statuses.synthetic_leaf,
        String(depth),
      ).toBe("different");
      // Valid settings at the limit stay definite and unchanged.
      expect(history(CATALOG, from, from).notComparedItems).toEqual([]);
      expect(compare(CATALOG, from, from).statuses.synthetic_leaf).toBe(
        "matching",
      );
    }
  });

  it("reads a setting below the limit as unknown, never as no setting", () => {
    const deep = catalog([chain(MAX_SETTING_DEPTH + 1, "a")]);
    const other = catalog([chain(MAX_SETTING_DEPTH + 1, "b")]);
    expect(unidentifiedSources(deep, "settingsCatalog").size).toBe(1);
    const diff = history(CATALOG, deep, other);
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
    expect(compare(CATALOG, deep, other).notCompared).toContain(CATALOG.key);
    // Flattening a raw item says so instead of leaving the setting out.
    expect(
      flattenItemSettings("settingsCatalog", deep).some(
        (row) => row.unreadable,
      ),
    ).toBe(true);
  });

  it("marks a deep secret as redacted in Compare, never leaves it out", () => {
    const secret = (depth: number) =>
      catalog([
        (() => {
          let node: Record<string, unknown> = {
            "@odata.type": SIMPLE,
            settingDefinitionId: "synthetic_deep_secret",
            simpleSettingValue: { "@odata.type": SECRET_VALUE, value: "x" },
          };
          for (let level = depth - 1; level >= 0; level--)
            node = {
              "@odata.type": GROUP,
              settingDefinitionId: `synthetic_group_${level}`,
              groupSettingValue: { children: [node] },
            };
          return node;
        })(),
      ]);
    for (const depth of [10, MAX_SETTING_DEPTH])
      expect(
        compare(CATALOG, secret(depth), secret(depth)).statuses
          .synthetic_deep_secret,
        String(depth),
      ).toBe("notComparable");
  });
});

describe("finding 4: every custom OMA-URI value by its documented Edm type", () => {
  const DEVICE = family("deviceConfigurations");
  const custom = (type: string, value: unknown) => ({
    "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
    id: "device-oma",
    displayName: "Synthetic custom profile",
    assignments: assigned,
    collectionStatus: { assignments: "complete" },
    omaSettings: [
      {
        "@odata.type": `#microsoft.graph.${type}`,
        displayName: "Synthetic value",
        omaUri: "./Device/Vendor/MSFT/Policy/Config/Synthetic/Value",
        isEncrypted: false,
        value,
      },
    ],
  });
  const URI = "./Device/Vendor/MSFT/Policy/Config/Synthetic/Value";
  // Values of the documented type, and values of another one.
  const cases: Array<[string, unknown[], unknown[]]> = [
    [
      "omaSettingDateTime",
      ["2026-10-23T10:00:00.0000000Z", "2026-10-24T10:00:00Z"],
      ["garbage", "2026-10-23", 5],
    ],
    [
      "omaSettingStringXml",
      ["PFN5bnRoZXRpYy8+", "PFN5bnRoZXRpYzIvPg=="],
      ["<Synthetic/>", "garbage!", 5],
    ],
    ["omaSettingFloatingPoint", [1.5, 2.5], [1e39, "1.5", true]],
    ["omaSettingInteger", [1, 2], [1.5, "1", 2 ** 40]],
    ["omaSettingBoolean", [true, false], ["true", 1]],
    ["omaSettingString", ["a", "b"], [5, {}]],
    ["omaSettingBase64", ["U3ludGhldGlj", "U3ludGhldGljMg=="], [5, true]],
  ];

  it("reads a value of another type as unknown, never as a fingerprinted change", () => {
    for (const [type, [valid], invalid] of cases)
      for (const value of invalid) {
        expect(
          unreadableSources(custom(type, value), "deviceConfigurations").size,
          `${type} ${String(value)}`,
        ).toBe(1);
        expectUnknown(DEVICE, URI, [custom(type, valid), custom(type, value)]);
        const stored = project(DEVICE, [custom(type, value)]).sections[0]!
          .items[0]!;
        expect(stored.fingerprints, `${type} ${String(value)}`).toBeUndefined();
      }
  });

  it("reads a change between documented values as a change", () => {
    for (const [type, [a, b]] of cases) {
      const diff = history(DEVICE, custom(type, a), custom(type, b));
      expect(diff.notComparedItems, type).toEqual([]);
      expect(diff.policies, type).toHaveLength(1);
      expect(
        history(DEVICE, custom(type, a), custom(type, a)).policies,
        type,
      ).toEqual([]);
    }
  });
});

describe("finding 5: Edm syntax as the OData CSDL defines it", () => {
  const SCRIPTS = family("macOSScripts", "scripts");
  const script = (executionFrequency: unknown) => ({
    "@odata.type": "#microsoft.graph.deviceShellScript",
    id: "script-1",
    displayName: "Synthetic shell script",
    fileName: "synthetic.sh",
    executionFrequency,
    retryCount: 0,
    blockExecutionNotifications: true,
    assignments: assigned,
    collectionStatus: { assignments: "complete" },
  });

  it("reads a duration with years, months or weeks as unknown", () => {
    for (const value of ["P1Y", "P1M", "P1W", "P1Y2M3DT4H"])
      expectUnknown(SCRIPTS, "executionFrequency", [
        script("PT0S"),
        script(value),
      ]);
    expect(changes(history(SCRIPTS, script("PT0S"), script("P1D")))).toEqual([
      ["executionFrequency", "changed"],
    ]);
    expect(
      history(SCRIPTS, script("PT0S"), script("PT0S")).notComparedItems,
    ).toEqual([]);
  });

  it("keeps the times Graph returns and the forms the CSDL allows readable", () => {
    const DEVICE = family("deviceConfigurations");
    const general = (time: unknown) => ({
      "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
      id: "device-1",
      displayName: "Synthetic restrictions",
      assignments: assigned,
      collectionStatus: { assignments: "complete" },
      defenderSystemScanSchedule: "userDefined",
      defenderScanType: "quick",
      defenderScheduledScanTime: time,
    });
    // Round 39: "02:00" is "02:00:00.0000000", one TimeOfDay.
    expect(
      changes(history(DEVICE, general("02:00:00.0000000"), general("02:00"))),
    ).toEqual([]);
    expect(
      changes(history(DEVICE, general("02:00:00.0000000"), general("02:30"))),
    ).toEqual([["defenderScheduledScanTime", "changed"]]);
    expectUnknown(DEVICE, "defenderScheduledScanTime", [
      general("02:00:00.0000000"),
      general("02:00:00.1234567890123"),
    ]);
  });
});

describe("sweep: typed leaves", () => {
  it("reads an assignment intent Graph does not document as unreadable", () => {
    const assignment = (intent: unknown) => ({
      intent,
      target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
    });
    for (const intent of [
      "apply",
      "remove",
      "required",
      "available",
      "uninstall",
      "availableWithoutEnrollment",
      null,
      undefined,
    ])
      expect(unreadableAssignment(assignment(intent)), String(intent)).toBe(
        false,
      );
    for (const intent of ["garbage", "Apply", "", 1])
      expect(unreadableAssignment(assignment(intent)), String(intent)).toBe(
        true,
      );
  });

  it("reads platforms by the documented flags members", () => {
    for (const value of ["windows10", "macOS", "iOS,macOS", "linux"])
      expect(
        documentedPropertyValue(
          "deviceManagementConfigurationPlatforms",
          value,
        ),
      ).toBe(true);
    for (const value of ["garbage", "windows", "unknownFutureValue", "", 1])
      expect(
        documentedPropertyValue(
          "deviceManagementConfigurationPlatforms",
          value,
        ),
      ).toBe(false);
  });
});

describe("sweep: transformations keep values apart", () => {
  it("tells a list entry holding a separator from two entries", () => {
    const list = (values: string[]) => ({
      "@odata.type": SIMPLE_COLLECTION,
      settingDefinitionId: "synthetic_list",
      simpleSettingCollectionValue: values.map((value) => ({
        "@odata.type": STRING_VALUE,
        value,
      })),
    });
    const from = catalog([list(["a, b"])]);
    const to = catalog([list(["a", "b"])]);
    expect(changes(history(CATALOG, from, to))).toEqual([
      ["synthetic_list", "changed"],
    ]);
    // Both lists carry their typed entries (settings-flatten.ts typed), so
    // Compare tells them apart; a reference file saved before tokens held
    // the type reads not comparable (typed-tokens-round-40.test.ts).
    expect(compare(CATALOG, from, to).statuses.synthetic_list).toBe(
      "different",
    );
    expect(compare(CATALOG, from, from).statuses.synthetic_list).toBe(
      "matching",
    );
    expect(compare(CATALOG, to, to).statuses.synthetic_list).toBe("matching");
    expect(
      compare(CATALOG, from, catalog([list(["c"])])).statuses.synthetic_list,
    ).toBe("different");

    const INTENT = family("securityBaselines");
    const intent = (valueJson: string) => ({
      id: "intent-1",
      displayName: "Synthetic intent",
      templateId: "synthetic-template",
      assignments: assigned,
      collectionStatus: complete,
      settings: [
        {
          "@odata.type":
            "#microsoft.graph.deviceManagementCollectionSettingInstance",
          definitionId: "synthetic_collection",
          valueJson,
        },
      ],
    });
    expect(
      changes(history(INTENT, intent('["a, b"]'), intent('["a","b"]'))),
    ).toEqual([["synthetic_collection", "changed"]]);
    expect(history(INTENT, intent('["a"]'), intent('["a"]')).policies).toEqual(
      [],
    );
  });

  it("marks an item nested deeper than any stored value as incomplete", () => {
    let nested: Record<string, unknown> = { leaf: "synthetic" };
    for (let level = 0; level < 100; level++) nested = { nested };
    const item = project(family("assignmentFilters", "assignmentAndRbac"), [
      { id: "filter-1", displayName: "Synthetic filter", nested },
    ]).sections[0]!.items[0]!;
    expect(item.incomplete).toBe(true);
  });
});

describe("sweep: limits agree between Compare, History and the reference file", () => {
  it("does not compare a family whose rows a reference file cannot hold", async () => {
    const long = catalog([simple("synthetic_setting", "a")], {
      name: `Synthetic ${"x".repeat(2100)}`,
    });
    const set = projectionSettings(project(CATALOG, [long]));
    expect(set.notCompared.map((entry) => entry.key)).toContain(CATALOG.key);
    // The file written is always one that can be read again.
    const file = await createReference(project(CATALOG, [long]), {
      createdAt: "2026-10-23T09:00:00Z",
      sourceLabel: "Synthetic tenant",
    });
    expect((await parseReference(serializeReference(file))).ok).toBe(true);
  });

  const capability = (actualValue: string, sha?: string): StoredCapability => ({
    id: "synthetic-capability",
    name: "Synthetic capability",
    platform: "windows",
    status: "partial" as StoredCapability["status"],
    evidence: [],
    checks: [
      {
        settingId: "synthetic_check",
        policyId: "policy-1",
        assessmentStatus: "checked",
        result: "different",
        actualValue,
        ...(sha ? { actualValueSha256: sha } : {}),
      } as StoredCapability["checks"][number],
    ],
  });
  const stored = (cap: StoredCapability): StoredAssessment => ({
    rulesetVersion: "synthetic",
    generatedAt: "2026-10-23T09:00:00Z",
    scope: {} as StoredAssessment["scope"],
    capabilities: [cap],
    frameworks: [
      {
        id: "synthetic-framework",
        name: "Synthetic framework",
        version: "1",
        summary: {} as StoredAssessment["frameworks"][number]["summary"],
        controls: [
          {
            id: "control-1",
            title: "Synthetic control",
            status:
              "partial" as StoredAssessment["frameworks"][number]["controls"][number]["status"],
            capabilityIds: [cap.id],
          },
        ],
      },
    ],
  });

  it("keeps the digest of a check value longer than it stores", () => {
    const value = (tail: string) => `${"x".repeat(600)}${tail}`;
    const assessment = (tail: string) =>
      compactAssessment({
        provenance: { rulesetVersion: "synthetic" },
        generatedAt: "2026-10-23T09:00:00Z",
        scope: {},
        frameworks: [],
        capabilities: [
          {
            capability: {
              id: "synthetic-capability",
              name: "Synthetic",
              platform: "windows",
            },
            status: "partial",
            evidence: [],
            checks: [
              {
                settingId: "synthetic_check",
                policyId: "policy-1",
                assessmentStatus: "checked",
                result: "different",
                actualValue: value(tail),
              },
            ],
          },
        ],
      } as unknown as ComplianceAssessment);
    const a = assessment("a").capabilities[0]!.checks[0]!;
    const b = assessment("b").capabilities[0]!.checks[0]!;
    expect(a.actualValue).toBe(b.actualValue);
    expect(a.actualValueSha256).not.toBe(b.actualValueSha256);
  });

  it("reads a change past the stored length as a change, and a shortened value without its digest as not compared", () => {
    const control = (from: StoredCapability, to: StoredCapability) => {
      const diff = diffAssessments(stored(from), {
        ...stored(to),
        frameworks: stored(to).frameworks.map((framework) => ({
          ...framework,
          controls: framework.controls.map((entry) => ({
            ...entry,
            status: "implemented" as typeof entry.status,
          })),
        })),
      });
      return diff.frameworks[0]!.changes[0]!.causes[0]!;
    };
    const prefix = "x".repeat(500);
    const changed = control(
      capability(prefix, "1".repeat(64)),
      capability(prefix, "2".repeat(64)),
    );
    expect(changed.notCompared).toBe(false);
    expect(changed.checksChanged).toHaveLength(1);
    const legacy = control(
      capability(prefix),
      capability(prefix, "2".repeat(64)),
    );
    expect(legacy.notCompared).toBe(true);
    expect(legacy.checksChanged).toEqual([]);
  });
});

describe("round 34 review", () => {
  it("reads a reference row saved without a token as not comparable, never different", async () => {
    const list = {
      "@odata.type": SIMPLE_COLLECTION,
      settingDefinitionId: "synthetic_list",
      simpleSettingCollectionValue: [
        { "@odata.type": STRING_VALUE, value: "CN=a, O=b" },
      ],
    };
    const current = projectionSettings(project(CATALOG, [catalog([list])]));
    // A file saved before lists with separators had a token.
    const saved = {
      ...current,
      settings: current.settings.map(
        ({ token: _token, ...setting }) => setting,
      ),
    };
    const result = compareSettings(saved, current);
    const row = result.groups
      .flatMap((group) => group.rows)
      .find((entry) => entry.setting === "synthetic_list");
    expect(row?.status).toBe("notComparable");
  });

  it("reads a missing OMA-URI list of every custom profile type as unknown", () => {
    const DEVICE = family("deviceConfigurations");
    for (const type of [
      "androidCustomConfiguration",
      "androidForWorkCustomConfiguration",
      "androidWorkProfileCustomConfiguration",
      "windows10CustomConfiguration",
      "windowsPhone81CustomConfiguration",
    ]) {
      const profile = (rows: boolean) => ({
        "@odata.type": `#microsoft.graph.${type}`,
        id: "custom-1",
        displayName: "Synthetic custom profile",
        assignments: assigned,
        collectionStatus: { assignments: "complete" },
        ...(rows
          ? {
              omaSettings: [
                {
                  "@odata.type": "#microsoft.graph.omaSettingInteger",
                  displayName: "Synthetic integer",
                  omaUri: "./Vendor/MSFT/Synthetic/Value",
                  value: 1,
                },
              ],
            }
          : {}),
      });
      const result = compare(DEVICE, profile(true), profile(false));
      expect(result.notCompared, type).toContain(DEVICE.key);
      expect(compare(DEVICE, profile(true), profile(true)).notCompared).toEqual(
        [],
      );
    }
  });

  it("never reads an item Graph returned as no record as a removed singleton", () => {
    const SINGLETON = family("deviceManagementSettings", "tenantAndService");
    const diff = historyItems(SINGLETON, [42], []);
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
  });
});
