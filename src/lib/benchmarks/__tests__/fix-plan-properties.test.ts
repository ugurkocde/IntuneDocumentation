// Table-driven property test of the fix plan over synthetic assessments:
// every combination of the dimensions the plan depends on, checked against
// invariants that hold whatever the plan's wording. Synthetic ids, names and
// values only.
import { describe, expect, it } from "vitest";
import {
  assessBenchmark,
  assessmentResults,
  combineLevelAssessments,
  judgeDeclared,
  type AssessmentResult,
  type BenchmarkAssessment,
  type ReasonCode,
  type SettingFinding,
} from "../assessment";
import { actionsForResult, buildFixPlan, nextStepText, type FixAction, type FixActionKind, type FixPlan, type FixSetting } from "../fix-plan";
import type { BenchmarkPack } from "../pack";
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

type Instance = Record<string, unknown>;

const S = "synthetic_prop_single";
const GROUP = "synthetic_prop_group";
const ROOT = "synthetic_prop_choice";
const A = "synthetic_prop_child_a";
const B = "synthetic_prop_child_b";
const PILOT = "d4000000-0000-0000-0000-000000000004";

/** Values the packs recommend: Level 1, and Level 2 where the Levels conflict. */
const L1 = { [S]: 5, [A]: 1, [B]: 5 } as Record<string, number>;
const CONFLICT = { [S]: 10, [A]: 1, [B]: 10 } as Record<string, number>;

type Shape = "single" | "group" | "choice";
type State = "match" | "differ" | "absent" | "unreadable";
type Holder = "assigned" | "unassigned" | "unknown" | "excluded" | "removal" | "broadRemove";
type Second = "none" | "unassignedMatch" | "unassignedDiffer";
type Collected = "complete" | "incomplete" | "otherProfiles";
type PackValue = "readable" | "unreadable" | "profileChoice";
type Levels = "single" | "equal" | "conflicting";
type Delivery = "plain" | "template";
type Basis = "recommendations" | "split" | "settings";

interface Case {
  shape: Shape;
  /** Per declared setting; null holds no root at all. */
  states: State[] | null;
  holder: Holder;
  second: Second;
  collected: Collected;
  packValue: PackValue;
  levels: Levels;
  delivery: Delivery;
  basis: Basis;
  /**
   * The Level 1 pack delivers the root for macOS too, held there by an
   * unassigned policy that matches: a second root per declared setting and
   * another candidate with its own assignment.
   */
  twin: boolean;
}

const declaredOf = (shape: Shape) => (shape === "single" ? [S] : [A, B]);

/** A root of the shape with each declared setting's value (null leaves it out). */
function root(shape: Shape, values: Record<string, Instance | null>): Instance {
  if (shape === "single") return values[S]!;
  const children = [A, B].flatMap((id) => {
    const value = values[id];
    return value ? [value] : [];
  });
  return shape === "group" ? groupCollection(GROUP, [children]) : choice(ROOT, "1", children);
}

function packRoot(shape: Shape, values: Record<string, number>, unreadable: boolean): Instance {
  const last = shape === "single" ? S : B;
  return root(
    shape,
    Object.fromEntries(
      declaredOf(shape).map((id) => [id, unreadable && id === last ? simpleSecret(id) : simpleInteger(id, values[id])]),
    ),
  );
}

function tenantRoot(shape: Shape, states: State[]): Instance {
  return root(
    shape,
    Object.fromEntries(
      declaredOf(shape).map((id, index) => {
        const state = states[index]!;
        const value =
          state === "match"
            ? simpleInteger(id, L1[id])
            : state === "differ"
              ? simpleInteger(id, L1[id]! + 4)
              : state === "unreadable"
                ? simpleSecret(id)
                : null;
        return [id, value];
      }),
    ),
  );
}

const include = { id: "include-pilot", target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: PILOT } };
const HOLDERS: Record<Holder, Partial<Parameters<typeof tenantPolicy>[0]>> = {
  assigned: {},
  unassigned: { assignments: [] },
  unknown: { assignmentsStatus: "incomplete" },
  excluded: {
    assignments: [include, { id: "exclude-pilot", target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId: PILOT } }],
  },
  removal: {
    assignments: [include, { id: "remove-pilot", intent: "remove", target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId: PILOT } }],
  },
  broadRemove: {
    assignments: [include, { id: "remove-all", intent: "remove", target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } }],
  },
};

function packsOf(item: Case): BenchmarkPack[] {
  const declared = declaredOf(item.shape);
  const recommendations = (level: 1 | 2) =>
    item.basis === "settings"
      ? undefined
      : item.basis === "split"
        ? declared.map((id, index) => ({ id: `${level}.${index + 1}`, title: `Synthetic property ${level}.${index + 1}`, level, settings: [id] }))
        : [{ id: `${level}.1`, title: `Synthetic property ${level}.1`, level, settings: declared }];
  const level1 = pack(
    [
      { settings: [packRoot(item.shape, L1, item.packValue === "unreadable")] },
      ...(item.twin ? [{ platforms: "macOS", settings: [packRoot(item.shape, L1, false)] }] : []),
      ...(item.packValue === "profileChoice"
        ? [{ settings: [packRoot(item.shape, { [S]: 7, [A]: 1, [B]: 7 }, false)] }]
        : []),
    ],
    recommendations(1),
    1,
  );
  if (item.delivery === "template")
    (level1.policies as Array<Record<string, unknown>>)[0]!.templateReference = {
      templateId: "00000000-0000-0000-0000-00000000c001",
    };
  if (item.levels === "single") return [level1];
  const level2 = pack(
    [{ settings: [packRoot(item.shape, item.levels === "equal" ? L1 : CONFLICT, false)] }],
    recommendations(2),
    2,
  );
  return [level1, level2];
}

function assessmentOf(item: Case): BenchmarkAssessment {
  const policies = [
    ...(item.states ? [tenantPolicy({ name: "Synthetic property holder", settings: [tenantRoot(item.shape, item.states)], ...HOLDERS[item.holder] })] : []),
    ...(item.second === "none"
      ? []
      : [
          tenantPolicy({
            name: "Synthetic property second",
            settings: [tenantRoot(item.shape, declaredOf(item.shape).map(() => (item.second === "unassignedMatch" ? "match" : "differ")))],
            assignments: [],
          }),
        ]),
    ...(item.twin
      ? [
          tenantPolicy({
            name: "Synthetic property mac",
            platforms: "macOS",
            settings: [tenantRoot(item.shape, declaredOf(item.shape).map(() => "match"))],
            assignments: [],
          }),
        ]
      : []),
    ...(item.collected === "incomplete"
      ? [tenantPolicy({ name: "Synthetic property unread", settings: [], settingsStatus: "incomplete" })]
      : []),
  ];
  const data = collection({
    policies,
    ...(item.collected === "otherProfiles"
      ? { other: { deviceConfigurations: [deviceConfiguration("windows10GeneralConfiguration")] } }
      : {}),
  });
  return combineLevelAssessments(packsOf(item).map((delivered) => assessBenchmark(data, delivered, { now: NOW })));
}

/** One open declared setting of a result, with each root it rests on judged for it. */
interface Open {
  id: string;
  result: string;
  status: string;
  reason?: ReasonCode;
  roots: Array<{ finding: SettingFinding; verdict: ReturnType<typeof judgeDeclared> }>;
}

function openSettings(assessment: BenchmarkAssessment, result: AssessmentResult): Open[] {
  const byKey = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  const declared =
    result.kind === "recommendation"
      ? result.recommendation.settings
      : [{ id: result.finding.settingId, status: result.finding.status, result: result.finding.result, reason: result.finding.reason, findingKeys: [result.finding.key] }];
  return declared
    .filter((setting) => setting.result !== "Pass")
    .map((setting) => ({
      id: setting.id,
      result: setting.result,
      status: setting.status,
      ...(setting.reason ? { reason: setting.reason } : {}),
      roots: setting.findingKeys.map((key) => {
        const finding = byKey.get(key)!;
        return { finding, verdict: judgeDeclared(finding, setting.id, assessment.collection) };
      }),
    }));
}

/** The kinds that answer one verdict. */
function kindsFor(verdict: ReturnType<typeof judgeDeclared>, root: SettingFinding): FixActionKind[] {
  if (verdict.result === "Fail")
    // Missing below a root a policy holds: change that root; else add it.
    return verdict.status === "Missing"
      ? root.observations.length
        ? ["changeValue", "changeBeforeAssign", "assignPolicy"]
        : ["addSetting"]
      : ["changeValue"];
  switch (verdict.reason) {
    case "notAssigned":
      return ["assignPolicy"];
    case "notAssignedDiffers":
    case "notAssignedMixed":
      return ["changeBeforeAssign", "assignPolicy"];
    case "otherProfiles":
      return ["checkOtherProfiles"];
    case "unreadableValue":
      return ["checkValue"];
    case "assignmentUnknown":
      return ["checkAssignment"];
    case "collectionIncomplete":
      return ["collectAgain"];
    case "packValueUnreadable":
      return ["checkPackValue"];
    case "profileChoice":
      return ["chooseValue"];
    default:
      return [];
  }
}

/** What the next step of a result must say for a reason that needs more than a value change. */
const REASON_STEP: Partial<Record<ReasonCode, RegExp>> = {
  collectionIncomplete: /Collect again/,
  assignmentUnknown: /Check the assignments/,
  unreadableValue: /Check .* in (policy|the policies)/,
  packValueUnreadable: /by hand/,
  otherProfiles: /Check .* for (it|\d)/,
  profileChoice: /several values for this setting; choose one first|Choose one of the delivered values/,
};

const stepsOf = (action: FixAction): FixSetting[] => [...action.settings, ...(action.conditions ?? [])];

/**
 * The kinds of a step on one policy that answer how that policy alone holds
 * a declared setting: the engine's judgement (judgeDeclared) of the root with
 * only that policy, on a complete collection where nothing else may set it.
 */
function aloneKinds(root: SettingFinding, settingId: string, policyId: string): FixActionKind[] {
  const observation = root.observations.find((item) => item.policyId === policyId);
  if (!observation) return [];
  const alone = judgeDeclared({ ...root, observations: [observation] }, settingId, {
    complete: true,
    otherProfilePlatforms: [],
  });
  if (alone.result === "Fail") return alone.status === "Missing" ? ["changeValue", "changeBeforeAssign"] : ["changeValue"];
  switch (alone.reason) {
    case "notAssignedDiffers":
      return ["changeBeforeAssign"];
    // Its value cannot be compared, on the tenant or on the pack side.
    case "unreadableValue":
    case "packValueUnreadable":
      return ["checkValue"];
    case "assignmentUnknown":
      return ["checkAssignment"];
    default:
      return [];
  }
}

/** Whether the action concerns the declared setting on this root as the engine judged it. */
function concerns(
  action: FixAction,
  open: Open,
  root: Open["roots"][number],
  resultKey: string,
): boolean {
  if (!kindsFor(root.verdict, root.finding).includes(action.kind)) return false;
  // A condition for one setting compared at two Levels with one value is one step.
  const condition = (action.conditions ?? []).some(
    (step) =>
      step.findingKey === root.finding.key ||
      (step.settingId === root.finding.settingId && step.platforms === root.finding.platforms),
  );
  if (action.kind === "assignPolicy") {
    // Settled whole, or in part on this root; else a change it takes as a condition.
    const part = action.partial?.[resultKey];
    if (
      action.settles?.includes(resultKey) &&
      (!part || part.some((item) => item.settingId === open.id && item.findingKey === root.finding.key))
    )
      return true;
    return condition && aloneKinds(root.finding, open.id, action.policy!.id).includes("changeBeforeAssign");
  }
  if (!action.settings.some((step) => step.findingKey === root.finding.key) && !condition) return false;
  if (!action.policy || action.kind === "addSetting") return true;
  return aloneKinds(root.finding, open.id, action.policy.id).includes(action.kind);
}

/** Every invariant the plan breaks for one assessment, in words. */
function violations(assessment: BenchmarkAssessment, plan: FixPlan): string[] {
  const found: string[] = [];
  const results = assessmentResults(assessment).filter((item) => item.result !== "Pass" && item.result !== "Not assessed");
  let without = 0;
  for (const result of results) {
    const actions = actionsForResult(plan, result.key);
    if (!actions.length) {
      without += 1;
      continue;
    }
    const next = nextStepText(plan, result);
    for (const open of openSettings(assessment, result)) {
      // (a) every open setting is addressed by one of the result's actions.
      const roots = open.roots.filter((root) => root.verdict.result !== "Pass");
      for (const root of roots)
        if (kindsFor(root.verdict, root.finding).length && !actions.some((action) => concerns(action, open, root, result.key)))
          found.push(`(a) ${result.key} ${open.id} ${root.verdict.result}/${root.verdict.reason ?? root.verdict.status} has no action among ${actions.map((action) => action.kind).join(",")}`);
      // (d) a reason that needs more than a value change is in the next step.
      for (const root of roots) {
        const pattern = root.verdict.reason && REASON_STEP[root.verdict.reason];
        if (pattern && !pattern.test(next)) found.push(`(d) ${result.key} ${open.id} ${root.verdict.reason} not in next step: ${next}`);
      }
    }
  }
  if (plan.withoutAction !== without) found.push(`(a) withoutAction ${plan.withoutAction}, expected ${without}`);
  // Assignments are alternatives only where each settles a shared result whole.
  for (const action of plan.actions)
    for (const id of action.alternatives ?? []) {
      const other = plan.actions.find((item) => item.id === id)!;
      const whole = (item: FixAction) => (item.settles ?? []).filter((key) => !item.partial?.[key]);
      if (!whole(action).some((key) => whole(other).includes(key)))
        found.push(`(b) ${action.id} names ${id} an alternative without a result both settle whole`);
    }
  // A value check is never repeated beside the same check as a condition of assigning.
  for (const result of results) {
    const next = nextStepText(plan, result);
    for (const match of next.matchAll(/Check (\S+) in policy (.+?) before assigning it\./g))
      if (next.includes(`Check ${match[1]} in policy ${match[2]}. `)) found.push(`(b) ${result.key} checks ${match[1]} in ${match[2]} twice: ${next}`);
  }
  // Every text names what it refers to: no empty list of policies or settings.
  const texts = [
    ...plan.actions.flatMap((action) => [action.text, ...stepsOf(action).map((step) => step.text), action.caution ?? ""]),
    ...Object.values(plan.advice),
    ...results.map((result) => nextStepText(plan, result)),
  ];
  for (const text of texts)
    if (/\s{2}|\s[.,:;]|^\s|\s$/.test(text)) found.push(`(w) text with an empty name: ${text}`);
  // (b) and (c): steps for one setting agree, and a Level conflict is a choice everywhere.
  // Steps that set or name a value; a check before assigning sets none.
  const steps = plan.actions.flatMap((action) =>
    stepsOf(action)
      .filter((step) => !step.text.startsWith("Check "))
      .map((step) => ({ action, step })),
  );
  const bySetting = new Map<string, typeof steps>();
  for (const entry of steps) {
    const key = `${entry.step.platforms}:${entry.step.settingId}`;
    bySetting.set(key, [...(bySetting.get(key) ?? []), entry]);
  }
  const setsValue: ReadonlySet<FixActionKind> = new Set(["changeValue", "changeBeforeAssign", "addSetting", "assignPolicy"]);
  for (const [setting, entries] of bySetting) {
    const valued = entries.filter(({ action }) => setsValue.has(action.kind));
    const conflicted = valued.filter(({ step }) => step.levelConflict);
    if (conflicted.length && conflicted.length < valued.length)
      found.push(`(b) ${setting}: ${valued.length - conflicted.length} steps name one value while the Levels conflict`);
    const targets = new Set(valued.filter(({ step }) => !step.levelConflict).map(({ step }) => step.recommended));
    if (targets.size > 1) found.push(`(b) ${setting}: steps name the values ${[...targets].join(" and ")}`);
  }
  for (const key of Object.keys(plan.levelConflicts)) {
    for (const { action, step } of steps.filter(({ step }) => step.findingKey === key)) {
      if (!setsValue.has(action.kind)) continue;
      if (!step.levelConflict || (action.kind !== "assignPolicy" && !/target Level/i.test(step.text)))
        found.push(`(c) ${key} ${action.kind} step names a value: ${step.text}`);
      if (step.draft === "available") found.push(`(c) ${key} has a draft while the Levels conflict`);
      if (action.kind !== "assignPolicy" && !/target Level/i.test(action.text))
        found.push(`(c) ${key} ${action.kind} action text names no choice: ${action.text}`);
    }
    const advice = plan.advice[key];
    if (advice && /recommended value|A draft policy is available/.test(advice) && !/target Level/i.test(advice))
      found.push(`(c) ${key} advice names a value: ${advice}`);
  }
  // (e) each action counts exactly the results whose own declared settings it answers.
  for (const action of plan.actions) {
    if (action.kind === "assignPolicy") continue;
    const counted = new Set(action.results.map((result) => result.key));
    const expected = new Set(
      results
        .filter((result) => openSettings(assessment, result).some((open) => open.roots.some((root) => concerns(action, open, root, result.key))))
        .map((result) => result.key),
    );
    const extra = [...counted].filter((key) => !expected.has(key));
    const missing = [...expected].filter((key) => !counted.has(key));
    if (extra.length || missing.length)
      found.push(`(e) ${action.id} counts ${[...counted].join(",")}, expected ${[...expected].join(",")}`);
  }
  return found;
}

const STATES: State[] = ["match", "differ", "absent", "unreadable"];
const product = <T,>(lists: T[][]): T[][] =>
  lists.reduce<T[][]>((all, list) => all.flatMap((prefix) => list.map((value) => [...prefix, value])), [[]]);

function statesOf(shape: Shape): Array<State[] | null> {
  return [null, ...product(declaredOf(shape).map(() => STATES))];
}

function cases(shape: Shape): Case[] {
  const all: Case[] = [];
  const holders: Holder[] = ["assigned", "unassigned", "unknown", "excluded", "removal", "broadRemove"];
  for (const states of statesOf(shape))
    for (const holder of states ? holders : (["assigned"] as Holder[]))
      for (const second of ["none", "unassignedMatch", "unassignedDiffer"] as Second[])
        for (const collected of ["complete", "incomplete", "otherProfiles"] as Collected[])
          for (const packValue of ["readable", "unreadable", "profileChoice"] as PackValue[])
            for (const levels of ["single", "equal", "conflicting"] as Levels[])
              for (const delivery of ["plain", "template"] as Delivery[])
                for (const basis of (shape === "single" ? ["recommendations", "settings"] : ["recommendations", "split", "settings"]) as Basis[])
                  for (const twin of [false, true])
                    all.push({ shape, states, holder, second, collected, packValue, levels, delivery, basis, twin });
  return all;
}

/** A deterministic share of the cases: every n-th (PROP_EVERY=1 runs every combination). */
const share = <T,>(items: T[], every: number) => items.filter((_, index) => index % every === 0);

describe("fix plan invariants over synthetic assessments", () => {
  for (const [shape, every] of [
    ["single", 1],
    ["group", 14],
    ["choice", 14],
  ] as Array<[Shape, number]>)
    it(`holds for every combination with a ${shape} root`, () => {
      const failures = new Map<string, string>();
      // The dimensions the plan depends on are reached: several assignments in one plan, partial ones.
      const reached = { severalAssignments: 0, partial: 0 };
      for (const item of share(cases(shape), Number(process.env.PROP_EVERY ?? every))) {
        const assessment = assessmentOf(item);
        const plan = buildFixPlan(assessment);
        if (plan.actions.filter((action) => action.kind === "assignPolicy").length > 1) reached.severalAssignments += 1;
        if (plan.actions.some((action) => action.partial)) reached.partial += 1;
        for (const text of violations(assessment, plan)) {
          const kind = text.replace(/[0-9a-f]{8}-[0-9a-f-]{27}|synthetic_prop_\w+|L\d\/\d+:\d+|[rs]:\S+|Synthetic property \w+/g, "_").slice(0, 120);
          if (!failures.has(kind)) failures.set(kind, `${text}\n  case ${JSON.stringify(item)}`);
        }
      }
      if (shape !== "single") expect(Math.min(reached.severalAssignments, reached.partial)).toBeGreaterThan(0);
      expect([...failures.values()]).toEqual([]);
    }, process.env.PROP_EVERY ? 3_600_000 : 120_000);
});
