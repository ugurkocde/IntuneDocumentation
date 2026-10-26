// Round 50 review: a Level conflict across a template and a plain policy,
// and a recommendation whose children are judged differently below one
// root. Synthetic ids and names only.
import { describe, expect, it } from "vitest";
import { assessBenchmark, assessmentResults, combineLevelAssessments } from "../assessment";
import { benchmarkDraftsReadme, generateBenchmarkDrafts } from "../drafts";
import { benchmarkCsv, benchmarkJson } from "../export";
import { buildFixPlan, nextStepText } from "../fix-plan";
import {
  NOW,
  choice,
  collection,
  deviceConfiguration,
  groupCollection,
  pack,
  simpleInteger,
  simpleSecret,
  tenantPolicy,
} from "./fixtures";

const S = "synthetic_r50_conflict";
const ROOT = "synthetic_r50_root";
const A = "synthetic_r50_root_a";
const B = "synthetic_r50_root_b";

describe("Level conflict across a template and a plain policy (round 50)", () => {
  // Level 1 delivers S=5 in a template policy, Level 2 S=10 in a plain one.
  function setup() {
    const level1 = pack([{ settings: [simpleInteger(S, 5)] }], [
      { id: "1.1", title: "Synthetic r50 recommendation L1", level: 1, settings: [S] },
    ], 1);
    (level1.policies as Array<Record<string, unknown>>)[0]!.templateReference = {
      templateId: "00000000-0000-0000-0000-00000000b050",
    };
    const level2 = pack([{ settings: [simpleInteger(S, 10)] }], [
      { id: "2.1", title: "Synthetic r50 recommendation L2", level: 2, settings: [S] },
    ], 2);
    const data = collection({ policies: [] });
    const delivered = [level1, level2];
    const assessment = combineLevelAssessments(delivered.map((item) => assessBenchmark(data, item, { now: NOW })));
    return { assessment, delivered };
  }

  it("generates no draft and states the choice in every step", () => {
    const { assessment, delivered } = setup();
    expect(assessment.settings.map((finding) => [finding.packLevel, finding.status, finding.templated])).toEqual([
      [1, "Missing", true],
      [2, "Missing", false],
    ]);
    const plan = buildFixPlan(assessment);
    const conflict = "Level 1 recommends 5, Level 2 recommends 10";
    expect(Object.values(plan.levelConflicts)).toEqual([conflict, conflict]);
    const steps = plan.actions.flatMap((action) => action.settings);
    expect(steps.map((setting) => setting.draft)).toEqual(expect.not.arrayContaining(["available"]));
    for (const step of steps) {
      expect(step.levelConflict).toBe(conflict);
      expect(step.text).toContain(`${conflict}`);
      expect(step.text).toMatch(/choose the value for your target Level/i);
      expect(step.text).not.toMatch(/recommended value (5|10)|draft policy is available/);
    }
    for (const action of plan.actions) {
      expect(action.text).not.toMatch(/draft policies are available/);
      expect(action.text).toContain("for your target Level");
    }
    for (const finding of assessment.settings) {
      expect(plan.advice[finding.key]).toContain(`${conflict}`);
      expect(plan.advice[finding.key]).toContain("target Level");
    }
    const drafts = generateBenchmarkDrafts(assessment, delivered, plan);
    expect(drafts.drafts).toEqual([]);
    const readme = benchmarkDraftsReadme(drafts, assessment);
    expect(readme).not.toContain("A draft policy is available");
    for (const result of assessmentResults(assessment))
      expect(nextStepText(plan, result)).toMatch(/choose the value for your target Level/i);
  });
});

describe("children of one root judged differently (round 50)", () => {
  // Policy P holds the root with A different and B matching; another
  // policy's settings were not read, so B cannot be shown to match.
  function setup() {
    const data = collection({
      policies: [
        tenantPolicy({ name: "Synthetic r50 holder", settings: [choice(ROOT, "1", [choice(A, "0"), simpleInteger(B, 5)])] }),
        tenantPolicy({ name: "Synthetic r50 unread", settings: [], settingsStatus: "incomplete" }),
      ],
    });
    return assessBenchmark(
      data,
      pack(
        [{ settings: [choice(ROOT, "1", [choice(A, "1"), simpleInteger(B, 5)])] }],
        [{ id: "1.1", title: "Synthetic r50 recommendation children", level: 1, settings: [A, B] }],
      ),
      { now: NOW },
    );
  }

  it("keeps the change to A and asks to collect again for B", () => {
    const assessment = setup();
    const [recommendation] = assessment.recommendations;
    expect(recommendation!.settings.map((setting) => [setting.id, setting.result, setting.reason])).toEqual([
      [A, "Fail", undefined],
      [B, "Review", "collectionIncomplete"],
    ]);
    const plan = buildFixPlan(assessment);
    expect(plan.actions.map((action) => action.kind)).toEqual(["changeValue", "collectAgain"]);
    const [result] = assessmentResults(assessment);
    expect(plan.byResult[result!.key]).toEqual(plan.actions.map((action) => action.id));
    const next = nextStepText(plan, result!);
    expect(next).toContain("in policy Synthetic r50 holder");
    expect(next).toContain("Collect again");
    expect(benchmarkCsv(assessment, plan)).toContain("Collect again");
    const json = JSON.parse(benchmarkJson(assessment, { plan })) as { results: Array<{ nextAction?: string }> };
    expect(JSON.stringify(json)).toContain("Collect again");
  });
});

// Found by the property test (fix-plan-properties.test.ts).
describe("every open setting below a root gets its own step (round 50 sweep)", () => {
  const recommendations = (ids: string[][]) =>
    ids.map((settings, index) => ({ id: `1.${index + 1}`, title: `Synthetic r50 sweep ${index + 1}`, level: 1 as const, settings }));

  it("counts a check only for the results whose own setting needs it", () => {
    // A is not in the Settings Catalog while other profiles exist; the pack value of B cannot be read.
    const assessment = assessBenchmark(
      collection({ policies: [], other: { deviceConfigurations: [deviceConfiguration("windows10GeneralConfiguration")] } }),
      pack([{ settings: [groupCollection(ROOT, [[simpleInteger(A, 1), simpleSecret(B)]])] }], recommendations([[A], [B]])),
      { now: NOW },
    );
    const plan = buildFixPlan(assessment);
    const ids = (kind: string) => plan.actions.find((action) => action.kind === kind)!.results.map((result) => result.id);
    expect(ids("checkOtherProfiles")).toEqual(["1.1"]);
    expect(ids("checkPackValue")).toEqual(["1.2"]);
  });

  it("adds a setting missing below a root that only an unassigned policy holds before assigning it", () => {
    const assessment = assessBenchmark(
      collection({
        policies: [tenantPolicy({ name: "Synthetic r50 unassigned", settings: [choice(ROOT, "1", [simpleInteger(B, 5)])], assignments: [] })],
      }),
      pack([{ settings: [choice(ROOT, "1", [simpleInteger(A, 1), simpleInteger(B, 5)])] }], recommendations([[A], [B]])),
      { now: NOW },
    );
    expect(assessment.recommendations.map((item) => [item.result, item.settings[0]!.status])).toEqual([
      ["Fail", "Missing"],
      ["Review", "Present"],
    ]);
    const plan = buildFixPlan(assessment);
    const [result] = assessmentResults(assessment);
    expect(plan.byResult[result!.key]).toBeDefined();
    expect(nextStepText(plan, result!)).toContain(`${A} from Not configured to 1`);
    expect(plan.withoutAction).toBe(0);
  });

  it("names the assignment a result waits for beside the check it needs too", () => {
    // P is not assigned: it matches A, and the value of B in it cannot be read.
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic r50 partial", settings: [groupCollection(ROOT, [[simpleInteger(A, 1), simpleSecret(B)]])], assignments: [] }),
        ],
      }),
      pack([{ settings: [groupCollection(ROOT, [[simpleInteger(A, 1), simpleInteger(B, 5)]])] }], recommendations([[A, B]])),
      { now: NOW },
    );
    expect(assessment.recommendations[0]!.settings.map((setting) => setting.reason)).toEqual(["notAssigned", "unreadableValue"]);
    const plan = buildFixPlan(assessment);
    expect(plan.actions.map((action) => action.kind)).toEqual(["assignPolicy", "checkValue"]);
    const [assign] = plan.actions;
    expect(assign!.text).toBe(
      "Assign policy Synthetic r50 partial after first checking 1 setting it holds whose value could not be read. It holds the matching value of 1 setting that 1 result needs besides its other steps. Assign it to a pilot group first.",
    );
    expect(assign!.unlocks).toMatchObject({ matches: 0, stillOpen: 1 });
    const next = nextStepText(plan, assessmentResults(assessment)[0]!);
    expect(next).toMatch(/^Assign policy Synthetic r50 partial\./);
    expect(next).toContain("Check");
    expect(plan.advice[assessment.settings[0]!.key]).toContain("Assign policy Synthetic r50 partial instead of importing a second one.");
  });

  it("asks for each assignment a setting on two roots needs, never one or the other", () => {
    const TWO = "synthetic_r50_two_roots";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic r50 windows", settings: [choice(TWO, "1")], assignments: [] }),
          tenantPolicy({ name: "Synthetic r50 mac", platforms: "macOS", settings: [choice(TWO, "1")], assignments: [] }),
        ],
      }),
      pack([{ settings: [choice(TWO, "1")] }, { platforms: "macOS", settings: [choice(TWO, "1")] }], recommendations([[TWO]])),
      { now: NOW },
    );
    const plan = buildFixPlan(assessment);
    expect(plan.withoutAction).toBe(0);
    expect(nextStepText(plan, assessmentResults(assessment)[0]!)).toBe("Assign policy Synthetic r50 mac. Assign policy Synthetic r50 windows.");
    expect(plan.actions.flatMap((action) => action.alternatives ?? [])).toEqual([]);
  });
});

// Found by the independent review of the round 50 fixes.
describe("assignments settle what they say (round 50 review)", () => {
  const C = "synthetic_r50_c";

  it("leaves out an assignment that settles only part of what another settles for the result", () => {
    // P matches A, Q matches A and B; C is missing everywhere, so no assignment lets the result match.
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic r50 smaller", settings: [choice(A, "1")], assignments: [] }),
          tenantPolicy({ name: "Synthetic r50 larger", settings: [choice(A, "1"), choice(B, "1")], assignments: [] }),
        ],
      }),
      pack([{ settings: [choice(A, "1"), choice(B, "1"), choice(C, "1")] }], [
        { id: "1.1", title: "Synthetic r50 three settings", level: 1, settings: [A, B, C] },
      ]),
      { now: NOW },
    );
    const plan = buildFixPlan(assessment);
    expect(plan.actions.map((action) => [action.kind, action.policy?.name])).toEqual([
      ["assignPolicy", "Synthetic r50 larger"],
      ["addSetting", undefined],
    ]);
    expect(nextStepText(plan, assessmentResults(assessment)[0]!)).toMatch(/^Assign policy Synthetic r50 larger\. Add /);
  });

  it("names the assignment a second root waits for while the first root differs", () => {
    const TWO = "synthetic_r50_two_roots";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic r50 windows assigned", settings: [choice(TWO, "0")] }),
          tenantPolicy({ name: "Synthetic r50 mac", platforms: "macOS", settings: [choice(TWO, "1")], assignments: [] }),
        ],
      }),
      pack([{ settings: [choice(TWO, "1")] }, { platforms: "macOS", settings: [choice(TWO, "1")] }], [
        { id: "1.1", title: "Synthetic r50 two roots", level: 1, settings: [TWO] },
      ]),
      { now: NOW },
    );
    expect(assessment.recommendations[0]!.settings[0]!.result).toBe("Fail");
    const plan = buildFixPlan(assessment);
    const next = nextStepText(plan, assessmentResults(assessment)[0]!);
    expect(next).toContain("Assign policy Synthetic r50 mac.");
    expect(next).toContain("in policy Synthetic r50 windows assigned from 0 to 1");
  });

  it("words an assignment that only takes the result's change as a condition as a step of its own", () => {
    const LEAF_X = "synthetic_r50_leaf_x";
    const LEAF_Y = "synthetic_r50_leaf_y";
    const OTHER = "synthetic_r50_other";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic r50 unassigned group",
            settings: [groupCollection(ROOT, [[simpleInteger(LEAF_X, 1), simpleInteger(LEAF_Y, 2)]])],
            assignments: [],
          }),
        ],
        other: { deviceConfigurations: [deviceConfiguration("windows10CustomConfiguration")] },
      }),
      pack([{ settings: [groupCollection(ROOT, [[simpleInteger(LEAF_X, 1), simpleInteger(LEAF_Y, 1)]]), choice(OTHER, "1")] }], [
        { id: "1.1", title: "Synthetic r50 x", level: 1, settings: [LEAF_X, OTHER] },
        { id: "1.2", title: "Synthetic r50 y", level: 1, settings: [LEAF_Y] },
      ]),
      { now: NOW },
    );
    const plan = buildFixPlan(assessment);
    const [, second] = assessmentResults(assessment);
    const [assign] = plan.actions;
    expect(assign!.settles).toEqual(["r:1:1.1"]);
    expect(nextStepText(plan, second!)).toMatch(/^Assign policy Synthetic r50 unassigned group after the changes below\. /);
    expect(nextStepText(plan, second!)).not.toContain(" or ");
  });
});
