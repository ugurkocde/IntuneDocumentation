import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { collectCatalogValues } from "../compliance/engine";
import type { ComplianceAssessment } from "../compliance/types";
import type { DetailedExportData } from "../configuration-analyzer";
import type { ConfigurationSectionData } from "../configuration-sections";
import { flattenItemSettings } from "../settings-flatten";
import { diffSnapshots } from "../snapshots/diff";
import { projectSnapshot } from "../snapshots/projection";
import {
  compareSettings as compareReference,
  projectionSettings,
} from "../snapshots/reference";
import { assessBenchmark } from "../benchmarks/assessment";
import {
  compareDefinition,
  compareRoot,
  type RecordJson,
} from "../benchmarks/policies";
import {
  choice,
  choiceCollection,
  collection,
  groupCollection,
  NOW,
  pack,
  simpleInteger,
  tenantPolicy,
} from "../benchmarks/__tests__/fixtures";

// Round 38 review findings, part 1: Graph documents children on every
// choiceSettingValue and returns an empty list for a choice without child
// settings (lab tenant, GET configurationPolicies/{id}/settings, 23 October
// 2026), but a list may also come back null or not at all. Every form holds
// the same nothing, so a benchmark, the compliance engine, Compare and
// History read them alike. Names, ids and values are synthetic.

type Instance = Record<string, unknown>;
type Form = "empty" | "null" | "omitted";
const FORMS: Form[] = ["empty", "null", "omitted"];

/** The instance with every empty choice child list in the given form. */
function childForm(value: unknown, form: Form): any {
  if (Array.isArray(value)) return value.map((item) => childForm(item, form));
  if (!value || typeof value !== "object") return value;
  const out: Instance = {};
  for (const [key, item] of Object.entries(value)) {
    const emptyChoiceList =
      key === "children" &&
      Array.isArray(item) &&
      !item.length &&
      "value" in (value as Instance);
    if (!emptyChoiceList) out[key] = childForm(item, form);
    else if (form === "empty") out[key] = [];
    else if (form === "null") out[key] = null;
  }
  return out;
}

const pairs = FORMS.flatMap((a) => FORMS.map((b) => [a, b] as const));

// --- Benchmark comparison -----------------------------------------------------

const ROOT = "synthetic_bench_forms_root";
const NESTED = "synthetic_bench_forms_nested";
const LIMIT = "synthetic_bench_forms_limit";
const LIST = "synthetic_bench_forms_list";
const GROUP = "synthetic_bench_forms_group";

const recommendation = (setting: string) => [
  {
    id: "1.1",
    title: "Synthetic forms setting",
    level: 1 as const,
    settings: [setting],
  },
];

function run(packRoot: Instance, tenantRoot: Instance, setting: string) {
  return assessBenchmark(
    collection({
      policies: [
        tenantPolicy({ name: "Tenant forms", settings: [tenantRoot] }),
      ],
    }),
    pack([{ settings: [packRoot] }], recommendation(setting)),
    { now: NOW },
  );
}

const outcome = (assessment: ReturnType<typeof run>) => [
  assessment.recommendations[0]!.result,
  assessment.recommendations[0]!.settings[0]!.status,
  assessment.levels[0]!.headline.rate,
];

const cases: Array<[string, () => Instance, string]> = [
  ["a root choice", () => choice(ROOT, "1"), ROOT],
  [
    "a nested choice recommendation",
    () => choice(ROOT, "1", [choice(NESTED, "0"), simpleInteger(LIMIT, 5)]),
    NESTED,
  ],
  [
    "a nested choice below a group collection",
    () => groupCollection(GROUP, [[choice(NESTED, "0")]]),
    NESTED,
  ],
  ["a choice collection", () => choiceCollection(LIST, ["a", "b"]), LIST],
];

describe("finding 1: empty, null and omitted child lists are one value", () => {
  for (const [label, build, setting] of cases)
    it(`passes ${label} whatever form either side's child lists have`, () => {
      for (const [packForm, tenantForm] of pairs) {
        const assessment = run(
          childForm(build(), packForm),
          childForm(build(), tenantForm),
          setting,
        );
        expect([packForm, tenantForm, ...outcome(assessment)]).toEqual([
          packForm,
          tenantForm,
          "Pass",
          "Present",
          1,
        ]);
      }
    });

  it("matches in compareRoot and compareDefinition for every pair of forms", () => {
    const root = () =>
      choice(ROOT, "1", [choice(NESTED, "0"), simpleInteger(LIMIT, 5)]);
    for (const [a, b] of pairs) {
      const want = childForm(root(), a) as RecordJson;
      const have = childForm(root(), b) as RecordJson;
      expect([a, b, compareRoot(want, have)]).toEqual([a, b, "match"]);
      expect([a, b, compareDefinition(want, have, NESTED)]).toEqual([
        a,
        b,
        { holds: "yes", comparison: "match" },
      ]);
    }
  });

  it("still fails truly different values and children", () => {
    for (const [a, b] of pairs) {
      // Another option of the root.
      expect(
        outcome(
          run(
            childForm(choice(ROOT, "1"), a),
            childForm(choice(ROOT, "0"), b),
            ROOT,
          ),
        ),
      ).toEqual(["Fail", "Different", 0]);
      // Another value of a child.
      expect(
        outcome(
          run(
            childForm(choice(ROOT, "1", [simpleInteger(LIMIT, 5)]), a),
            childForm(choice(ROOT, "1", [simpleInteger(LIMIT, 9)]), b),
            LIMIT,
          ),
        ),
      ).toEqual(["Fail", "Different", 0]);
      // Another option of a nested choice.
      expect(
        outcome(
          run(
            childForm(choice(ROOT, "1", [choice(NESTED, "0")]), a),
            childForm(choice(ROOT, "1", [choice(NESTED, "1")]), b),
            NESTED,
          ),
        ),
      ).toEqual(["Fail", "Different", 0]);
      // A choice collection with another entry.
      expect(
        outcome(
          run(
            childForm(choiceCollection(LIST, ["a", "b"]), a),
            childForm(choiceCollection(LIST, ["a", "c"]), b),
            LIST,
          ),
        ),
      ).toEqual(["Fail", "Different", 0]);
    }
    // A root without child settings in the pack, with one in the tenant.
    expect(
      outcome(
        run(
          choice(ROOT, "1"),
          choice(ROOT, "1", [simpleInteger(LIMIT, 5)]),
          ROOT,
        ),
      ),
    ).toEqual(["Fail", "Different", 0]);
  });

  it("reads one recommended value, not a profile choice, in two pack policies", () => {
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Tenant forms", settings: [choice(ROOT, "1")] }),
        ],
      }),
      pack(
        [
          { settings: [childForm(choice(ROOT, "1"), "empty")] },
          { settings: [childForm(choice(ROOT, "1"), "omitted")] },
        ],
        recommendation(ROOT),
      ),
      { now: NOW },
    );
    expect(assessment.recommendations[0]!.result).toBe("Pass");
    expect(assessment.levels[0]!.headline.rate).toBe(1);
  });

  it("ignores template references Graph returns null, empty or set", () => {
    const bare = (instance: Instance) => {
      const copy = structuredClone(instance);
      delete copy.settingInstanceTemplateReference;
      delete (copy.choiceSettingValue as Instance)
        .settingValueTemplateReference;
      return copy;
    };
    const templated = (instance: Instance) => {
      const copy = structuredClone(instance);
      copy.settingInstanceTemplateReference = {
        settingInstanceTemplateId: "00000000-0000-0000-0000-00000000b001",
      };
      (copy.choiceSettingValue as Instance).settingValueTemplateReference = {
        settingValueTemplateId: "00000000-0000-0000-0000-00000000b002",
        useTemplateDefault: false,
      };
      return copy;
    };
    const root = choice(ROOT, "1");
    for (const [a, b] of [
      [root, bare(root)],
      [bare(root), templated(root)],
      [templated(root), root],
    ])
      expect(outcome(run(a!, b!, ROOT))).toEqual(["Pass", "Present", 1]);
  });

  it("matches children of a group in any order", () => {
    const entry = (order: "ab" | "ba") => {
      const children = [choice(NESTED, "0"), simpleInteger(LIMIT, 5)];
      return groupCollection(GROUP, [
        order === "ab" ? children : children.reverse(),
      ]);
    };
    expect(outcome(run(entry("ab"), entry("ba"), NESTED))).toEqual([
      "Pass",
      "Present",
      1,
    ]);
    expect(
      outcome(
        run(
          choiceCollection(LIST, ["a", "b"]),
          choiceCollection(LIST, ["b", "a"]),
          LIST,
        ),
      ),
    ).toEqual(["Pass", "Present", 1]);
  });
});

// --- Compliance engine --------------------------------------------------------

const BITLOCKER = "device_vendor_msft_bitlocker_requiredeviceencryption";

function bitlocker(form: Form) {
  return childForm(choice(BITLOCKER, "1"), form);
}

function exportWith(instances: unknown[]): DetailedExportData {
  return {
    settingsCatalog: [
      {
        id: "catalog-1",
        name: "Synthetic catalog policy",
        settings: instances.map((settingInstance) => ({ settingInstance })),
        assignments: [
          {
            target: {
              "@odata.type":
                "#microsoft.graph.allLicensedUsersAssignmentTarget",
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
    conditionalAccessPolicies: [],
    windowsUpdatePolicies: [],
    appProtectionPolicies: [],
    appConfigurations: [],
    enrollmentConfigurations: [],
  } as unknown as DetailedExportData;
}

describe("finding 1: the engine reads every child list form alike", () => {
  for (const form of FORMS)
    it(`enforces a choice whose child list is ${form}`, () => {
      expect(
        collectCatalogValues([{ settingInstance: bitlocker(form) }]).get(
          BITLOCKER,
        ),
      ).toEqual([`${BITLOCKER}_1`]);
      const result = assessCompliance(
        exportWith([bitlocker(form)]),
      ).capabilities.find(
        (row) => row.capability.id === "windows-disk-encryption",
      )!;
      expect(result.status).toBe("enforced");
    });
});

// --- Compare and History ------------------------------------------------------

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

const statuses = (a: unknown[], b: unknown[]) =>
  compareReference(
    projectionSettings(project(a)),
    projectionSettings(project(b)),
  )
    .groups.flatMap((group) => group.rows)
    .map((row) => row.status);

describe("finding 1: Compare and History read every child list form alike", () => {
  const roots = () => [
    choice(ROOT, "1", [choice(NESTED, "0"), simpleInteger(LIMIT, 5)]),
    choiceCollection(LIST, ["a", "b"]),
    groupCollection(GROUP, [[choice(NESTED, "1")]]),
  ];

  it("flattens to the same rows", () => {
    const rows = (form: Form) =>
      flattenItemSettings("settingsCatalog", {
        settings: childForm(roots(), form).map((settingInstance: unknown) => ({
          settingInstance,
        })),
      });
    expect(rows("null")).toEqual(rows("empty"));
    expect(rows("omitted")).toEqual(rows("empty"));
  });

  it("compares and diffs as unchanged for every pair of forms", () => {
    for (const [a, b] of pairs) {
      const left = childForm(roots(), a);
      const right = childForm(roots(), b);
      const found = statuses(left, right);
      expect(found.length).toBeGreaterThan(0);
      expect([a, b, found.every((status) => status === "matching")]).toEqual([
        a,
        b,
        true,
      ]);
      expect([
        a,
        b,
        diffSnapshots(project(left), project(right)).policies,
      ]).toEqual([a, b, []]);
    }
  });

  it("still reports a different nested option", () => {
    const left = [choice(ROOT, "1", [choice(NESTED, "0")])];
    const right = childForm(
      [choice(ROOT, "1", [choice(NESTED, "1")])],
      "omitted",
    );
    expect(statuses(left, right)).toContain("different");
    expect(
      diffSnapshots(project(left), project(right)).policies.map(
        (policy) => policy.kind,
      ),
    ).toEqual(["changed"]);
  });
});

describe("sweep: children of one instance in another order", () => {
  it("compares and diffs as unchanged", () => {
    const root = (order: "ab" | "ba") => {
      const children = [choice(NESTED, "0"), simpleInteger(LIMIT, 5)];
      return [
        choice(ROOT, "1", order === "ab" ? children : [...children].reverse()),
      ];
    };
    const found = statuses(root("ab"), root("ba"));
    expect(found.length).toBeGreaterThan(0);
    expect(found.every((status) => status === "matching")).toBe(true);
    expect(
      diffSnapshots(project(root("ab")), project(root("ba"))).policies,
    ).toEqual([]);
  });
});

// Round 38 review findings, part 2: Entra and Intune exclusions take
// precedence over inclusions (Microsoft Learn: authentication methods
// "Excluded groups take precedence over include groups", Conditional
// Access "The exclude action overrides the include action", Intune
// "Exclusion takes precedence over inclusion"). Graph returns includeTargets
// and excludeTargets ({ id, targetType }) on every authentication method and
// every Conditional Access target list (lab tenant, GET
// /beta/policies/authenticationMethodsPolicy and
// /beta/identity/conditionalAccess/policies, 23 October 2026).

const GROUP_G = "00000000-0000-0000-0000-0000000000a1";
const GROUP_H = "00000000-0000-0000-0000-0000000000a2";
const group = (id: string) => ({ targetType: "group", id });
const ALL = { targetType: "group", id: "all_users" };

function methodsData(...configs: Instance[]): DetailedExportData {
  const defaults: Instance[] = [
    { id: "Fido2", state: "disabled", includeTargets: [ALL] },
    { id: "Sms", state: "disabled", includeTargets: [ALL] },
    { id: "Voice", state: "disabled", includeTargets: [ALL] },
    { id: "Email", state: "disabled", includeTargets: [] },
    { id: "X509Certificate", state: "disabled", includeTargets: [ALL] },
  ];
  const byId = new Map<unknown, Instance>(
    defaults.map((config) => [config.id, { excludeTargets: [], ...config }]),
  );
  for (const config of configs)
    byId.set(config.id, { ...byId.get(config.id), ...config });
  return {
    ...exportWith([]),
    settingsCatalog: [],
    collectedAt: "2026-10-23T09:00:00Z",
    tenantIdentityPolicies: {
      authenticationMethods: {
        authenticationMethodConfigurations: [...byId.values()],
      },
      securityDefaults: { isEnabled: false },
      status: {
        authenticationMethods: "collected",
        securityDefaults: "collected",
      },
    },
  } as unknown as DetailedExportData;
}

const capabilityOf = (data: DetailedExportData, id: string) =>
  assessCompliance(data).capabilities.find((row) => row.capability.id === id)!;

const PHISHING = "tenant-phishing-resistant-method-enabled";
const WEAK = "tenant-weak-methods-disabled";

const checkOf = (result: ReturnType<typeof capabilityOf>, method: string) =>
  result.checks.find(
    (check) => check.settingId === `authenticationMethodsPolicy/${method}`,
  )!;

describe("finding 2: an authentication method excluded for its only group targets nobody", () => {
  it("is no passkey evidence when the only include group is excluded", () => {
    const result = capabilityOf(
      methodsData({
        id: "Fido2",
        state: "enabled",
        includeTargets: [group(GROUP_G)],
        excludeTargets: [group(GROUP_G)],
      }),
      PHISHING,
    );
    expect(result.status).not.toBe("enforced");
    expect(result.evidence).toEqual([]);
    expect(checkOf(result, "Fido2")).toMatchObject({
      assessmentStatus: "checked",
      result: "different",
      actualValue: "Enabled, every include target excluded",
    });
  });

  it("is no weak method counter-evidence when SMS is excluded for its only group", () => {
    const result = capabilityOf(
      methodsData({
        id: "Sms",
        state: "enabled",
        includeTargets: [group(GROUP_G)],
        excludeTargets: [group(GROUP_G.toUpperCase())],
      }),
      WEAK,
    );
    expect(result.status).toBe("enforced");
    expect(result.evidence.map((item) => item.observedValue)).toEqual([
      "Sms, Voice and Email not enabled for any user group",
    ]);
    expect(checkOf(result, "Sms")).toMatchObject({
      result: "matches",
      actualValue: "Enabled, every include target excluded",
    });
  });

  it("targets nobody when all users are excluded", () => {
    const result = capabilityOf(
      methodsData({
        id: "Sms",
        state: "enabled",
        includeTargets: [ALL, group(GROUP_G)],
        excludeTargets: [ALL],
      }),
      WEAK,
    );
    expect(result.status).toBe("enforced");
  });

  it("stays enforced for a group that is not excluded", () => {
    const result = capabilityOf(
      methodsData({
        id: "Fido2",
        state: "enabled",
        includeTargets: [group(GROUP_G), group(GROUP_H)],
        excludeTargets: [group(GROUP_H)],
      }),
      PHISHING,
    );
    expect(result.status).toBe("enforced");
    expect(result.evidence.map((item) => item.observedValue)).toEqual([
      "Fido2 enabled for at least one user group",
    ]);
    expect(checkOf(result, "Fido2")).toMatchObject({
      result: "matches",
      actualValue: "Enabled for 1 target, 1 excluded",
    });
  });

  it("stays enforced for all users with an unrelated group excluded", () => {
    const fido = capabilityOf(
      methodsData({
        id: "Fido2",
        state: "enabled",
        includeTargets: [ALL],
        excludeTargets: [group(GROUP_G)],
      }),
      PHISHING,
    );
    expect(fido.status).toBe("enforced");
    const sms = capabilityOf(
      methodsData({
        id: "Sms",
        state: "enabled",
        includeTargets: [ALL],
        excludeTargets: [group(GROUP_G)],
      }),
      WEAK,
    );
    expect(sms.status).toBe("disabledByPolicy");
    expect(sms.evidence.map((item) => item.observedValue)).toEqual([
      "Sms enabled for at least one user group",
    ]);
  });

  for (const [label, excludeTargets] of [
    ["omitted", undefined],
    ["no list", { id: GROUP_G }],
    ["an entry without an id", [{ targetType: "group" }]],
    ["an entry of an undocumented type", [{ targetType: "role", id: GROUP_H }]],
  ] as const)
    it(`is unable to check when the exclusions are ${label}`, () => {
      for (const includeTargets of [[ALL], [group(GROUP_G)]]) {
        const fido = capabilityOf(
          methodsData({
            id: "Fido2",
            state: "enabled",
            includeTargets,
            excludeTargets,
          }),
          PHISHING,
        );
        expect(fido.status).not.toBe("enforced");
        expect(fido.evidence).toEqual([]);
        expect(checkOf(fido, "Fido2")).toMatchObject({
          assessmentStatus: "unableToCheck",
          result: null,
          actualValue: "Enabled, exclude targets not readable",
        });
        const sms = capabilityOf(
          methodsData({
            id: "Sms",
            state: "enabled",
            includeTargets,
            excludeTargets,
          }),
          WEAK,
        );
        expect(sms.status).not.toBe("disabledByPolicy");
        expect(sms.status).not.toBe("enforced");
        expect(sms.evidence).toEqual([]);
        expect(checkOf(sms, "Sms")).toMatchObject({
          assessmentStatus: "unableToCheck",
          result: null,
        });
      }
    });

  it("needs no exclusions for a method without include targets or a disabled one", () => {
    const result = capabilityOf(
      methodsData(
        {
          id: "Email",
          state: "enabled",
          includeTargets: [],
          excludeTargets: undefined,
        },
        { id: "Sms", state: "disabled", excludeTargets: undefined },
      ),
      WEAK,
    );
    expect(result.status).toBe("enforced");
  });
});

// --- Conditional Access -------------------------------------------------------

function caData(users: Instance, applications: Instance = {}) {
  return {
    ...exportWith([]),
    settingsCatalog: [],
    conditionalAccessPolicies: [
      {
        id: "00000000-0000-0000-0000-0000000000c1",
        displayName: "Synthetic MFA policy",
        state: "enabled",
        grantControls: {
          operator: "AND",
          builtInControls: ["mfa"],
          customAuthenticationFactors: [],
          termsOfUse: [],
          authenticationStrength: null,
        },
        conditions: {
          users: {
            includeUsers: [],
            excludeUsers: [],
            includeGroups: [],
            excludeGroups: [],
            includeRoles: [],
            excludeRoles: [],
            includeGuestsOrExternalUsers: null,
            excludeGuestsOrExternalUsers: null,
            ...users,
          },
          applications: {
            includeApplications: ["All"],
            excludeApplications: [],
            includeUserActions: [],
            includeAuthenticationContextClassReferences: [],
            applicationFilter: null,
            ...applications,
          },
        },
      },
    ],
  } as unknown as DetailedExportData;
}

const MFA = "tenant-mfa-required";

describe("sweep: Conditional Access exclusions take precedence", () => {
  for (const [label, users] of [
    ["groups", { includeGroups: [GROUP_G], excludeGroups: [GROUP_G] }],
    ["users", { includeUsers: [GROUP_G], excludeUsers: [GROUP_G] }],
    [
      "roles",
      { includeRoles: [GROUP_G], excludeRoles: [GROUP_G.toUpperCase()] },
    ],
    [
      "guests",
      {
        includeUsers: ["GuestsOrExternalUsers"],
        excludeUsers: ["GuestsOrExternalUsers"],
      },
    ],
  ] as const)
    it(`is no MFA evidence when the only included ${label} are excluded`, () => {
      const result = capabilityOf(caData(users), MFA);
      expect(result.status).not.toBe("enforced");
      expect(result.evidence).toEqual([]);
      expect(result.checks.map((check) => check.result)).toEqual(["different"]);
    });

  it("is no MFA evidence when the only included application is excluded", () => {
    const app = "00000000-0000-0000-0000-0000000000d1";
    const result = capabilityOf(
      caData(
        { includeUsers: ["All"] },
        { includeApplications: [app], excludeApplications: [app] },
      ),
      MFA,
    );
    expect(result.status).not.toBe("enforced");
    expect(result.checks.map((check) => check.result)).toEqual(["different"]);
  });

  it("stays enforced for a group that is not excluded and for all users", () => {
    for (const users of [
      { includeGroups: [GROUP_G, GROUP_H], excludeGroups: [GROUP_H] },
      { includeUsers: ["All"], excludeGroups: [GROUP_G] },
      { includeGroups: [GROUP_G], excludeUsers: [GROUP_G] },
    ])
      expect(capabilityOf(caData(users), MFA).status).toBe("enforced");
  });

  it("is unable to check when the exclusion list it depends on was omitted", () => {
    const result = capabilityOf(
      caData({ includeGroups: [GROUP_G], excludeGroups: undefined }),
      MFA,
    );
    expect(result.status).not.toBe("enforced");
    expect(result.evidence).toEqual([]);
    expect(result.checks.map((check) => check.result)).toEqual([null]);
    // All users needs no exclusion list: no list names the All sentinel.
    expect(
      capabilityOf(
        caData({ includeUsers: ["All"], excludeUsers: undefined }),
        MFA,
      ).status,
    ).toBe("enforced");
  });
});

// --- Intune assignments -------------------------------------------------------

const include = (id: string) => ({
  target: {
    "@odata.type": "#microsoft.graph.groupAssignmentTarget",
    groupId: id,
    deviceAndAppManagementAssignmentFilterId: null,
    deviceAndAppManagementAssignmentFilterType: "none",
  },
});
const exclude = (id: string) => ({
  target: {
    "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget",
    groupId: id,
    deviceAndAppManagementAssignmentFilterId: null,
    deviceAndAppManagementAssignmentFilterType: "none",
  },
});
const allDevices = {
  target: {
    "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
    deviceAndAppManagementAssignmentFilterId: null,
    deviceAndAppManagementAssignmentFilterType: "none",
  },
};

function assignedBitlocker(assignments: unknown[]) {
  const data = exportWith([bitlocker("empty")]);
  (data.settingsCatalog as Instance[])[0]!.assignments = assignments;
  return capabilityOf(data, "windows-disk-encryption");
}

describe("sweep: an Intune group both included and excluded is not assigned", () => {
  it("is not assigned evidence in the engine", () => {
    const result = assignedBitlocker([include(GROUP_G), exclude(GROUP_G)]);
    expect(result.status).not.toBe("enforced");
    expect(result.evidence.map((item) => item.assignment.state)).toEqual([
      "notAssigned",
    ]);
  });

  it("stays assigned for another included group or all devices", () => {
    for (const assignments of [
      [include(GROUP_G), include(GROUP_H), exclude(GROUP_H)],
      [allDevices, exclude(GROUP_G)],
      [include(GROUP_G), exclude(GROUP_H)],
    ])
      expect(assignedBitlocker(assignments).status).toBe("enforced");
  });

  it("is Review, never Pass, in a benchmark", () => {
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Tenant forms",
            settings: [choice(ROOT, "1")],
            assignments: [include(GROUP_G), exclude(GROUP_G)],
          }),
        ],
      }),
      pack([{ settings: [choice(ROOT, "1")] }], recommendation(ROOT)),
      { now: NOW },
    );
    expect(assessment.recommendations[0]!.result).toBe("Review");
    expect(assessment.levels[0]!.headline.rate).toBeNull();
  });
});

// --- Second pass: guests, unassigned differences, History filters -------------

const TENANT_A = "00000000-0000-0000-0000-0000000000e1";
const TENANT_B = "00000000-0000-0000-0000-0000000000e2";
const guestsOf = (types: string, tenants?: unknown) => ({
  "@odata.type": "#microsoft.graph.conditionalAccessGuestsOrExternalUsers",
  guestOrExternalUserTypes: types,
  externalTenants: tenants ?? {
    "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants",
    membershipKind: "all",
  },
});
const enumerated = (...members: string[]) => ({
  "@odata.type": "#microsoft.graph.conditionalAccessEnumeratedExternalTenants",
  membershipKind: "enumerated",
  members,
});

describe("review: guests or external users are a fourth include axis", () => {
  const status = (users: Instance) => capabilityOf(caData(users), MFA).status;
  const results = (users: Instance) =>
    capabilityOf(caData(users), MFA).checks.map((check) => check.result);

  it("is MFA evidence for a policy that targets guests only", () => {
    for (const users of [
      {
        includeGuestsOrExternalUsers: guestsOf(
          "b2bCollaborationGuest,internalGuest",
        ),
      },
      // Members in another order and a tenant list compare alike.
      {
        includeGuestsOrExternalUsers: guestsOf(
          "internalGuest,b2bCollaborationGuest",
          enumerated(TENANT_A),
        ),
      },
      // Another type excluded, or the type excluded for another tenant only.
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest"),
        excludeGuestsOrExternalUsers: guestsOf("internalGuest"),
      },
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest"),
        excludeGuestsOrExternalUsers: guestsOf(
          "b2bCollaborationGuest",
          enumerated(TENANT_A),
        ),
      },
    ])
      expect(status(users)).toBe("enforced");
  });

  it("targets nobody when the included guests are excluded", () => {
    for (const users of [
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest"),
        excludeGuestsOrExternalUsers: guestsOf(
          "internalGuest,b2bCollaborationGuest",
        ),
      },
      {
        includeGuestsOrExternalUsers: guestsOf(
          "b2bCollaborationGuest",
          enumerated(TENANT_A),
        ),
        excludeGuestsOrExternalUsers: guestsOf(
          "b2bCollaborationGuest",
          enumerated(TENANT_A.toUpperCase(), TENANT_B),
        ),
      },
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest"),
        excludeUsers: ["GuestsOrExternalUsers"],
      },
      { includeGuestsOrExternalUsers: guestsOf("none") },
    ]) {
      expect(status(users)).not.toBe("enforced");
      expect(results(users)).toEqual(["different"]);
    }
  });

  it("is unable to check guests of an unreadable shape", () => {
    for (const users of [
      { includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest,") },
      { includeGuestsOrExternalUsers: guestsOf("unknownFutureValue") },
      { includeGuestsOrExternalUsers: guestsOf("futureGuestType") },
      { includeGuestsOrExternalUsers: { guestOrExternalUserTypes: 3 } },
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest", {
          membershipKind: "enumerated",
        }),
      },
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest"),
        excludeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest", {
          "@odata.type": "#microsoft.graph.conditionalAccessAllExternalTenants",
          membershipKind: "enumerated",
        }),
      },
      {
        includeGuestsOrExternalUsers: guestsOf("internalGuest"),
        excludeGuestsOrExternalUsers: guestsOf(
          "internalGuest",
          enumerated(TENANT_A),
        ),
      },
      {
        includeGuestsOrExternalUsers: guestsOf("b2bCollaborationGuest"),
        excludeUsers: undefined,
      },
    ]) {
      expect(status(users)).not.toBe("enforced");
      expect(results(users)).toEqual([null]);
    }
  });

  it("reads guests decided by another axis as before", () => {
    expect(
      status({
        includeUsers: ["All"],
        includeGuestsOrExternalUsers: guestsOf("futureGuestType"),
      }),
    ).toBe("enforced");
  });
});

describe("review: a difference on an unassigned policy counts like its match", () => {
  const assess = (...policies: Array<Record<string, unknown>>) =>
    assessBenchmark(
      collection({ policies }),
      pack([{ settings: [choice(ROOT, "1")] }], recommendation(ROOT)),
      { now: NOW },
    );
  const state = (assessment: ReturnType<typeof assess>) => {
    const [setting] = assessment.recommendations[0]!.settings;
    return [setting!.status, setting!.result, setting!.reason];
  };
  const unknownAssignment = [
    { target: { "@odata.type": "#microsoft.graph.futureAssignmentTarget" } },
  ];

  it("is Review notAssigned when only unassigned policies differ", () => {
    for (const assignments of [[], [include(GROUP_G), exclude(GROUP_G)]]) {
      const run = assess(
        tenantPolicy({ settings: [choice(ROOT, "0")], assignments }),
      );
      expect(state(run)).toEqual(["Review", "Review", "notAssigned"]);
      expect(run.levels[0]!.headline.rate).toBeNull();
    }
    const both = assess(
      tenantPolicy({ settings: [choice(ROOT, "0")], assignments: [] }),
      tenantPolicy({ settings: [choice(ROOT, "1")], assignments: [] }),
    );
    expect(state(both)).toEqual(["Review", "Review", "notAssigned"]);
  });

  it("passes an assigned match next to an unassigned difference", () => {
    const run = assess(
      tenantPolicy({ settings: [choice(ROOT, "0")], assignments: [] }),
      tenantPolicy({ settings: [choice(ROOT, "1")] }),
    );
    expect(state(run)).toEqual(["Present", "Pass", undefined]);
    expect(run.levels[0]!.headline.rate).toBe(1);
  });

  it("keeps an assigned or unknown assignment difference a Fail", () => {
    for (const assignments of [undefined, unknownAssignment]) {
      const run = assess(
        tenantPolicy({ settings: [choice(ROOT, "0")], assignments }),
        tenantPolicy({ settings: [choice(ROOT, "1")], assignments: [] }),
      );
      expect(state(run)).toEqual(["Different", "Fail", undefined]);
      expect(run.levels[0]!.headline.rate).toBe(0);
    }
  });

  it("is assignmentUnknown for an unknown assignment match next to an unassigned difference", () => {
    const run = assess(
      tenantPolicy({ settings: [choice(ROOT, "0")], assignments: [] }),
      tenantPolicy({
        settings: [choice(ROOT, "1")],
        assignments: unknownAssignment,
      }),
    );
    expect(state(run)).toEqual(["Present", "Review", "assignmentUnknown"]);
  });
});

describe("review: an assignment filter type none, null or omitted is one value", () => {
  const withFilter = (form: "none" | "null" | "omitted") => {
    const target: Instance = {
      "@odata.type": "#microsoft.graph.groupAssignmentTarget",
      groupId: GROUP_G,
      deviceAndAppManagementAssignmentFilterId: null,
    };
    if (form === "none")
      target.deviceAndAppManagementAssignmentFilterType = "none";
    if (form === "null")
      target.deviceAndAppManagementAssignmentFilterType = null;
    return [{ target }];
  };
  const projectAssigned = (assignments: unknown[]) => {
    const snapshot = project([choice(ROOT, "1")]);
    const item = snapshot.sections[0].items[0];
    item.data.assignments = assignments;
    return snapshot;
  };

  it("reports no assignment change between the forms", () => {
    const forms = ["none", "null", "omitted"] as const;
    for (const a of forms)
      for (const b of forms)
        expect([
          a,
          b,
          diffSnapshots(
            projectAssigned(withFilter(a)),
            projectAssigned(withFilter(b)),
          ).policies,
        ]).toEqual([a, b, []]);
  });

  it("still reports a filter that applies", () => {
    const filtered = [
      {
        target: {
          "@odata.type": "#microsoft.graph.groupAssignmentTarget",
          groupId: GROUP_G,
          deviceAndAppManagementAssignmentFilterId:
            "00000000-0000-0000-0000-0000000000f1",
          deviceAndAppManagementAssignmentFilterType: "include",
        },
      },
    ];
    const diff = diffSnapshots(
      projectAssigned(withFilter("omitted")),
      projectAssigned(filtered),
    );
    expect(diff.policies.map((policy) => policy.kind)).toEqual(["changed"]);
  });
});

describe("review: excluding all users excludes include targets that cannot be read", () => {
  it("targets nobody with an unreadable include entry", () => {
    const result = capabilityOf(
      methodsData({
        id: "Sms",
        state: "enabled",
        includeTargets: [{ targetType: "group" }, group(GROUP_G)],
        excludeTargets: [ALL],
      }),
      WEAK,
    );
    expect(result.status).toBe("enforced");
    expect(checkOf(result, "Sms")).toMatchObject({
      result: "matches",
      actualValue: "Enabled, every include target excluded",
    });
  });
});
