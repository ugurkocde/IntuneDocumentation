import { describe, expect, it } from "vitest";
import { assessBenchmark, assessmentResults } from "../assessment";
import { benchmarkDraftsReadme, generateBenchmarkDrafts } from "../drafts";
import { FIX_ACTION_ORDER, actionsForResult, buildFixPlan, nextStepText } from "../fix-plan";
import { combineLevelAssessments } from "../assessment";
import { benchmarkCsv } from "../export";
import {
  ASSIGNED,
  NOW,
  choice,
  collection,
  deviceConfiguration,
  groupCollection,
  pack,
  simpleInteger,
  simpleSecret,
  simpleString,
  tenantPolicy,
} from "./fixtures";
import { richAssessment, unassignedAssessment, unassignedPack } from "./export-fixtures";

// Synthetic setting ids; every group of the plan gets at least one.
const DIFFERS = "synthetic_plan_differs";
const WAITS_A = "synthetic_plan_waits_a";
const WAITS_B = "synthetic_plan_waits_b";
const OTHER_VALUE = "synthetic_plan_other_value";
const ELSEWHERE = "synthetic_plan_elsewhere";
const ABSENT_MAC = "synthetic_plan_absent_mac";
const SECRET = "synthetic_plan_secret";
const UNKNOWN_REACH = "synthetic_plan_unknown_reach";
const CHOICE = "synthetic_plan_choice";

const ASSIGNED_POLICY = "Synthetic assigned baseline";
const WAITING_POLICY = "Synthetic waiting profile";
const OTHER_POLICY = "Synthetic other value profile";
const SECRET_POLICY = "Synthetic secret profile";
const UNREAD_POLICY = "Synthetic unread assignments";

const GROUP_ID = "00000000-0000-0000-0000-0000000000aa";

function planPack() {
  return pack(
    [
      {
        name: "Synthetic plan pack policy",
        settings: [
          choice(DIFFERS, "1"),
          choice(WAITS_A, "1"),
          choice(WAITS_B, "1"),
          choice(OTHER_VALUE, "1"),
          choice(ELSEWHERE, "1"),
          simpleString(SECRET, "synthetic"),
          choice(UNKNOWN_REACH, "1"),
          choice(CHOICE, "1"),
        ],
      },
      { name: "Synthetic plan pack policy 2", settings: [choice(CHOICE, "2")] },
      { name: "Synthetic plan pack policy for macOS", platforms: "macOS", settings: [choice(ABSENT_MAC, "true")] },
    ],
    [
      { id: "1.1", title: "Synthetic recommendation title 1", level: 1, settings: [DIFFERS] },
      { id: "1.2", title: "Synthetic recommendation title 2", level: 1, settings: [WAITS_A] },
      { id: "1.3", title: "Synthetic recommendation title 3", level: 1, settings: [WAITS_B] },
      { id: "1.4", title: "Synthetic recommendation title 4", level: 1, settings: [OTHER_VALUE] },
      { id: "1.5", title: "Synthetic recommendation title 5", level: 1, settings: [ELSEWHERE] },
      { id: "1.6", title: "Synthetic recommendation title 6", level: 1, settings: [ABSENT_MAC] },
      { id: "1.7", title: "Synthetic recommendation title 7", level: 1, settings: [SECRET] },
      { id: "1.8", title: "Synthetic recommendation title 8", level: 1, settings: [UNKNOWN_REACH] },
      { id: "1.9", title: "Synthetic recommendation title 9", level: 1, settings: [CHOICE] },
    ],
  );
}

function planAssessment() {
  const data = collection({
    policies: [
      tenantPolicy({
        id: "synthetic-assigned",
        name: ASSIGNED_POLICY,
        settings: [choice(DIFFERS, "0")],
        assignments: [
          {
            id: "a1",
            target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: GROUP_ID },
          },
        ],
      }),
      tenantPolicy({
        id: "synthetic-waiting",
        name: WAITING_POLICY,
        settings: [choice(WAITS_A, "1"), choice(WAITS_B, "1")],
        assignments: [],
      }),
      tenantPolicy({
        id: "synthetic-other",
        name: OTHER_POLICY,
        settings: [choice(OTHER_VALUE, "0")],
        assignments: [],
      }),
      tenantPolicy({ id: "synthetic-secret", name: SECRET_POLICY, settings: [simpleSecret(SECRET)] }),
      tenantPolicy({
        id: "synthetic-unread",
        name: UNREAD_POLICY,
        settings: [choice(UNKNOWN_REACH, "1")],
        assignmentsStatus: "incomplete",
      }),
    ],
    // A Windows device configuration: absent Windows settings may be set
    // there (otherProfiles); the macOS setting is proven missing.
    other: { deviceConfigurations: [deviceConfiguration("windows10CustomConfiguration")] },
  });
  data.groupNames = new Map([[GROUP_ID, "Synthetic pilot group"]]);
  return assessBenchmark(data, planPack(), { now: NOW });
}

describe("fix plan", () => {
  const assessment = planAssessment();
  const plan = buildFixPlan(assessment);
  const kinds = plan.actions.map((action) => action.kind);
  const of = (kind: string) => plan.actions.filter((action) => action.kind === kind);

  it("checks that the fixture reaches every engine verdict the plan groups", () => {
    const byId = Object.fromEntries(assessment.recommendations.map((item) => [item.id, [item.result, item.reason]]));
    expect(byId).toEqual({
      "1.1": ["Fail", undefined],
      "1.2": ["Review", "notAssigned"],
      "1.3": ["Review", "notAssigned"],
      "1.4": ["Review", "notAssignedDiffers"],
      "1.5": ["Review", "otherProfiles"],
      "1.6": ["Fail", undefined],
      "1.7": ["Review", "unreadableValue"],
      "1.8": ["Review", "assignmentUnknown"],
      "1.9": ["Review", "profileChoice"],
    });
  });

  it("orders the groups by impact", () => {
    expect(kinds).toEqual([
      "changeValue",
      "assignPolicy",
      "changeBeforeAssign",
      "checkOtherProfiles",
      "checkValue",
      "checkAssignment",
      "chooseValue",
      "addSetting",
    ]);
    const order = kinds.map((kind) => FIX_ACTION_ORDER.indexOf(kind));
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("changes a differing value on an assigned policy, with its reach and both values", () => {
    const [action] = of("changeValue");
    expect(action!.policy).toMatchObject({ id: "synthetic-assigned", name: ASSIGNED_POLICY, assignment: "assigned" });
    expect(action!.text).toBe(
      `Change 1 setting in policy ${ASSIGNED_POLICY} (assigned to Group: Synthetic pilot group) to the recommended value.`,
    );
    expect(action!.settings).toEqual([
      expect.objectContaining({ settingId: DIFFERS, current: "0", recommended: "1" }),
    ]);
    expect(action!.settings[0]!.text).toBe(`Change ${DIFFERS} in policy ${ASSIGNED_POLICY} from 0 to 1.`);
    expect(action!.results.map((result) => result.id)).toEqual(["1.1"]);
  });

  it("assigns a policy only for the results it would let match, counted by the engine", () => {
    const assign = of("assignPolicy");
    // The policy with another value only is never advised for assignment.
    expect(assign.map((action) => action.policy!.name)).toEqual([WAITING_POLICY]);
    expect(assign[0]!.unlocks).toEqual({ judged: 2, matches: 2, differs: 0, regressions: 0 });
    expect(assign[0]!.results.map((result) => result.id)).toEqual(["1.2", "1.3"]);
    expect(assign[0]!.text).toBe(
      `Assign policy ${WAITING_POLICY}, which would let 2 results be judged: 2 would match. Assign it to a pilot group first.`,
    );
  });

  it("names the value to change before assigning a policy that holds another value", () => {
    const [action] = of("changeBeforeAssign");
    expect(action!.policy!.name).toBe(OTHER_POLICY);
    expect(action!.settings[0]!.text).toBe(`Change ${OTHER_VALUE} in policy ${OTHER_POLICY} from 0 to 1 before assigning it.`);
  });

  it("names the older profile families that may set an absent setting", () => {
    const [action] = of("checkOtherProfiles");
    expect(action!.platforms).toBe("windows10");
    expect(action!.text).toBe(
      "Check device configuration profiles (Windows) for 1 setting not found in the Settings Catalog.",
    );
    expect(action!.results.map((result) => result.id)).toEqual(["1.5"]);
  });

  it("says which unreadable cause applies and why an assignment is unknown", () => {
    const [unreadable] = of("checkValue");
    expect(unreadable!.policy!.name).toBe(SECRET_POLICY);
    expect(unreadable!.settings[0]).toMatchObject({ cause: "secret" });
    expect(unreadable!.settings[0]!.text).toContain("secret");
    const [unknown] = of("checkAssignment");
    expect(unknown!.policy!.name).toBe(UNREAD_POLICY);
    expect(unknown!.text).toBe(
      `Check the assignments of policy ${UNREAD_POLICY}. Its assignments were not read completely; collect again to read them.`,
    );
    expect(plan.advice[assessment.settings.find((finding) => finding.settingId === UNKNOWN_REACH)!.key]).toContain(
      "collect again to read them",
    );
  });

  it("adds a missing setting, with a draft only where drafts.ts generates one", () => {
    const [action] = of("addSetting");
    expect(action!.settings).toEqual([
      expect.objectContaining({ settingId: ABSENT_MAC, current: "Not configured", recommended: "true", draft: "available" }),
    ]);
    const drafts = generateBenchmarkDrafts(assessment, planPack());
    expect(drafts.drafts.flatMap((draft) => draft.settingIds)).toEqual([ABSENT_MAC]);
  });

  it("gives every result that is not Matches or Not assessed at least one action", () => {
    expect(plan.withoutAction).toBe(0);
    for (const result of assessmentResults(assessment))
      if (result.result !== "Pass" && result.result !== "Not assessed") {
        expect(actionsForResult(plan, result.key).length, result.id).toBeGreaterThan(0);
        expect(nextStepText(plan, result), result.id).not.toBe("");
      }
  });

  it("is the advice the drafts README writes", () => {
    const drafts = generateBenchmarkDrafts(assessment, planPack(), plan);
    const readme = benchmarkDraftsReadme(drafts, assessment);
    for (const gap of drafts.notGenerated) {
      const finding = assessment.settings.find((item) => item.settingId === gap.settingId)!;
      expect(gap.reason.startsWith(plan.advice[finding.key]!)).toBe(true);
      expect(readme).toContain(gap.reason);
    }
    expect(drafts.changes).toEqual([
      expect.objectContaining({ settingId: DIFFERS, policies: [ASSIGNED_POLICY] }),
    ]);
  });

  it("names no pack policy and no recommendation title", () => {
    const text = JSON.stringify(plan);
    for (const policy of planPack().policies as Array<{ name: string }>) expect(text).not.toContain(policy.name);
    for (const item of assessment.recommendations) expect(text).not.toContain(item.title);
    expect(text).not.toMatch(/[\u2013\u2014]| - /);
  });
});

describe("fix plan on the shared fixtures", () => {
  it("advises the matching unassigned policy, never the differing one, for mixed holders", () => {
    const assessment = unassignedAssessment();
    const plan = buildFixPlan(assessment);
    const assign = plan.actions.filter((action) => action.kind === "assignPolicy");
    expect(assign.map((action) => action.policy!.name)).toEqual(["Synthetic unassigned match"]);
    const drafts = generateBenchmarkDrafts(assessment, unassignedPack(), plan);
    expect(drafts.notGenerated.map((gap) => gap.reason)).toEqual(
      assessment.settings
        .filter((finding) => finding.result !== "Pass")
        .map((finding) => expect.stringContaining(plan.advice[finding.key]!)),
    );
  });

  it("asks for a new collection when the collection is incomplete", () => {
    const plan = buildFixPlan(richAssessment({ complete: false }));
    expect(plan.actions.some((action) => action.kind === "collectAgain")).toBe(true);
    expect(plan.actions.some((action) => action.kind === "addSetting")).toBe(false);
  });

  it("checks a pack value by hand when it cannot be compared", () => {
    const plan = buildFixPlan(richAssessment());
    const [action] = plan.actions.filter((item) => item.kind === "checkPackValue");
    expect(action!.results.map((result) => result.id)).toEqual(["2.2"]);
  });

  it("does not advise assigning when the assignment is what is unknown", () => {
    const data = collection({
      policies: [tenantPolicy({ name: "Synthetic unknown", settings: [choice(WAITS_A, "1")], assignments: ASSIGNED, assignmentsStatus: "incomplete" })],
    });
    const assessment = assessBenchmark(data, pack([{ settings: [choice(WAITS_A, "1")] }]), { now: NOW });
    const plan = buildFixPlan(assessment);
    expect(plan.actions.map((action) => action.kind)).toEqual(["checkAssignment"]);
  });
});

describe("fix plan against the engine's verdicts (review findings)", () => {
  it("counts results that match now and would no longer match when a policy is assigned", () => {
    const data = collection({
      policies: [
        tenantPolicy({ name: "Synthetic assigned match", settings: [choice(WAITS_B, "1")] }),
        tenantPolicy({
          name: "Synthetic candidate",
          settings: [choice(WAITS_A, "1"), choice(WAITS_B, "0")],
          assignments: [],
        }),
      ],
    });
    const assessment = assessBenchmark(
      data,
      pack(
        [{ settings: [choice(WAITS_A, "1"), choice(WAITS_B, "1")] }],
        [
          { id: "1.1", title: "Synthetic recommendation title a", level: 1, settings: [WAITS_A] },
          { id: "1.2", title: "Synthetic recommendation title b", level: 1, settings: [WAITS_B] },
        ],
      ),
      { now: NOW },
    );
    expect(assessment.recommendations.map((item) => item.result)).toEqual(["Review", "Pass"]);
    const [assign] = buildFixPlan(assessment).actions.filter((action) => action.kind === "assignPolicy");
    expect(assign!.unlocks).toEqual({ judged: 1, matches: 1, differs: 0, regressions: 1 });
    expect(assign!.text).toBe(
      "Assign policy Synthetic candidate, which would let 1 result be judged: 1 would match, and 1 result that matches now would no longer match. Change the values it holds first. Assign it to a pilot group first.",
    );
  });

  it("attaches a change of a root only to results whose own setting differs, and never to Not assessed ones", () => {
    const ROOT = "synthetic_plan_root";
    const LEAF_X = "synthetic_plan_root_leaf_x";
    const LEAF_Y = "synthetic_plan_root_leaf_y";
    const OUTSIDE = "synthetic_plan_outside";
    const recommendedRoot = groupCollection(ROOT, [[simpleInteger(LEAF_X, 1), simpleInteger(LEAF_Y, 1)]]);
    const data = collection({
      policies: [
        tenantPolicy({ name: "Synthetic assigned group", settings: [groupCollection(ROOT, [[simpleInteger(LEAF_Y, 2)]])] }),
        tenantPolicy({
          name: "Synthetic unassigned group",
          settings: [groupCollection(ROOT, [[simpleInteger(LEAF_X, 1), simpleInteger(LEAF_Y, 2)]])],
          assignments: [],
        }),
      ],
    });
    const assessment = assessBenchmark(
      data,
      pack(
        [{ settings: [recommendedRoot] }],
        [
          { id: "1.1", title: "Synthetic recommendation title x", level: 1, settings: [LEAF_X] },
          { id: "1.2", title: "Synthetic recommendation title y", level: 1, settings: [LEAF_Y] },
          { id: "1.3", title: "Synthetic recommendation title outside", level: 1, settings: [LEAF_Y, OUTSIDE] },
        ],
      ),
      { now: NOW },
    );
    const verdicts = Object.fromEntries(assessment.recommendations.map((item) => [item.id, item.result]));
    expect(verdicts).toEqual({ "1.1": "Review", "1.2": "Fail", "1.3": "Not assessed" });
    expect(assessment.settings[0]!.status).toBe("Different");
    const plan = buildFixPlan(assessment);
    const [change] = plan.actions.filter((action) => action.kind === "changeValue");
    expect(change!.results.map((result) => result.id)).toEqual(["1.2"]);
    // A group root is named by its settings, never by entry counts.
    expect(change!.settings[0]!.text).toBe(
      `Change the settings below ${ROOT} in policy Synthetic assigned group to the recommended values.`,
    );
    expect(plan.byResult["r:1:1.3"]).toBeUndefined();
    expect(plan.byResult["r:1:1.1"]).toEqual(["assignPolicy:" + assessment.settings[0]!.observations[1]!.policyId]);
  });

  it("drafts no Level's value when the Level 1 and Level 2 packs disagree, and one when they agree", () => {
    const empty = collection({ policies: [] });
    const level = (value: string, packLevel: 1 | 2) =>
      assessBenchmark(empty, pack([{ settings: [choice(ABSENT_MAC, value)] }], undefined, packLevel), { now: NOW });
    const conflict = combineLevelAssessments([level("1", 1), level("2", 2)]);
    const conflictPlan = buildFixPlan(conflict);
    expect(conflictPlan.actions[0]!.settings.map((setting) => setting.draft)).toEqual(["levelConflict", "levelConflict"]);
    expect(generateBenchmarkDrafts(conflict, [
      pack([{ settings: [choice(ABSENT_MAC, "1")] }], undefined, 1),
      pack([{ settings: [choice(ABSENT_MAC, "2")] }], undefined, 2),
    ]).drafts).toEqual([]);
    const agree = combineLevelAssessments([level("1", 1), level("1", 2)]);
    expect(buildFixPlan(agree).actions[0]!.settings.map((setting) => setting.draft)).toEqual(["available", "duplicate"]);
  });

  it("writes Not configured only for a setting proven missing in the CSV", () => {
    const assessment = planAssessment();
    const lines = benchmarkCsv(assessment).split("\r\n");
    const row = (id: string) => lines.find((line) => line.includes(`,Recommendation,${id},`))!;
    expect(row("1.5")).toContain(",Not found in the collected Settings Catalog policies,");
    expect(row("1.5")).not.toContain("Not configured");
    expect(row("1.6")).toContain(",Not configured,");
  });
});

describe("fix plan: the policy to add a missing setting to", () => {
  const AREA_HELD = "synthetic_plan_area_held";
  const AREA_MISSING = "synthetic_plan_area_missing";
  const OTHER_HELD_A = "synthetic_plan_other_held_a";
  const OTHER_HELD_B = "synthetic_plan_other_held_b";
  const LONE_MISSING = "synthetic_plan_lone_missing";
  const MAC_MISSING = "synthetic_plan_mac_missing";
  const AREA_POLICY = "Synthetic area policy";
  const BUSY_POLICY = "Synthetic busy policy";
  const assessment = assessBenchmark(
    collection({
      policies: [
        tenantPolicy({ name: AREA_POLICY, settings: [choice(AREA_HELD, "1")] }),
        tenantPolicy({ name: BUSY_POLICY, settings: [choice(OTHER_HELD_A, "1"), choice(OTHER_HELD_B, "1")] }),
        // Never a candidate: not assigned, or created from a template.
        tenantPolicy({
          name: "Synthetic unassigned holder",
          settings: [choice(AREA_HELD, "1"), choice(OTHER_HELD_A, "1"), choice(OTHER_HELD_B, "1")],
          assignments: [],
        }),
        tenantPolicy({
          name: "Synthetic template holder",
          settings: [choice(AREA_HELD, "1"), choice(OTHER_HELD_A, "1"), choice(OTHER_HELD_B, "1")],
          templateId: "00000000-0000-0000-0000-00000000c0de_1",
        }),
      ],
    }),
    pack(
      [
        { settings: [choice(AREA_HELD, "1"), choice(AREA_MISSING, "1")] },
        { settings: [choice(OTHER_HELD_A, "1"), choice(OTHER_HELD_B, "1")] },
        { settings: [choice(LONE_MISSING, "1")] },
        { platforms: "macOS", settings: [choice(MAC_MISSING, "1")] },
      ],
      [
        { id: "1.1", title: "Synthetic area held", level: 1, settings: [AREA_HELD] },
        { id: "1.2", title: "Synthetic area missing", level: 1, settings: [AREA_MISSING] },
        { id: "2.1", title: "Synthetic other held", level: 1, settings: [OTHER_HELD_A, OTHER_HELD_B] },
        { id: "3.1", title: "Synthetic lone missing", level: 1, settings: [LONE_MISSING] },
        { id: "4.1", title: "Synthetic macOS missing", level: 1, settings: [MAC_MISSING] },
      ],
    ),
    { now: NOW },
  );
  const plan = buildFixPlan(assessment);
  const add = plan.actions.filter((action) => action.kind === "addSetting");
  const finding = (id: string) => assessment.settings.find((item) => item.settingId === id)!;

  it("prefers an assigned policy holding settings of the same benchmark area", () => {
    const action = add.find((item) => item.results.some((result) => result.id === "1.2"))!;
    expect(action.policy?.name).toBe(AREA_POLICY);
    expect(action.text).toBe(
      `Add 1 setting to policy ${AREA_POLICY} (assigned to All Users), which already holds settings of the same benchmark area; draft policies are available for 1 of them.`,
    );
    expect(plan.advice[finding(AREA_MISSING).key]).toBe(
      `Add ${AREA_MISSING} with the recommended value 1 to policy ${AREA_POLICY}, which is assigned and already holds settings of the same benchmark area. A draft policy is available.`,
    );
  });

  it("otherwise names the assigned policy holding the most settings of the platform, never an unassigned or template policy", () => {
    const action = add.find((item) => item.results.some((result) => result.id === "3.1"))!;
    expect(action.policy?.name).toBe(BUSY_POLICY);
    expect(action.text).toBe(
      `Add 1 setting to policy ${BUSY_POLICY} (assigned to All Users); draft policies are available for 1 of them.`,
    );
    const text = JSON.stringify(add);
    expect(text).not.toContain("Synthetic unassigned holder");
    expect(text).not.toContain("Synthetic template holder");
  });

  it("says any assigned policy of the platform when none holds a setting of it", () => {
    const action = add.find((item) => item.results.some((result) => result.id === "4.1"))!;
    expect(action.policy).toBeUndefined();
    expect(action.platforms).toBe("macOS");
    expect(action.text).toBe(
      "Add 1 setting to any assigned Settings Catalog policy for this platform (none holds these settings today); draft policies are available for 1 of them.",
    );
    expect(nextStepText(plan, assessmentResults(assessment).find((result) => result.id === "4.1")!)).toBe(
      `Add ${MAC_MISSING} with the recommended value 1 to any assigned Settings Catalog policy for this platform (none holds these settings today). A draft policy is available.`,
    );
  });

  it("names the same policy in the drafts README", () => {
    const packs = pack(
      [
        { settings: [choice(AREA_HELD, "1"), choice(AREA_MISSING, "1")] },
        { settings: [choice(OTHER_HELD_A, "1"), choice(OTHER_HELD_B, "1")] },
        { settings: [choice(LONE_MISSING, "1")] },
        { platforms: "macOS", settings: [choice(MAC_MISSING, "1")] },
      ],
      assessment.recommendations.map(({ id, title, settings }) => ({
        id,
        title,
        level: 1 as const,
        settings: settings.map((setting) => setting.id),
      })),
    );
    const drafts = generateBenchmarkDrafts(assessment, packs, plan);
    expect(drafts.drafts.map((draft) => [draft.settingIds, draft.addTo])).toEqual([
      [[AREA_MISSING], [AREA_POLICY]],
      [[LONE_MISSING], [BUSY_POLICY]],
      [[MAC_MISSING], []],
    ]);
    const readme = benchmarkDraftsReadme(drafts, assessment);
    expect(readme).toContain(
      `Instead of importing it, you can add its settings to policy ${AREA_POLICY}, which is assigned (as the fix plan says).`,
    );
    expect(readme).toContain(`you can add its settings to policy ${BUSY_POLICY}, which is assigned`);
  });

  it("counts a setting missing at both Levels once and names the same candidate for both", () => {
    const level = (packLevel: 1 | 2) =>
      assessBenchmark(
        collection({ policies: [tenantPolicy({ name: AREA_POLICY, settings: [choice(AREA_HELD, "1")] })] }),
        pack(
          packLevel === 1
            ? [{ settings: [choice(AREA_HELD, "1"), choice(AREA_MISSING, "1")] }]
            : // At Level 2 the setting sits in another pack policy, where no tenant policy holds anything.
              [{ settings: [choice(AREA_HELD, "1")] }, { settings: [choice(AREA_MISSING, "1")] }],
          undefined,
          packLevel,
        ),
        { now: NOW },
      );
    const both = combineLevelAssessments([level(1), level(2)]);
    const plan = buildFixPlan(both);
    const [action] = plan.actions.filter((item) => item.kind === "addSetting");
    expect(plan.actions.filter((item) => item.kind === "addSetting")).toHaveLength(1);
    expect(action!.text).toBe(
      `Add 1 setting to policy ${AREA_POLICY} (assigned to All Users), which already holds settings of the same benchmark area; draft policies are available for 1 of them.`,
    );
    const [first, second] = both.settings.filter((item) => item.settingId === AREA_MISSING);
    expect(plan.advice[second!.key]).toBe(
      `Another draft in this ZIP already holds this setting. Import that draft, or add the setting to policy ${AREA_POLICY}, which is assigned and already holds settings of the same benchmark area.`,
    );
    expect(plan.advice[first!.key]).toContain(`to policy ${AREA_POLICY}, which is assigned`);
  });

  it("names the candidate where the packs of two Levels disagree", () => {
    const level = (value: string, packLevel: 1 | 2) =>
      assessBenchmark(
        collection({ policies: [tenantPolicy({ name: AREA_POLICY, settings: [choice(AREA_HELD, "1")] })] }),
        pack([{ settings: [choice(AREA_HELD, "1"), choice(AREA_MISSING, value)] }], undefined, packLevel),
        { now: NOW },
      );
    const both = combineLevelAssessments([level("1", 1), level("2", 2)]);
    const advice = buildFixPlan(both).advice;
    const missing = both.settings.filter((item) => item.settingId === AREA_MISSING);
    expect(missing).toHaveLength(2);
    for (const item of missing)
      expect(advice[item.key]).toBe(
        `The packs compared recommend different values for this setting, so no draft is generated. Choose the value for your Level and set it in policy ${AREA_POLICY}, which is assigned and already holds settings of the same benchmark area.`,
      );
  });
});
