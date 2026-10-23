import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import type { ComplianceAssessment } from "../compliance/types";
import type { DetailedExportData } from "../configuration-analyzer";
import { extractSettingValue, UNREADABLE_VALUE } from "../configuration-parser";
import type { ConfigurationSectionData } from "../configuration-sections";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import { projectSnapshot } from "../snapshots/projection";
import {
  compareSettings as compareReference,
  projectionSettings,
} from "../snapshots/reference";
import { assessBenchmark } from "../benchmarks/assessment";
import { observationLabel } from "../benchmarks/display";
import { generateBenchmarkDrafts } from "../benchmarks/drafts";
import { compareDefinition, type RecordJson } from "../benchmarks/policies";
import {
  choice,
  collection,
  groupCollection,
  NOW,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "../benchmarks/__tests__/fixtures";

// Round 37 review findings: a nested Settings Catalog setting applies only
// below the options its parents select, so the benchmark comparison judges
// it with them; a pack parent this app cannot read shadows its descendants
// like a tenant parent does; and an instance without its definition id
// shadows its children in the documentation, Compare and History as in the
// compliance engine. Names, ids and values are synthetic.

const T = "#microsoft.graph.deviceManagementConfiguration";

// --- Benchmark comparison -----------------------------------------------------

const ENABLED = "synthetic_bench_lock_enabled";
const LIMIT = "synthetic_bench_lock_limit";
const OTHER = "synthetic_bench_lock_other";

const childOnly = [
  {
    id: "1.1",
    title: "Synthetic lock limit",
    level: 1 as const,
    settings: [LIMIT],
  },
];
const parentAndChild = [
  {
    id: "1.1",
    title: "Synthetic lock enabled",
    level: 1 as const,
    settings: [ENABLED],
  },
  {
    id: "1.2",
    title: "Synthetic lock limit",
    level: 1 as const,
    settings: [LIMIT],
  },
];

const lock = (option: string, limit?: number, other?: number) =>
  choice(ENABLED, option, [
    ...(limit === undefined ? [] : [simpleInteger(LIMIT, limit)]),
    ...(other === undefined ? [] : [simpleInteger(OTHER, other)]),
  ]);

const lockPack = (recommendations = childOnly, root = lock("0", 5)) =>
  pack([{ settings: [root] }], recommendations);

function run(settings: Record<string, unknown>[], target = lockPack()) {
  return assessBenchmark(
    collection({ policies: [tenantPolicy({ name: "Tenant lock", settings })] }),
    target,
    { now: NOW },
  );
}

const results = (assessment: ReturnType<typeof run>) =>
  assessment.recommendations.map((item) => [item.id, item.result]);
const rate = (assessment: ReturnType<typeof run>) =>
  assessment.levels[0]!.headline.rate;

describe("finding 1: a descendant is judged with its parents' options", () => {
  it("is Fail, never Pass, when the tenant parent selects another option", () => {
    const assessment = run([lock("1", 5)]);
    expect(results(assessment)).toEqual([["1.1", "Fail"]]);
    expect(assessment.recommendations[0]!.settings[0]!.status).toBe(
      "Different",
    );
    expect(rate(assessment)).toBe(0);
    const both = run([lock("1", 5)], lockPack(parentAndChild));
    expect(results(both)).toEqual([
      ["1.1", "Fail"],
      ["1.2", "Fail"],
    ]);
    expect(rate(both)).toBe(0);
  });

  it("is Different, never Missing, when the other option holds no child", () => {
    const assessment = run([lock("1")]);
    const [setting] = assessment.recommendations[0]!.settings;
    expect([setting!.status, setting!.result]).toEqual(["Different", "Fail"]);
    const drafts = generateBenchmarkDrafts(assessment, lockPack());
    expect(drafts.drafts).toEqual([]);
    expect(drafts.changes.map((change) => change.policies)).toEqual([
      ["Tenant lock"],
    ]);
  });

  it("names a parent with another option on the screen and in the PDF", () => {
    const recommended = lock("0", 5) as RecordJson;
    const label = (tenant: Record<string, unknown>) =>
      observationLabel({ recommended }, { value: tenant as RecordJson }, LIMIT);
    expect(label(lock("1", 5))).toBe("Parent setting differs");
    expect(label(lock("1"))).toBe("Parent setting differs");
    expect(label(lock("0", 5))).toBe("Matches");
    expect(label(lock("0", 9))).toBe("Differs");
    expect(label(lock("0"))).toBe("Not set in this policy");
    expect(
      compareDefinition(recommended, lock("1", 9) as RecordJson, LIMIT),
    ).toEqual({ holds: "yes", comparison: "differ" });
  });

  it("judges an entry of a group collection with the option above it", () => {
    const GROUP_ID = "synthetic_bench_lock_group";
    const SWITCH = "synthetic_bench_lock_switch";
    const entry = (option: string, limit: number) => [
      choice(SWITCH, option, [simpleInteger(LIMIT, limit)]),
    ];
    const target = pack(
      [{ settings: [groupCollection(GROUP_ID, [entry("on", 5)])] }],
      childOnly,
    );
    expect(
      results(run([groupCollection(GROUP_ID, [entry("off", 5)])], target)),
    ).toEqual([["1.1", "Fail"]]);
    // Entries are matched, not paired: one entry with the option is enough.
    const matched = run(
      [groupCollection(GROUP_ID, [entry("off", 5), entry("on", 5)])],
      target,
    );
    expect(results(matched)).toEqual([["1.1", "Pass"]]);
    expect(rate(matched)).toBe(1);
  });

  it("is Pass with matching parent and child, and Fail for a different child", () => {
    const pass = run([lock("0", 5)], lockPack(parentAndChild));
    expect(results(pass)).toEqual([
      ["1.1", "Pass"],
      ["1.2", "Pass"],
    ]);
    expect(rate(pass)).toBe(1);
    const fail = run([lock("0", 9)], lockPack(parentAndChild));
    expect(results(fail)).toEqual([
      ["1.1", "Fail"],
      ["1.2", "Fail"],
    ]);
    expect(fail.recommendations[1]!.settings[0]!.status).toBe("Different");
  });

  it("does not judge a descendant with an unrelated sibling", () => {
    const assessment = run(
      [lock("0", 5, 4)],
      lockPack(childOnly, lock("0", 5, 3)),
    );
    expect(results(assessment)).toEqual([["1.1", "Pass"]]);
    expect(rate(assessment)).toBe(1);
  });
});

// The pack parent without its own value, holding the given children.
const valueless = (children: Record<string, unknown>[]) => ({
  ...choice(ENABLED, "0", children),
  choiceSettingValue: { children },
});

describe("finding 2: a pack parent this app cannot read shadows its descendants", () => {
  it("is Review with a null rate, never Fail, against a readable tenant difference", () => {
    const target = lockPack(
      parentAndChild,
      valueless([simpleInteger(LIMIT, 5)]),
    );
    const assessment = run([lock("1", 9)], target);
    expect(
      assessment.recommendations.map((item) => [
        item.id,
        item.result,
        item.reason,
      ]),
    ).toEqual([
      ["1.1", "Review", "packValueUnreadable"],
      ["1.2", "Review", "packValueUnreadable"],
    ]);
    expect(assessment.settings[0]).toMatchObject({
      status: "Review",
      result: "Review",
      reason: "packValueUnreadable",
    });
    expect(rate(assessment)).toBeNull();
    expect(assessment.levels[0]!.headline.counts.fail).toBe(0);
    const drafts = generateBenchmarkDrafts(assessment, target);
    expect(drafts.drafts).toEqual([]);
    expect(drafts.changes).toEqual([]);
  });

  it("is Review on the settings basis too", () => {
    const target = pack([{ settings: [valueless([simpleInteger(LIMIT, 5)])] }]);
    const assessment = run([lock("1", 9)], target);
    expect(assessment.basis).toBe("settings");
    expect(assessment.settings[0]).toMatchObject({
      status: "Review",
      reason: "packValueUnreadable",
    });
    expect(rate(assessment)).toBeNull();
  });

  it("is Review below an unreadable pack grandparent", () => {
    const OUTER = "synthetic_bench_lock_outer";
    const outer = (inner: Record<string, unknown>) => ({
      "@odata.type": `${T}GroupSettingInstance`,
      settingDefinitionId: OUTER,
      groupSettingValue: { children: [inner] },
    });
    const target = pack(
      [{ settings: [outer(valueless([simpleInteger(LIMIT, 5)]))] }],
      childOnly,
    );
    const assessment = run([outer(lock("1", 9))], target);
    expect(assessment.recommendations[0]).toMatchObject({
      result: "Review",
      reason: "packValueUnreadable",
    });
    expect(rate(assessment)).toBeNull();
  });

  it("still compares a readable pack parent with readable tenant data", () => {
    expect(results(run([lock("0", 5)]))).toEqual([["1.1", "Pass"]]);
    expect(results(run([lock("0", 9)]))).toEqual([["1.1", "Fail"]]);
  });
});

// --- Compliance engine --------------------------------------------------------

const PASSWORD_ENABLED =
  "device_vendor_msft_policy_config_devicelock_devicepasswordenabled";
const MAX_INACTIVITY =
  "device_vendor_msft_policy_config_devicelock_maxinactivitytimedevicelock";

function inactivityLock(parent: Record<string, unknown>) {
  const data = {
    settingsCatalog: [
      {
        id: "catalog-1",
        name: "Synthetic catalog policy",
        platforms: "windows10",
        settings: [{ settingInstance: parent }],
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
            },
          },
        ],
      },
    ],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
  } as unknown as DetailedExportData;
  const result = assessCompliance(data).capabilities.find(
    (row) => row.capability.id === "windows-inactivity-lock",
  )!;
  return {
    status: result.status,
    checks: result.checks.filter((check) => check.settingId === MAX_INACTIVITY),
  };
}

// A null id leaves the definition id out.
const deviceLock = (option: string | null, id: unknown = PASSWORD_ENABLED) => {
  const children = [
    {
      "@odata.type": `${T}SimpleSettingInstance`,
      settingDefinitionId: MAX_INACTIVITY,
      simpleSettingValue: {
        "@odata.type": `${T}IntegerSettingValue`,
        value: 5,
      },
    },
  ];
  return {
    "@odata.type": `${T}ChoiceSettingInstance`,
    ...(id === null ? {} : { settingDefinitionId: id }),
    choiceSettingValue: {
      ...(option === null ? {} : { value: `${PASSWORD_ENABLED}_${option}` }),
      children,
    },
  };
};

describe("the engine: prerequisite parents", () => {
  it("enforces a child below its required parent option", () => {
    expect(inactivityLock(deviceLock("0")).status).toBe("enforced");
  });

  it("is unableToCheck below another option, an unreadable or an unidentified parent", () => {
    for (const parent of [
      deviceLock("1"),
      deviceLock(null),
      deviceLock("0", null),
      deviceLock("0", ""),
    ]) {
      const result = inactivityLock(parent);
      expect(result.status).not.toBe("enforced");
      expect(result.checks.length).toBeGreaterThan(0);
      for (const check of result.checks) {
        expect(check.assessmentStatus).toBe("unableToCheck");
        expect(check.result).toBeNull();
      }
    }
  });
});

// --- Documentation, Compare and History ---------------------------------------

const CHILD_ID = "synthetic_child";
const childText = (value: string) => ({
  "@odata.type": `${T}SimpleSettingInstance`,
  settingDefinitionId: CHILD_ID,
  simpleSettingValue: { "@odata.type": `${T}StringSettingValue`, value },
});
// A synthetic choice parent with a readable option; a null id leaves the
// definition id out.
const parent = (children: unknown[], id: unknown = "synthetic_parent") => ({
  "@odata.type": `${T}ChoiceSettingInstance`,
  ...(id === null ? {} : { settingDefinitionId: id }),
  choiceSettingValue: { value: "synthetic_parent_1", children },
});

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

function project(instances: unknown[]) {
  const section = {
    key: "settingsCatalog",
    familyKey: "settingsCatalog",
    label: "Settings Catalog",
    selectionPrefix: "catalog",
    items: [
      {
        id: "catalog-1",
        name: "Synthetic catalog policy",
        platforms: "windows10",
        technologies: "mdm",
        assignments: [],
        collectionStatus: { settings: "complete", assignments: "complete" },
        settings: instances.map((settingInstance, index) => ({
          id: String(index),
          settingInstance,
        })),
      },
    ],
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

describe("finding 3: an instance without its definition id shadows its children", () => {
  for (const [label, id] of [
    ["no definition id", null],
    ["an empty definition id", ""],
  ] as const)
    it(`keeps the parent and child as unreadable rows for ${label}`, () => {
      const rows = flattenItemSettings("settingsCatalog", {
        settings: [{ settingInstance: parent([childText("a")], id) }],
      });
      expect(rows.map((row) => [row.value, row.unreadable])).toEqual([
        [UNREADABLE_VALUE, true],
        [UNREADABLE_VALUE, true],
      ]);
      expect(rows[1]!.definitionId).toBe(CHILD_ID);
      const parsed = extractSettingValue({
        id: "0",
        settingInstance: parent([childText("a")], id) as never,
        settingDefinitions: [],
      });
      expect(parsed.value).toBe(UNREADABLE_VALUE);
      expect(parsed.nestedSettings?.map((row) => row.value)).toEqual([
        UNREADABLE_VALUE,
      ]);
    });

  it("shadows a grandchild below an unidentified nested parent", () => {
    const outer = {
      "@odata.type": `${T}GroupSettingInstance`,
      settingDefinitionId: "synthetic_outer",
      groupSettingValue: { children: [parent([childText("a")], "")] },
    };
    const rows = flattenItemSettings("settingsCatalog", {
      settings: [{ settingInstance: outer }],
    });
    expect(rows.find((row) => row.definitionId === CHILD_ID)).toMatchObject({
      value: UNREADABLE_VALUE,
      unreadable: true,
    });
    const parsed = extractSettingValue({
      id: "0",
      settingInstance: outer as never,
      settingDefinitions: [],
    });
    expect(parsed.nestedSettings?.map((row) => row.value)).toEqual([
      UNREADABLE_VALUE,
      UNREADABLE_VALUE,
    ]);
  });

  it("never compares or reports a change below an unidentified parent", () => {
    const compare = (a: string, b: string) => {
      const result = compareReference(
        projectionSettings(project([parent([childText(a)], "")])),
        projectionSettings(project([parent([childText(b)], "")])),
      );
      return result.groups
        .flatMap((group) => group.rows)
        .find((row) => row.setting === CHILD_ID)?.status;
    };
    expect(compare("a", "a")).not.toBe("matching");
    expect(compare("a", "b")).not.toBe("different");
    const diff = diffSnapshots(
      project([parent([childText("a")], "")]),
      project([parent([childText("b")], "")]),
    );
    expect(diff.policies).toEqual([]);
  });

  it("still reads a child of an identified parent", () => {
    const rows = flattenItemSettings("settingsCatalog", {
      settings: [{ settingInstance: parent([childText("a")]) }],
    });
    expect(rows.map((row) => [row.definitionId, row.value])).toEqual([
      ["synthetic_parent", expect.any(String)],
      [CHILD_ID, "a"],
    ]);
    expect(rows.some((row) => row.unreadable)).toBe(false);
    const parsed = extractSettingValue({
      id: "0",
      settingInstance: parent([childText("a")]) as never,
      settingDefinitions: [],
    });
    expect(parsed.nestedSettings?.map((row) => row.value)).toEqual(["a"]);
    const diff = diffSnapshots(
      project([parent([childText("a")])]),
      project([parent([childText("b")])]),
    );
    expect(diff.policies.map((policy) => policy.kind)).toEqual(["changed"]);
  });
});

describe("review: parents compare only by what selects the branch", () => {
  const ROOT = "synthetic_bench_branch_root";
  const SWITCH = "synthetic_bench_branch_switch";
  const LEAF = "synthetic_bench_branch_leaf";
  const leafOnly = [
    {
      id: "1.1",
      title: "Synthetic branch leaf",
      level: 1 as const,
      settings: [LEAF],
    },
  ];
  const outcome = (
    packRoot: Record<string, unknown>,
    tenantRoot: Record<string, unknown>,
  ) => {
    const assessment = run(
      [tenantRoot],
      pack([{ settings: [packRoot] }], leafOnly),
    );
    const [item] = assessment.recommendations;
    return [item!.result, item!.settings[0]!.status, rate(assessment)];
  };
  const choiceRoot = () => choice(ROOT, "0", [simpleInteger(LEAF, 5)]);

  it("is Pass with extra properties on a choice parent", () => {
    const value = choiceRoot();
    const extraValue = {
      ...value,
      choiceSettingValue: {
        ...(value.choiceSettingValue as Record<string, unknown>),
        extraProp: "x",
      },
    };
    expect(outcome(choiceRoot(), extraValue)).toEqual(["Pass", "Present", 1]);
    expect(
      outcome(choiceRoot(), { ...choiceRoot(), extraInstanceProp: "y" }),
    ).toEqual(["Pass", "Present", 1]);
  });

  it("is Pass with an extra property on a group collection entry", () => {
    const root = () =>
      groupCollection(ROOT, [[choice(SWITCH, "0", [simpleInteger(LEAF, 5)])]]);
    const tenant = root();
    const [entry] = tenant.groupSettingCollectionValue as Record<
      string,
      unknown
    >[];
    entry!.extra = 1;
    expect(outcome(root(), tenant)).toEqual(["Pass", "Present", 1]);
  });

  it("is Missing below a choice parent of the same option without children", () => {
    const tenant = choice(ROOT, "0");
    (tenant.choiceSettingValue as Record<string, unknown>).children = null;
    expect(outcome(choiceRoot(), tenant)).toEqual(["Fail", "Missing", 0]);
  });

  it("is Missing in an empty tenant group collection", () => {
    expect(
      outcome(
        groupCollection(ROOT, [[simpleInteger(LEAF, 5)]]),
        groupCollection(ROOT, []),
      ),
    ).toEqual(["Fail", "Missing", 0]);
  });

  it("still fails a tenant parent of another option", () => {
    expect(
      outcome(choiceRoot(), choice(ROOT, "1", [simpleInteger(LEAF, 5)])),
    ).toEqual(["Fail", "Different", 0]);
  });
});

describe("review: a readable parent difference above an unreadable pack value", () => {
  const ROOT = "synthetic_bench_secret_root";
  const INNER = "synthetic_bench_secret_inner";
  const LEAF = "synthetic_bench_secret_leaf";
  const leafOnly = [
    {
      id: "1.1",
      title: "Synthetic secret leaf",
      level: 1 as const,
      settings: [LEAF],
    },
  ];
  const outcome = (
    packRoot: Record<string, unknown>,
    tenantRoot: Record<string, unknown>,
  ) => {
    const assessment = run(
      [tenantRoot],
      pack([{ settings: [packRoot] }], leafOnly),
    );
    const [item] = assessment.recommendations;
    return [item!.result, item!.reason, rate(assessment)];
  };
  // The inner pack choice without its own value.
  const valuelessInner = () => {
    const inner = choice(INNER, "0", [simpleInteger(LEAF, 5)]);
    delete (inner.choiceSettingValue as Record<string, unknown>).value;
    return inner;
  };

  it("is Different: the tenant fails whatever the pack value is", () => {
    expect(
      outcome(choice(ROOT, "0", [simpleSecret(LEAF)]), choice(ROOT, "1")),
    ).toEqual(["Fail", undefined, 0]);
    expect(
      outcome(choice(ROOT, "0", [valuelessInner()]), choice(ROOT, "1")),
    ).toEqual(["Fail", undefined, 0]);
  });

  it("is Review when the readable parents match", () => {
    expect(
      outcome(
        choice(ROOT, "0", [valuelessInner()]),
        choice(ROOT, "0", [choice(INNER, "1", [simpleInteger(LEAF, 6)])]),
      ),
    ).toEqual(["Review", "packValueUnreadable", null]);
  });
});
