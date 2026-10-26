// Round 51 review: a Level conflict across intersecting platform sets, and
// group entries reordered between Levels. Synthetic ids and names only.
import { describe, expect, it } from "vitest";
import { assessBenchmark, assessmentResults, combineLevelAssessments } from "../assessment";
import { benchmarkDraftsReadme, generateBenchmarkDrafts } from "../drafts";
import { benchmarkCsv, benchmarkJson } from "../export";
import { buildFixPlan, nextStepText } from "../fix-plan";
import type { BenchmarkPack } from "../pack";
import { NOW, collection, groupCollection, pack, simpleInteger, simpleSecret, tenantPolicy } from "./fixtures";

const S = "synthetic_r51_single";
const G = "synthetic_r51_group";
const A = "synthetic_r51_group_a";
const B = "synthetic_r51_group_b";

type Instance = Record<string, unknown>;

function assess(level1: BenchmarkPack, level2: BenchmarkPack, policies: Array<Parameters<typeof tenantPolicy>[0]>) {
  const data = collection({ policies: policies.map((policy) => tenantPolicy(policy)) });
  const delivered = [level1, level2];
  const assessment = combineLevelAssessments(delivered.map((item) => assessBenchmark(data, item, { now: NOW })));
  return { assessment, delivered, plan: buildFixPlan(assessment) };
}

const levels = (l1: { platforms: string; value: Instance }, l2: { platforms: string; value: Instance }) =>
  [
    pack([{ platforms: l1.platforms, settings: [l1.value] }], [
      { id: "1.1", title: "Synthetic r51 recommendation L1", level: 1, settings: [l1.value.settingDefinitionId as string] },
    ], 1),
    pack([{ platforms: l2.platforms, settings: [l2.value] }], [
      { id: "2.1", title: "Synthetic r51 recommendation L2", level: 2, settings: [l2.value.settingDefinitionId as string] },
    ], 2),
  ] as const;

describe("Level conflict across intersecting platform sets (round 51)", () => {
  const conflict = "Level 1 recommends 5, Level 2 recommends 10";

  for (const [name, l2Platforms, holderPlatforms] of [
    ["a subset", "macOS", "iOS,macOS"],
    ["an overlapping set", "macOS,windows10", "iOS,macOS,windows10"],
  ] as const)
    it(`states the choice in every step when Level 2 covers ${name}`, () => {
      const [level1, level2] = levels(
        { platforms: "iOS,macOS", value: simpleInteger(S, 5) },
        { platforms: l2Platforms, value: simpleInteger(S, 10) },
      );
      const { assessment, delivered, plan } = assess(level1, level2, [
        { name: "Synthetic r51 holder", platforms: holderPlatforms, settings: [simpleInteger(S, 20)] },
      ]);
      expect(assessment.settings.map((finding) => [finding.packLevel, finding.status])).toEqual([
        [1, "Different"],
        [2, "Different"],
      ]);
      expect(Object.values(plan.levelConflicts)).toEqual([conflict, conflict]);
      const change = plan.actions.find((action) => action.kind === "changeValue")!;
      expect(change.text).toMatch(/for your target Level/);
      for (const step of change.settings) {
        expect(step.levelConflict).toBe(conflict);
        expect(step.text).toContain(conflict);
        expect(step.text).not.toMatch(/ to (5|10)\b/);
      }
      for (const result of assessmentResults(assessment)) {
        const next = nextStepText(plan, result);
        expect(next).toMatch(/choose the value for your target Level/i);
        expect(next).not.toMatch(/ to (5|10)\b/);
      }
      for (const finding of assessment.settings) expect(plan.advice[finding.key]).toContain(conflict);
      const json = JSON.parse(benchmarkJson(assessment, { plan })) as {
        fixPlan: Array<{ settings: Array<{ levelConflict?: string }> }>;
      };
      expect(json.fixPlan.flatMap((action) => action.settings).map((setting) => setting.levelConflict)).toEqual([conflict, conflict]);
      expect(benchmarkCsv(assessment, plan)).toContain("target Level");
      const readme = benchmarkDraftsReadme(generateBenchmarkDrafts(assessment, delivered, plan), assessment);
      expect(readme).toContain(`${conflict}: choose the value for your target Level.`);
    });

  it("generates no draft when the setting is missing", () => {
    const [level1, level2] = levels(
      { platforms: "iOS,macOS", value: simpleInteger(S, 5) },
      { platforms: "macOS", value: simpleInteger(S, 10) },
    );
    const { assessment, delivered, plan } = assess(level1, level2, []);
    expect(assessment.settings.map((finding) => finding.status)).toEqual(["Missing", "Missing"]);
    expect(Object.values(plan.levelConflicts)).toEqual([conflict, conflict]);
    const steps = plan.actions.flatMap((action) => action.settings);
    expect(steps.map((step) => step.draft)).toEqual(["levelConflict", "levelConflict"]);
    for (const action of plan.actions) expect(action.text).toContain("for your target Level");
    const drafts = generateBenchmarkDrafts(assessment, delivered, plan);
    expect(drafts.drafts).toEqual([]);
    expect(benchmarkDraftsReadme(drafts, assessment)).not.toContain("A draft policy is available");
  });

  it("keeps disjoint platform sets independent (control)", () => {
    const [level1, level2] = levels(
      { platforms: "iOS", value: simpleInteger(S, 5) },
      { platforms: "macOS", value: simpleInteger(S, 10) },
    );
    const missing = assess(level1, level2, []);
    expect(missing.plan.levelConflicts).toEqual({});
    expect(generateBenchmarkDrafts(missing.assessment, missing.delivered, missing.plan).drafts).toHaveLength(2);
    const held = assess(level1, level2, [
      { name: "Synthetic r51 holder", platforms: "iOS,macOS", settings: [simpleInteger(S, 20)] },
    ]);
    expect(held.plan.levelConflicts).toEqual({});
    const change = held.plan.actions.find((action) => action.kind === "changeValue")!;
    expect(change.settings.map((step) => [step.platforms, step.levelConflict, step.text.replace(/.* from /, "from ")])).toEqual([
      ["iOS", undefined, "from 20 to 5."],
      ["macOS", undefined, "from 20 to 10."],
    ]);
  });
});

describe("group entries reordered between Levels (round 51)", () => {
  const entry = (a: number, b: number) => [simpleInteger(A, a), simpleInteger(B, b)];

  it("is one value: no Level conflict, a draft and the recommended value", () => {
    const [level1, level2] = levels(
      { platforms: "windows10", value: groupCollection(G, [entry(1, 2), entry(3, 4)]) },
      { platforms: "windows10", value: groupCollection(G, [entry(3, 4), entry(1, 2)]) },
    );
    const missing = assess(level1, level2, []);
    expect(missing.plan.levelConflicts).toEqual({});
    expect(missing.plan.actions.flatMap((action) => action.settings).map((step) => step.draft)).toEqual([
      "available",
      "duplicate",
    ]);
    expect(generateBenchmarkDrafts(missing.assessment, missing.delivered, missing.plan).drafts).toHaveLength(1);
    const held = assess(level1, level2, [
      { name: "Synthetic r51 holder", settings: [groupCollection(G, [entry(1, 2), entry(3, 9)])] },
    ]);
    expect(held.plan.levelConflicts).toEqual({});
    for (const step of held.plan.actions.flatMap((action) => action.settings)) {
      expect(step.levelConflict).toBeUndefined();
      expect(step.text).not.toContain("target Level");
    }
  });

  it("still conflicts when an entry truly differs (control)", () => {
    const [level1, level2] = levels(
      { platforms: "windows10", value: groupCollection(G, [entry(1, 2), entry(3, 4)]) },
      { platforms: "windows10", value: groupCollection(G, [entry(3, 5), entry(1, 2)]) },
    );
    const { plan, assessment, delivered } = assess(level1, level2, []);
    expect(Object.keys(plan.levelConflicts)).toHaveLength(2);
    expect(generateBenchmarkDrafts(assessment, delivered, plan).drafts).toEqual([]);
  });
});

describe("one value check per policy and setting across Level platforms (round 51)", () => {
  // Both Levels recommend the group for other platforms; the unassigned
  // holder covers both and its value below the group cannot be read.
  it("names the check of the holder once in the next step", () => {
    const value = groupCollection(G, [[simpleInteger(A, 1), simpleInteger(B, 5)]]);
    const [level1, level2] = ([1, 2] as const).map((level) =>
      pack([{ platforms: level === 1 ? "windows10" : "iOS", settings: [value] }], [
        { id: `${level}.1`, title: `Synthetic r51 recommendation L${level}`, level, settings: [A, B] },
      ], level),
    ) as [BenchmarkPack, BenchmarkPack];
    const { assessment, plan } = assess(level1, level2, [
      {
        name: "Synthetic r51 holder",
        platforms: "windows10,iOS",
        assignments: [],
        settings: [groupCollection(G, [[simpleInteger(A, 1), simpleSecret(B)]])],
      },
    ]);
    const nexts = assessmentResults(assessment).map((result) => nextStepText(plan, result));
    expect(nexts.join(" ")).toContain(`in policy Synthetic r51 holder before assigning it.`);
    for (const next of nexts) expect(next.match(/Check \S+ in policy Synthetic r51 holder\b/g)?.length ?? 0).toBeLessThanOrEqual(1);
  });
});
