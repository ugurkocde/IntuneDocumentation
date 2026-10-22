import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
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
  groupCollection,
  pack,
  simpleCollection,
  simpleInteger,
  simpleSecret,
  simpleString,
  templated,
  tenantPolicy,
} from "./fixtures";

const ALPHA = "synthetic_bench_alpha";
const BETA = "synthetic_bench_beta";
const LENGTH = "synthetic_bench_length";

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

  for (const [label, instance] of unreadable)
    it(`is Review with ${label}`, () => {
      const run = assess([tenantPolicy({ settings: [instance] })]);
      expect(statusOf(run, LENGTH)).toEqual([
        "Review",
        "Review",
        "unreadableValue",
      ]);
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

  it("is Review notAssigned when one matching policy is assigned and another is not", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(ALPHA, "1")] }),
      tenantPolicy({ settings: [choice(ALPHA, "1")], assignments: [] }),
    ]);
    expect(statusOf(run, ALPHA)).toEqual(["Present", "Review", "notAssigned"]);
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

  it("keeps a readable difference on an unassigned policy a Fail", () => {
    const run = assess([
      tenantPolicy({ settings: [choice(BETA, "false")], assignments: [] }),
    ]);
    expect(statusOf(run, BETA)).toEqual(["Different", "Fail", undefined]);
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
