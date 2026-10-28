import { describe, expect, it } from "vitest";
import {
  unidentifiedSources,
  unreadableAssignment,
  unreadableProperties,
  unreadableSources,
} from "../compliance/graph-rows";
import type { ComplianceAssessment } from "../compliance/types";
import type { ConfigurationSectionData } from "../configuration-sections";
import { DetailedIntuneService } from "../intune-detailed-client";
import {
  INTUNE_POLICY_REGISTRY,
  sanitizeGraphData,
  setRedactionDigest,
} from "../intune-policy-registry";
import { diffSnapshots } from "../snapshots/diff";
import {
  contentDigest,
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import {
  compareSettings,
  projectionSettings,
  type SettingComparison,
} from "../snapshots/reference";

// Known limits of Compare and History closed in round 33, and the round 33
// review findings. Shapes follow Graph beta in the lab tenant (23 October
// 2026) with synthetic names, ids and values.

// The projection stores the assessment as it is; these tests read settings.
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

function compare(at: Family, reference: unknown, current: unknown) {
  const result = compareSettings(
    projectionSettings(project(at, [reference])),
    projectionSettings(project(at, [current])),
  );
  const rows = result.groups.flatMap((group) => group.rows);
  return {
    statuses: Object.fromEntries(
      rows.map((row) => [row.setting, row.status]),
    ) as Record<string, SettingComparison>,
    notCompared: result.notCompared.map((entry) => entry.family),
  };
}

function history(at: Family, from: unknown, to: unknown) {
  return diffSnapshots(project(at, [from]), project(at, [to]));
}

const changes = (diff: ReturnType<typeof diffSnapshots>) =>
  diff.policies.flatMap((policy) =>
    policy.settings.map((row) => [row.definitionId ?? row.name, row.change]),
  );

// Not definite in either view: not comparable or not compared in Compare,
// and the policy not compared in History.
function expectUnknown(
  at: Family,
  setting: string,
  [a, b]: [unknown, unknown],
) {
  const result = compare(at, a, b);
  if (!result.notCompared.includes(at.key))
    expect(result.statuses[setting], setting).toBe("notComparable");
  const diff = history(at, a, b);
  expect(diff.policies).toEqual([]);
  expect(diff.notComparedItems).toHaveLength(1);
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
const STRING_VALUE =
  "#microsoft.graph.deviceManagementConfigurationStringSettingValue";

describe("reusable policy settings are collected and compared", () => {
  const REUSABLE = family("reusablePolicySettings", "assignmentAndRbac");
  const DEFINITION = "synthetic_reusablesettings_certificatefile";
  const reusable = (value: unknown, instance = true) => ({
    id: "reusable-1",
    displayName: "Synthetic certificate",
    settingDefinitionId: DEFINITION,
    version: 1,
    ...(instance
      ? {
          settingInstance: {
            "@odata.type": SIMPLE,
            settingDefinitionId: DEFINITION,
            settingInstanceTemplateReference: null,
            simpleSettingValue: { "@odata.type": STRING_VALUE, value },
          },
        }
      : {}),
  });

  it("selects the setting instance on the list request", async () => {
    const entry = INTUNE_POLICY_REGISTRY.find(
      (item) => item.key === REUSABLE.key,
    )!;
    const selected: string[] = [];
    const service = new DetailedIntuneService("test") as any;
    service.retryWithBackoff = (fn: () => Promise<unknown>) => fn();
    service.client = {
      api: () => {
        let fields: string | undefined;
        const request: any = {
          version: () => request,
          top: () => request,
          select: (value: string) => {
            selected.push(value);
            fields = value;
            return request;
          },
          // Graph returns settingInstance only when it is selected.
          get: async () => ({
            value: [
              fields?.split(",").includes("settingInstance")
                ? reusable("Synthetic value")
                : reusable("Synthetic value", false),
            ],
          }),
        };
        return request;
      },
    };
    const section = await service.fetchRegistrySection(entry);
    expect(selected).toHaveLength(1);
    expect(selected[0]!.split(",")).toEqual(
      expect.arrayContaining(["id", "displayName", "settingInstance"]),
    );
    expect(section.items[0].settingInstance.simpleSettingValue.value).toBe(
      "Synthetic value",
    );
  });

  it("reads a changed value as changed in History and different in Compare", () => {
    expect(changes(history(REUSABLE, reusable("A"), reusable("B")))).toEqual([
      [DEFINITION, "changed"],
    ]);
    expect(history(REUSABLE, reusable("A"), reusable("A")).policies).toEqual(
      [],
    );
    expect(
      compare(REUSABLE, reusable("A"), reusable("B")).statuses[DEFINITION],
    ).toBe("different");
    expect(
      compare(REUSABLE, reusable("A"), reusable("A")).statuses[DEFINITION],
    ).toBe("matching");
  });

  it("reads content Graph did not return as not compared, never unchanged", () => {
    for (const [a, b] of [
      [reusable("A"), reusable("A", false)],
      [reusable("A", false), reusable("A", false)],
      [reusable("A"), { ...reusable("A", false), settingInstance: "garbage" }],
    ]) {
      const diff = history(REUSABLE, a, b);
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
      expect(compare(REUSABLE, a, b).notCompared).toContain(REUSABLE.key);
    }
    const project1 = project(REUSABLE, [reusable("A", false)]);
    expect(project1.sections[0]!.items[0]!.incomplete).toBe(true);
  });

  it("reads an unreadable value as unknown", () => {
    expectUnknown(REUSABLE, DEFINITION, [reusable("A"), reusable(5)]);
  });
});

describe("Compare reads choices and presentations by id", () => {
  const CATALOG = family("settingsCatalog");
  const CHOICE = "device_vendor_msft_synthetic_mode";
  const catalog = (option: string, label: string) => ({
    id: "catalog-1",
    name: "Synthetic catalog policy",
    platforms: "windows10",
    technologies: "mdm",
    assignments: assigned,
    collectionStatus: complete,
    settings: [
      {
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId: CHOICE,
          choiceSettingValue: { value: `${CHOICE}_${option}`, children: [] },
        },
        settingDefinitions: [
          {
            id: CHOICE,
            displayName: "Synthetic mode",
            options: [
              { itemId: `${CHOICE}_1`, displayName: label },
              { itemId: `${CHOICE}_0`, displayName: `${label} off` },
            ],
          },
        ],
      },
    ],
  });

  it("reads a renamed option with the same id as matching", () => {
    expect(
      compare(CATALOG, catalog("1", "Enabled"), catalog("1", "On")).statuses[
        CHOICE
      ],
    ).toBe("matching");
    expect(
      compare(CATALOG, catalog("1", "Enabled"), catalog("0", "Enabled"))
        .statuses[CHOICE],
    ).toBe("different");
    expect(
      history(CATALOG, catalog("1", "Enabled"), catalog("1", "On")).policies,
    ).toEqual([]);
    expect(
      changes(history(CATALOG, catalog("1", "Enabled"), catalog("0", "On"))),
    ).toEqual([[CHOICE, "changed"]]);
  });

  const TEMPLATE = family("administrativeTemplates");
  const template = (id: string, label: string, value: number) => ({
    id: "template-1",
    displayName: "Synthetic template",
    assignments: assigned,
    collectionStatus: complete,
    definitionValues: [
      {
        id: "value-1",
        enabled: true,
        definition: {
          id: "synthetic-definition",
          displayName: "Synthetic timeout",
          categoryPath: "\\Synthetic",
        },
        presentationValues: [
          {
            "@odata.type":
              "#microsoft.graph.groupPolicyPresentationValueDecimal",
            value,
            presentation: { id, label },
          },
        ],
      },
    ],
  });
  const SETTING = "synthetic-definition";

  it("reads a renamed presentation label with the same id as matching", () => {
    const same = [
      template("presentation-1", "Timeout", 900),
      template("presentation-1", "Idle timeout", 900),
    ] as const;
    expect(Object.values(compare(TEMPLATE, ...same).statuses)).toEqual([
      "matching",
    ]);
    expect(history(TEMPLATE, ...same).policies).toEqual([]);
    for (const other of [
      template("presentation-1", "Timeout", 600),
      template("presentation-2", "Timeout", 900),
    ]) {
      const from = template("presentation-1", "Timeout", 900);
      expect(Object.values(compare(TEMPLATE, from, other).statuses)).toEqual([
        "different",
      ]);
      expect(changes(history(TEMPLATE, from, other))).toEqual([
        [SETTING, "changed"],
      ]);
    }
  });
});

describe("collections Graph gives no order are compared as multisets", () => {
  const CA = family("conditionalAccessPolicies");
  const policy = (
    conditions: Record<string, unknown> = {},
    grants: Record<string, unknown> = {},
    users: Record<string, unknown> = {},
  ) => ({
    id: "ca-1",
    displayName: "Synthetic CA policy",
    state: "enabled",
    conditions: {
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
        ...users,
      },
      applications: { includeApplications: ["All"], excludeApplications: [] },
      platforms: {
        includePlatforms: ["windows", "macOS"],
        excludePlatforms: [],
      },
      ...conditions,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa", "compliantDevice"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
      ...grants,
    },
  });
  const PLATFORMS = "Conditions / Platforms / Include Platforms";
  const CONTROLS = "Grant Controls / Built In Controls";
  const platforms = (list: string[]) =>
    policy({ platforms: { includePlatforms: list, excludePlatforms: [] } });

  it("reads a reordered Conditional Access list as matching", () => {
    const base = policy();
    expect(
      compare(CA, base, platforms(["macOS", "windows"])).statuses,
    ).toMatchObject({
      [PLATFORMS]: "matching",
    });
    expect(
      compare(
        CA,
        base,
        policy({}, { builtInControls: ["compliantDevice", "mfa"] }),
      ).statuses[CONTROLS],
    ).toBe("matching");
    const groups = (list: string[]) => policy({}, {}, { includeGroups: list });
    const g1 = "00000000-0000-0000-0000-0000000000a1";
    const g2 = "00000000-0000-0000-0000-0000000000a2";
    const reordered = history(CA, groups([g1, g2]), groups([g2, g1]));
    expect(reordered.notComparedItems).toEqual([]);
    expect(reordered.policies).toEqual([]);
    expect(
      history(
        CA,
        platforms(["windows", "macOS"]),
        platforms(["macOS", "windows"]),
      ).policies,
    ).toEqual([]);
    // Flags members are a set too.
    const guests = (types: string) =>
      policy(
        {},
        {},
        {
          includeGuestsOrExternalUsers: {
            guestOrExternalUserTypes: types,
            externalTenants: {
              "@odata.type":
                "#microsoft.graph.conditionalAccessAllExternalTenants",
              membershipKind: "all",
            },
          },
        },
      );
    expect(
      history(
        CA,
        guests("internalGuest,b2bCollaborationGuest"),
        guests("b2bCollaborationGuest,internalGuest"),
      ).policies,
    ).toEqual([]);
  });

  it("still reads an added or removed entry as a change", () => {
    expect(
      compare(CA, policy(), platforms(["windows", "macOS", "linux"])).statuses[
        PLATFORMS
      ],
    ).toBe("different");
    expect(
      compare(CA, policy(), platforms(["macOS"])).statuses[PLATFORMS],
    ).toBe("different");
    const added = history(CA, policy(), platforms(["windows", "macOS", "iOS"]));
    expect(added.policies).toHaveLength(1);
    expect(added.policies[0]!.settings.map((row) => row.change)).toEqual([
      "changed",
    ]);
    const g1 = "00000000-0000-0000-0000-0000000000a1";
    const g2 = "00000000-0000-0000-0000-0000000000a2";
    const groups = (list: string[]) => policy({}, {}, { includeGroups: list });
    expect(history(CA, groups([g1, g2]), groups([g1])).policies).toHaveLength(
      1,
    );
    // A repeated entry counts: a multiset, not a set.
    expect(history(CA, groups([g1, g1]), groups([g1])).policies).toHaveLength(
      1,
    );
  });

  const CATALOG = family("settingsCatalog");
  const SECRET_ID = "synthetic_profiles_presharedkey";
  const profiles = (keys: string[]) => ({
    id: "catalog-wifi",
    name: "Synthetic Wi-Fi profiles",
    platforms: "windows10",
    technologies: "mdm",
    assignments: assigned,
    collectionStatus: complete,
    settings: [
      {
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
          settingDefinitionId: "synthetic_profiles",
          groupSettingCollectionValue: keys.map((key) => ({
            children: [
              {
                "@odata.type": SIMPLE,
                settingDefinitionId: SECRET_ID,
                simpleSettingValue: {
                  "@odata.type":
                    "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
                  value: key,
                  valueState: "notEncrypted",
                },
              },
            ],
          })),
        },
      },
    ],
  });
  const secretChanges = (diff: ReturnType<typeof diffSnapshots>) =>
    diff.policies
      .flatMap((entry) => entry.settings)
      .filter((row) => row.valueNotStored)
      .map((row) => row.change);

  it("keeps fingerprint identity when an entry is inserted or reordered", () => {
    const before = profiles(["Synthetic-A", "Synthetic-B"]);
    const inserted = history(
      CATALOG,
      before,
      profiles(["Synthetic-X", "Synthetic-A", "Synthetic-B"]),
    );
    expect(inserted.notComparedItems).toEqual([]);
    expect(secretChanges(inserted)).toEqual(["added"]);
    expect(
      secretChanges(
        history(CATALOG, before, profiles(["Synthetic-B", "Synthetic-A"])),
      ),
    ).toEqual([]);
    expect(
      secretChanges(
        history(CATALOG, before, profiles(["Synthetic-A", "Synthetic-C"])),
      ),
    ).toEqual(["changed"]);
    expect(
      secretChanges(history(CATALOG, before, profiles(["Synthetic-A"]))),
    ).toEqual(["removed"]);
  });

  it("keeps the order of Settings Catalog value collections", () => {
    const LIST = "device_vendor_msft_synthetic_fallbackorder";
    const ordered = (values: string[]) => ({
      ...profiles([]),
      id: "catalog-order",
      settings: [
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
            settingDefinitionId: LIST,
            simpleSettingCollectionValue: values.map((value) => ({
              "@odata.type": STRING_VALUE,
              value,
            })),
          },
        },
      ],
    });
    // Graph documents no order for them and several CSPs are ordered lists.
    expect(
      compare(CATALOG, ordered(["a", "b"]), ordered(["b", "a"])).statuses[LIST],
    ).toBe("different");
    expect(
      changes(history(CATALOG, ordered(["a", "b"]), ordered(["b", "a"]))),
    ).toEqual([[LIST, "changed"]]);
  });

  const TEMPLATE = family("administrativeTemplates");
  const list = (pairs: Array<{ name: unknown; value: unknown }>) => ({
    id: "template-list",
    displayName: "Synthetic list template",
    assignments: assigned,
    collectionStatus: complete,
    definitionValues: [
      {
        id: "value-1",
        enabled: true,
        definition: { id: "synthetic-list", displayName: "Synthetic sites" },
        presentationValues: [
          {
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueList",
            values: pairs,
            presentation: { id: "presentation-list", label: "Sites" },
          },
        ],
      },
    ],
  });

  it("reads reordered list presentation pairs as unchanged", () => {
    const a = { name: "Synthetic site A", value: "1" };
    const b = { name: "Synthetic site B", value: "2" };
    expect(history(TEMPLATE, list([a, b]), list([b, a])).policies).toEqual([]);
    const changed = history(
      TEMPLATE,
      list([a, b]),
      list([a, { ...b, value: "3" }]),
    );
    expect(changed.notComparedItems).toEqual([]);
    expect(changed.policies).toHaveLength(1);
  });
});

describe("round 33: unreadable raw values never read as valid", () => {
  const CA = family("conditionalAccessPolicies");
  const ca = (state: unknown) => ({
    id: "ca-1",
    displayName: "Synthetic CA policy",
    state,
    conditions: {
      clientAppTypes: ["all"],
      signInRiskLevels: [],
      userRiskLevels: [],
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
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

  it("reads an enum value Graph does not document as unknown", () => {
    expectUnknown(CA, "state", [ca("enabled"), ca("garbage")]);
    expect(compare(CA, ca("enabled"), ca("disabled")).statuses.state).toBe(
      "different",
    );
    expect(
      history(CA, ca("enabled"), ca("enabledForReportingButNotEnforced"))
        .policies,
    ).toHaveLength(1);
  });

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
  const TIME = "defenderScheduledScanTime";

  it("reads a TimeOfDay that is no time as unknown", () => {
    expectUnknown(DEVICE, TIME, [general("02:00:00"), general("garbage")]);
    expect(
      compare(DEVICE, general("02:00:00"), general("03:00:00.0000000"))
        .statuses[TIME],
    ).toBe("different");
    expect(
      changes(
        history(DEVICE, general("02:00:00"), general("03:00:00.0000000")),
      ),
    ).toEqual([[TIME, "changed"]]);
    expect(
      compare(DEVICE, general("02:00:00.0000000"), general("02:00:00.0000000"))
        .statuses[TIME],
    ).toBe("matching");
    // Null is a value: not configured.
    expect(
      history(DEVICE, general(null), general("02:00:00")).policies,
    ).toHaveLength(1);
  });

  const TEMPLATE = family("administrativeTemplates");
  const sites = (value: unknown) => ({
    id: "template-list",
    displayName: "Synthetic list template",
    assignments: assigned,
    collectionStatus: complete,
    definitionValues: [
      {
        id: "value-1",
        enabled: true,
        definition: { id: "synthetic-list", displayName: "Synthetic sites" },
        presentationValues: [
          {
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueList",
            values: [{ name: "Site", value }],
            presentation: { id: "presentation-list", label: "Sites" },
          },
        ],
      },
    ],
  });

  it("reads list pairs that are not text as unknown, never fingerprinted", () => {
    expectUnknown(TEMPLATE, "synthetic-list", [sites("example"), sites(123)]);
    const stored = project(TEMPLATE, [sites(123)]).sections[0]!.items[0]!;
    expect(stored.fingerprints).toBeUndefined();
    expect(
      history(TEMPLATE, sites("example"), sites("other")).policies,
    ).toHaveLength(1);
  });

  const INTENT = family("securityBaselines");
  const intent = (value: unknown, valueJson: string) => ({
    id: "intent-1",
    displayName: "Synthetic intent",
    templateId: "synthetic-template",
    assignments: assigned,
    collectionStatus: { settings: "complete", assignments: "complete" },
    settings: [
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementIntegerSettingInstance",
        definitionId: "synthetic_integer",
        value,
        valueJson,
      },
    ],
  });

  it("never stores an unreadable intent value as not configured", () => {
    expectUnknown(INTENT, "synthetic_integer", [
      intent(1, "1"),
      intent({ value: 2 }, "null"),
    ]);
    // A setting that is not configured stays definite.
    const notConfigured = compare(INTENT, intent(1, "1"), intent(null, "null"));
    expect(notConfigured.notCompared).toEqual([]);
    expect(notConfigured.statuses.synthetic_integer).not.toBe("notComparable");
    expect(
      history(INTENT, intent(1, "1"), intent(null, "null")).policies,
    ).toHaveLength(1);
  });

  const COMPLIANCE = family("compliancePolicies");
  const compliance = (typed: boolean) => ({
    ...(typed
      ? { "@odata.type": "#microsoft.graph.windows10CompliancePolicy" }
      : {}),
    id: "compliance-1",
    displayName: "Synthetic compliance policy",
    assignments: assigned,
    collectionStatus: { assignments: "complete" },
    passwordRequired: true,
    passwordMinutesOfInactivityBeforeLock: 15,
    osMinimumVersion: "10.0.19045",
  });

  it("reads a typed policy without its type as incomplete, never missing settings", () => {
    for (const [a, b] of [
      [compliance(true), compliance(false)],
      [compliance(false), compliance(true)],
    ]) {
      const result = compare(COMPLIANCE, a, b);
      expect(result.notCompared).toContain(COMPLIANCE.key);
      expect(Object.values(result.statuses)).not.toContain("missing");
      const diff = history(COMPLIANCE, a, b);
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    for (const type of [5, "", null]) {
      const stored = project(COMPLIANCE, [
        { ...compliance(false), "@odata.type": type },
      ]).sections[0]!.items[0]!;
      expect(stored.incomplete).toBe(true);
    }
    // Typed on both sides, the settings stay definite.
    const typed = compare(COMPLIANCE, compliance(true), {
      ...compliance(true),
      passwordRequired: false,
    });
    expect(typed.statuses.passwordRequired).toBe("different");
  });
});

// The structural rule behind round 33: the readability check runs on the
// value as Graph returned it, before the projection transforms it, so no
// unreadable raw value is stored in a form that reads as valid (null,
// [Redacted], a fingerprint or a dropped property). Every leaf of valid
// items of each layout is replaced by values of other shapes; whenever the
// shared checks read the raw item as unreadable, Compare reports no
// difference, missing or extra setting and History compares nothing.
describe("round 33 review: values Graph documents and values it does not", () => {
  const INTENT = family("securityBaselines");
  const collection = (value: unknown, valueJson: string) => ({
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
        ...(value === undefined ? {} : { value }),
        valueJson,
      },
    ],
  });
  const COLLECTION = "synthetic_collection";

  it("reads a JSON intent type by its JSON text, a stray value as unknown", () => {
    const a = collection(undefined, '["a"]');
    const b = collection(undefined, '["b"]');
    expect(compare(INTENT, a, b).statuses[COLLECTION]).toBe("different");
    expect(changes(history(INTENT, a, b))).toEqual([[COLLECTION, "changed"]]);
    expect(compare(INTENT, a, a).statuses[COLLECTION]).toBe("matching");
    // A value beside the JSON text would be read instead of it.
    for (const stray of ["a", ["a"], { value: 2 }])
      expectUnknown(INTENT, COLLECTION, [a, collection(stray, '["a"]')]);
    // A complex instance with a value record beside its JSON text, as in
    // the review: unknown, never the same "{}" on both sides.
    const complex = (valueJson: string) => ({
      ...collection(undefined, valueJson),
      settings: [
        {
          "@odata.type":
            "#microsoft.graph.deviceManagementComplexSettingInstance",
          definitionId: COLLECTION,
          value: [{ a: 1 }],
          valueJson,
        },
      ],
    });
    expectUnknown(INTENT, COLLECTION, [complex('{"a":1}'), complex('{"a":2}')]);
    // Null beside "null" is a collection that is not configured.
    expect(
      history(INTENT, a, collection(null, "null")).notComparedItems,
    ).toEqual([]);
  });

  const TEMPLATE = family("administrativeTemplates");
  const template = (entry: Record<string, unknown>) => ({
    id: "template-1",
    displayName: "Synthetic template",
    assignments: assigned,
    collectionStatus: complete,
    definitionValues: [
      {
        id: "value-1",
        enabled: true,
        definition: { id: "synthetic-definition", displayName: "Synthetic" },
        presentationValues: [entry],
      },
    ],
  });
  const pairs = (value: unknown) =>
    template({
      "@odata.type": "#microsoft.graph.groupPolicyPresentationValueList",
      values: [{ name: "Site", value }],
      presentation: { id: "presentation-list", label: "Sites" },
    });

  it("reads a pair with a null value as a documented pair", () => {
    const stored = project(TEMPLATE, [pairs(null)]).sections[0]!.items[0]!;
    expect(stored.fingerprints).toBeDefined();
    expect(history(TEMPLATE, pairs(null), pairs(null)).policies).toEqual([]);
    const changed = history(TEMPLATE, pairs(null), pairs("example"));
    expect(changed.notComparedItems).toEqual([]);
    expect(changed.policies).toHaveLength(1);
    // Values of another type stay unreadable.
    expectUnknown(TEMPLATE, "synthetic-definition", [
      pairs(null),
      pairs(false),
    ]);
  });

  it("reads values on a single value presentation as unknown", () => {
    const text = (extra: Record<string, unknown>) =>
      template({
        "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
        value: "Synthetic text",
        presentation: { id: "presentation-text", label: "Text" },
        ...extra,
      });
    for (const values of [["a"], [{ name: "a", value: "b" }], null, "x"])
      expectUnknown(TEMPLATE, "synthetic-definition", [
        text({}),
        text({ values }),
      ]);
    expect(history(TEMPLATE, text({}), text({})).notComparedItems).toEqual([]);
  });

  it("keys a value the collector redacted by its presentation id, not its label", () => {
    setRedactionDigest(contentDigest);
    try {
      const secret = (label: string, value: string) =>
        sanitizeGraphData(
          template({
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
            value,
            presentation: { id: "presentation-secret", label },
          }),
        );
      const from = secret("Synthetic password", "Synthetic-1");
      const renamed = history(
        TEMPLATE,
        from,
        secret("Synthetic proxy password", "Synthetic-1"),
      );
      expect(renamed.notComparedItems).toEqual([]);
      expect(renamed.policies).toEqual([]);
      const rotated = history(
        TEMPLATE,
        from,
        secret("Synthetic proxy password", "Synthetic-2"),
      );
      expect(
        rotated.policies.flatMap((entry) =>
          entry.settings.map((row) => [row.change, row.valueNotStored]),
        ),
      ).toEqual([["changed", true]]);
    } finally {
      setRedactionDigest(null);
    }
  });
});

describe("the projection never stores an unreadable raw value as readable", () => {
  const typedValue = (type: string, value: unknown) => ({
    "@odata.type": `#microsoft.graph.${type}`,
    value,
  });
  const presentation = (
    type: string,
    field: string,
    value: unknown,
    id: string,
  ) => ({
    "@odata.type": `#microsoft.graph.${type}`,
    [field]: value,
    presentation: { id, label: id },
  });
  const valid: Array<[Family, Record<string, unknown>]> = [
    [
      family("settingsCatalog"),
      {
        id: "catalog-1",
        name: "Synthetic catalog policy",
        platforms: "windows10",
        technologies: "mdm",
        assignments: assigned,
        collectionStatus: complete,
        settings: [
          {
            id: "0",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
              settingDefinitionId: "synthetic_choice",
              choiceSettingValue: {
                value: "synthetic_choice_1",
                children: [
                  {
                    "@odata.type": SIMPLE,
                    settingDefinitionId: "synthetic_choice_level",
                    simpleSettingValue: typedValue(
                      "deviceManagementConfigurationIntegerSettingValue",
                      3,
                    ),
                  },
                ],
              },
            },
          },
          {
            id: "1",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
              settingDefinitionId: "synthetic_list",
              simpleSettingCollectionValue: [
                typedValue(
                  "deviceManagementConfigurationStringSettingValue",
                  "a",
                ),
                typedValue(
                  "deviceManagementConfigurationStringSettingValue",
                  "b",
                ),
              ],
            },
          },
        ],
      },
    ],
    [
      family("reusablePolicySettings", "assignmentAndRbac"),
      {
        id: "reusable-1",
        displayName: "Synthetic reusable setting",
        settingInstance: {
          "@odata.type": SIMPLE,
          settingDefinitionId: "synthetic_reusablesetting",
          simpleSettingValue: typedValue(
            "deviceManagementConfigurationStringSettingValue",
            "Synthetic value",
          ),
        },
      },
    ],
    [
      family("administrativeTemplates"),
      {
        id: "template-1",
        displayName: "Synthetic template",
        assignments: assigned,
        collectionStatus: complete,
        definitionValues: [
          {
            id: "value-1",
            enabled: true,
            definition: {
              id: "synthetic-definition",
              displayName: "Synthetic",
            },
            presentationValues: [
              presentation(
                "groupPolicyPresentationValueDecimal",
                "value",
                900,
                "p-decimal",
              ),
              presentation(
                "groupPolicyPresentationValueText",
                "value",
                "text",
                "p-text",
              ),
              presentation(
                "groupPolicyPresentationValueMultiText",
                "values",
                ["a", "b"],
                "p-multi",
              ),
              presentation(
                "groupPolicyPresentationValueList",
                "values",
                [{ name: "Site", value: "example" }],
                "p-list",
              ),
            ],
          },
        ],
      },
    ],
    [
      family("securityBaselines"),
      {
        id: "intent-1",
        displayName: "Synthetic intent",
        templateId: "synthetic-template",
        assignments: assigned,
        collectionStatus: complete,
        settings: [
          {
            "@odata.type":
              "#microsoft.graph.deviceManagementIntegerSettingInstance",
            definitionId: "synthetic_integer",
            value: 1,
            valueJson: "1",
          },
          {
            "@odata.type":
              "#microsoft.graph.deviceManagementBooleanSettingInstance",
            definitionId: "synthetic_boolean",
            value: true,
            valueJson: "true",
          },
          {
            "@odata.type":
              "#microsoft.graph.deviceManagementCollectionSettingInstance",
            definitionId: "synthetic_collection",
            valueJson: '["a"]',
          },
        ],
      },
    ],
    [
      family("compliancePolicies"),
      {
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        id: "compliance-1",
        displayName: "Synthetic compliance policy",
        assignments: assigned,
        collectionStatus: { assignments: "complete" },
        passwordRequired: true,
        passwordMinutesOfInactivityBeforeLock: 15,
        osMinimumVersion: "10.0.19045",
      },
    ],
    [
      family("deviceConfigurations"),
      {
        "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
        id: "device-1",
        displayName: "Synthetic restrictions",
        assignments: assigned,
        collectionStatus: { assignments: "complete" },
        defenderSystemScanSchedule: "userDefined",
        defenderScanType: "quick",
        defenderScheduledScanTime: "02:00:00",
      },
    ],
    [
      family("deviceConfigurations"),
      {
        "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
        id: "device-oma",
        displayName: "Synthetic custom profile",
        assignments: assigned,
        collectionStatus: { assignments: "complete" },
        omaSettings: [
          {
            "@odata.type": "#microsoft.graph.omaSettingInteger",
            displayName: "Synthetic integer",
            omaUri: "./Device/Vendor/MSFT/Policy/Config/Synthetic/Value",
            value: 1,
          },
        ],
      },
    ],
    [
      family("conditionalAccessPolicies"),
      {
        id: "ca-1",
        displayName: "Synthetic CA policy",
        state: "enabled",
        conditions: {
          clientAppTypes: ["browser"],
          signInRiskLevels: ["high"],
          userRiskLevels: [],
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
          },
          platforms: { includePlatforms: ["windows"], excludePlatforms: [] },
          authenticationFlows: { transferMethods: "deviceCodeFlow" },
        },
        grantControls: {
          operator: "OR",
          builtInControls: ["mfa"],
          customAuthenticationFactors: [],
          termsOfUse: [],
          authenticationStrength: null,
        },
      },
    ],
  ];

  const BAD: unknown[] = [{ value: 2 }, [{}], 123, 1.5, "garbage", true, ""];

  // Every leaf: primitives, null and lists of primitives, and their entries.
  function leaves(
    value: unknown,
    path: Array<string | number> = [],
  ): Array<Array<string | number>> {
    if (Array.isArray(value))
      return [
        ...(path.length &&
        value.every((entry) => entry === null || typeof entry !== "object")
          ? [path]
          : []),
        ...value.flatMap((entry, index) => leaves(entry, [...path, index])),
      ];
    if (value && typeof value === "object")
      return Object.entries(value).flatMap(([key, entry]) =>
        path.length === 0 && key === "id" ? [] : leaves(entry, [...path, key]),
      );
    return path.length ? [path] : [];
  }

  function replaced(
    item: Record<string, unknown>,
    path: Array<string | number>,
    value: unknown,
  ) {
    const copy = structuredClone(item);
    let current: any = copy;
    for (const segment of path.slice(0, -1)) current = current[segment];
    current[path[path.length - 1]!] = value;
    return copy;
  }

  const rawUnknown = (item: Record<string, unknown>, familyKey: string) =>
    unidentifiedSources(item, familyKey).size > 0 ||
    unreadableSources(item, familyKey).size > 0 ||
    unreadableProperties(item, familyKey).length > 0 ||
    (Array.isArray(item.assignments) &&
      item.assignments.some(unreadableAssignment));

  it("keeps every fixture definite and unchanged against itself", () => {
    for (const [at, item] of valid) {
      expect(rawUnknown(item, at.familyKey), at.key).toBe(false);
      const diff = history(at, item, item);
      expect(diff.notComparedItems, at.key).toEqual([]);
      expect(diff.policies, at.key).toEqual([]);
      const result = compare(at, item, item);
      expect(result.notCompared, at.key).toEqual([]);
    }
  });

  it("never reads an unreadable leaf as a definite value", () => {
    let checked = 0;
    const definite: string[] = [];
    for (const [at, item] of valid)
      for (const path of leaves(item))
        for (const bad of BAD) {
          const mutated = replaced(item, path, bad);
          if (!rawUnknown(mutated, at.familyKey)) continue;
          checked++;
          const where = `${at.key} ${path.join(".")} = ${JSON.stringify(bad)}`;
          for (const [a, b] of [
            [item, mutated],
            [mutated, item],
          ]) {
            const diff = history(at, a, b);
            if (diff.policies.length || diff.notComparedItems.length !== 1)
              definite.push(`History ${where}`);
            const statuses = Object.values(compare(at, a, b).statuses);
            if (
              statuses.some((status) =>
                ["different", "missing", "extra"].includes(status),
              )
            )
              definite.push(`Compare ${where}`);
          }
        }
    expect(definite).toEqual([]);
    expect(checked).toBeGreaterThan(100);
  });
});
