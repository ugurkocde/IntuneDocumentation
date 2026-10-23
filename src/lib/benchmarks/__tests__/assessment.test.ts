import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
import { generateBenchmarkDrafts } from "../drafts";
import {
  RESULT_LABELS,
  REASON_LABELS,
  SETTING_STATUS_LABELS,
  countsText,
  headlineLabel,
} from "../display";
import { REDACTED_VALUE } from "../../intune-policy-registry";
import {
  NOW,
  choice,
  choiceCollection,
  collection,
  deviceConfiguration,
  groupCollection,
  pack,
  simpleCollection,
  simpleInteger,
  simpleSecret,
  simpleString,
  templated,
  tenantPolicy,
} from "./fixtures";

import { unassignedAssessment } from "./export-fixtures";

const ALPHA = "synthetic_bench_alpha";
const BETA = "synthetic_bench_beta";
const LENGTH = "synthetic_bench_length";
const GROUP = "synthetic_bench_group";
const CHILD_A = "synthetic_bench_group_a";
const CHILD_B = "synthetic_bench_group_b";

const settingsPack = pack([
  {
    settings: [
      choice(ALPHA, "1"),
      choice(BETA, "true"),
      simpleInteger(LENGTH, 14),
    ],
  },
]);

function assess(
  policies: Record<string, unknown>[],
  extra: Partial<Parameters<typeof collection>[0]> = {},
  target = settingsPack,
) {
  return assessBenchmark(collection({ policies, ...extra }), target, {
    now: NOW,
  });
}

const statusOf = (
  run: ReturnType<typeof assess>,
  settingId: string,
): [string, string, string | undefined] => {
  const finding = run.settings.find((item) => item.settingId === settingId)!;
  return [finding.status, finding.result, finding.reason];
};

describe("benchmark comparison statuses", () => {
  it("matches, differs and misses on a complete collection with assigned policies", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1"), choice(BETA, "false")] }),
    ]);
    expect(run.collection.complete).toBe(true);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
    expect(statusOf(run, BETA)).toEqual(["Different", "Fail", undefined]);
    expect(statusOf(run, LENGTH)).toEqual(["Missing", "Fail", undefined]);
  });

  it("ignores template references, so a policy from a template matches the plain value", () => {
    const run = assess([
      tenantPolicy({
        settings: [templated(choice(ALPHA, "1"))],
        templateId: "00000000-0000-0000-0000-00000000b001_1",
      }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
    expect(run.settings[0]!.observations[0]!.templated).toBe(true);
  });

  it("keeps platforms apart: a value on another platform is not an observation", () => {
    const run = assess([
      tenantPolicy({ platforms: "macOS", settings: [choice(ALPHA, "1")] }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Missing", "Fail", undefined]);
  });
});

describe("Missing only when the collection proves absence", () => {
  const present = () => tenantPolicy({ settings: [choice(ALPHA, "1")] });

  it("is Missing on a complete collection", () => {
    expect(statusOf(assess([present()]), LENGTH)).toEqual([
      "Missing",
      "Fail",
      undefined,
    ]);
  });

  const incomplete: Array<[string, () => ReturnType<typeof assess>]> = [
    [
      "a section error",
      () => assess([present()], { sectionError: "Request failed" }),
    ],
    ["no completion time", () => assess([present()], { collectedAt: null })],
    [
      "a policy with incomplete settings",
      () =>
        assess([
          present(),
          tenantPolicy({ settings: [], settingsStatus: "incomplete" }),
        ]),
    ],
    [
      "a policy without collection status",
      () =>
        assess([
          present(),
          tenantPolicy({
            settings: [],
            settingsStatus: null,
            assignmentsStatus: null,
          }),
        ]),
    ],
    [
      "a fetch error for a policy",
      () => {
        const broken = tenantPolicy({ settings: [] });
        return assess([present(), broken], {
          fetchErrors: [
            {
              policyId: String(broken.id),
              policyName: String(broken.name),
              policyType: "Settings Catalog",
              familyKey: "settingsCatalog",
              error: "Settings: request failed",
              partial: true,
            },
          ],
        });
      },
    ],
    [
      "a collection level fetch error",
      () =>
        assess([present()], {
          fetchErrors: [
            {
              policyId: "collection-Settings Catalog",
              policyName: "Settings Catalog",
              policyType: "Settings Catalog",
              familyKey: "settingsCatalog",
              error: "Paging stopped",
              partial: true,
            },
          ],
        }),
    ],
    [
      "a policy without a readable platform",
      () =>
        assess([present(), tenantPolicy({ platforms: null, settings: [] })]),
    ],
  ];

  for (const [label, run] of incomplete)
    it(`is Review, never Missing, with ${label}`, () => {
      const result = run();
      expect(result.collection.complete).toBe(false);
      expect(result.collection.gaps.length).toBeGreaterThan(0);
      expect(statusOf(result, LENGTH)).toEqual([
        "Review",
        "Review",
        "collectionIncomplete",
      ]);
    });

  it("still reports a readable difference as Different on an incomplete collection", () => {
    const run = assess([tenantPolicy({ settings: [choice(BETA, "false")] })], {
      sectionError: "Request failed",
    });
    expect(statusOf(run, BETA)).toEqual(["Different", "Fail", undefined]);
  });
});

describe("a tenant root without a definition id", () => {
  const unidentified: Array<[string, Record<string, unknown>]> = [
    [
      "no settingDefinitionId",
      {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
        choiceSettingValue: { value: `${ALPHA}_1`, children: [] },
      },
    ],
    [
      "an empty settingDefinitionId",
      { ...choice(ALPHA, "1"), settingDefinitionId: "" },
    ],
  ];

  for (const [label, root] of unidentified) {
    it(`makes the collection incomplete as the only root of a policy, with ${label}`, () => {
      const run = assess([tenantPolicy({ settings: [root] })]);
      expect(run.collection.complete).toBe(false);
      expect(run.collection.gaps.join(" ")).toMatch(
        /settings were not read completely/,
      );
      for (const id of [ALPHA, LENGTH])
        expect(statusOf(run, id)).toEqual([
          "Review",
          "Review",
          "collectionIncomplete",
        ]);
      expect(generateBenchmarkDrafts(run, settingsPack).drafts).toEqual([]);
    });

    it(`keeps a match next to it from Pass, with ${label}`, () => {
      const run = assess([
        tenantPolicy({ settings: [choice(ALPHA, "1"), root] }),
      ]);
      expect(run.collection.complete).toBe(false);
      expect(statusOf(run, ALPHA)).toEqual([
        "Review",
        "Review",
        "collectionIncomplete",
      ]);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "collectionIncomplete",
      ]);
      expect(generateBenchmarkDrafts(run, settingsPack).drafts).toEqual([]);
    });
  }
});

describe("a tenant settings row without an instance", () => {
  for (const row of [{ id: "0" }, null])
    it(`makes the collection incomplete, with ${JSON.stringify(row)}`, () => {
      const run = assess([
        { ...tenantPolicy({ settings: [] }), settings: [row] },
      ]);
      expect(run.collection.complete).toBe(false);
      for (const id of [ALPHA, LENGTH])
        expect(statusOf(run, id)).toEqual([
          "Review",
          "Review",
          "collectionIncomplete",
        ]);
      expect(generateBenchmarkDrafts(run, settingsPack).drafts).toEqual([]);
    });
});

describe("settings outside the Settings Catalog (owner decision D2)", () => {
  const present = () => tenantPolicy({ settings: [choice(ALPHA, "1")] });
  const macPack = pack([
    {
      platforms: "macOS",
      settings: [choice(ALPHA, "1"), simpleInteger(LENGTH, 14)],
    },
  ]);
  const linuxPack = pack([
    { platforms: "linux", settings: [simpleInteger(LENGTH, 14)] },
  ]);

  it("stays Missing when no profile of another type exists for the platform", () => {
    const run = assess([present()], {
      other: {
        deviceConfigurations: [deviceConfiguration("macOSCustomConfiguration")],
      },
    });
    expect(run.collection.complete).toBe(true);
    expect(statusOf(run, LENGTH)).toEqual(["Missing", "Fail", undefined]);
  });

  const others: Array<[string, Partial<Parameters<typeof collection>[0]>]> = [
    [
      "a device configuration",
      {
        other: {
          deviceConfigurations: [
            deviceConfiguration("windows10CustomConfiguration"),
          ],
        },
      },
    ],
    [
      "an update ring",
      {
        other: {
          windowsUpdatePolicies: [
            deviceConfiguration("windowsUpdateForBusinessConfiguration"),
          ],
        },
      },
    ],
    [
      "an administrative template",
      {
        other: {
          administrativeTemplates: [
            { id: "synthetic-admx-1", displayName: "Synthetic ADMX" },
          ],
        },
      },
    ],
    [
      "a security baseline intent",
      {
        other: {
          securityBaselines: [
            { id: "synthetic-intent-1", templateId: "synthetic-template" },
          ],
        },
      },
    ],
    [
      "a device configuration of an unknown type",
      {
        other: {
          deviceConfigurations: [deviceConfiguration("futureConfiguration")],
        },
      },
    ],
    ["a family that was not collected", { omit: ["administrativeTemplates"] }],
  ];
  for (const [label, extra] of others)
    it(`is Review otherProfiles, never Missing, with ${label} for the platform`, () => {
      const run = assess([present()], extra);
      expect(run.collection.complete).toBe(true);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "otherProfiles",
      ]);
      expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
    });

  it("judges each platform on its own profiles", () => {
    const windowsOnly = {
      other: { administrativeTemplates: [{ id: "synthetic-admx-1" }] },
    };
    const mac = assessBenchmark(
      collection({ policies: [], ...windowsOnly }),
      macPack,
      { now: NOW },
    );
    expect(mac.settings.map((finding) => finding.status)).toEqual([
      "Missing",
      "Missing",
    ]);
    const macProfile = {
      other: {
        deviceConfigurations: [
          deviceConfiguration("macOSGeneralDeviceConfiguration"),
        ],
      },
    };
    const macElsewhere = assessBenchmark(
      collection({ policies: [], ...macProfile }),
      macPack,
      { now: NOW },
    );
    expect(macElsewhere.settings.map((finding) => finding.reason)).toEqual([
      "otherProfiles",
      "otherProfiles",
    ]);
    // An intent's platform is not collected, so it counts for every platform.
    const intent = {
      other: { securityBaselines: [{ id: "synthetic-intent-1" }] },
    };
    const macIntent = assessBenchmark(
      collection({ policies: [], ...intent }),
      macPack,
      { now: NOW },
    );
    expect(macIntent.settings.map((finding) => finding.reason)).toEqual([
      "otherProfiles",
      "otherProfiles",
    ]);
    const linux = assessBenchmark(
      collection({ policies: [], ...macProfile }),
      linuxPack,
      { now: NOW },
    );
    expect(linux.settings[0]!.status).toBe("Missing");
  });

  for (const type of ["sharedPCConfiguration", "editionUpgradeConfiguration"])
    it(`reads ${type} as a Windows only profile`, () => {
      const windowsType = {
        other: { deviceConfigurations: [deviceConfiguration(type)] },
      };
      const mac = assessBenchmark(
        collection({ policies: [], ...windowsType }),
        macPack,
        { now: NOW },
      );
      expect(mac.settings.map((finding) => finding.status)).toEqual([
        "Missing",
        "Missing",
      ]);
      const windows = assess([present()], windowsType);
      expect(statusOf(windows, LENGTH)).toEqual([
        "Review",
        "Review",
        "otherProfiles",
      ]);
    });

  it("keeps a recommendation out of the rate instead of Differs", () => {
    const target = pack(
      [{ settings: [simpleInteger(LENGTH, 14)] }],
      [{ id: "1.1", title: "Synthetic length", level: 1, settings: [LENGTH] }],
    );
    const run = assess(
      [present()],
      { other: { administrativeTemplates: [{ id: "synthetic-admx-1" }] } },
      target,
    );
    expect(run.recommendations[0]).toMatchObject({
      result: "Review",
      reason: "otherProfiles",
    });
    expect(run.levels[0]!.headline.rate).toBeNull();
    expect(REASON_LABELS.otherProfiles).toMatch(/outside the Settings Catalog/);
  });
});

describe("a pack value this app cannot read (finding 5)", () => {
  const secretPack = pack([
    { settings: [simpleSecret(LENGTH), choice(ALPHA, "1")] },
  ]);
  const wrongTypePack = pack([{ settings: [simpleInteger(LENGTH, "14")] }]);

  it("is Review packValueUnreadable, never Different, against a readable tenant value", () => {
    const run = assess(
      [tenantPolicy({ settings: [simpleString(LENGTH, "synthetic")] })],
      {},
      secretPack,
    );
    expect(statusOf(run, LENGTH)).toEqual([
      "Review",
      "Review",
      "packValueUnreadable",
    ]);
    const wrong = assess(
      [tenantPolicy({ settings: [simpleInteger(LENGTH, 15)] })],
      {},
      wrongTypePack,
    );
    expect(statusOf(wrong, LENGTH)).toEqual([
      "Review",
      "Review",
      "packValueUnreadable",
    ]);
  });

  it("is never Missing when the setting is absent", () => {
    const run = assess(
      [tenantPolicy({ settings: [choice(ALPHA, "1")] })],
      {},
      secretPack,
    );
    expect(statusOf(run, LENGTH)).toEqual([
      "Review",
      "Review",
      "packValueUnreadable",
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
  });

  it("still reports a readable difference elsewhere in the same root", () => {
    const groupPack = pack([
      {
        settings: [
          groupCollection(GROUP, [
            [simpleSecret(CHILD_A), choice(CHILD_B, "1")],
          ]),
        ],
      },
    ]);
    const tenant = groupCollection(GROUP, [
      [simpleString(CHILD_A, "x"), choice(CHILD_B, "2")],
    ]);
    const run = assessBenchmark(
      collection({ policies: [tenantPolicy({ settings: [tenant] })] }),
      groupPack,
      {
        now: NOW,
      },
    );
    expect(statusOf(run, GROUP)).toEqual(["Different", "Fail", undefined]);
  });
});

describe("Different only with a readable observed value", () => {
  const unreadable: Array<[string, Record<string, unknown>]> = [
    ["a secret value", simpleSecret(LENGTH, "token")],
    ["a secret value without a value", simpleSecret(LENGTH)],
    ["a redacted value", simpleInteger(LENGTH, REDACTED_VALUE)],
    ["an integer of the wrong type", simpleInteger(LENGTH, "15")],
    [
      "a value without its type",
      { ...simpleInteger(LENGTH, 15), simpleSettingValue: { value: 15 } },
    ],
    [
      "an undocumented instance type",
      {
        ...simpleInteger(LENGTH, 15),
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationFutureSettingInstance",
      },
    ],
    [
      "a dropped value",
      {
        ...simpleInteger(LENGTH, 15),
        simpleSettingValue: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
        },
      },
    ],
  ];

  unreadable.push(
    ["an integer above the Int32 range", simpleInteger(LENGTH, 2147483648)],
    ["an integer below the Int32 range", simpleInteger(LENGTH, -2147483649)],
  );

  for (const [label, instance] of unreadable)
    it(`is Review with ${label}`, () => {
      const run = assess([tenantPolicy({ settings: [instance] })]);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "unreadableValue",
      ]);
    });

  it("reads the Int32 bounds as readable integers", () => {
    for (const value of [2147483647, -2147483648])
      expect(
        statusOf(
          assess([tenantPolicy({ settings: [simpleInteger(LENGTH, value)] })]),
          LENGTH,
        ),
      ).toEqual(["Different", "Fail", undefined]);
  });

  it("treats a pack integer outside the Int32 range as unreadable and drafts nothing", () => {
    for (const value of [2147483648, -2147483649]) {
      const target = pack([{ settings: [simpleInteger(LENGTH, value)] }]);
      const run = assess([tenantPolicy({ settings: [] })], {}, target);
      expect(run.collection.complete).toBe(true);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "packValueUnreadable",
      ]);
      expect(generateBenchmarkDrafts(run, target).drafts).toEqual([]);
    }
  });

  it("is Different with a readable integer that differs, and Present when it matches", () => {
    expect(
      statusOf(
        assess([tenantPolicy({ settings: [simpleInteger(LENGTH, 15)] })]),
        LENGTH,
      ),
    ).toEqual(["Different", "Fail", undefined]);
    expect(
      statusOf(
        assess([tenantPolicy({ settings: [simpleInteger(LENGTH, 14)] })]),
        LENGTH,
      ),
    ).toEqual(["Present", "Pass", undefined]);
  });

  it("is Different when a readable observation differs, even next to an unreadable one", () => {
    const run = assess([
      tenantPolicy({ settings: [simpleInteger(LENGTH, 12)] }),
      tenantPolicy({ settings: [simpleInteger(LENGTH, REDACTED_VALUE)] }),
    ]);
    expect(statusOf(run, LENGTH)).toEqual(["Different", "Fail", undefined]);
  });

  it("is Review when one observation matches and another is unreadable", () => {
    const run = assess([
      tenantPolicy({ settings: [simpleInteger(LENGTH, 14)] }),
      tenantPolicy({ settings: [simpleInteger(LENGTH, REDACTED_VALUE)] }),
    ]);
    expect(statusOf(run, LENGTH)).toEqual([
      "Review",
      "Review",
      "unreadableValue",
    ]);
  });

  it("compares string, collection and choice collection values readably", () => {
    const target = pack([
      {
        settings: [
          simpleString("synthetic_bench_text", "on"),
          simpleCollection("synthetic_bench_list", ["a", "b"]),
          choiceCollection("synthetic_bench_choices", ["x", "y"]),
        ],
      },
    ]);
    const run = assess(
      [
        tenantPolicy({
          settings: [
            simpleString("synthetic_bench_text", "on"),
            simpleCollection("synthetic_bench_list", ["a", "c"]),
            choiceCollection("synthetic_bench_choices", ["x", "y"]),
          ],
        }),
      ],
      {},
      target,
    );
    expect(run.settings.map((item) => item.status)).toEqual([
      "Present",
      "Different",
      "Present",
    ]);
    const redacted = assess(
      [
        tenantPolicy({
          settings: [
            simpleCollection("synthetic_bench_list", ["a", REDACTED_VALUE]),
          ],
        }),
      ],
      {},
      target,
    );
    expect(statusOf(redacted, "synthetic_bench_list")).toEqual([
      "Review",
      "Review",
      "unreadableValue",
    ]);
  });
});

describe("one match next to an incomplete policy", () => {
  it("is Review when another policy holding the setting is incomplete", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")] }),
      tenantPolicy({
        settings: [choice(ALPHA, "1")],
        settingsStatus: "incomplete",
      }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual([
      "Review",
      "Review",
      "collectionIncomplete",
    ]);
  });

  it("is Review when an incomplete policy may hold the setting unseen", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")] }),
      tenantPolicy({ settings: [], settingsStatus: "incomplete" }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual([
      "Review",
      "Review",
      "collectionIncomplete",
    ]);
  });

  it("is Pass when every policy was read", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")] }),
      tenantPolicy({ settings: [choice(BETA, "true")] }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
  });
});

describe("assignment of matching policies", () => {
  it("is Review notAssigned when the match is only on an unassigned policy", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Review", "notAssigned"]);
  });

  it("is Pass when one matching policy is assigned and another is not (owner decision D1)", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")] }),
      tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
  });

  it("is Pass when one matching policy is assigned and another's assignment is unknown", () => {
    const run = assess([
      tenantPolicy({
        settings: [choice(ALPHA, "1")],
        assignmentsStatus: "incomplete",
      }),
      tenantPolicy({ settings: [choice(ALPHA, "1")] }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Pass", undefined]);
  });

  it("is Review assignmentUnknown when no match is assigned and one assignment is unknown", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
      tenantPolicy({
        settings: [choice(ALPHA, "1")],
        assignmentsStatus: "incomplete",
      }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual([
      "Present",
      "Review",
      "assignmentUnknown",
    ]);
  });

  it("is Review notAssigned for a recommendation whose every match is unassigned, Pass with one assigned", () => {
    const target = pack(
      [{ settings: [choice(ALPHA, "1")] }],
      [{ id: "1.1", title: "Synthetic alpha", level: 1, settings: [ALPHA] }],
    );
    const unassigned = assess(
      [
        tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
        tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
      ],
      {},
      target,
    );
    expect(unassigned.recommendations[0]).toMatchObject({
      result: "Review",
      reason: "notAssigned",
    });
    const mixed = assess(
      [
        tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
        tenantPolicy({ settings: [choice(ALPHA, "1")] }),
      ],
      {},
      target,
    );
    expect(mixed.recommendations[0]!.result).toBe("Pass");
    expect(mixed.recommendations[0]!.reason).toBeUndefined();
  });

  it("keeps an assigned readable difference a Fail next to an unassigned match", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(BETA, "false")] }),
      tenantPolicy({ settings: [choice(BETA, "true")], assignments: [] }),
    ]);
    expect(statusOf(run, BETA)).toEqual(["Different", "Fail", undefined]);
  });

  it("is Review assignmentUnknown when an assignment target could not be read", () => {
    const unknownTarget = assess([
      tenantPolicy({
        settings: [choice(ALPHA, "1")],
        assignments: [
          {
            target: {
              "@odata.type": "#microsoft.graph.futureAssignmentTarget",
            },
          },
        ],
      }),
    ]);
    expect(statusOf(unknownTarget, ALPHA)).toEqual([
      "Present",
      "Review",
      "assignmentUnknown",
    ]);
  });

  it("treats assignments that were not read as an unknown assignment, not an incomplete collection", () => {
    const run = assess([
      tenantPolicy({
        settings: [choice(ALPHA, "1")],
        assignmentsStatus: "incomplete",
      }),
    ]);
    expect(run.collection.complete).toBe(true);
    expect(statusOf(run, ALPHA)).toEqual([
      "Present",
      "Review",
      "assignmentUnknown",
    ]);
  });

  // An unassigned policy applies to nobody: its difference counts no more
  // than its match does (owner decision D1, round 38).
  it("makes a readable difference on an unassigned policy only Review notAssignedDiffers", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(BETA, "false")], assignments: [] }),
    ]);
    expect(statusOf(run, BETA)).toEqual([
      "Review",
      "Review",
      "notAssignedDiffers",
    ]);
  });

  // Round 39: the reason says what the unassigned holders hold, so the
  // advice fits. Only a match on every holder is notAssigned.
  it("tells a matching, a differing and a mixed unassigned holding apart", () => {
    const run = unassignedAssessment();
    expect(
      run.settings.map((item) => [item.settingId, item.status, item.reason]),
    ).toEqual([
      ["synthetic_bench_alpha", "Present", "notAssigned"],
      ["synthetic_bench_length", "Review", "notAssignedDiffers"],
      ["synthetic_bench_gamma", "Review", "notAssignedMixed"],
    ]);
    expect(
      run.recommendations.map((item) => [
        item.id,
        item.result,
        item.reason,
        item.settings[0]!.reason,
      ]),
    ).toEqual([
      ["1.1", "Review", "notAssigned", "notAssigned"],
      ["1.2", "Review", "notAssignedDiffers", "notAssignedDiffers"],
      ["1.3", "Review", "notAssignedMixed", "notAssignedMixed"],
    ]);
    expect(run.levels[0]!.headline.counts).toMatchObject({ pass: 0, fail: 0 });
  });

  it("is Review collectionIncomplete, not a claim about unassigned holders, on an incomplete collection", () => {
    const run = unassignedAssessment({ complete: false });
    expect(run.collection.complete).toBe(false);
    expect(run.settings.map((item) => [item.settingId, item.reason])).toEqual([
      ["synthetic_bench_alpha", "collectionIncomplete"],
      ["synthetic_bench_length", "collectionIncomplete"],
      ["synthetic_bench_gamma", "collectionIncomplete"],
    ]);
  });

  // Round 39 review: a value that cannot be read is unknown, never a
  // difference to change. Secret and wrong-type values are real tenant data.
  const unreadableHolders = () => [
    simpleSecret(LENGTH),
    simpleInteger(LENGTH, "nine"),
  ];

  it("is Review unreadableValue, not notAssignedDiffers, when an unassigned holder cannot be read", () => {
    for (const unreadable of unreadableHolders()) {
      const run = assess([
        tenantPolicy({ settings: [simpleInteger(LENGTH, 9)], assignments: [] }),
        tenantPolicy({ settings: [unreadable], assignments: [] }),
      ]);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "unreadableValue",
      ]);
    }
  });

  it("passes an assigned match next to an unassigned value that cannot be read", () => {
    for (const unreadable of unreadableHolders()) {
      const run = assess([
        tenantPolicy({ settings: [simpleInteger(LENGTH, 14)] }),
        tenantPolicy({ settings: [unreadable], assignments: [] }),
      ]);
      expect(statusOf(run, LENGTH)).toEqual(["Present", "Pass", undefined]);
      expect(run.levels[0]!.headline.counts).toMatchObject({ pass: 1 });
    }
  });

  it("keeps an unreadable value on an assigned policy Review next to an assigned match", () => {
    for (const unreadable of unreadableHolders()) {
      const run = assess([
        tenantPolicy({ settings: [simpleInteger(LENGTH, 14)] }),
        tenantPolicy({ settings: [unreadable] }),
      ]);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "unreadableValue",
      ]);
    }
  });

  it("never reads an unassigned value that cannot be read as a match", () => {
    for (const unreadable of unreadableHolders()) {
      const alone = assess([
        tenantPolicy({ settings: [unreadable], assignments: [] }),
      ]);
      expect(statusOf(alone, LENGTH)).toEqual([
        "Review",
        "Review",
        "unreadableValue",
      ]);
      const withMatch = assess([
        tenantPolicy({
          settings: [simpleInteger(LENGTH, 14)],
          assignments: [],
        }),
        tenantPolicy({ settings: [unreadable], assignments: [] }),
      ]);
      expect(statusOf(withMatch, LENGTH)).toEqual([
        "Present",
        "Review",
        "notAssigned",
      ]);
    }
  });

  it("keeps a difference on an assigned policy a Fail next to unassigned holders", () => {
    const run = assess([
      tenantPolicy({ settings: [simpleInteger(LENGTH, 9)] }),
      tenantPolicy({ settings: [simpleInteger(LENGTH, 14)], assignments: [] }),
    ]);
    expect(statusOf(run, LENGTH)).toEqual(["Different", "Fail", undefined]);
  });
});

describe("a fetch error that concerns only assignments", () => {
  // The item and fetchErrors entry as intune-detailed-client.ts records an
  // assignments request that failed after the settings were read whole.
  const failedAssignments = (
    overrides: {
      error?: string;
      endpoint?: string;
      message?: string;
      settingsStatus?: "complete" | "incomplete";
      assignmentsStatus?: "complete" | "incomplete";
      policyId?: string;
    } = {},
  ) => {
    const policy: Record<string, unknown> = {
      ...tenantPolicy({
        settings: [choice(ALPHA, "1")],
        assignments: [],
        settingsStatus: overrides.settingsStatus ?? "complete",
        assignmentsStatus: overrides.assignmentsStatus ?? "incomplete",
      }),
      hasFetchError: true,
      fetchErrorMessage:
        overrides.message ?? overrides.error ?? "Assignments: request failed",
    };
    return {
      policy,
      fetchErrors: [
        {
          policyId: overrides.policyId ?? String(policy.id),
          policyName: String(policy.name),
          policyType: "Settings Catalog",
          familyKey: "settingsCatalog",
          endpoint:
            overrides.endpoint ??
            `/deviceManagement/configurationPolicies('${String(policy.id)}')`,
          error: overrides.error ?? "Assignments: request failed",
          partial: true,
        },
      ],
    };
  };

  const recommendationPack = pack(
    [{ settings: [choice(ALPHA, "1"), simpleInteger(LENGTH, 14)] }],
    [
      {
        id: "1.1",
        title: "Synthetic alpha",
        level: 1,
        settings: [ALPHA],
      },
      {
        id: "1.2",
        title: "Synthetic length",
        level: 1,
        settings: [LENGTH],
      },
    ],
  );

  it("keeps the family complete and makes only that policy's assignment unknown", () => {
    const { policy, fetchErrors } = failedAssignments();
    const run = assessBenchmark(
      collection({ policies: [policy], fetchErrors }),
      recommendationPack,
      { now: NOW },
    );
    expect(run.collection).toMatchObject({ complete: true, gaps: [] });
    expect(
      run.recommendations.map((item) => [item.id, item.result, item.reason]),
    ).toEqual([
      ["1.1", "Review", "assignmentUnknown"],
      ["1.2", "Fail", undefined],
    ]);
    expect(statusOf(run, LENGTH)).toEqual(["Missing", "Fail", undefined]);
  });

  it("keeps a readable difference on that policy a Fail", () => {
    const { policy, fetchErrors } = failedAssignments();
    policy.settings = [{ id: "0", settingInstance: choice(ALPHA, "2") }];
    expect(statusOf(assess([policy], { fetchErrors }), ALPHA)).toEqual([
      "Different",
      "Fail",
      undefined,
    ]);
  });

  const familyWide: Array<[string, Parameters<typeof failedAssignments>[0]]> = [
    [
      "a settings step next to the assignments step",
      { error: "Settings: request failed; Assignments: request failed" },
    ],
    [
      "settings marked incomplete",
      { settingsStatus: "incomplete", assignmentsStatus: "incomplete" },
    ],
    [
      "assignments marked complete despite the error",
      { assignmentsStatus: "complete" },
    ],
    [
      "an endpoint naming the settings relation",
      {
        endpoint:
          "/deviceManagement/configurationPolicies('synthetic')/settings",
      },
    ],
    [
      "an item message with a settings step",
      { message: "Settings: request failed; Assignments: request failed" },
    ],
    [
      "an assignments error for no collected policy",
      { policyId: "collection-Settings Catalog" },
    ],
  ];

  for (const [label, overrides] of familyWide)
    it(`stays family wide with ${label}`, () => {
      const { policy, fetchErrors } = failedAssignments(overrides);
      const run = assess([policy], { fetchErrors });
      expect(run.collection.complete).toBe(false);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "collectionIncomplete",
      ]);
    });
});

describe("profile choice", () => {
  it("is Review when the pack holds two values for one definition", () => {
    const target = pack([
      { settings: [choice(ALPHA, "1")] },
      { settings: [choice(ALPHA, "2")] },
    ]);
    const run = assess(
      [tenantPolicy({ settings: [choice(ALPHA, "1")] })],
      {},
      target,
    );
    expect(run.settings.map((item) => [item.status, item.reason])).toEqual([
      ["Review", "profileChoice"],
      ["Review", "profileChoice"],
    ]);
  });
});

describe("settings headline", () => {
  it("is Pass / (Pass + Fail), with Review and Not assessed counted outside the rate", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1"), choice(BETA, "false")] }),
      tenantPolicy({ settings: [simpleInteger(LENGTH, REDACTED_VALUE)] }),
    ]);
    const headline = run.levels[0]!.headline;
    expect(run.basis).toBe("settings");
    expect(headline.counts).toEqual({
      pass: 1,
      fail: 1,
      review: 1,
      notAssessed: 0,
    });
    expect(headline.rate).toBe(0.5);
  });

  it("is null when nothing could be assessed, never zero", () => {
    const run = assess(
      [tenantPolicy({ settings: [simpleInteger(LENGTH, REDACTED_VALUE)] })],
      {
        sectionError: "Request failed",
      },
    );
    expect(
      run.levels[0]!.headline.counts.pass + run.levels[0]!.headline.counts.fail,
    ).toBe(0);
    expect(run.levels[0]!.headline.rate).toBeNull();
  });

  it("leaves an unreadable value out of the rate instead of counting it as Differs", () => {
    const rate = (length: unknown) =>
      assess([
        tenantPolicy({
          settings: [
            choice(ALPHA, "1"),
            choice(BETA, "false"),
            simpleInteger(LENGTH, length),
          ],
        }),
      ]).levels[0]!.headline.rate;
    const without = assess(
      [tenantPolicy({ settings: [choice(ALPHA, "1"), choice(BETA, "false")] })],
      {},
      pack([{ settings: [choice(ALPHA, "1"), choice(BETA, "true")] }]),
    ).levels[0]!.headline.rate;
    expect(rate(REDACTED_VALUE)).toBe(without);
    expect(rate(REDACTED_VALUE)).toBeGreaterThan(rate(15)!);
  });
});

describe("grouped roots", () => {
  const GROUP = "synthetic_bench_group";
  const leaf = (id: string, option: string) => choice(`${GROUP}_${id}`, option);
  const groupPack = pack([
    {
      settings: [
        groupCollection(GROUP, [[leaf("one", "on"), leaf("two", "on")]]),
      ],
    },
  ]);

  it("ignores extra tenant children and matches the recommended leaves", () => {
    const run = assess(
      [
        tenantPolicy({
          settings: [
            groupCollection(GROUP, [
              [leaf("one", "on"), leaf("two", "on"), leaf("extra", "kept")],
            ]),
          ],
        }),
      ],
      {},
      groupPack,
    );
    expect(statusOf(run, GROUP)).toEqual(["Present", "Pass", undefined]);
  });

  it("is Review when a recommended leaf is unreadable and Different when a readable one differs", () => {
    const unreadableLeaf = {
      ...leaf("two", "on"),
      choiceSettingValue: { value: REDACTED_VALUE, children: [] },
    };
    expect(
      statusOf(
        assess(
          [
            tenantPolicy({
              settings: [
                groupCollection(GROUP, [[leaf("one", "on"), unreadableLeaf]]),
              ],
            }),
          ],
          {},
          groupPack,
        ),
        GROUP,
      ),
    ).toEqual(["Review", "Review", "unreadableValue"]);
    expect(
      statusOf(
        assess(
          [
            tenantPolicy({
              settings: [
                groupCollection(GROUP, [[leaf("one", "off"), unreadableLeaf]]),
              ],
            }),
          ],
          {},
          groupPack,
        ),
        GROUP,
      ),
    ).toEqual(["Different", "Fail", undefined]);
  });

  const entryOn = () => [leaf("one", "on"), leaf("two", "on")];
  const entryOff = () => [leaf("one", "off"), leaf("two", "off")];
  const twoEntryPack = pack([
    { settings: [groupCollection(GROUP, [entryOn(), entryOff()])] },
  ]);
  const groupRun = (entries: Record<string, unknown>[][]) =>
    assess(
      [tenantPolicy({ settings: [groupCollection(GROUP, entries)] })],
      {},
      twoEntryPack,
    );

  it("matches reordered entries as a multiset, never Different", () => {
    expect(statusOf(groupRun([entryOff(), entryOn()]), GROUP)).toEqual([
      "Present",
      "Pass",
      undefined,
    ]);
    // Reordered children inside an entry match as well.
    expect(
      statusOf(
        groupRun([
          [leaf("two", "off"), leaf("one", "off")],
          [leaf("two", "on"), leaf("one", "on")],
        ]),
        GROUP,
      ),
    ).toEqual(["Present", "Pass", undefined]);
  });

  it("ignores an extra tenant entry in any position", () => {
    expect(
      statusOf(
        groupRun([[leaf("extra", "kept")], entryOff(), entryOn()]),
        GROUP,
      ),
    ).toEqual(["Present", "Pass", undefined]);
  });

  it("is Different when a recommended entry has no readable match", () => {
    expect(statusOf(groupRun([entryOn()]), GROUP)).toEqual([
      "Different",
      "Fail",
      undefined,
    ]);
    // A multiset: one tenant entry cannot stand for two recommended ones.
    const twice = pack([
      { settings: [groupCollection(GROUP, [entryOn(), entryOn()])] },
    ]);
    expect(
      statusOf(
        assess(
          [tenantPolicy({ settings: [groupCollection(GROUP, [entryOn()])] })],
          {},
          twice,
        ),
        GROUP,
      ),
    ).toEqual(["Different", "Fail", undefined]);
  });

  it("is Review when the only candidate for a recommended entry is unreadable", () => {
    const unreadableTwo = {
      ...leaf("two", "off"),
      choiceSettingValue: { value: REDACTED_VALUE, children: [] },
    };
    expect(
      statusOf(
        groupRun([[leaf("one", "off"), unreadableTwo], entryOn()]),
        GROUP,
      ),
    ).toEqual(["Review", "Review", "unreadableValue"]);
  });

  it("matches nested group collections inside entries in any order", () => {
    const INNER = `${GROUP}_inner`;
    const inner = (first: string, second: string) =>
      groupCollection(INNER, [
        [choice(`${INNER}_leaf`, first)],
        [choice(`${INNER}_leaf`, second)],
      ]);
    const nestedPack = pack([
      { settings: [groupCollection(GROUP, [[inner("a", "b")], entryOn()])] },
    ]);
    const nested = (first: string, second: string) =>
      statusOf(
        assess(
          [
            tenantPolicy({
              settings: [
                groupCollection(GROUP, [entryOn(), [inner(first, second)]]),
              ],
            }),
          ],
          {},
          nestedPack,
        ),
        GROUP,
      );
    expect(nested("b", "a")).toEqual(["Present", "Pass", undefined]);
    expect(nested("b", "c")).toEqual(["Different", "Fail", undefined]);
  });

  it("judges a declared leaf inside reordered entries as a multiset", () => {
    const leafPack = pack(
      [{ settings: [groupCollection(GROUP, [entryOn(), entryOff()])] }],
      [
        {
          id: "1.1",
          title: "Synthetic group leaf one",
          level: 1,
          settings: [`${GROUP}_one`],
        },
      ],
    );
    const leafRun = (entries: Record<string, unknown>[][]) =>
      assessBenchmark(
        collection({
          policies: [
            tenantPolicy({ settings: [groupCollection(GROUP, entries)] }),
          ],
        }),
        leafPack,
        { now: NOW },
      ).recommendations[0];
    expect(leafRun([entryOff(), entryOn()])).toMatchObject({
      result: "Pass",
      settings: [{ status: "Present", result: "Pass" }],
    });
    expect(leafRun([entryOn(), entryOn()])).toMatchObject({
      result: "Fail",
      settings: [{ status: "Different", result: "Fail" }],
    });
  });

  it("is Review when a group entry has no readable children", () => {
    const broken = {
      ...groupCollection(GROUP, []),
      groupSettingCollectionValue: [{ settingValueTemplateReference: null }],
    };
    expect(
      statusOf(
        assess([tenantPolicy({ settings: [broken] })], {}, groupPack),
        GROUP,
      ),
    ).toEqual(["Review", "Review", "unreadableValue"]);
  });
});

describe("choice collections", () => {
  const CHOICES = "synthetic_bench_choices";
  const choicesPack = pack([
    { settings: [choiceCollection(CHOICES, ["a", "b", "c"])] },
  ]);
  const choicesRun = (instance: Record<string, unknown>) =>
    statusOf(
      assess([tenantPolicy({ settings: [instance] })], {}, choicesPack),
      CHOICES,
    );
  const withoutChildren = (options: string[]) => ({
    ...choiceCollection(CHOICES, options),
    choiceSettingCollectionValue: options.map((option) => ({
      value: `${CHOICES}_${option}`,
    })),
  });

  it("matches reordered entries as a multiset, never Different", () => {
    expect(choicesRun(choiceCollection(CHOICES, ["c", "a", "b"]))).toEqual([
      "Present",
      "Pass",
      undefined,
    ]);
    // Choice values may omit children; the order still does not count.
    expect(
      statusOf(
        assess(
          [tenantPolicy({ settings: [withoutChildren(["b", "c", "a"])] })],
          {},
          pack([{ settings: [withoutChildren(["a", "b", "c"])] }]),
        ),
        CHOICES,
      ),
    ).toEqual(["Present", "Pass", undefined]);
  });

  it("is Different when the entries differ, repeat or are missing or extra at a flat root", () => {
    for (const options of [
      ["c", "a", "d"],
      ["a", "a", "b"],
      ["b", "a"],
      ["c", "a", "b", "d"],
    ])
      expect(choicesRun(choiceCollection(CHOICES, options))).toEqual([
        "Different",
        "Fail",
        undefined,
      ]);
  });

  it("is Review, not Different, when a reordered entry is unreadable or of the wrong type", () => {
    for (const entry of [
      { value: REDACTED_VALUE, children: [] },
      { value: 5, children: [] },
      { children: [] },
    ])
      expect(
        choicesRun({
          ...choiceCollection(CHOICES, []),
          choiceSettingCollectionValue: [
            { value: `${CHOICES}_c`, children: [] },
            entry,
            { value: `${CHOICES}_a`, children: [] },
          ],
        }),
      ).toEqual(["Review", "Review", "unreadableValue"]);
  });

  it("matches a reordered choice collection inside a group entry", () => {
    const GROUP = "synthetic_bench_choice_group";
    const nested = (options: string[]) =>
      groupCollection(GROUP, [[choiceCollection(`${GROUP}_choices`, options)]]);
    const target = pack([{ settings: [nested(["x", "y"])] }]);
    const run = (options: string[]) =>
      statusOf(
        assess([tenantPolicy({ settings: [nested(options)] })], {}, target),
        GROUP,
      );
    expect(run(["y", "x"])).toEqual(["Present", "Pass", undefined]);
    expect(run(["y", "z"])).toEqual(["Different", "Fail", undefined]);
  });
});

describe("review round fixes", () => {
  it("is Different when a flat root's own readable value differs, even with an unreadable tenant child", () => {
    const run = assess([
      tenantPolicy({
        settings: [
          choice(ALPHA, "2", [
            simpleSecret("synthetic_bench_alpha_secret", "token"),
          ]),
        ],
      }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Different", "Fail", undefined]);
    const same = assess([
      tenantPolicy({
        settings: [
          choice(ALPHA, "1", [
            simpleSecret("synthetic_bench_alpha_secret", "token"),
          ]),
        ],
      }),
    ]);
    expect(statusOf(same, ALPHA)).toEqual(["Different", "Fail", undefined]);
  });

  it("is Review, not Different, for a wrong typed entry of a nested choice collection", () => {
    const GROUP = "synthetic_bench_nested";
    const nested = (entry: unknown) =>
      groupCollection(GROUP, [
        [
          {
            ...choiceCollection(`${GROUP}_choices`, ["x"]),
            choiceSettingCollectionValue: [entry],
          },
        ],
      ]);
    const target = pack([
      {
        settings: [
          groupCollection(GROUP, [
            [choiceCollection(`${GROUP}_choices`, ["x"])],
          ]),
        ],
      },
    ]);
    for (const entry of [
      { value: 5, children: [] },
      { children: [] },
      { value: REDACTED_VALUE, children: [] },
    ])
      expect(
        statusOf(
          assess([tenantPolicy({ settings: [nested(entry)] })], {}, target),
          GROUP,
        ),
      ).toEqual(["Review", "Review", "unreadableValue"]);
    expect(
      statusOf(
        assess(
          [
            tenantPolicy({
              settings: [nested({ value: `${GROUP}_choices_y`, children: [] })],
            }),
          ],
          {},
          target,
        ),
        GROUP,
      ),
    ).toEqual(["Different", "Fail", undefined]);
  });

  describe("a malformed child entry is unreadable at its parent", () => {
    const GROUP = "synthetic_bench_malformed";
    const leaf = (id: string) => choice(`${GROUP}_${id}`, "on");
    const target = pack(
      [
        {
          settings: [
            groupCollection(GROUP, [[leaf("one"), leaf("two")]]),
            choice(ALPHA, "1", [leaf("choice")]),
          ],
        },
      ],
      [
        {
          id: "4.1",
          title: "Synthetic nested child",
          level: 1,
          settings: [`${GROUP}_two`],
        },
        {
          id: "4.2",
          title: "Synthetic choice child",
          level: 1,
          settings: [`${GROUP}_choice`],
        },
        {
          id: "4.3",
          title: "Synthetic root",
          level: 1,
          settings: [GROUP],
        },
      ],
    );
    const malformed = [
      {},
      { "@odata.type": "#microsoft.graph.synthetic" },
      { ...leaf("empty"), settingDefinitionId: "" },
    ];
    const run = (child: Record<string, unknown>) =>
      assess(
        [
          tenantPolicy({
            settings: [
              groupCollection(GROUP, [[leaf("one"), child]]),
              choice(ALPHA, "1", [child]),
            ],
          }),
        ],
        {},
        target,
      );

    it("makes a root result Review, never Missing or Different, on a complete collection", () => {
      for (const child of malformed) {
        const result = run(child);
        expect(result.collection.complete).toBe(true);
        expect(statusOf(result, GROUP)).toEqual([
          "Review",
          "Review",
          "unreadableValue",
        ]);
        expect(statusOf(result, ALPHA)).toEqual([
          "Review",
          "Review",
          "unreadableValue",
        ]);
        expect(
          result.recommendations.find((item) => item.id === "4.3")?.result,
        ).toBe("Review");
      }
    });

    it("makes a nested child recommendation Review, never Fail", () => {
      for (const child of malformed)
        expect(
          run(child)
            .recommendations.filter((item) => item.id !== "4.3")
            .map((item) => [item.id, item.result]),
        ).toEqual([
          ["4.1", "Review"],
          ["4.2", "Review"],
        ]);
      // A readable child still decides on its own.
      expect(
        run(leaf("two")).recommendations.map((item) => [item.id, item.result]),
      ).toEqual([
        ["4.1", "Pass"],
        ["4.2", "Fail"],
        ["4.3", "Pass"],
      ]);
    });
  });

  describe("a pack descendant below an unreadable pack parent", () => {
    const GROUP = "synthetic_bench_hidden";
    const ROOT = "synthetic_bench_hidden_root";
    const DESCENDANT = "synthetic_bench_hidden_descendant";
    const leaf = (id: string) => choice(id, "on");
    // A child entry without a definition id, holding a valid descendant.
    const hidden = () => ({
      ...choice("synthetic_bench_hidden_parent", "on", [leaf(DESCENDANT)]),
      settingDefinitionId: "",
    });
    const recommendations = [
      {
        id: "5.1",
        title: "Synthetic hidden descendant",
        level: 1 as const,
        settings: [DESCENDANT],
      },
    ];
    const roots: Array<[string, string, Record<string, unknown>]> = [
      [
        "a group root",
        GROUP,
        groupCollection(GROUP, [[leaf(`${GROUP}_one`), hidden()]]),
      ],
      ["a choice root", ROOT, choice(ROOT, "1", [hidden()])],
    ];

    for (const [label, rootId, root] of roots)
      it(`is Review packValueUnreadable under ${label} on a complete, empty collection`, () => {
        const target = pack([{ settings: [root] }], recommendations);
        const run = assess([tenantPolicy({ settings: [] })], {}, target);
        expect(run.collection.complete).toBe(true);
        expect(statusOf(run, rootId)).toEqual([
          "Review",
          "Review",
          "packValueUnreadable",
        ]);
        const [item] = run.recommendations;
        expect([item!.result, item!.reason]).toEqual([
          "Review",
          "packValueUnreadable",
        ]);
        expect(item!.settings.map((setting) => setting.status)).toEqual([
          "Review",
        ]);
        expect(run.levels[0]!.headline.rate).toBeNull();
        expect(generateBenchmarkDrafts(run, target).drafts).toEqual([]);
      });

    it("is Review packValueUnreadable for a readable descendant of an unreadable pack parent", () => {
      const parent = (value: string, children: Record<string, unknown>[]) => ({
        ...choice(ROOT, "1", children),
        choiceSettingValue: { value, children },
      });
      const target = pack(
        [{ settings: [parent("", [leaf(DESCENDANT)])] }],
        recommendations,
      );
      const outcome = (tenant: Record<string, unknown>[]) => {
        const run = assess([tenantPolicy({ settings: tenant })], {}, target);
        expect(run.collection.complete).toBe(true);
        const [item] = run.recommendations;
        return [item!.result, item!.reason];
      };
      expect(outcome([])).toEqual(["Review", "packValueUnreadable"]);
      expect(outcome([parent(`${ROOT}_1`, [leaf(DESCENDANT)])])).toEqual([
        "Review",
        "packValueUnreadable",
      ]);
      // A readable tenant difference below the unreadable pack parent is no
      // difference either: which option the pack selects is not certain.
      expect(
        outcome([parent(`${ROOT}_1`, [choice(DESCENDANT, "off")])]),
      ).toEqual(["Review", "packValueUnreadable"]);
    });
  });

  it("does not read a sibling id that extends another id with a dot as its child", () => {
    const GROUP = "synthetic.bench.payload";
    const target = pack(
      [
        {
          settings: [
            groupCollection(GROUP, [
              [
                choice("synthetic.bench.a", "on"),
                choice("synthetic.bench.a.b", "on"),
              ],
            ]),
          ],
        },
      ],
      [
        {
          id: "3.1",
          title: "Synthetic dotted",
          level: 1,
          settings: ["synthetic.bench.a"],
        },
      ],
    );
    const run = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            settings: [
              groupCollection(GROUP, [
                [
                  choice("synthetic.bench.a", "on"),
                  choice("synthetic.bench.a.b", "off"),
                ],
              ]),
            ],
          }),
        ],
      }),
      target,
      { now: NOW },
    );
    expect(run.recommendations[0]!.result).toBe("Pass");
  });
});

describe("display labels", () => {
  it("uses Matches, Differs, Needs review and Not assessed", () => {
    expect(RESULT_LABELS).toEqual({
      Pass: "Matches",
      Fail: "Differs",
      Review: "Needs review",
      "Not assessed": "Not assessed",
    });
  });

  it("never says compliant, score or certified", () => {
    const texts = [
      ...Object.values(RESULT_LABELS),
      ...Object.values(SETTING_STATUS_LABELS),
      ...Object.values(REASON_LABELS),
      headlineLabel("recommendations"),
      headlineLabel("settings"),
      countsText({ pass: 1, fail: 2, review: 3, notAssessed: 4 }),
    ].join(" ");
    expect(texts).not.toMatch(/complian|score|certif/i);
  });
});
