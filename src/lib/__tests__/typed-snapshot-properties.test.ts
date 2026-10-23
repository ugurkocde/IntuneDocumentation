import { describe, expect, it } from "vitest";
import type { ConfigurationSectionData } from "../configuration-sections";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance } from "../compliance";
import {
  documentedPropertyValue,
  unreadablePresentationValue,
  unreadableProperties,
} from "../compliance/graph-rows";
import { UNREADABLE_VALUE } from "../configuration-parser";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import {
  projectSnapshot,
  type SnapshotProjection,
} from "../snapshots/projection";
import {
  compareSettings,
  projectionSettings,
  type SettingComparison,
} from "../snapshots/reference";

// Round 32: every leaf value Compare and History read passes one type-aware
// check (compliance/graph-rows.ts). Plain Graph properties are read by
// their documented type (compliance/graph-property-types.ts), list
// presentations need their list, only typed list presentations are
// fingerprinted, and group instances holding a value that cannot be
// compared never establish a difference. Shapes follow Graph beta in the lab
// tenant (23 October 2026), with synthetic names and ids.

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];
const complete = { settings: "complete", assignments: "complete" };

const LEGACY = [
  "settingsCatalog",
  "deviceConfigurations",
  "administrativeTemplates",
  "compliancePolicies",
  "securityBaselines",
  "windowsUpdatePolicies",
  "enrollmentConfigurations",
  "conditionalAccessPolicies",
];

function project(key: string, items: unknown[]): SnapshotProjection {
  const of = (family: string) => (family === key ? items : []);
  const exportData = {
    collectedAt: "2026-10-23T09:00:00Z",
    ...Object.fromEntries(LEGACY.map((family) => [family, of(family)])),
    scripts: { windows: [], macOS: [] },
    sections: LEGACY.map(
      (family) =>
        ({
          key: family,
          familyKey: family,
          label: family,
          selectionPrefix: family,
          items: of(family),
        }) as ConfigurationSectionData,
    ),
    fetchErrors: [],
  } as unknown as DetailedExportData;
  return JSON.parse(
    JSON.stringify(
      projectSnapshot(
        exportData,
        assessCompliance(exportData),
        new Map(),
        (digest) => `synthetic:${digest}`,
      ),
    ),
  );
}

interface Compared {
  statuses: Record<string, SettingComparison>;
  notCompared: string[];
}

function compare(key: string, reference: unknown, current: unknown): Compared {
  const result = compareSettings(
    projectionSettings(project(key, [reference])),
    projectionSettings(project(key, [current])),
  );
  return {
    statuses: Object.fromEntries(
      result.groups
        .filter((group) => group.family === key)
        .flatMap((group) => group.rows)
        .map((row) => [row.setting, row.status]),
    ),
    notCompared: result.notCompared.map((family) => family.family),
  };
}

function history(key: string, from: unknown, to: unknown) {
  return diffSnapshots(project(key, [from]), project(key, [to]));
}

const changes = (diff: ReturnType<typeof diffSnapshots>) =>
  diff.policies.flatMap((policy) =>
    policy.settings.map((row) => [row.definitionId ?? row.name, row.change]),
  );

// The setting is never definite: not comparable in Compare, and its policy
// is not compared in History.
function expectUnknown(
  key: string,
  setting: string,
  pairs: Array<[unknown, unknown]>,
) {
  for (const [a, b] of pairs) {
    expect(compare(key, a, b).statuses[setting], JSON.stringify([a, b])).toBe(
      "notComparable",
    );
    const diff = history(key, a, b);
    expect(diff.policies, JSON.stringify([a, b])).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
  }
}

describe("plain Graph properties are read by their documented type", () => {
  const compliance = (fields: Record<string, unknown>) => ({
    "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
    id: "compliance-1",
    displayName: "Synthetic compliance policy",
    assignments: assigned,
    passwordRequired: true,
    passwordMinutesOfInactivityBeforeLock: 15,
    osMinimumVersion: "10.0.19045",
    ...fields,
  });
  const MINUTES = "passwordMinutesOfInactivityBeforeLock";
  const minutes = (value: unknown) => compliance({ [MINUTES]: value });

  it("reads a fraction, a string or an out of range Int32 as unknown", () => {
    for (const bad of [1.5, "15", true, 3000000000, [15], { value: 15 }])
      expectUnknown("compliancePolicies", MINUTES, [
        [minutes(15), minutes(bad)],
        [minutes(bad), minutes(15)],
        [minutes(bad), minutes(bad)],
      ]);
  });

  it("reads a Boolean or a String of another type as unknown", () => {
    expectUnknown("compliancePolicies", "passwordRequired", [
      [compliance({}), compliance({ passwordRequired: "Enabled" })],
      [compliance({ passwordRequired: 1 }), compliance({})],
    ]);
    expectUnknown("compliancePolicies", "osMinimumVersion", [
      [compliance({}), compliance({ osMinimumVersion: 10 })],
    ]);
  });

  it("keeps valid typed values, null and changes definite", () => {
    expect(
      compare("compliancePolicies", minutes(15), minutes(15)).statuses[MINUTES],
    ).toBe("matching");
    expect(
      compare("compliancePolicies", minutes(900), minutes(600)).statuses[
        MINUTES
      ],
    ).toBe("different");
    // Null is not configured: no setting on that side.
    expect(
      compare("compliancePolicies", minutes(null), minutes(15)).statuses[
        MINUTES
      ],
    ).toBe("extra");
    expect(
      compare("compliancePolicies", minutes(15), minutes(null)).statuses[
        MINUTES
      ],
    ).toBe("missing");
    expect(
      compare("compliancePolicies", minutes(null), minutes(null)).statuses[
        MINUTES
      ],
    ).toBeUndefined();
    const of = (from: unknown, to: unknown) => {
      const diff = history("compliancePolicies", minutes(from), minutes(to));
      expect(diff.notComparedItems).toEqual([]);
      return changes(diff);
    };
    expect(of(15, 15)).toEqual([]);
    expect(of(900, 600)).toEqual([[MINUTES, "changed"]]);
    expect(of(null, 900)).toEqual([[MINUTES, "added"]]);
    expect(of(900, null)).toEqual([[MINUTES, "removed"]]);
    expect(of(null, null)).toEqual([]);
  });

  it("reads an enum by the members Graph documents", () => {
    const update = (mode: unknown) => ({
      "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
      id: "update-1",
      displayName: "Synthetic update ring",
      assignments: assigned,
      qualityUpdatesDeferralPeriodInDays: 0,
      deadlineForQualityUpdatesInDays: 2,
      deadlineGracePeriodInDays: 1,
      qualityUpdatesPaused: false,
      automaticUpdateMode: mode,
    });
    for (const bad of ["unknownFutureValue", "syntheticMode", 2])
      expectUnknown("windowsUpdatePolicies", "automaticUpdateMode", [
        [update("windowsDefault"), update(bad)],
        [update(bad), update(bad)],
      ]);
    expect(
      compare(
        "windowsUpdatePolicies",
        update("windowsDefault"),
        update("userDefined"),
      ).statuses.automaticUpdateMode,
    ).toBe("different");
    expect(
      changes(
        history(
          "windowsUpdatePolicies",
          update("windowsDefault"),
          update("userDefined"),
        ),
      ),
    ).toEqual([["automaticUpdateMode", "changed"]]);
  });

  it("reads a nested property by its documented type", () => {
    const protection = (state: unknown) => ({
      "@odata.type":
        "#microsoft.graph.windows10EndpointProtectionConfiguration",
      id: "protection-1",
      displayName: "Synthetic endpoint protection",
      assignments: assigned,
      firewallProfileDomain: { firewallEnabled: state },
    });
    const statusOf = (a: unknown, b: unknown) =>
      Object.entries(
        compare("deviceConfigurations", protection(a), protection(b)).statuses,
      ).find(([setting]) => setting.includes("firewallProfileDomain"))?.[1];
    for (const bad of [5, "on", true]) {
      expect(statusOf("allowed", bad)).toBe("notComparable");
      expect(statusOf(bad, bad)).toBe("notComparable");
      const diff = history(
        "deviceConfigurations",
        protection("allowed"),
        protection(bad),
      );
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    expect(statusOf("allowed", "allowed")).toBe("matching");
    expect(statusOf("allowed", "blocked")).toBe("different");
  });

  it("reads an item key that is no plain value as unknown, never missing", () => {
    const enrollment = (priority: unknown) => ({
      "@odata.type": "#microsoft.graph.deviceEnrollmentLimitConfiguration",
      id: "enrollment-1",
      displayName: "Synthetic enrollment limit",
      assignments: assigned,
      priority,
    });
    for (const bad of [{ value: 1 }, [{ value: 1 }], 1.5, "1"])
      expectUnknown("enrollmentConfigurations", "priority", [
        [enrollment(1), enrollment(bad)],
        [enrollment(bad), enrollment(bad)],
      ]);
    expect(
      compare("enrollmentConfigurations", enrollment(1), enrollment(2)).statuses
        .priority,
    ).toBe("different");
    expect(
      changes(
        history("enrollmentConfigurations", enrollment(1), enrollment(2)),
      ),
    ).toEqual([["priority", "changed"]]);
  });
});

describe("Conditional Access fields are read by their documented type", () => {
  const policy = (
    fields: Record<string, unknown> = {},
    conditions: Record<string, unknown> = {},
  ) => ({
    id: "ca-1",
    displayName: "Synthetic CA policy",
    state: "enabled",
    conditions: {
      clientAppTypes: ["all"],
      applications: {
        includeApplications: ["All"],
        excludeApplications: [],
        includeAgentActions: [],
      },
      users: {
        includeUsers: ["All"],
        excludeUsers: [],
        includeGroups: [],
        excludeGroups: [],
        includeRoles: [],
        excludeRoles: [],
      },
      platforms: { includePlatforms: ["windows"], excludePlatforms: [] },
      ...conditions,
    },
    grantControls: {
      operator: "OR",
      builtInControls: ["mfa"],
      customAuthenticationFactors: [],
      termsOfUse: [],
      authenticationStrength: null,
    },
    ...fields,
  });
  const CA = "conditionalAccessPolicies";
  const status = (a: unknown, b: unknown, name: string) =>
    Object.entries(compare(CA, a, b).statuses).find(([setting]) =>
      setting.endsWith(name),
    )?.[1];

  it("reads a state or a control of another type as unknown", () => {
    for (const [fields, name] of [
      [{ state: 5 }, "state"],
      [{ state: "unknownFutureValue" }, "state"],
      [
        {
          grantControls: {
            ...policy().grantControls,
            builtInControls: ["mfa", 1],
          },
        },
        "Built In Controls",
      ],
      [
        {
          grantControls: {
            ...policy().grantControls,
            builtInControls: ["syntheticControl"],
          },
        },
        "Built In Controls",
      ],
    ] as const) {
      expect(status(policy(), policy(fields), name)).toBe("notComparable");
      const diff = history(CA, policy(), policy(fields));
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    expect(status(policy(), policy({ state: "disabled" }), "state")).toBe(
      "different",
    );
    expect(status(policy(), policy(), "state")).toBe("matching");
  });

  it("does not compare a family whose record Graph did not return as one", () => {
    // The platforms may hold any platform, so none reads as missing.
    for (const platforms of ["windows", ["windows"], 5]) {
      const result = compare(CA, policy(), policy({}, { platforms }));
      expect(result.notCompared).toContain(CA);
      const diff = history(CA, policy(), policy({}, { platforms }));
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    expect(
      compare(CA, policy(), policy({}, { platforms: null })).notCompared,
    ).not.toContain(CA);
  });

  it("reads an undocumented field only as a plausible plain value", () => {
    const actions = (value: unknown) =>
      policy(
        {},
        {
          applications: {
            includeApplications: ["All"],
            excludeApplications: [],
            includeAgentActions: value,
          },
        },
      );
    expect(
      compare(CA, actions([1, "synthetic"]), actions([])).notCompared,
    ).toContain(CA);
    expect(compare(CA, actions([]), actions([])).notCompared).not.toContain(CA);
    expect(
      history(CA, actions(["synthetic"]), actions(["synthetic"]))
        .notComparedItems,
    ).toEqual([]);
  });
});

describe("the shared property check", () => {
  it("keeps valid documented values and unknown complex values readable", () => {
    // Raw collected data, as desktop search flattens it.
    const raw = {
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      passwordMinutesOfInactivityBeforeLock: null,
      passwordRequired: false,
      osMinimumVersion: null,
      passwordRequiredType: "deviceDefault",
      validOperatingSystemBuildRanges: [],
      wslDistributions: [{ distribution: "Synthetic", minimumOSVersion: "1" }],
      deviceCompliancePolicyScript: null,
      roleScopeTagIds: ["0"],
    };
    expect(unreadableProperties(raw)).toEqual([]);
    expect(
      flattenItemSettings("compliancePolicies", raw).some(
        (row) => row.unreadable,
      ),
    ).toBe(false);
  });

  it("flags an unknown property only as a list of mixed primitives", () => {
    expect(unreadableProperties({ syntheticList: [1, "a"] })).toEqual([
      { path: ["syntheticList"], container: false },
    ]);
    for (const value of [1.5, "a", [1, 2], [], { a: [1] }, [{ a: 1 }]])
      expect(unreadableProperties({ syntheticValue: value })).toEqual([]);
  });

  it("checks types, collections, flags and enums", () => {
    expect(documentedPropertyValue("Int32", 2147483647)).toBe(true);
    expect(documentedPropertyValue("Int32", 2147483648)).toBe(false);
    expect(documentedPropertyValue("Collection(String)", [])).toBe(true);
    expect(documentedPropertyValue("Collection(String)", ["a", null])).toBe(
      false,
    );
    expect(
      documentedPropertyValue("authenticationMethodModes", "password,sms"),
    ).toBe(true);
    expect(
      documentedPropertyValue(
        "authenticationMethodModes",
        "password,synthetic",
      ),
    ).toBe(false);
    expect(documentedPropertyValue("runAsAccountType", "system")).toBe(true);
    expect(
      documentedPropertyValue("runAsAccountType", "unknownFutureValue"),
    ).toBe(false);
    expect(documentedPropertyValue("runAsAccountType", "")).toBe(false);
  });

  it("shows an unreadable property as unreadable in the documentation rows", () => {
    const rows = flattenItemSettings("compliancePolicies", {
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      passwordMinutesOfInactivityBeforeLock: 1.5,
      passwordRequired: true,
    });
    expect(
      rows.find(
        (row) => row.definitionId === "passwordMinutesOfInactivityBeforeLock",
      ),
    ).toMatchObject({
      value: UNREADABLE_VALUE,
      unreadable: true,
    });
    expect(
      rows.find((row) => row.definitionId === "passwordRequired")?.unreadable,
    ).toBeUndefined();
  });
});

describe("administrative template presentations", () => {
  const template = (presentation: Record<string, unknown>) => ({
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
          displayName: "Synthetic sites",
          categoryPath: "\\Synthetic",
        },
        presentationValues: [
          {
            presentation: { id: "synthetic-presentation", label: "Sites" },
            ...presentation,
          },
        ],
      },
    ],
  });
  const LIST = "#microsoft.graph.groupPolicyPresentationValueList";
  const MULTI = "#microsoft.graph.groupPolicyPresentationValueMultiText";
  const list = (values?: unknown) =>
    template({
      "@odata.type": LIST,
      ...(values === undefined ? {} : { values }),
    });
  const multi = (values: unknown) => template({ "@odata.type": MULTI, values });
  const T = "administrativeTemplates";
  const SITES = "Synthetic / synthetic-definition";
  const fingerprints = (item: unknown) =>
    Object.keys(
      project(T, [item]).sections.find((section) => section.key === T)!
        .items[0]!.fingerprints ?? {},
    );

  it("reads a list presentation without its list as unknown", () => {
    expect(unreadablePresentationValue({ "@odata.type": LIST })).toBe(true);
    expect(
      unreadablePresentationValue({ "@odata.type": LIST, values: [] }),
    ).toBe(false);
    expectUnknown(T, SITES, [
      [list(), list()],
      [list([{ name: "Site", value: "one.example" }]), list()],
      [list(), list([{ name: "Site", value: "one.example" }])],
    ]);
    // No fingerprint is read as removed or added.
    const diff = history(
      T,
      list([{ name: "Site", value: "one.example" }]),
      list(),
    );
    expect(diff.totals.settingChanges).toBe(0);
  });

  it("fingerprints only the pairs of a typed list presentation", () => {
    expect(fingerprints(multi([{}]))).toEqual([]);
    expect(
      fingerprints(
        template({ values: [{ name: "Site", value: "one.example" }] }),
      ),
    ).toEqual([]);
    expectUnknown(T, SITES, [
      [multi(["one"]), multi([{}])],
      [multi([{}]), multi([{}])],
      [multi(["one"]), template({ "@odata.type": LIST, values: ["one"] })],
    ]);
    const diff = history(T, multi(["one"]), multi([{}]));
    expect(diff.totals.settingChanges).toBe(0);
  });

  it("keeps empty and valid lists definite", () => {
    expect(compare(T, list([]), list([])).statuses[SITES]).toBe("matching");
    const same = history(T, list([]), list([]));
    expect(same.notComparedItems).toEqual([]);
    expect(same.policies).toEqual([]);
    const added = history(
      T,
      list([]),
      list([{ name: "Site", value: "one.example" }]),
    );
    expect(added.notComparedItems).toEqual([]);
    expect(
      added.policies
        .flatMap((policy) => policy.settings)
        .map((row) => row.change),
    ).toEqual(["changed", "added"]);
    const changed = history(T, multi(["one"]), multi(["two"]));
    expect(changed.notComparedItems).toEqual([]);
    expect(changes(changed)).toEqual([["synthetic-definition", "changed"]]);
    expect(compare(T, multi(["one"]), multi(["two"])).statuses[SITES]).toBe(
      "different",
    );
  });
});

describe("group instances holding a value that cannot be compared", () => {
  const GROUP = "device_vendor_msft_synthetic_rules_{rulename}";
  const A = `${GROUP}_a`;
  const B = `${GROUP}_b`;
  const integer = (id: string, value: unknown) => ({
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId: id,
    simpleSettingValue: {
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
      ...(value === undefined ? {} : { value }),
    },
  });
  // One policy holding a group collection, one instance per [A, B].
  const rules = (...instances: Array<[number, number | undefined]>) => ({
    id: "catalog-1",
    name: "Synthetic rules",
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
          settingDefinitionId: GROUP,
          groupSettingCollectionValue: instances.map(([a, b]) => ({
            children: [integer(A, a), integer(B, b)],
          })),
        },
      },
    ],
  });
  const S = "settingsCatalog";

  it("never reads an unchanged sibling as different", () => {
    for (const current of [
      rules([1, undefined], [1, undefined]),
      rules([1, undefined], [1, 2]),
      rules([1, undefined]),
    ]) {
      const result = compare(S, rules([1, 1], [1, 2]), current);
      expect(result.statuses[A], JSON.stringify(current)).toBe("notComparable");
      expect(result.statuses[B]).toBe("notComparable");
      expect(compare(S, current, rules([1, 1], [1, 2])).statuses[A]).toBe(
        "notComparable",
      );
      const diff = history(S, rules([1, 1], [1, 2]), current);
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
  });

  it("keeps a sibling whose own values differ different", () => {
    expect(
      compare(S, rules([1, 1], [1, 2]), rules([3, undefined], [3, undefined]))
        .statuses[A],
    ).toBe("different");
  });

  it("keeps valid groups definite", () => {
    expect(
      compare(S, rules([1, 1], [1, 2]), rules([1, 1], [1, 2])).statuses,
    ).toEqual({
      [A]: "matching",
      [B]: "matching",
    });
    expect(
      compare(S, rules([1, 1], [1, 2]), rules([1, 2], [1, 1])).statuses,
    ).toEqual({
      [A]: "matching",
      [B]: "matching",
    });
    const changed = compare(S, rules([1, 1], [1, 2]), rules([1, 1], [1, 3]));
    expect(changed.statuses).toEqual({ [A]: "matching", [B]: "different" });
    expect(compare(S, rules([1, 1], [1, 2]), rules([1, 1])).statuses[A]).toBe(
      "different",
    );
    const diff = history(S, rules([1, 1], [1, 2]), rules([1, 1], [1, 3]));
    expect(diff.notComparedItems).toEqual([]);
    expect(changes(diff)).toEqual([[B, "changed"]]);
  });
});

describe("names Graph returns with the settings are display only", () => {
  const CHOICE = "device_vendor_msft_synthetic_mode";
  const CHILD = "device_vendor_msft_synthetic_mode_level";
  const definitions = [
    {
      id: CHOICE,
      displayName: "Synthetic mode",
      options: [
        { itemId: `${CHOICE}_1`, displayName: "Enabled" },
        { itemId: `${CHOICE}_0`, displayName: "Disabled" },
      ],
    },
    { id: CHILD, displayName: "Synthetic level" },
  ];
  const catalog = (option: string, withDefinitions: boolean) => ({
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
          choiceSettingValue: {
            value: `${CHOICE}_${option}`,
            children: [
              {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                settingDefinitionId: CHILD,
                simpleSettingValue: {
                  "@odata.type":
                    "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
                  value: 3,
                },
              },
            ],
          },
        },
        ...(withDefinitions ? { settingDefinitions: definitions } : {}),
      },
    ],
  });
  const S = "settingsCatalog";

  it("never compares an option name with an option id", () => {
    // One side read the definitions, the other did not (the collector reads
    // the settings without them when the expand fails).
    expect(
      compare(S, catalog("1", true), catalog("1", false)).statuses[CHOICE],
    ).toBe("notComparable");
    expect(
      compare(S, catalog("1", false), catalog("0", true)).statuses[CHOICE],
    ).toBe("notComparable");
    // Names on both sides, or ids on both sides, stay definite.
    expect(
      compare(S, catalog("1", true), catalog("1", true)).statuses[CHOICE],
    ).toBe("matching");
    expect(
      compare(S, catalog("1", true), catalog("0", true)).statuses[CHOICE],
    ).toBe("different");
    expect(
      compare(S, catalog("1", false), catalog("1", false)).statuses[CHOICE],
    ).toBe("matching");
    expect(
      compare(S, catalog("1", false), catalog("0", false)).statuses[CHOICE],
    ).toBe("different");
  });

  it("compares choices by option id and settings by definition id in History", () => {
    for (const [from, to] of [
      [true, false],
      [false, true],
    ] as const) {
      const same = history(S, catalog("1", from), catalog("1", to));
      expect(same.notComparedItems).toEqual([]);
      expect(same.policies).toEqual([]);
      const changed = history(S, catalog("1", from), catalog("0", to));
      expect(changed.notComparedItems).toEqual([]);
      expect(changes(changed)).toEqual([[CHOICE, "changed"]]);
    }
    const shown = history(S, catalog("1", true), catalog("0", true))
      .policies[0]!.settings[0]!;
    expect(shown).toMatchObject({ before: "Enabled", after: "Disabled" });
  });

  const template = (
    categoryPath: unknown,
    presentation: unknown = { id: "synthetic-presentation", label: "Timeout" },
  ) => ({
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
          categoryPath,
        },
        presentationValues: [
          {
            "@odata.type":
              "#microsoft.graph.groupPolicyPresentationValueDecimal",
            value: 900,
            ...(presentation === NO_PRESENTATION ? {} : { presentation }),
          },
        ],
      },
    ],
  });
  const T = "administrativeTemplates";
  const NO_PRESENTATION = Symbol("no presentation");

  it("names a template value by its definition id, not its category", () => {
    // Graph returns null as the category of some definitions (lab tenant).
    const result = compare(T, template("\\Synthetic"), template(null));
    expect(Object.values(result.statuses)).toEqual(["matching"]);
    const diff = history(T, template("\\Synthetic"), template(null));
    expect(diff.notComparedItems).toEqual([]);
    expect(diff.policies).toEqual([]);
  });

  it("reads a presentation value without its presentation as unknown", () => {
    for (const presentation of [
      NO_PRESENTATION,
      {},
      { label: "Timeout" },
      { id: "synthetic-presentation" },
    ]) {
      const result = compare(T, template(null), template(null, presentation));
      expect(
        Object.values(result.statuses),
        JSON.stringify(presentation),
      ).toEqual(["notComparable"]);
      const diff = history(T, template(null), template(null, presentation));
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    // A presentation without a label is named by its id.
    expect(
      Object.values(
        compare(
          T,
          template(null, { id: "synthetic-presentation", label: null }),
          template(null, { id: "synthetic-presentation", label: null }),
        ).statuses,
      ),
    ).toEqual(["matching"]);
  });

  it("reads an intent collection that holds no list as unknown", () => {
    const intent = (valueJson: string) => ({
      id: "intent-1",
      displayName: "Synthetic intent",
      assignments: assigned,
      collectionStatus: complete,
      settings: [
        {
          id: "setting-1",
          "@odata.type":
            "#microsoft.graph.deviceManagementCollectionSettingInstance",
          definitionId: "deviceConfiguration--synthetic_list",
          valueJson,
        },
      ],
    });
    for (const bad of ["5", '"synthetic"', '{"synthetic":1}'])
      expectUnknown(
        "securityBaselines",
        "deviceConfiguration--synthetic_list",
        [
          [intent('["one"]'), intent(bad)],
          [intent(bad), intent(bad)],
        ],
      );
    expect(
      changes(
        history("securityBaselines", intent('["one"]'), intent('["two"]')),
      ),
    ).toEqual([["deviceConfiguration--synthetic_list", "changed"]]);
    expect(
      history("securityBaselines", intent("null"), intent("null"))
        .notComparedItems,
    ).toEqual([]);
  });
});

describe("independent review sweep", () => {
  const S = "settingsCatalog";
  const GROUP = "device_vendor_msft_synthetic_rules";
  const CHILD = `${GROUP}_{rulename}_port`;
  const port = (value: number) => ({
    "@odata.type":
      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
    settingDefinitionId: CHILD,
    simpleSettingValue: {
      "@odata.type":
        "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
      value,
    },
  });
  const rules = (value: unknown) => ({
    id: "catalog-1",
    name: "Synthetic rules",
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
          settingDefinitionId: GROUP,
          ...(value === undefined
            ? {}
            : { groupSettingCollectionValue: value }),
        },
      },
    ],
  });

  it("reads a group instance without its group value as holding any setting", () => {
    for (const value of [undefined, null]) {
      for (const [a, b] of [
        [rules([{ children: [port(80)] }]), rules(value)],
        [rules(value), rules([{ children: [port(80)] }])],
      ]) {
        expect(compare(S, a, b).notCompared).toContain(S);
        const diff = history(S, a, b);
        expect(diff.policies).toEqual([]);
        expect(diff.notComparedItems).toHaveLength(1);
      }
    }
    // An empty collection is a value: no rule.
    expect(
      compare(S, rules([{ children: [port(80)] }]), rules([])).statuses[CHILD],
    ).toBe("missing");
  });

  it("keeps the rows of a group entry when another entry is added", () => {
    const diff = history(
      S,
      rules([{ children: [port(80)] }]),
      rules([{ children: [port(80)] }, { children: [port(443)] }]),
    );
    expect(diff.notComparedItems).toEqual([]);
    expect(changes(diff)).toEqual([[CHILD, "added"]]);
  });

  it("reads template presentation values Graph did not return as incomplete", () => {
    const template = (presentationValues: unknown) => ({
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
            categoryPath: null,
          },
          ...(presentationValues === undefined ? {} : { presentationValues }),
        },
      ],
    });
    const T = "administrativeTemplates";
    const readable = template([
      {
        "@odata.type": "#microsoft.graph.groupPolicyPresentationValueDecimal",
        value: 900,
        presentation: { id: "synthetic-presentation", label: "Timeout" },
      },
    ]);
    for (const missing of [undefined, null]) {
      expect(compare(T, readable, template(missing)).notCompared).toContain(T);
      const diff = history(T, readable, template(missing));
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    expect(history(T, template([]), template([])).notComparedItems).toEqual([]);
  });

  it("never reads a name Graph returned on one side only as a rename", () => {
    const tag = (displayName?: string) => ({
      "@odata.type": "#microsoft.graph.deviceEnrollmentLimitConfiguration",
      id: "enrollment-1",
      ...(displayName === undefined ? {} : { displayName }),
      assignments: assigned,
      priority: 1,
    });
    const E = "enrollmentConfigurations";
    for (const [a, b] of [
      [tag("Synthetic limit"), tag()],
      [tag(), tag("Synthetic limit")],
    ]) {
      const diff = history(E, a, b);
      expect(diff.totals.renamed).toBe(0);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    expect(
      history(E, tag("Synthetic limit"), tag("Renamed limit")).totals.renamed,
    ).toBe(1);
  });

  it("reads Conditional Access conditions Graph omitted as not comparable", () => {
    const policy = (conditions: Record<string, unknown>) => ({
      id: "ca-1",
      displayName: "Synthetic CA policy",
      state: "enabled",
      conditions: {
        userRiskLevels: [],
        signInRiskLevels: [],
        clientAppTypes: ["all"],
        applications: { includeApplications: ["All"], excludeApplications: [] },
        users: {
          includeUsers: ["All"],
          excludeUsers: [],
          includeGroups: [],
          excludeGroups: [],
          includeRoles: [],
          excludeRoles: [],
        },
        ...conditions,
      },
      grantControls: {
        operator: "OR",
        builtInControls: ["mfa"],
        customAuthenticationFactors: [],
        termsOfUse: [],
        authenticationStrength: null,
      },
    });
    const CA = "conditionalAccessPolicies";
    const omitted = policy({});
    delete (omitted.conditions as Record<string, unknown>).clientAppTypes;
    for (const [a, b] of [
      [policy({}), omitted],
      [omitted, policy({})],
    ]) {
      const status = Object.entries(compare(CA, a, b).statuses).find(
        ([setting]) => setting.endsWith("Client App Types"),
      )?.[1];
      expect(status).toBe("notComparable");
    }
  });

  it("reads an assignment intent that is no text as unreadable", () => {
    const app = (intent: unknown) => ({
      "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
      id: "compliance-1",
      displayName: "Synthetic compliance policy",
      passwordRequired: true,
      assignments: [
        {
          id: "assignment-1",
          intent,
          target: {
            "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
          },
        },
      ],
    });
    const C = "compliancePolicies";
    for (const bad of [1, { value: "required" }, ["required"], ""]) {
      const diff = history(C, app("required"), app(bad));
      expect(diff.totals.assignmentChanges, JSON.stringify(bad)).toBe(0);
      expect(diff.notComparedItems).toHaveLength(1);
    }
    const changed = history(C, app("required"), app("available"));
    expect(changed.notComparedItems).toEqual([]);
    expect(changed.totals.assignmentChanges).toBe(2);
  });
});
