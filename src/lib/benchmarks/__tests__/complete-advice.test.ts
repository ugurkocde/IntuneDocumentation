import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { assessBenchmark, assessmentResults, type BenchmarkAssessment } from "../assessment";
import { BELOW_DIFFERS, holderValueText, resultSettingDetails } from "../display";
import { benchmarkCsv, benchmarkSummary } from "../export";
import { actionsForResult, buildFixPlan, nextStepText } from "../fix-plan";
import { differencePlace, type Json } from "../policies";
import { renderReadinessPdf } from "../readiness-pdf";
import { definitionNames, tenantSettings, type SettingNames } from "../tenant-settings";
import { differenceText, settingName } from "../values";
import {
  choice,
  collection,
  groupCollection,
  NOW,
  pack,
  simpleString,
  tenantPolicy,
} from "./fixtures";

// Synthetic ids, names and values only. Regressions for advice that must be
// complete in every output, results that an action claims only through its
// own policy's value, and values and names that stay readable.

/** Text of every page with whitespace collapsed (as readiness-pdf.test.ts reads it). */
function pdfText(assessment: BenchmarkAssessment): string {
  const bytes = renderReadinessPdf(assessment, {
    renderDate: new Date("2026-10-22T12:00:00.000Z"),
    tenantLabel: "Synthetic Tenant",
    exceptions: [],
  });
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  const pages = [...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)([\s\S]*?)endobj/g)];
  return pages
    .map((match) => {
      const contentId = /\/Contents (\d+) 0 R/.exec(match[2] ?? "")?.[1];
      const object = new RegExp(`(?:^|\\n)${contentId} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\n`).exec(pdf);
      if (!object) return "";
      const start = (object.index ?? 0) + object[0].length;
      const length = Number(/\/Length (\d+)/.exec(object[1] ?? "")?.[1]);
      const data = raw.subarray(start, start + length);
      const stream = (object[1]?.includes("/FlateDecode") ? inflateSync(data) : data).toString("latin1");
      return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
        .map((item) => (item[1] ?? "").replace(/\\(.)/g, "$1"))
        .join(" ");
    })
    .join(" ")
    .replace(/\s+/g, " ");
}

describe("an unassigned policy whose assignment would break many matching results", () => {
  const WAITING = "synthetic_bench_r48_waiting";
  const HELD = Array.from({ length: 20 }, (_, index) => `synthetic_bench_r48_held_${index + 1}`);
  const CANDIDATE = "Synthetic candidate profile";
  const assessment = assessBenchmark(
    collection({
      policies: [
        tenantPolicy({ name: "Synthetic assigned baseline", settings: HELD.map((id) => choice(id, "1")) }),
        tenantPolicy({
          name: CANDIDATE,
          settings: [choice(WAITING, "1"), ...HELD.map((id) => choice(id, "0"))],
          assignments: [],
        }),
      ],
    }),
    pack(
      [{ settings: [choice(WAITING, "1"), ...HELD.map((id) => choice(id, "1"))] }],
      [WAITING, ...HELD].map((id, index) => ({
        id: `1.${index + 1}`,
        title: `Synthetic recommendation ${index + 1}`,
        level: 1 as const,
        settings: [id],
      })),
    ),
    { now: NOW },
  );
  const plan = buildFixPlan(assessment);
  const assign = plan.actions.find((action) => action.kind === "assignPolicy")!;
  const steps = HELD.map((id) => `Change ${id} in policy ${CANDIDATE} from 0 to 1 before assigning it.`);
  const waiting = assessmentResults(assessment).find((item) => item.id === "1.1")!;

  it("reaches the state: one result waits for the policy, 20 matching results would no longer match", () => {
    expect(waiting.result).toBe("Review");
    expect(assign.results.map((result) => result.id)).toEqual(["1.1"]);
    expect(assign.unlocks).toEqual({ judged: 1, matches: 1, differs: 0, regressions: 20 });
    expect(assign.conditions!.map((setting) => setting.text)).toEqual(steps);
  });

  it("lists every condition and the warning in the PDF, and the cards say where they are", () => {
    const text = pdfText(assessment);
    for (const step of steps) expect(text).toContain(step);
    expect(text).toContain(assign.caution!);
    const number = plan.actions.indexOf(assign) + 1;
    const note = `Before assigning policy ${CANDIDATE}, do the steps listed under step ${number} on the What to Do page.`;
    // The step card of the result that needs review, and its row's next step where it has a card.
    expect(text).toContain(note);
    expect(text).not.toMatch(/and \d+ more settings?/);
  });

  it("carries every condition and the warning in the next step, the CSV and the JSON", () => {
    const next = nextStepText(plan, waiting);
    for (const step of steps) expect(next).toContain(step);
    expect(next).toContain(assign.caution!);
    const csv = benchmarkCsv(assessment, plan);
    for (const step of steps) expect(csv).toContain(step);
    const json = benchmarkSummary(assessment, { plan }) as unknown as {
      fixPlan: Array<{ id: string; caution?: string; conditions?: Array<{ text: string }> }>;
    };
    const action = json.fixPlan.find((item) => item.id === assign.id)!;
    expect(action.caution).toBe(assign.caution);
    expect(action.conditions!.map((setting) => setting.text)).toEqual(steps);
  });
});

describe("a group whose settings below belong to separate recommendations", () => {
  const ROOT = "synthetic_bench_r48_group";
  const A = "synthetic_bench_r48_group_a";
  const B = "synthetic_bench_r48_group_b";
  const X = "Synthetic policy differing in A";
  const Y = "Synthetic policy differing in B";
  const entry = (a: string, b: string) => groupCollection(ROOT, [[choice(A, a), choice(B, b)]]);
  const assessment = assessBenchmark(
    collection({
      policies: [
        tenantPolicy({ name: X, settings: [entry("0", "1")] }),
        tenantPolicy({ name: Y, settings: [entry("1", "0")] }),
      ],
    }),
    pack(
      [{ settings: [entry("1", "1")] }],
      [
        { id: "1.1", title: "Synthetic child A recommendation", level: 1, settings: [A] },
        { id: "1.2", title: "Synthetic child B recommendation", level: 1, settings: [B] },
      ],
    ),
    { now: NOW },
  );
  const plan = buildFixPlan(assessment);
  const [first, second] = assessmentResults(assessment);

  it("reaches the state: both results differ through one root held by both policies", () => {
    expect([first!.result, second!.result]).toEqual(["Fail", "Fail"]);
    expect(assessment.settings).toHaveLength(1);
    expect(plan.actions.filter((action) => action.kind === "changeValue")).toHaveLength(2);
  });

  it("gives each result only the change of the policy differing in its own setting, and counts follow", () => {
    const change = (policy: string) =>
      plan.actions.find((action) => action.kind === "changeValue" && action.policy?.name === policy)!;
    expect(change(X).results.map((result) => result.id)).toEqual(["1.1"]);
    expect(change(Y).results.map((result) => result.id)).toEqual(["1.2"]);
    expect(actionsForResult(plan, first!.key).map((action) => action.policy?.name)).toEqual([X]);
    expect(actionsForResult(plan, second!.key).map((action) => action.policy?.name)).toEqual([Y]);
    expect(nextStepText(plan, first!)).toContain(X);
    expect(nextStepText(plan, first!)).not.toContain(Y);
    expect(nextStepText(plan, second!)).not.toContain(X);
    expect(plan.withoutAction).toBe(0);
  });

  it("keeps the change for a setting missing below the root the policy holds with another value", () => {
    // X holds the group with A differing and B absent; no other policy holds B.
    const missing = assessBenchmark(
      collection({ policies: [tenantPolicy({ name: X, settings: [groupCollection(ROOT, [[choice(A, "0")]])] })] }),
      pack(
        [{ settings: [entry("1", "1")] }],
        [
          { id: "1.1", title: "Synthetic child A recommendation", level: 1, settings: [A] },
          { id: "1.2", title: "Synthetic child B recommendation", level: 1, settings: [B] },
        ],
      ),
      { now: NOW },
    );
    expect(missing.recommendations.map((item) => item.settings[0]!.status)).toEqual(["Different", "Missing"]);
    const plan = buildFixPlan(missing);
    expect(plan.actions.map((action) => [action.kind, action.results.map((result) => result.id)])).toEqual([
      ["changeValue", ["1.1", "1.2"]],
    ]);
    expect(plan.actions[0]!.settings[0]!.text).toContain(`${B} from Not configured to 1`);
    expect(plan.withoutAction).toBe(0);
  });

  it("still associates both results with a policy that differs in both settings", () => {
    const both = assessBenchmark(
      collection({ policies: [tenantPolicy({ name: X, settings: [entry("0", "0")] })] }),
      pack(
        [{ settings: [entry("1", "1")] }],
        [
          { id: "1.1", title: "Synthetic child A recommendation", level: 1, settings: [A] },
          { id: "1.2", title: "Synthetic child B recommendation", level: 1, settings: [B] },
        ],
      ),
      { now: NOW },
    );
    const [action] = buildFixPlan(both).actions;
    expect(action!.results.map((result) => result.id)).toEqual(["1.1", "1.2"]);
  });
});

describe("values that differ beyond the shortened text", () => {
  const ID = "synthetic_bench_r48_long";
  const POLICY = "Synthetic long value policy";
  const common = "Synthetic ".repeat(20);
  const assess = (current: string, recommended: string) =>
    assessBenchmark(
      collection({ policies: [tenantPolicy({ name: POLICY, settings: [simpleString(ID, current)] })] }),
      pack([{ settings: [simpleString(ID, recommended)] }]),
      { now: NOW },
    );

  it("says the own value differs, never a setting below, and shows where the values differ", () => {
    const assessment = assess(`${common}current tail`, `${common}recommended tail`);
    const finding = assessment.settings[0]!;
    // Same shortened text on both sides.
    expect(finding.observations[0]!.current.text).toBe(finding.recommendedValue.text);
    const [result] = assessmentResults(assessment);
    const [detail] = resultSettingDetails(assessment, result!);
    const shown = holderValueText(detail!.holders[0]!, detail!.recommended);
    expect(shown).not.toContain(BELOW_DIFFERS);
    expect(shown).toContain("current tail");
    expect(shown).toContain("recommended tail");
    const plan = buildFixPlan(assessment);
    const step = plan.actions[0]!.settings[0]!.text;
    expect(step).not.toContain("settings below");
    expect(step).toMatch(/^Change synthetic_bench_r48_long in policy Synthetic long value policy from .*current tail.* to .*recommended tail/);
    expect(benchmarkCsv(assessment, plan)).not.toContain(BELOW_DIFFERS);
  });

  it("keeps the shortened text where it already differs", () => {
    const assessment = assess("Synthetic short current", "Synthetic short recommended");
    const step = buildFixPlan(assessment).actions[0]!.settings[0]!.text;
    expect(step).toBe(
      `Change ${ID} in policy ${POLICY} from Synthetic short current to Synthetic short recommended.`,
    );
  });

  it("tells a differing parent, own value and setting below apart from the raw values", () => {
    const ROOT = "synthetic_bench_r48_place";
    const CHILD = "synthetic_bench_r48_place_child";
    const GRAND = "synthetic_bench_r48_place_grand";
    const value = (root: string, child: string, grand: string) =>
      choice(ROOT, root, [choice(CHILD, child, [simpleString(GRAND, grand)])]) as Json;
    const wanted = value("1", "1", "a");
    expect(differencePlace(wanted, value("1", "1", "a"), CHILD)).toBeNull();
    expect(differencePlace(wanted, value("1", "0", "a"), CHILD)).toBe("own");
    expect(differencePlace(wanted, value("1", "1", "b"), CHILD)).toBe("below");
    // The root's other option decides, also with a difference below the child.
    expect(differencePlace(wanted, value("0", "1", "b"), CHILD)).toBe("parent");
  });

  it("distinguishes settings below whose values differ beyond the shortened text", () => {
    const ROOT = "synthetic_bench_r48_root";
    const CHILD = "synthetic_bench_r48_root_child";
    const root = (value: string) => choice(ROOT, "1", [simpleString(CHILD, value)]);
    const assessment = assessBenchmark(
      collection({ policies: [tenantPolicy({ name: POLICY, settings: [root(`${common}current tail`)] })] }),
      pack([{ settings: [root(`${common}recommended tail`)] }]),
      { now: NOW },
    );
    const observation = assessment.settings[0]!.observations[0]!;
    const [difference] = observation.differences!;
    expect(difference!.current).not.toBe(difference!.recommended);
    expect(differenceText(observation)).toContain("current tail");
    expect(differenceText(observation)).toContain("recommended tail");
  });
});

describe("names of settings below another that Graph gives no display name", () => {
  const ROOT = "synthetic_bench_r48_admx_root";
  const CHILD = "synthetic_bench_r48_admx_root_value";
  const DEFINITIONS = [
    {
      id: ROOT,
      displayName: "Synthetic warning settings (User)",
      name: "L_SyntheticWarning",
      rootDefinitionId: ROOT,
      options: [{ itemId: `${ROOT}_1`, displayName: "Enabled" }],
    },
    {
      id: CHILD,
      displayName: "",
      name: "L_SyntheticWarningValue",
      rootDefinitionId: ROOT,
      options: [
        { itemId: `${CHILD}_1`, displayName: "Synthetic notify" },
        { itemId: `${CHILD}_2`, displayName: "Synthetic block" },
      ],
    },
  ];

  it("names the setting within its root, with its options, and falls back to the id", () => {
    const names = definitionNames(DEFINITIONS);
    expect(settingName(names, CHILD)).toBe("Synthetic warning settings (User): L_SyntheticWarningValue");
    expect(names[CHILD]!.options[`${CHILD}_2`]).toBe("Synthetic block");
    expect(settingName(names, "synthetic_bench_r48_unknown")).toBe("synthetic_bench_r48_unknown");
    // Without its root's name it keeps its Graph name.
    const alone: SettingNames = definitionNames([DEFINITIONS[1]]);
    expect(settingName(alone, CHILD)).toBe("L_SyntheticWarningValue");
  });

  it("shows the readable name of a differing setting below in the PDF, CSV, JSON and fix plan", () => {
    const root = (option: string) => choice(ROOT, "1", [choice(CHILD, option)]);
    const policy = tenantPolicy({ name: "Synthetic office policy", settings: [root("1")] });
    // The collected rows carry their definitions ($expand=settingDefinitions).
    (policy.settings as Array<Record<string, unknown>>)[0]!.settingDefinitions = DEFINITIONS;
    const data = collection({ policies: [policy] });
    expect(settingName(tenantSettings(data).definitions, CHILD)).toContain("L_SyntheticWarningValue");
    const assessment = assessBenchmark(data, pack([{ settings: [root("2")] }]), { now: NOW });
    const named = "Synthetic warning settings (User): L_SyntheticWarningValue";
    const plan = buildFixPlan(assessment);
    expect(plan.actions[0]!.settings[0]!.text).toContain(`${named} from Synthetic notify to Synthetic block`);
    const pdf = pdfText(assessment);
    expect(pdf).toContain(`${named} (current Synthetic notify, recommended Synthetic block)`);
    expect(pdf).not.toContain(`${CHILD} (current`);
    expect(benchmarkCsv(assessment, plan)).toContain(`${named} (current Synthetic notify, recommended Synthetic block)`);
    expect(JSON.stringify(benchmarkSummary(assessment, { plan }))).toContain(`"name":"${named}"`);
  });
});
