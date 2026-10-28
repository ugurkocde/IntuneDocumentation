import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { collectCatalogValues } from "../compliance/engine";
import { generateFixPack } from "../compliance/fix-pack";
import { MAX_SETTING_DEPTH } from "../compliance/graph-rows";
import {
  safeguardPolicies,
  safeguardState,
} from "../compliance/management/management-summary";
import type { ComplianceAssessment } from "../compliance/types";
import type { DetailedExportData } from "../configuration-analyzer";
import { extractSettingValue, UNREADABLE_VALUE } from "../configuration-parser";
import {
  getStableItemId,
  type ConfigurationSectionData,
} from "../configuration-sections";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import {
  projectSnapshot,
  restoreCollection,
  type SnapshotProjection,
} from "../snapshots/projection";
import {
  compareSettings,
  projectionSettings,
  type SettingComparison,
} from "../snapshots/reference";
import { assessBenchmark } from "../benchmarks/assessment";
import { valueText } from "../benchmarks/readiness-pdf";
import {
  choice as benchChoice,
  collection,
  NOW,
  pack,
  simpleInteger,
  tenantPolicy,
} from "../benchmarks/__tests__/fixtures";

// Round 35 review findings: every consumer of Settings Catalog instances
// reads them with the shared instance rules and depth limit of
// compliance/graph-rows.ts, item identity is the resource's own id, and a
// rename needs readable names. Shapes follow Graph beta (msgraph skill
// schemas and the lab tenant, 23 October 2026) with synthetic names, ids
// and values.

const T = "#microsoft.graph.deviceManagementConfiguration";
const SIMPLE = `${T}SimpleSettingInstance`;
const CHOICE = `${T}ChoiceSettingInstance`;
const GROUP = `${T}GroupSettingInstance`;
const INTEGER_VALUE = `${T}IntegerSettingValue`;
const STRING_VALUE = `${T}StringSettingValue`;

// --- Compliance engine --------------------------------------------------------

// The Windows interactive logon machine inactivity limit (session-lock.ts):
// a simple integer setting without a prerequisite.
const INACTIVITY =
  "device_vendor_msft_policy_config_localpoliciessecurityoptions_interactivelogon_machineinactivitylimit_v2";

const allUsers = [
  {
    target: {
      "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget",
    },
  },
];

function exportWith(instances: unknown[]): DetailedExportData {
  return {
    settingsCatalog: [
      {
        id: "catalog-1",
        name: "Synthetic catalog policy",
        settings: instances.map((settingInstance) => ({ settingInstance })),
        assignments: allUsers,
      },
    ],
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
  } as unknown as DetailedExportData;
}

function inactivityLock(instances: unknown[]) {
  const result = assessCompliance(exportWith(instances)).capabilities.find(
    (row) => row.capability.id === "windows-inactivity-lock",
  )!;
  const checks = result.checks.filter(
    (check) => check.settingId === INACTIVITY,
  );
  return { status: result.status, checks };
}

const integer = (id: string, value: unknown, extra = {}) => ({
  "@odata.type": SIMPLE,
  settingDefinitionId: id,
  simpleSettingValue: { "@odata.type": INTEGER_VALUE, value },
  ...extra,
});

// A chain of group instances with the given instance at depth `depth` (the
// root instance is at depth 0).
function nested(depth: number, leaf: Record<string, unknown>) {
  let instance: Record<string, unknown> = leaf;
  for (let level = depth - 1; level >= 0; level -= 1)
    instance = {
      "@odata.type": GROUP,
      settingDefinitionId: `synthetic_group_${level}`,
      groupSettingValue: { children: [instance] },
    };
  return instance;
}

function expectUnableToCheck(instances: unknown[]) {
  const { status, checks } = inactivityLock(instances);
  expect(status).not.toBe("enforced");
  expect(checks.length).toBeGreaterThan(0);
  for (const check of checks) {
    expect(check.assessmentStatus).toBe("unableToCheck");
    expect(check.result).toBeNull();
  }
}

describe("finding 2: the compliance engine reads instances with the shared rules", () => {
  it("enforces a valid simple instance and a valid one at the depth limit", () => {
    const valid = inactivityLock([integer(INACTIVITY, 900)]);
    expect(valid.status).toBe("enforced");
    expect(valid.checks[0]).toMatchObject({
      assessmentStatus: "checked",
      result: "matches",
    });
    expect(
      inactivityLock([nested(MAX_SETTING_DEPTH, integer(INACTIVITY, 900))])
        .status,
    ).toBe("enforced");
  });

  it("reads a choice instance holding a simple value as unable to check", () => {
    expectUnableToCheck([
      {
        "@odata.type": CHOICE,
        settingDefinitionId: INACTIVITY,
        simpleSettingValue: { "@odata.type": INTEGER_VALUE, value: 900 },
      },
    ]);
  });

  it("reads an instance of an undocumented type as unable to check", () => {
    expectUnableToCheck([
      { ...integer(INACTIVITY, 900), "@odata.type": "garbage" },
    ]);
  });

  it("reads a simple instance with a stray choice value as unable to check", () => {
    expectUnableToCheck([
      integer(INACTIVITY, 900, {
        choiceSettingValue: { value: `${INACTIVITY}_1`, children: [] },
      }),
    ]);
  });

  it("reads a setting below the depth limit as unable to check, never enforced", () => {
    expectUnableToCheck([
      nested(MAX_SETTING_DEPTH + 1, integer(INACTIVITY, 900)),
    ]);
  });

  it("does not read the children of an instance whose type cannot be read", () => {
    const parent = {
      "@odata.type": "garbage",
      settingDefinitionId: "synthetic_parent",
      groupSettingValue: { children: [integer(INACTIVITY, 900)] },
    };
    expectUnableToCheck([parent]);
  });
});

// --- CIS benchmark comparison -------------------------------------------------

const LENGTH = "synthetic_bench_length";
const RECOMMENDATION = {
  id: "1.1",
  title: "Synthetic recommendation",
  level: 1 as const,
  settings: [LENGTH],
};

function benchmark(tenant: Record<string, unknown>, recommended = tenant) {
  const run = assessBenchmark(
    collection({ policies: [tenantPolicy({ settings: [tenant] })] }),
    pack([{ settings: [recommended] }], [RECOMMENDATION]),
    { now: NOW },
  );
  const finding = run.settings[0]!;
  return {
    finding: [finding.status, finding.result, finding.reason],
    recommendation: run.recommendations[0]!.result,
    headline: run.levels[0]!.headline,
  };
}

describe("finding 4: the benchmark comparison applies the shared instance rules", () => {
  it("passes a valid simple instance and a valid choice instance", () => {
    const simple = benchmark(simpleInteger(LENGTH, 14));
    expect(simple.finding).toEqual(["Present", "Pass", undefined]);
    expect(simple.headline.rate).toBe(1);
    const choice = benchmark(benchChoice(LENGTH, "1"));
    expect(choice.finding).toEqual(["Present", "Pass", undefined]);
  });

  it("reads a simple instance with a stray choice value as unreadable, never Fail", () => {
    const run = benchmark(
      {
        ...simpleInteger(LENGTH, 14),
        choiceSettingValue: { value: `${LENGTH}_1`, children: [] },
      },
      simpleInteger(LENGTH, 14),
    );
    expect(run.finding).toEqual(["Review", "Review", "unreadableValue"]);
    expect(run.recommendation).toBe("Review");
    expect(run.headline.rate).toBeNull();
    expect(run.headline.counts.fail).toBe(0);
  });

  it("reads a choice instance holding a simple value as unreadable", () => {
    const run = benchmark(
      {
        "@odata.type": CHOICE,
        settingDefinitionId: LENGTH,
        simpleSettingValue: { "@odata.type": INTEGER_VALUE, value: 14 },
      },
      simpleInteger(LENGTH, 14),
    );
    expect(run.finding).toEqual(["Review", "Review", "unreadableValue"]);
    expect(run.headline.counts.fail).toBe(0);
  });

  it("shows such a value as not readable in the readiness report", () => {
    expect(
      valueText({
        ...simpleInteger(LENGTH, 14),
        choiceSettingValue: { value: `${LENGTH}_1` },
      } as never),
    ).toBe("Not readable");
    expect(valueText(simpleInteger(LENGTH, 14) as never)).toBe("14");
  });

  it("compares a nested setting at the depth limit and never one below it", () => {
    const at = nested(MAX_SETTING_DEPTH, simpleInteger("synthetic_leaf", 14));
    expect(benchmark(at).finding).toEqual(["Present", "Pass", undefined]);
    const below = nested(
      MAX_SETTING_DEPTH + 1,
      simpleInteger("synthetic_leaf", 14),
    );
    const run = benchmark(below);
    expect(run.finding[1]).toBe("Review");
    expect(run.headline.counts.fail).toBe(0);
  });
});

// --- Projection, Compare and History ------------------------------------------

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

function project(key: string, items: unknown[]): SnapshotProjection {
  const section = {
    key,
    familyKey: key,
    label: key,
    selectionPrefix: key,
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

const assigned = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];
const complete = { settings: "complete", assignments: "complete" };

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

const CHOICE_ID = "synthetic_choice";
const choiceInstance = (option: string, extra = {}) => ({
  "@odata.type": CHOICE,
  settingDefinitionId: CHOICE_ID,
  choiceSettingValue: { value: `${CHOICE_ID}_${option}`, children: [] },
  ...extra,
});

function compare(key: string, reference: unknown, current: unknown) {
  const result = compareSettings(
    projectionSettings(project(key, [reference])),
    projectionSettings(project(key, [current])),
  );
  return {
    statuses: Object.fromEntries(
      result.groups
        .flatMap((group) => group.rows)
        .map((row) => [row.setting, row.status]),
    ) as Record<string, SettingComparison>,
    notCompared: result.notCompared.map((entry) => entry.family),
  };
}

const history = (key: string, from: unknown[], to: unknown[]) =>
  diffSnapshots(project(key, from), project(key, to));

describe("finding 3: the projection keeps stray and malformed value properties", () => {
  const stray = choiceInstance("1", { simpleSettingValue: 42 });

  it("keeps a stray simple value as an unreadable marker through storage and restore", () => {
    const stored = project("settingsCatalog", [catalog([stray])]);
    const instance = (stored.sections[0]!.items[0]!.data.settings as any[])[0]
      .settingInstance;
    expect(instance.simpleSettingValue).toEqual({});
    const restored = restoreCollection(stored).sections[0]!.items[0];
    expect(restored.settings[0].settingInstance.simpleSettingValue).toEqual({});
  });

  it("never reports such a setting as different in Compare or changed in History", () => {
    for (const [a, b] of [
      [catalog([choiceInstance("1")]), catalog([stray])],
      [catalog([stray]), catalog([choiceInstance("0")])],
    ]) {
      const result = compare("settingsCatalog", a, b);
      // The instance cannot be read by its type, so its source is
      // unidentified and the family is not compared.
      expect(result.notCompared).toContain("settingsCatalog");
      expect(result.statuses[CHOICE_ID]).toBeUndefined();
      const diff = history("settingsCatalog", [a], [b]);
      expect(diff.policies).toEqual([]);
      expect(diff.notComparedItems).toHaveLength(1);
    }
  });

  it("still compares valid choice and simple instances", () => {
    const simple = {
      "@odata.type": SIMPLE,
      settingDefinitionId: "synthetic_text",
      simpleSettingValue: { "@odata.type": STRING_VALUE, value: "a" },
    };
    const before = catalog([choiceInstance("1"), simple]);
    const after = catalog([
      choiceInstance("0"),
      {
        ...simple,
        simpleSettingValue: { "@odata.type": STRING_VALUE, value: "b" },
      },
    ]);
    expect(compare("settingsCatalog", before, after).statuses).toMatchObject({
      [CHOICE_ID]: "different",
      synthetic_text: "different",
    });
    const diff = history("settingsCatalog", [before], [after]);
    expect(diff.policies.map((policy) => policy.kind)).toEqual(["changed"]);
    expect(diff.policies[0]!.settings).toHaveLength(2);
  });
});

describe("finding 1: item identity is the resource's own id", () => {
  const intent = (id: string | undefined, value: boolean) => ({
    "@odata.type": "#microsoft.graph.deviceManagementIntent",
    ...(id === undefined ? {} : { id }),
    displayName: "Synthetic intent",
    templateId: "synthetic-template",
    assignments: assigned,
    collectionStatus: complete,
    settings: [
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementBooleanSettingInstance",
        definitionId: "synthetic_boolean",
        value,
        valueJson: String(value),
      },
    ],
  });

  it("never names an item by its template id or a policy id", () => {
    const section = { key: "securityBaselines" };
    expect(
      getStableItemId(section, { templateId: "synthetic-template" }, 0),
    ).toBe("singleton-securityBaselines-0");
    expect(getStableItemId(section, { policyId: "synthetic-policy" }, 1)).toBe(
      "singleton-securityBaselines-1",
    );
    expect(getStableItemId(section, { id: "intent-1" }, 0)).toBe("intent-1");
  });

  it("reads an intent that lost its id as not compared, never added and removed", () => {
    for (const [from, to] of [
      [intent("intent-1", true), intent(undefined, true)],
      [intent(undefined, true), intent("intent-1", true)],
    ]) {
      const diff = history("securityBaselines", [from], [to]);
      expect(diff.policies).toEqual([]);
      expect(diff.totals.added + diff.totals.removed).toBe(0);
      expect(diff.notComparedItems.length).toBeGreaterThan(0);
    }
  });

  it("still pairs intents by their ids", () => {
    const diff = history(
      "securityBaselines",
      [intent("intent-1", true)],
      [intent("intent-1", false)],
    );
    expect(diff.policies.map((policy) => [policy.id, policy.kind])).toEqual([
      ["intent-1", "changed"],
    ]);
  });
});

describe("finding 5: a rename needs readable names on both sides", () => {
  const named = (name: unknown) => catalog([choiceInstance("1")], { name });

  it("never reports a rename from or to a name that is no text", () => {
    for (const [from, to] of [
      [named(42), named("New name")],
      [named("Old name"), named(42)],
    ]) {
      const diff = history("settingsCatalog", [from], [to]);
      expect(diff.policies).toEqual([]);
      expect(diff.totals.renamed).toBe(0);
      expect(diff.notComparedItems).toHaveLength(1);
    }
  });

  it("still reports a rename between text names", () => {
    const diff = history(
      "settingsCatalog",
      [named("Old name")],
      [named("New name")],
    );
    expect(diff.policies[0]).toMatchObject({
      kind: "changed",
      previousName: "Old name",
    });
  });
});

// --- Documentation and flattening ---------------------------------------------

describe("sweep: documentation and flattening read children with the shared rules", () => {
  const child = {
    "@odata.type": SIMPLE,
    settingDefinitionId: "synthetic_child",
    simpleSettingValue: { "@odata.type": STRING_VALUE, value: "child value" },
  };
  const unreadableParent = {
    "@odata.type": "garbage",
    settingDefinitionId: "synthetic_parent",
    groupSettingValue: { children: [child] },
  };
  const validParent = { ...unreadableParent, "@odata.type": GROUP };

  it("shows an instance of an undocumented type as unreadable, without children", () => {
    const parsed = extractSettingValue({
      id: "0",
      settingInstance: unreadableParent as never,
      settingDefinitions: [],
    });
    expect(parsed.value).toBe(UNREADABLE_VALUE);
    expect(parsed.nestedSettings).toBeUndefined();
    const rows = flattenItemSettings("settingsCatalog", {
      settings: [{ settingInstance: unreadableParent }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      definitionId: "synthetic_parent",
      unreadable: true,
    });
  });

  it("still shows the children of a valid group", () => {
    const parsed = extractSettingValue({
      id: "0",
      settingInstance: validParent as never,
      settingDefinitions: [],
    });
    expect(parsed.nestedSettings?.map((row) => row.value)).toEqual([
      "child value",
    ]);
    const rows = flattenItemSettings("settingsCatalog", {
      settings: [{ settingInstance: validParent }],
    });
    expect(rows.map((row) => [row.definitionId, row.value])).toEqual([
      ["synthetic_child", "child value"],
    ]);
  });

  it("shows a setting below the depth limit as unknown in the documentation", () => {
    const deep = nested(MAX_SETTING_DEPTH + 1, child);
    const parsed = extractSettingValue({
      id: "0",
      settingInstance: deep as never,
      settingDefinitions: [],
    });
    const flat = JSON.stringify(parsed);
    expect(flat).not.toContain("child value");
    expect(flat).toContain(UNREADABLE_VALUE);
    const atLimit = extractSettingValue({
      id: "0",
      settingInstance: nested(MAX_SETTING_DEPTH, child) as never,
      settingDefinitions: [],
    });
    expect(JSON.stringify(atLimit)).toContain("child value");
  });
});

// --- Policies without an id in the management summary ------------------------

describe("sweep: a policy without an id is never merged or dropped", () => {
  const idless = (instances: unknown[], assignments: unknown[]) => ({
    name: "Synthetic shared name",
    settings: instances.map((settingInstance) => ({ settingInstance })),
    assignments,
  });
  const lock = (policies: unknown[]) => {
    const data = exportWith([]);
    data.settingsCatalog = policies as never;
    return assessCompliance(data).capabilities.find(
      (row) => row.capability.id === "windows-inactivity-lock",
    )!;
  };

  it("lists two policies without ids on their own, each with its assignment", () => {
    const result = lock([
      idless([integer(INACTIVITY, 900)], allUsers),
      idless([integer(INACTIVITY, 900)], []),
    ]);
    expect(
      safeguardPolicies(result)
        .map((policy) => policy.assigned)
        .sort(),
    ).toEqual([false, true]);
  });

  it("reads an unreadable value on a policy without an id as missing data", () => {
    const result = lock([
      idless(
        [{ ...integer(INACTIVITY, 900), "@odata.type": "garbage" }],
        allUsers,
      ),
    ]);
    expect(result.status).toBe("noEvidence");
    expect(safeguardState(result)).toBe("dataMissing");
  });

  it("still merges evidence of one policy with an id", () => {
    const result = lock([
      { ...idless([integer(INACTIVITY, 900)], allUsers), id: "catalog-1" },
    ]);
    expect(safeguardPolicies(result)).toEqual([
      { name: "Synthetic shared name", assigned: true },
    ]);
    expect(safeguardState(result)).toBe("inPlace");
  });
});

// --- Review of round 35 -------------------------------------------------------

const ENCRYPTION = "device_vendor_msft_bitlocker_requiredeviceencryption";
const PASSWORD_ENABLED =
  "device_vendor_msft_policy_config_devicelock_devicepasswordenabled";
const MAX_INACTIVITY =
  "device_vendor_msft_policy_config_devicelock_maxinactivitytimedevicelock";

const capability = (id: string, instances: unknown[]) =>
  assessCompliance(exportWith(instances)).capabilities.find(
    (row) => row.capability.id === id,
  )!;

const choiceOf = (id: string, option: string, children: unknown = []) => ({
  "@odata.type": CHOICE,
  settingDefinitionId: id,
  choiceSettingValue: { value: `${id}_${option}`, children },
});

describe("review: the engine reads valid instances and only those", () => {
  it("enforces a valid choice and reads children Graph returned as no list as unable to check", () => {
    expect(
      capability("windows-disk-encryption", [choiceOf(ENCRYPTION, "1")]).status,
    ).toBe("enforced");
    for (const children of ["x", 5]) {
      const result = capability("windows-disk-encryption", [
        choiceOf(ENCRYPTION, "1", children),
      ]);
      expect(result.status).not.toBe("enforced");
      const checks = result.checks.filter(
        (check) => check.settingId === ENCRYPTION,
      );
      expect(checks.length).toBeGreaterThan(0);
      for (const check of checks) {
        expect(check.assessmentStatus).toBe("unableToCheck");
        expect(check.result).toBeNull();
      }
    }
  });

  it("reads a custom OMA-URI value inside a simple setting value as unable to check", () => {
    expectUnableToCheck([
      {
        "@odata.type": SIMPLE,
        settingDefinitionId: INACTIVITY,
        simpleSettingValue: {
          "@odata.type": "#microsoft.graph.omaSettingInteger",
          value: 900,
        },
      },
    ]);
  });

  it("reads a secret value as unable to check", () => {
    expectUnableToCheck([
      {
        "@odata.type": SIMPLE,
        settingDefinitionId: INACTIVITY,
        simpleSettingValue: {
          "@odata.type": `${T}SecretSettingValue`,
          value: "synthetic-token",
          valueState: "encryptedValueToken",
        },
      },
    ]);
  });

  it("enforces a child only beneath its enabled prerequisite parent", () => {
    const lock = (option: string) =>
      capability("windows-inactivity-lock", [
        choiceOf(PASSWORD_ENABLED, option, [integer(MAX_INACTIVITY, 5)]),
      ]).status;
    expect(lock("0")).toBe("enforced");
    expect(lock("1")).not.toBe("enforced");
  });

  it("enforces a valid setting inside a group collection", () => {
    expect(
      inactivityLock([
        {
          "@odata.type": `${T}GroupSettingCollectionInstance`,
          settingDefinitionId: "synthetic_group_collection",
          groupSettingCollectionValue: [
            { children: [integer(INACTIVITY, 900)] },
          ],
        },
      ]).status,
    ).toBe("enforced");
  });

  it("reads every option of a valid choice collection", () => {
    const values = collectCatalogValues([
      {
        settingInstance: {
          "@odata.type": `${T}ChoiceSettingCollectionInstance`,
          settingDefinitionId: "synthetic_choices",
          choiceSettingCollectionValue: [
            { value: "synthetic_choices_a", children: [] },
            { value: "synthetic_choices_b", children: [] },
          ],
        },
      },
    ]);
    expect(values.get("synthetic_choices")).toEqual([
      "synthetic_choices_a",
      "synthetic_choices_b",
    ]);
  });
});

describe("review: the fix pack never calls an unreadable value a deliberate choice", () => {
  const parent =
    "device_vendor_msft_policy_config_admx_credssp_restrictedremoteadministration";
  // A finished collection, as the fix pack generator requires.
  const pack = (instance: unknown) => {
    const data = {
      ...exportWith([]),
      collectedAt: "2026-10-23T09:00:00Z",
      settingsCatalog: [
        {
          id: "policy-1",
          name: "Synthetic remote admin policy",
          platforms: "windows10",
          technologies: "mdm",
          settings: [{ settingInstance: instance }],
          assignments: allUsers,
        },
      ],
    } as unknown as DetailedExportData;
    return generateFixPack(assessCompliance(data), { collection: data });
  };

  it("names a readable other option as a deliberate choice", () => {
    const gap = pack(choiceOf(parent, "0")).notGeneratable.find(
      (row) => row.capabilityId === "windows-remote-credential-guard",
    );
    expect(gap?.reason).toMatch(/deliberately configured differently/);
  });

  it("does not call an unreadable value deliberately configured", () => {
    const reasons = (instance: unknown) =>
      pack(instance)
        .notGeneratable.map((row) => row.reason)
        .join(" ");
    for (const instance of [
      { ...choiceOf(parent, "0"), "@odata.type": "garbage" },
      choiceOf(parent, "0", 5),
      {
        "@odata.type": CHOICE,
        settingDefinitionId: parent,
        choiceSettingValue: { value: 42, children: [] },
      },
    ])
      expect(reasons(instance)).not.toMatch(/deliberately configured/);
    expect(
      reasons({
        "@odata.type": CHOICE,
        settingDefinitionId: parent,
        choiceSettingValue: { value: 42, children: [] },
      }),
    ).toMatch(
      /a value that could not be read, so whether it is configured differently is unknown/,
    );
  });
});

describe("review: the documentation shows malformed collection entries as unreadable", () => {
  const show = (instance: unknown) =>
    extractSettingValue({
      id: "0",
      settingInstance: instance as never,
      settingDefinitions: [],
    });

  it("reads null and non-record entries without throwing", () => {
    for (const instance of [
      {
        "@odata.type": `${T}SimpleSettingCollectionInstance`,
        settingDefinitionId: "synthetic_texts",
        simpleSettingCollectionValue: [null],
      },
      {
        "@odata.type": `${T}ChoiceSettingCollectionInstance`,
        settingDefinitionId: "synthetic_choices",
        choiceSettingCollectionValue: [null, 5],
      },
      {
        "@odata.type": `${T}GroupSettingCollectionInstance`,
        settingDefinitionId: "synthetic_groups",
        groupSettingCollectionValue: [null],
      },
      {
        "@odata.type": `${T}GroupSettingCollectionInstance`,
        settingDefinitionId: "synthetic_groups",
        groupSettingCollectionValue: 5,
      },
    ])
      expect(show(instance).value).toBe(UNREADABLE_VALUE);
  });

  it("shows a child Graph returned as no record as an unknown setting", () => {
    const parsed = show({
      "@odata.type": GROUP,
      settingDefinitionId: "synthetic_parent",
      groupSettingValue: {
        children: [
          null,
          {
            "@odata.type": SIMPLE,
            settingDefinitionId: "synthetic_child",
            simpleSettingValue: { "@odata.type": STRING_VALUE, value: "kept" },
          },
        ],
      },
    });
    expect(parsed.nestedSettings?.map((row) => row.value)).toEqual([
      UNREADABLE_VALUE,
      "kept",
    ]);
  });
});
