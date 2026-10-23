import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { collectCatalogValues } from "../compliance/engine";
import {
  canonicalFlags,
  canonicalPlatforms,
  documentedPropertyValue,
} from "../compliance/graph-rows";
import type { ComplianceAssessment } from "../compliance/types";
import { REDACTED_VALUE } from "../intune-policy-registry";
import {
  analyzeConfigurations,
  type DetailedExportData,
} from "../configuration-analyzer";
import { extractSettingValue, UNREADABLE_VALUE } from "../configuration-parser";
import type { ConfigurationSectionData } from "../configuration-sections";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import { inComparisonOrder } from "../snapshots/order";
import { projectSnapshot } from "../snapshots/projection";
import {
  compareSettings as compareReference,
  platformOf,
  projectionSettings,
} from "../snapshots/reference";
import type { SettingComparison } from "../snapshots/reference-types";
import { assessBenchmark } from "../benchmarks/assessment";
import {
  compareDefinition,
  parsePolicies,
  type RecordJson,
} from "../benchmarks/policies";
import { tenantSettings } from "../benchmarks/tenant-settings";
import {
  choice,
  collection,
  groupCollection,
  NOW,
  pack,
  simpleInteger,
  tenantPolicy,
} from "../benchmarks/__tests__/fixtures";

// Round 36 review findings: a setting below a parent whose own value is
// unreadable is unknown, never enforced, Pass or Fail, and stays present;
// Settings Catalog platforms are read only as documented
// deviceManagementConfigurationPlatforms members, in one canonical form for
// tenant and pack. Graph returns platforms comma separated without spaces in
// the order of their bits ("android,iOS" on configurationPolicyTemplates,
// lab tenant, 23 October 2026). Names, ids and values are synthetic.

const T = "#microsoft.graph.deviceManagementConfiguration";
const CHOICE = `${T}ChoiceSettingInstance`;
const GROUP = `${T}GroupSettingInstance`;

// --- Compliance engine --------------------------------------------------------

const BITLOCKER = "device_vendor_msft_bitlocker_requiredeviceencryption";
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
        platforms: "windows10",
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

function capability(instances: unknown[], id: string, settingId: string) {
  const result = assessCompliance(exportWith(instances)).capabilities.find(
    (row) => row.capability.id === id,
  )!;
  return {
    status: result.status,
    checks: result.checks.filter((check) => check.settingId === settingId),
  };
}

const bitLocker = (instances: unknown[]) =>
  capability(instances, "windows-disk-encryption", BITLOCKER);
const inactivity = (instances: unknown[]) =>
  capability(instances, "windows-inactivity-lock", INACTIVITY);

const bitLockerOn = () => ({
  "@odata.type": CHOICE,
  settingDefinitionId: BITLOCKER,
  choiceSettingValue: { value: `${BITLOCKER}_1`, children: [] },
});

const inactivityLimit = () => ({
  "@odata.type": `${T}SimpleSettingInstance`,
  settingDefinitionId: INACTIVITY,
  simpleSettingValue: { "@odata.type": `${T}IntegerSettingValue`, value: 900 },
});

// A synthetic choice parent with the given own value and children.
const parent = (value: unknown, children: unknown[]) => ({
  "@odata.type": CHOICE,
  settingDefinitionId: "synthetic_parent",
  choiceSettingValue: {
    ...(value === undefined ? {} : { value }),
    children,
  },
});

function expectUnknown(result: ReturnType<typeof bitLocker>) {
  expect(result.status).not.toBe("enforced");
  expect(result.status).not.toBe("missing");
  expect(result.checks.length).toBeGreaterThan(0);
  for (const check of result.checks) {
    expect(check.assessmentStatus).toBe("unableToCheck");
    expect(check.result).toBeNull();
  }
}

describe("finding 1: the engine reads no child below an unreadable parent", () => {
  it("is unableToCheck for a readable child of a choice parent without its value", () => {
    expectUnknown(bitLocker([parent(undefined, [bitLockerOn()])]));
    expectUnknown(inactivity([parent(undefined, [inactivityLimit()])]));
  });

  it("is unableToCheck below a parent of another value shape or an empty option", () => {
    expectUnknown(bitLocker([parent("", [bitLockerOn()])]));
    expectUnknown(bitLocker([parent(7, [bitLockerOn()])]));
  });

  it("is unableToCheck below an unreadable grandparent", () => {
    expectUnknown(
      bitLocker([
        parent(undefined, [
          {
            "@odata.type": GROUP,
            settingDefinitionId: "synthetic_middle",
            groupSettingValue: { children: [bitLockerOn()] },
          },
        ]),
      ]),
    );
  });

  it("is unableToCheck below a parent without a definition id", () => {
    expectUnknown(
      bitLocker([
        {
          "@odata.type": GROUP,
          groupSettingValue: { children: [bitLockerOn()] },
        },
      ]),
    );
  });

  it("keeps the child present but without values", () => {
    const values = collectCatalogValues([
      { settingInstance: parent(undefined, [bitLockerOn()]) },
    ]);
    expect(values.get(BITLOCKER)).toEqual([]);
    expect(values.get("synthetic_parent")).toEqual([]);
  });

  it("enforces a readable child of a readable parent", () => {
    expect(
      bitLocker([parent("synthetic_parent_1", [bitLockerOn()])]).status,
    ).toBe("enforced");
    expect(
      inactivity([parent("synthetic_parent_1", [inactivityLimit()])]).status,
    ).toBe("enforced");
    expect(
      collectCatalogValues([
        { settingInstance: parent("synthetic_parent_1", [bitLockerOn()]) },
      ]).get(BITLOCKER),
    ).toEqual([`${BITLOCKER}_1`]);
  });
});

// --- Benchmark comparison -----------------------------------------------------

const PARENT = "synthetic_bench_parent";
const CHILD = "synthetic_bench_parent_child";
const LEAF = "synthetic_bench_leaf";

const recommendations = [
  {
    id: "1.1",
    title: "Synthetic parent",
    level: 1 as const,
    settings: [PARENT],
  },
  {
    id: "1.2",
    title: "Synthetic child",
    level: 1 as const,
    settings: [CHILD],
  },
];

const parentPack = pack(
  [{ settings: [choice(PARENT, "on", [simpleInteger(CHILD, 5)])] }],
  recommendations,
);

// The parent without its own value, holding the given child.
const valueless = (child: Record<string, unknown>) => ({
  ...choice(PARENT, "on", [child]),
  choiceSettingValue: { children: [child] },
});

function run(settings: Record<string, unknown>[], target = parentPack) {
  return assessBenchmark(
    collection({ policies: [tenantPolicy({ settings })] }),
    target,
    { now: NOW },
  );
}

const resultOf = (assessment: ReturnType<typeof run>, id: string) =>
  assessment.recommendations.find((item) => item.id === id)!;

describe("finding 1: a benchmark child below an unreadable tenant parent", () => {
  it("is Review, never Pass, when the child matches", () => {
    const assessment = run([valueless(simpleInteger(CHILD, 5))]);
    expect(resultOf(assessment, "1.1")).toMatchObject({
      result: "Review",
      reason: "unreadableValue",
    });
    expect(resultOf(assessment, "1.2")).toMatchObject({
      result: "Review",
      reason: "unreadableValue",
    });
    expect(assessment.settings[0]).toMatchObject({
      status: "Review",
      result: "Review",
    });
    const headline = assessment.levels[0]!.headline;
    expect(headline.rate).toBeNull();
    expect(headline.counts).toMatchObject({ pass: 0, fail: 0, review: 2 });
  });

  it("is Review, never Fail, when the child differs or is absent", () => {
    for (const settings of [
      [valueless(simpleInteger(CHILD, 9))],
      [valueless(simpleInteger("synthetic_bench_parent_other", 5))],
    ]) {
      const assessment = run(settings);
      expect(resultOf(assessment, "1.2").result).toBe("Review");
      expect(resultOf(assessment, "1.2").settings[0]!.status).not.toBe(
        "Missing",
      );
      expect(assessment.levels[0]!.headline.counts.fail).toBe(0);
    }
  });

  it("holds the child, so it is never Missing", () => {
    expect(
      compareDefinition(
        choice(PARENT, "on", [simpleInteger(CHILD, 5)]) as RecordJson,
        valueless(simpleInteger(CHILD, 5)) as RecordJson,
        CHILD,
      ),
    ).toEqual({ holds: "yes", comparison: "unknown" });
  });

  it("is Review for an entry of a group collection below an unreadable parent", () => {
    const GROUP_ID = "synthetic_bench_parent_group";
    const nestedPack = pack(
      [
        {
          settings: [
            choice(PARENT, "on", [
              groupCollection(GROUP_ID, [[simpleInteger(LEAF, 1)]]),
            ]),
          ],
        },
      ],
      [{ id: "2.1", title: "Synthetic leaf", level: 1, settings: [LEAF] }],
    );
    const assessment = run(
      [valueless(groupCollection(GROUP_ID, [[simpleInteger(LEAF, 1)]]))],
      nestedPack,
    );
    expect(resultOf(assessment, "2.1").result).toBe("Review");
    expect(assessment.levels[0]!.headline.rate).toBeNull();
  });

  it("is Pass below a readable parent and Fail when the readable child differs", () => {
    const pass = run([choice(PARENT, "on", [simpleInteger(CHILD, 5)])]);
    expect(resultOf(pass, "1.1").result).toBe("Pass");
    expect(resultOf(pass, "1.2").result).toBe("Pass");
    expect(pass.levels[0]!.headline.rate).toBe(1);
    const fail = run([choice(PARENT, "on", [simpleInteger(CHILD, 9)])]);
    expect(resultOf(fail, "1.2").result).toBe("Fail");
    expect(fail.levels[0]!.headline.rate).toBe(0);
  });
});

// --- Platforms -------------------------------------------------------------

const SETTING = "synthetic_bench_platform_setting";

function platformRun(tenant: unknown, packPlatforms: string) {
  return assessBenchmark(
    collection({
      policies: [
        tenantPolicy({ platforms: tenant, settings: [choice(SETTING, "on")] }),
      ],
    }),
    pack([{ platforms: packPlatforms, settings: [choice(SETTING, "on")] }]),
    { now: NOW },
  );
}

const statusOf = (assessment: ReturnType<typeof platformRun>) => {
  const finding = assessment.settings[0]!;
  return [finding.status, finding.result, finding.reason];
};

describe("finding 2: tenant platforms are read only as documented members", () => {
  it("is Review, never Missing, for a policy of unreadable platforms", () => {
    for (const platforms of [
      "unknownFutureValue",
      "windows10,unknownFutureValue",
      "Windows10",
      "windows10,",
      "windows10, macOS",
      "syntheticOS",
      "",
      7,
    ]) {
      const assessment = platformRun(platforms, "windows10");
      expect(statusOf(assessment)).toEqual([
        "Review",
        "Review",
        "collectionIncomplete",
      ]);
      expect(assessment.collection.complete).toBe(false);
      expect(assessment.levels[0]!.headline.rate).toBeNull();
    }
  });

  it("records the unreadable platforms as a gap and keeps them unknown", () => {
    const tenant = tenantSettings(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic future policy",
            platforms: "unknownFutureValue",
            settings: [choice(SETTING, "on")],
          }),
        ],
      }),
    );
    expect(tenant.complete).toBe(false);
    expect(tenant.policies[0]!.platforms).toBeNull();
    expect(tenant.gaps).toContain(
      "Synthetic future policy: the platform was not returned readably.",
    );
  });
});

describe("finding 3: one canonical form for tenant and pack platforms", () => {
  it("matches the same platforms in either order", () => {
    for (const [tenant, packed] of [
      ["iOS,macOS", "macOS,iOS"],
      ["macOS,iOS", "iOS,macOS"],
      ["iOS,macOS", "iOS,macOS"],
      ["android,iOS", "iOS,android"],
    ] as const)
      expect(statusOf(platformRun(tenant, packed))).toEqual([
        "Present",
        "Pass",
        undefined,
      ]);
  });

  it("matches a single platform and keeps other platforms apart", () => {
    expect(statusOf(platformRun("iOS", "iOS"))).toEqual([
      "Present",
      "Pass",
      undefined,
    ]);
    expect(statusOf(platformRun("macOS", "iOS"))).toEqual([
      "Missing",
      "Fail",
      undefined,
    ]);
    expect(statusOf(platformRun("iOS", "iOS,macOS"))).toEqual([
      "Missing",
      "Fail",
      undefined,
    ]);
  });

  it("observes a tenant policy whose platforms include the pack platforms", () => {
    for (const [tenant, packed] of [
      ["macOS,iOS", "iOS"],
      ["android,iOS,macOS", "macOS,iOS"],
    ] as const)
      expect(statusOf(platformRun(tenant, packed))).toEqual([
        "Present",
        "Pass",
        undefined,
      ]);
  });

  it("never compares a pack policy of unreadable platforms", () => {
    for (const platforms of ["unknownFutureValue", "iOS,syntheticOS", " iOS"])
      expect(statusOf(platformRun("iOS", platforms))).toEqual([
        "Review",
        "Review",
        "packValueUnreadable",
      ]);
  });

  it("stores pack platforms in canonical form", () => {
    expect(
      parsePolicies({
        name: "Synthetic pack policy",
        platforms: "macOS,iOS",
        technologies: "mdm",
        settings: [{ settingInstance: choice(SETTING, "on") }],
      })[0]!.platforms,
    ).toBe("iOS,macOS");
  });

  it("canonicalizes flags enum values by their documented members", () => {
    expect(canonicalPlatforms("windows10")).toBe("windows10");
    expect(canonicalPlatforms("macOS,iOS")).toBe("iOS,macOS");
    expect(canonicalPlatforms("iOS,macOS,iOS")).toBe("iOS,macOS");
    expect(canonicalPlatforms("none")).toBe("none");
    expect(canonicalPlatforms("none,windows10")).toBe("windows10");
    for (const value of [
      "unknownFutureValue",
      "iOS,unknownFutureValue",
      "",
      ",iOS",
      "iOS ,macOS",
      "ios",
      null,
      undefined,
      ["iOS"],
    ])
      expect(canonicalPlatforms(value)).toBeNull();
    expect(canonicalFlags("authenticationMethodModes", "sms,password")).toBe(
      "password,sms",
    );
    expect(canonicalFlags("riskLevel", "low")).toBeNull();
    expect(
      documentedPropertyValue("authenticationMethodModes", "sms,password"),
    ).toBe(true);
    expect(
      documentedPropertyValue("authenticationMethodModes", "sms,bogus"),
    ).toBe(false);
    expect(documentedPropertyValue("riskLevel", "low")).toBe(true);
    expect(documentedPropertyValue("riskLevel", "unknownFutureValue")).toBe(
      false,
    );
  });
});

// --- Compare, History and the documentation ---------------------------------

const ASSESSMENT = {
  provenance: { rulesetVersion: "synthetic" },
  generatedAt: "2026-10-23T09:00:00Z",
  scope: {},
  capabilities: [],
  frameworks: [],
} as unknown as ComplianceAssessment;

function project(items: unknown[]) {
  const section = {
    key: "settingsCatalog",
    familyKey: "settingsCatalog",
    label: "Settings Catalog",
    selectionPrefix: "catalog",
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

const catalogItem = (
  instances: unknown[],
  platforms: unknown = "windows10",
) => ({
  id: "catalog-1",
  name: "Synthetic catalog policy",
  platforms,
  technologies: "mdm",
  assignments: allUsers,
  collectionStatus: { settings: "complete", assignments: "complete" },
  settings: instances.map((settingInstance, index) => ({
    id: String(index),
    settingInstance,
  })),
});

function compareItems(reference: unknown, current: unknown) {
  const result = compareReference(
    projectionSettings(project([reference])),
    projectionSettings(project([current])),
  );
  const rows = result.groups.flatMap((group) => group.rows);
  return {
    statuses: Object.fromEntries(
      rows.map((row) => [row.setting, row.status]),
    ) as Record<string, SettingComparison>,
    platforms: result.groups.map((group) => group.platform),
    notCompared: result.notCompared.map((entry) => entry.family),
  };
}

const CHILD_ID = "synthetic_child";
const childText = (value: string) => ({
  "@odata.type": `${T}SimpleSettingInstance`,
  settingDefinitionId: CHILD_ID,
  simpleSettingValue: { "@odata.type": `${T}StringSettingValue`, value },
});

describe("finding 1: Compare, History and the documentation below an unreadable parent", () => {
  it("never compares a child below an unreadable parent in Compare", () => {
    for (const [reference, current] of [
      [
        catalogItem([parent(undefined, [childText("a")])]),
        catalogItem([parent(undefined, [childText("a")])]),
      ],
      [
        catalogItem([parent(undefined, [childText("a")])]),
        catalogItem([parent(undefined, [childText("b")])]),
      ],
      [
        catalogItem([parent("synthetic_parent_1", [childText("a")])]),
        catalogItem([parent(undefined, [childText("b")])]),
      ],
    ]) {
      const { statuses } = compareItems(reference, current);
      expect(statuses[CHILD_ID]).toBe("notComparable");
    }
  });

  it("still compares a child of a readable parent in Compare", () => {
    const readable = (value: string) =>
      catalogItem([parent("synthetic_parent_1", [childText(value)])]);
    expect(compareItems(readable("a"), readable("a")).statuses[CHILD_ID]).toBe(
      "matching",
    );
    expect(compareItems(readable("a"), readable("b")).statuses[CHILD_ID]).toBe(
      "different",
    );
  });

  it("never reports a change below an unreadable parent in History", () => {
    const diff = diffSnapshots(
      project([catalogItem([parent(undefined, [childText("a")])])]),
      project([catalogItem([parent(undefined, [childText("b")])])]),
    );
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
    const readable = diffSnapshots(
      project([catalogItem([parent("synthetic_parent_1", [childText("a")])])]),
      project([catalogItem([parent("synthetic_parent_1", [childText("b")])])]),
    );
    expect(readable.policies.map((policy) => policy.kind)).toEqual(["changed"]);
  });

  it("keeps the child as an unreadable row and documents it without its value", () => {
    const rows = flattenItemSettings("settingsCatalog", {
      settings: [{ settingInstance: parent(undefined, [childText("a")]) }],
    });
    expect(
      rows.map((row) => [row.definitionId, row.value, row.unreadable]),
    ).toEqual([
      ["synthetic_parent", UNREADABLE_VALUE, true],
      [CHILD_ID, UNREADABLE_VALUE, true],
    ]);
    const parsed = extractSettingValue({
      id: "0",
      settingInstance: parent(undefined, [childText("a")]) as never,
      settingDefinitions: [],
    });
    expect(parsed.value).toBe(UNREADABLE_VALUE);
    expect(parsed.nestedSettings?.map((row) => row.value)).toEqual([
      UNREADABLE_VALUE,
    ]);
    const readable = extractSettingValue({
      id: "0",
      settingInstance: parent("synthetic_parent_1", [childText("a")]) as never,
      settingDefinitions: [],
    });
    expect(readable.nestedSettings?.map((row) => row.value)).toEqual(["a"]);
  });
});

describe("finding 3: Compare groups platforms by their canonical form", () => {
  const item = (platforms: unknown) =>
    catalogItem([parent("synthetic_parent_1", [])], platforms);

  it("groups the same platforms in either order and matches them", () => {
    const result = compareItems(item("iOS,macOS"), item("macOS,iOS"));
    expect(result.platforms).toEqual(["iOS, macOS"]);
    expect(result.statuses.synthetic_parent).toBe("matching");
    expect(platformOf({ platforms: "windows10" })).toBe("Windows");
  });

  it("does not compare a family holding unreadable platforms", () => {
    for (const platforms of ["unknownFutureValue", "iOS, macOS", "ios"])
      expect(compareItems(item("iOS"), item(platforms)).notCompared).toContain(
        "settingsCatalog",
      );
  });
});

describe("sweep: every other platforms and flags reader uses the canonical form", () => {
  it("does not compare a Settings Catalog policy Graph returned without platforms", () => {
    const item = (platforms: unknown) =>
      catalogItem([parent("synthetic_parent_1", [])], platforms);
    const without: Record<string, unknown> = item("windows10");
    delete without.platforms;
    expect(compareItems(item("windows10"), without).notCompared).toContain(
      "settingsCatalog",
    );
    expect(compareItems(item("windows10"), item(null)).notCompared).toContain(
      "settingsCatalog",
    );
    expect(
      compareItems(item("windows10"), item("windows10")).notCompared,
    ).toEqual([]);
  });

  it("orders flags values by their canonical form for Compare and History", () => {
    const ordered = (levels: string) =>
      inComparisonOrder("conditionalAccessPolicies", {
        conditions: { insiderRiskLevels: levels },
      }).conditions as { insiderRiskLevels: string };
    expect(ordered("elevated,minor").insiderRiskLevels).toBe("minor,elevated");
    expect(ordered("minor,minor,elevated").insiderRiskLevels).toBe(
      "minor,elevated",
    );
    expect(ordered("minor,syntheticLevel").insiderRiskLevels).toBe(
      "minor,syntheticLevel",
    );
  });

  it("counts a policy once for each documented platform in the documentation", () => {
    const counts = (platforms: unknown[]) =>
      analyzeConfigurations({
        ...exportWith([]),
        settingsCatalog: platforms.map((value, index) => ({
          id: `catalog-${index}`,
          name: "Synthetic catalog policy",
          platforms: value,
          settings: [],
          assignments: [],
        })),
      } as unknown as DetailedExportData).platformCounts;
    expect(counts(["iOS,macOS", "windows10", "macOS"])).toEqual({
      iOS: 1,
      macOS: 2,
      Windows: 1,
    });
    expect(counts(["unknownFutureValue", "windows10, macOS"])).toEqual({});
  });
});

describe("review: more shapes of an unreadable parent", () => {
  const choices = (
    entries: Array<{ value: unknown; children: unknown[] }>,
  ) => ({
    "@odata.type": `${T}ChoiceSettingCollectionInstance`,
    settingDefinitionId: "synthetic_choices",
    choiceSettingCollectionValue: entries,
  });

  it("is unableToCheck below a choice collection with one unreadable entry", () => {
    expectUnknown(
      bitLocker([
        choices([
          { value: "synthetic_choices_a", children: [bitLockerOn()] },
          { value: 7, children: [] },
        ]),
      ]),
    );
    expect(
      bitLocker([
        choices([
          { value: "synthetic_choices_a", children: [bitLockerOn()] },
          { value: "synthetic_choices_b", children: [] },
        ]),
      ]).status,
    ).toBe("enforced");
  });

  it("is unableToCheck below a redacted choice parent", () => {
    expectUnknown(bitLocker([parent(REDACTED_VALUE, [bitLockerOn()])]));
  });

  const COLLECTION = "synthetic_bench_choices";
  const entryChild = (value: number) => simpleInteger(CHILD, value);
  const collectionRoot = (
    entries: Array<{ value: unknown; children: unknown[] }>,
  ) => ({
    ...choice(COLLECTION, "a"),
    choiceSettingValue: undefined,
    "@odata.type": `${T}ChoiceSettingCollectionInstance`,
    choiceSettingCollectionValue: entries,
  });
  const collectionPack = pack(
    [
      {
        settings: [
          JSON.parse(
            JSON.stringify(
              collectionRoot([
                { value: `${COLLECTION}_a`, children: [entryChild(5)] },
              ]),
            ),
          ),
        ],
      },
    ],
    [
      {
        id: "3.1",
        title: "Synthetic entry child",
        level: 1,
        settings: [CHILD],
      },
    ],
  );

  it("is Review below a benchmark choice collection with one unreadable entry", () => {
    const tenant = (second: unknown) =>
      run(
        [
          JSON.parse(
            JSON.stringify(
              collectionRoot([
                { value: `${COLLECTION}_a`, children: [entryChild(5)] },
                { value: second, children: [] },
              ]),
            ),
          ),
        ],
        collectionPack,
      );
    const unreadable = tenant(7);
    expect(resultOf(unreadable, "3.1").result).toBe("Review");
    expect(unreadable.levels[0]!.headline.rate).toBeNull();
    const readable = tenant(`${COLLECTION}_b`);
    expect(resultOf(readable, "3.1").result).toBe("Pass");
    expect(readable.levels[0]!.headline.rate).toBe(1);
  });

  it("is Review below a redacted benchmark choice parent", () => {
    const redacted = {
      ...choice(PARENT, "on", [simpleInteger(CHILD, 5)]),
      choiceSettingValue: {
        value: REDACTED_VALUE,
        children: [simpleInteger(CHILD, 5)],
      },
    };
    const assessment = run([redacted]);
    expect(resultOf(assessment, "1.2").result).toBe("Review");
    expect(assessment.levels[0]!.headline.rate).toBeNull();
  });

  it("never reports a change of a child whose nested parent is unreadable in History", () => {
    const nestedItem = (value: string) =>
      catalogItem([
        {
          "@odata.type": GROUP,
          settingDefinitionId: "synthetic_outer",
          groupSettingValue: {
            children: [parent(undefined, [childText(value)])],
          },
        },
      ]);
    const diff = diffSnapshots(
      project([nestedItem("a")]),
      project([nestedItem("b")]),
    );
    expect(diff.policies).toEqual([]);
    expect(diff.notComparedItems).toHaveLength(1);
    expect(
      compareItems(nestedItem("a"), nestedItem("a")).statuses[CHILD_ID],
    ).toBe("notComparable");
  });
});

describe("review: the platform none names no platform", () => {
  it("reads none beside windows10 as windows10", () => {
    expect(statusOf(platformRun("none,windows10", "windows10"))).toEqual([
      "Present",
      "Pass",
      undefined,
    ]);
  });

  it("is Review, never Missing, for a tenant policy of platform none", () => {
    const assessment = platformRun("none", "windows10");
    expect(statusOf(assessment)).toEqual([
      "Review",
      "Review",
      "collectionIncomplete",
    ]);
    expect(assessment.levels[0]!.headline.rate).toBeNull();
  });

  it("never compares a pack policy of platform none", () => {
    expect(statusOf(platformRun("windows10", "none"))).toEqual([
      "Review",
      "Review",
      "packValueUnreadable",
    ]);
  });
});
