// Round 49 review: the Level 1 and Level 2 packs recommend different values
// for one setting, an assignment includes one group and excludes another of
// the same display name, and a result that needs review has no single step.
// Synthetic ids and names only.
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { assessBenchmark, assessmentResults, combineLevelAssessments } from "../assessment";
import { reachText } from "../display";
import { benchmarkDraftsReadme, generateBenchmarkDrafts } from "../drafts";
import { benchmarkCsv, benchmarkJson } from "../export";
import { buildFixPlan, nextStepText } from "../fix-plan";
import { renderReadinessPdf } from "../readiness-pdf";
import { NOW, choice, collection, pack, simpleInteger, tenantPolicy } from "./fixtures";

const CONFLICT = "synthetic_r49_conflict";
const WAITS = "synthetic_r49_waits";
const CANDIDATE = "Synthetic r49 candidate";
const ASSIGNED_POLICY = "Synthetic r49 assigned";

/** Text of every page of a PDF, whitespace collapsed (as readiness-pdf.test.ts reads it). */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  return [...pdf.matchAll(/<<([^>]*?)>>\s*stream\n/g)]
    .map((match) => {
      const start = (match.index ?? 0) + match[0].length;
      const length = Number(/\/Length (\d+)/.exec(match[1] ?? "")?.[1]);
      const data = raw.subarray(start, start + length);
      const stream = (match[1]?.includes("/FlateDecode") ? inflateSync(data) : data).toString("latin1");
      return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((item) => (item[1] ?? "").replace(/\\(.)/g, "$1")).join(" ");
    })
    .join(" ")
    .replace(/\s+/g, " ");
}

/**
 * The packs of both Levels: Level 1 recommends 5 for the setting, Level 2
 * the given value; Level 1 also holds a setting the candidate matches.
 */
function packs(level2: number) {
  return [
    pack(
      [{ settings: [simpleInteger(CONFLICT, 5), choice(WAITS, "1")] }],
      [
        { id: "1.1", title: "Synthetic r49 recommendation conflict", level: 1, settings: [CONFLICT] },
        { id: "1.2", title: "Synthetic r49 recommendation waits", level: 1, settings: [WAITS] },
      ],
      1,
    ),
    pack(
      [{ settings: [simpleInteger(CONFLICT, level2)] }],
      [{ id: "2.1", title: "Synthetic r49 recommendation conflict L2", level: 2, settings: [CONFLICT] }],
      2,
    ),
  ];
}

function combined(policies: Record<string, unknown>[], level2 = 10) {
  const data = collection({ policies });
  const delivered = packs(level2);
  return {
    assessment: combineLevelAssessments(delivered.map((item) => assessBenchmark(data, item, { now: NOW }))),
    delivered,
  };
}

const CHOOSE = (policy: string, when = "") =>
  `For ${CONFLICT}, Level 1 recommends 5, Level 2 recommends 10: choose the value for your target Level and set it in policy ${policy}${when}.`;

/** Every text a customer reads from one assessment: plan, CSV, JSON, drafts README and PDF. */
function outputs(assessment: ReturnType<typeof combined>["assessment"], delivered: ReturnType<typeof packs>) {
  const plan = buildFixPlan(assessment);
  return {
    plan,
    planText: JSON.stringify(plan),
    next: assessmentResults(assessment).map((result) => nextStepText(plan, result)),
    csv: benchmarkCsv(assessment, plan),
    json: benchmarkJson(assessment, { plan }),
    readme: benchmarkDraftsReadme(generateBenchmarkDrafts(assessment, delivered, plan), assessment),
    pdf: pdfText(renderReadinessPdf(assessment, { renderDate: new Date("2026-10-22T12:00:00.000Z"), tenantLabel: "Synthetic Tenant" })),
  };
}

describe("fix plan: Levels that recommend different values (round 49)", () => {
  it("states the conflict instead of two changes on an unassigned policy, and joins it to assigning the policy once", () => {
    const { assessment, delivered } = combined([
      tenantPolicy({ name: CANDIDATE, settings: [simpleInteger(CONFLICT, 1), choice(WAITS, "1")], assignments: [] }),
    ]);
    // The engine judges each Level against its own value.
    expect(assessment.recommendations.map((item) => [item.level, item.id, item.result, item.reason])).toEqual([
      [1, "1.1", "Review", "notAssignedDiffers"],
      [1, "1.2", "Review", "notAssigned"],
      [2, "2.1", "Review", "notAssignedDiffers"],
    ]);
    const out = outputs(assessment, delivered);
    const [assign] = out.plan.actions;
    expect(out.plan.actions.map((action) => action.kind)).toEqual(["assignPolicy"]);
    expect(assign!.conditions!.map((setting) => setting.text)).toEqual([CHOOSE(CANDIDATE, " before assigning it")]);
    expect(assign!.text).toBe(
      `Assign policy ${CANDIDATE} after first choosing the value of 1 setting it holds for your target Level. Assigned as it is, it would let 3 results be judged: 1 would match and 2 would differ. Assign it to a pilot group first.`,
    );
    // No output names a change to either Level's value.
    for (const text of [out.planText, ...out.next, out.csv, out.json, out.readme, out.pdf])
      expect(text).not.toMatch(/from 1 to (5|10)/);
    for (const text of [out.csv, out.json, out.readme, out.pdf]) expect(text).toContain(CHOOSE(CANDIDATE, " before assigning it"));
    for (const finding of assessment.settings.filter((item) => item.settingId === CONFLICT))
      expect(out.plan.advice[finding.key]).toContain("Level 1 recommends 5, Level 2 recommends 10: choose the value for your target Level");
    const json = JSON.parse(out.json) as { fixPlan: Array<{ conditions?: Array<{ levelConflict?: string }> }> };
    expect(json.fixPlan[0]!.conditions!.map((item) => item.levelConflict)).toEqual(["Level 1 recommends 5, Level 2 recommends 10"]);
    expect(out.plan.levelConflicts).toEqual(
      Object.fromEntries(
        assessment.settings
          .filter((item) => item.settingId === CONFLICT)
          .map((item) => [item.key, "Level 1 recommends 5, Level 2 recommends 10"]),
      ),
    );
  });

  it("states the conflict on an assigned policy and counts it as a choice, not a change", () => {
    const { assessment, delivered } = combined([
      tenantPolicy({ name: ASSIGNED_POLICY, settings: [simpleInteger(CONFLICT, 1), choice(WAITS, "1")] }),
    ]);
    const out = outputs(assessment, delivered);
    const [change] = out.plan.actions.filter((action) => action.kind === "changeValue");
    expect(new Set(change!.settings.map((setting) => setting.text))).toEqual(new Set([CHOOSE(ASSIGNED_POLICY)]));
    expect(change!.text).toBe(
      `Choose the value of 1 setting in policy ${ASSIGNED_POLICY} (assigned to All Users) for your target Level: the Levels compared recommend different values.`,
    );
    for (const text of [out.planText, ...out.next, out.csv, out.json, out.readme, out.pdf])
      expect(text).not.toMatch(/from 1 to (5|10)/);
    expect(out.readme).toContain(
      `${CONFLICT}: change policy ${ASSIGNED_POLICY}. Level 1 recommends 5, Level 2 recommends 10: choose the value for your target Level.`,
    );
    for (const finding of assessment.settings.filter((item) => item.settingId === CONFLICT))
      expect(out.plan.advice[finding.key]).toBe(CHOOSE(ASSIGNED_POLICY));
    // One setting is one change in the README, as the plan counts it.
    expect(generateBenchmarkDrafts(assessment, delivered, out.plan).changes).toEqual([
      expect.objectContaining({ settingId: CONFLICT, recommendationIds: ["1.1", "2.1"], policies: [ASSIGNED_POLICY] }),
    ]);
    expect(out.readme).toContain("Summary: 0 draft policies, 1 policy changes");
  });

  it("never asks to change a value one Level matches to the other Level's value", () => {
    const { assessment, delivered } = combined([
      tenantPolicy({ name: ASSIGNED_POLICY, settings: [simpleInteger(CONFLICT, 5), choice(WAITS, "1")] }),
    ]);
    expect(assessment.recommendations.map((item) => item.result)).toEqual(["Pass", "Pass", "Fail"]);
    const out = outputs(assessment, delivered);
    const [change] = out.plan.actions;
    expect(change!.settings.map((setting) => setting.text)).toEqual([CHOOSE(ASSIGNED_POLICY)]);
    for (const text of [out.planText, ...out.next, out.csv, out.json, out.pdf]) expect(text).not.toMatch(/from 5 to 10/);
  });

  it("keeps the change when both Levels recommend the same value", () => {
    const { assessment } = combined(
      [tenantPolicy({ name: ASSIGNED_POLICY, settings: [simpleInteger(CONFLICT, 1), choice(WAITS, "1")] })],
      5,
    );
    const plan = buildFixPlan(assessment);
    const [change] = plan.actions;
    expect(change!.text).toBe(
      `Change 1 setting in policy ${ASSIGNED_POLICY} (assigned to All Users) to the recommended value.`,
    );
    expect(new Set(change!.settings.map((setting) => setting.text))).toEqual(
      new Set([`Change ${CONFLICT} in policy ${ASSIGNED_POLICY} from 1 to 5.`]),
    );
    expect(plan.levelConflicts).toEqual({});
  });
});

describe("assignment reach by target identity (round 49)", () => {
  const INCLUDED = "a1000000-0000-0000-0000-000000000001";
  const EXCLUDED = "b2000000-0000-0000-0000-000000000002";
  const ALPHA = "synthetic_r49_alpha";
  const reachOf = (assignments: unknown[], names: Record<string, string>) => {
    const data = collection({ policies: [tenantPolicy({ name: ASSIGNED_POLICY, settings: [choice(ALPHA, "1")], assignments })] });
    data.groupNames = new Map(Object.entries(names));
    const assessment = assessBenchmark(data, pack([{ settings: [choice(ALPHA, "1")] }]), { now: NOW });
    return reachText(assessment.settings[0]!.observations[0]!);
  };
  const include = (groupId: string) => ({
    id: `include-${groupId}`,
    target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
  });
  const exclude = (groupId: string) => ({
    id: `exclude-${groupId}`,
    target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId },
  });

  it("keeps an included group whose name an excluded group shares, and tells the two apart", () => {
    const text = reachOf([include(INCLUDED), exclude(EXCLUDED)], {
      [INCLUDED]: "Synthetic Pilot",
      [EXCLUDED]: "Synthetic Pilot",
    });
    expect(text).toBe("assigned to Group: Synthetic Pilot (a1000000), excluding Group: Synthetic Pilot (b2000000)");
  });

  it("names groups of distinct names without an id, and leaves out a group that is excluded itself", () => {
    expect(
      reachOf([include(INCLUDED), exclude(EXCLUDED)], { [INCLUDED]: "Synthetic Pilot", [EXCLUDED]: "Synthetic Kiosks" }),
    ).toBe("assigned to Group: Synthetic Pilot, excluding Group: Synthetic Kiosks");
    expect(
      reachOf(
        [include(INCLUDED), include(EXCLUDED), exclude(EXCLUDED)],
        { [INCLUDED]: "Synthetic Pilot", [EXCLUDED]: "Synthetic Kiosks" },
      ),
    ).toBe("assigned to Group: Synthetic Pilot, excluding Group: Synthetic Kiosks");
  });
});

// A recommendation whose settings are matched on two unassigned policies:
// assigning either alone leaves it Needs review, so no single step covers it.
function twoPolicyAssessment() {
  const A = "synthetic_r49_together_a";
  const B = "synthetic_r49_together_b";
  return assessBenchmark(
    collection({
      policies: [
        tenantPolicy({ name: "Synthetic r49 first half", settings: [choice(A, "1")], assignments: [] }),
        tenantPolicy({ name: "Synthetic r49 second half", settings: [choice(B, "1")], assignments: [] }),
      ],
    }),
    pack(
      [{ settings: [choice(A, "1"), choice(B, "1")] }],
      [{ id: "1.1", title: "Synthetic r49 recommendation together", level: 1, settings: [A, B] }],
    ),
    { now: NOW },
  );
}

describe("PDF without a step for a result that needs review (round 49)", () => {
  const render = (assessment: ReturnType<typeof twoPolicyAssessment>) =>
    pdfText(renderReadinessPdf(assessment, { renderDate: new Date("2026-10-22T12:00:00.000Z"), tenantLabel: "Synthetic Tenant" }));

  it("never says the steps above cover a result no step covers", () => {
    const assessment = twoPolicyAssessment();
    // Each assignment settles one setting of the result (round 50), so the
    // result has both steps; a plan without them is what the PDF states.
    const plan = buildFixPlan(assessment);
    expect(plan.actions.map((action) => [action.kind, action.policy!.name, action.partial])).toEqual([
      ["assignPolicy", "Synthetic r49 first half", { "r:1:1.1": [{ settingId: "synthetic_r49_together_a", findingKey: "0:0" }] }],
      ["assignPolicy", "Synthetic r49 second half", { "r:1:1.1": [{ settingId: "synthetic_r49_together_b", findingKey: "0:1" }] }],
    ]);
    expect(plan.withoutAction).toBe(0);
    expect(nextStepText(plan, assessmentResults(assessment)[0]!)).toBe(
      "Assign policy Synthetic r49 first half. Assign policy Synthetic r49 second half.",
    );
    const text = pdfText(
      renderReadinessPdf(assessment, {
        renderDate: new Date("2026-10-22T12:00:00.000Z"),
        tenantLabel: "Synthetic Tenant",
        fixPlan: { ...plan, actions: [], byResult: {}, withoutAction: 1 },
      }),
    );
    expect(text).toContain("No result differs. 1 result needs review, and no single step covers it: see the result detail.");
    expect(text).not.toContain("the steps above say what to check");
    expect(text).toContain("No step could be derived from the collected data; the result detail says what each result needs.");
  });

  it("says nothing is to do only for a truly empty plan", () => {
    const ALPHA = "synthetic_r49_alpha";
    const assessment = assessBenchmark(
      collection({ policies: [tenantPolicy({ name: ASSIGNED_POLICY, settings: [choice(ALPHA, "1")] })] }),
      pack([{ settings: [choice(ALPHA, "1")] }], [{ id: "1.1", title: "Synthetic r49 recommendation alpha", level: 1, settings: [ALPHA] }]),
      { now: NOW },
    );
    expect(buildFixPlan(assessment)).toMatchObject({ actions: [], withoutAction: 0 });
    const text = render(assessment);
    expect(text).toContain("No result differs or needs review.");
    expect(text).toContain("Nothing to do: no result differs or needs review.");
  });
});
