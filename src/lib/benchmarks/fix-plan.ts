/**
 * What the customer should do next, from one assessment: the engine's
 * verdicts grouped into actions and ordered by impact. Pure; it never writes
 * to a tenant and names only what the assessment already carries (setting
 * ids and display names, tenant policy ids and names, result ids), never
 * recommendation text.
 *
 * Groups, in this order:
 * 1. changeValue: settings that differ on policies that are assigned or of
 *    unknown assignment; one action per policy, listing its settings with
 *    the current and the recommended value.
 * 2. assignPolicy: a policy that is not assigned and holds values results
 *    wait for; the engine judges the results again as if that policy alone
 *    were assigned (reassess), and the action counts the results that would
 *    then be judged, and how many of them would match or differ. Only a
 *    policy that would let at least one result match is advised, and its
 *    results are those that would match.
 * 3. changeBeforeAssign: a policy that is not assigned and holds another
 *    value (notAssignedDiffers, notAssignedMixed).
 *
 * Wherever the plan says to assign a policy that is not assigned (the
 * assignPolicy and changeBeforeAssign actions, and the advice of the
 * notAssigned family), the same simulation names what assigning it as it is
 * would break: its other values that would then differ or need review, as
 * steps to do first (conditions), and the results that would differ or no
 * longer match (caution). nextStepText and the advice carry both, so no
 * output says "assign" without them.
 * 4. checkOtherProfiles: settings not in the Settings Catalog while older
 *    profile types may set them (otherProfiles), per pack platform, naming
 *    the families present there.
 * 5. Checks by precise reason: checkValue (unreadableValue, per policy, with
 *    the cause where known), checkAssignment (assignmentUnknown, per
 *    policy), collectAgain (collectionIncomplete), checkPackValue
 *    (packValueUnreadable) and chooseValue (profileChoice).
 * 6. addSetting: settings the collection proves missing, with whether a
 *    draft policy is available, one action per candidate policy to add them
 *    to (candidatePolicies) or per platform when there is none.
 *
 * Each step answers a verdict: a finding's own, and that of every setting a
 * recommendation declares below its root, judged on that root as the
 * engine judges it (judgeDeclared). A root that differs in one setting
 * still gets the steps another setting below it needs, a setting missing
 * below a root a policy holds is added by changing that root, and an
 * action counts a result only through a declared setting whose verdict it
 * answers. An assignment that settles part of a result no single
 * assignment lets match is advised for it too (partial), beside its other
 * steps.
 *
 * advice holds the sentences of every verdict of each finding that is not
 * Pass, the same words the drafts README uses (drafts.ts), so the plan and
 * the README never disagree.
 *
 * Level 2 is compared together with Level 1 and each Level is judged against
 * its own pack's value (combineLevelAssessments), so where the two packs
 * recommend different values for a setting no single value is the target:
 * every step that would set the value (a change, a condition before
 * assigning, an addition, also in a template policy, the advice) states the
 * conflict and asks for the value of the target Level instead of naming two
 * changes that undo each other (levelConflicts), counts it as a choice, not
 * a change, and generates no draft.
 */
import {
  assessmentResults,
  judgeDeclared,
  reassess,
  type AssessmentResult,
  type BenchmarkAssessment,
  type BenchmarkLevel,
  type Observation,
  type ReasonCode,
  type SettingFinding,
} from "./assessment";
import { FORM_DIFFERS, REASON_LABELS, UNREADABLE_CAUSE_LABELS, otherProfilesText, reachText } from "./display";
import type { AssignmentReach, AssignmentState } from "./tenant-settings";
import { canonicalPlatforms } from "../compliance/graph-rows";
import { comparable, compareDefinition, differencePlace } from "./policies";
import {
  NOT_CONFIGURED,
  contrastedTexts,
  differenceText,
  findInstance,
  fullValueText,
  settingName,
  settingValue,
  type UnreadableCause,
} from "./values";

export type FixActionKind =
  | "changeValue"
  | "assignPolicy"
  | "changeBeforeAssign"
  | "checkOtherProfiles"
  | "checkValue"
  | "checkAssignment"
  | "collectAgain"
  | "checkPackValue"
  | "chooseValue"
  | "addSetting";

/** Impact order of the kinds: lower first. */
export const FIX_ACTION_ORDER: readonly FixActionKind[] = [
  "changeValue",
  "assignPolicy",
  "changeBeforeAssign",
  "checkOtherProfiles",
  "checkValue",
  "checkAssignment",
  "collectAgain",
  "checkPackValue",
  "chooseValue",
  "addSetting",
];

export interface FixPolicy {
  id: string;
  name: string;
  assignment: AssignmentState;
  reach: AssignmentReach;
}

/** Whether a missing setting can get a draft policy, and if not why. */
export type DraftState =
  | "available"
  | "incomplete"
  | "templated"
  | "duplicate"
  | "levelConflict"
  | "unreadablePack";

export interface FixSetting {
  findingKey: string;
  settingId: string;
  /** Display name, or the id when no definition names it. */
  name: string;
  packLevel: BenchmarkLevel;
  platforms: string;
  /** The policy's current value for actions on one policy; Not configured for missing settings. */
  current: string | null;
  recommended: string;
  /** Why the value cannot be read, for checkValue. */
  cause?: UnreadableCause;
  /** For addSetting. */
  draft?: DraftState;
  /**
   * The values the Levels compared recommend for this setting when they
   * differ ("Level 1 recommends 5, Level 2 recommends 10"): the step asks
   * to choose the value of the target Level instead of naming a change.
   */
  levelConflict?: string;
  /** This setting's step in plain words. */
  text: string;
}

export interface FixResult {
  level: BenchmarkLevel;
  kind: AssessmentResult["kind"];
  /** Recommendation id, or setting id for a Level judged by settings. */
  id: string;
  /** Unique result key (AssessmentResult.key). */
  key: string;
}

export interface FixAction {
  /** Stable within one plan. */
  id: string;
  kind: FixActionKind;
  /** The tenant policy the action is about, when it is about one; for addSetting the candidate to add to. */
  policy?: FixPolicy;
  /** The engine reason the action answers, for the checks. */
  reason?: ReasonCode;
  settings: FixSetting[];
  /** Results that are not Matches and that this action concerns. */
  results: FixResult[];
  /**
   * assignPolicy: results that would be judged with this policy assigned,
   * how many would match or differ, and how many that match now would no
   * longer match; stillOpen counts the results of the action that assigning
   * it as it is neither lets match nor makes differ (they need other steps
   * too), when there are any.
   */
  unlocks?: { judged: number; matches: number; differs: number; regressions: number; stillOpen?: number };
  /**
   * assignPolicy: the results no single assignment lets match that this
   * one settles in part, by result key, with the declared settings it
   * settles and the finding (pack root) each is settled on; they need
   * other steps too.
   */
  partial?: Record<string, Array<{ settingId: string; findingKey: string }>>;
  /**
   * assignPolicy: the keys of the results it settles, whole (it lets them
   * match) or in part (partial). Its other results are those whose changes
   * it takes as conditions; only settled results make two assignments
   * alternatives.
   */
  settles?: string[];
  /** checkOtherProfiles, and addSetting without a candidate policy: the pack platforms of its settings. */
  platforms?: string;
  /**
   * assignPolicy and changeBeforeAssign: the other values of the policy
   * that the simulation shows would differ or need review once it is
   * assigned as it is, as the steps to do before assigning it.
   */
  conditions?: FixSetting[];
  /**
   * What every result of the action is told besides its own steps: for
   * assignPolicy and changeBeforeAssign the results that assigning the
   * policy as it is would make differ or no longer match, for
   * checkAssignment why the assignments need checking.
   */
  caution?: string;
  /**
   * assignPolicy: the other assignPolicy actions that would let some of the
   * same results match; assigning one of them is enough for those.
   */
  alternatives?: string[];
  /** The action in plain words. */
  text: string;
}

export interface FixPlan {
  actions: FixAction[];
  /** Action ids per result key, in plan order. */
  byResult: Record<string, string[]>;
  /** One sentence per finding that is not Pass, by finding key (the drafts README uses it). */
  advice: Record<string, string>;
  /** The Level conflict of each finding whose setting the Levels recommend differently, by finding key. */
  levelConflicts: Record<string, string>;
  /** Results that are neither Matches nor Not assessed and have no action; normally none. */
  withoutAction: number;
}

const INCOMPLETE =
  "The collection could not establish that the setting is missing. Refresh the policies with a complete collection and generate the drafts again.";
const TEMPLATED_REASON =
  "The pack delivers this setting in a policy created from a template, which drafts do not generate.";
const TEMPLATED = `${TEMPLATED_REASON} Configure it in the matching template policy.`;
const DUPLICATE = "Another draft in this ZIP already holds this setting.";
const UNREADABLE_PACK =
  "Part of the delivered pack value of this setting cannot be compared, so no draft is generated.";
const LEVEL_CONFLICT =
  "The packs compared recommend different values for this setting, so no draft is generated.";

export const DRAFT_STATE_TEXT: Readonly<Record<Exclude<DraftState, "available">, string>> = {
  incomplete: INCOMPLETE,
  templated: TEMPLATED,
  duplicate: DUPLICATE,
  levelConflict: LEVEL_CONFLICT,
  unreadablePack: UNREADABLE_PACK,
};

const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const plural = (count: number, one: string, many: string) =>
  `${count.toLocaleString("en-US")} ${count === 1 ? one : many}`;

const policyRef = (observation: Observation): FixPolicy => ({
  id: observation.policyId,
  name: observation.policyName,
  assignment: observation.assignment,
  reach: observation.reach,
});

/**
 * One setting across pack policies and Levels: its platforms in canonical
 * form (the same set in any order is the same) and its definition id.
 */
const sameSetting = (finding: Pick<SettingFinding, "platforms" | "settingId">) =>
  `${canonicalPlatforms(finding.platforms) ?? finding.platforms}:${finding.settingId}`;

/** The tenant policy a missing setting is best added to, if any. */
interface Candidate {
  policy: FixPolicy;
  /** It already holds settings of the same benchmark area. */
  sameArea: boolean;
}

/** Where a missing setting goes when no candidate policy exists. */
const ANY_POLICY =
  "any assigned Settings Catalog policy for this platform (none holds these settings today)";

/**
 * The candidate policy of each missing setting: an assigned Settings Catalog
 * policy of the same platform that is not created from a template (those
 * take only their template's settings), preferring the one holding the most
 * settings of the same benchmark area, the pack policy the setting is
 * delivered in, then the most settings of the pack, then by name. Only
 * policies holding a pack setting are known to the assessment.
 */
function candidatePolicies(assessment: BenchmarkAssessment): (finding: SettingFinding) => Candidate | null {
  const area = (finding: SettingFinding) => `${finding.packLevel}:${finding.policyIndex}`;
  const byPlatform = new Map<
    string,
    Map<string, { observation: Observation; areas: Map<string, Set<string>>; settings: Set<string> }>
  >();
  for (const finding of assessment.settings)
    for (const observation of finding.observations) {
      if (observation.assignment !== "assigned" || observation.templated) continue;
      const policies = byPlatform.get(finding.platforms) ?? new Map();
      byPlatform.set(finding.platforms, policies);
      const entry = policies.get(observation.policyId) ?? { observation, areas: new Map(), settings: new Set() };
      policies.set(observation.policyId, entry);
      entry.areas.set(area(finding), (entry.areas.get(area(finding)) ?? new Set()).add(finding.key));
      entry.settings.add(finding.key);
    }
  return (finding) => {
    const own = area(finding);
    const held = (entry: { areas: Map<string, Set<string>> }) => entry.areas.get(own)?.size ?? 0;
    const [best] = [...(byPlatform.get(finding.platforms)?.values() ?? [])].sort(
      (a, b) =>
        held(b) - held(a) ||
        b.settings.size - a.settings.size ||
        a.observation.policyName.localeCompare(b.observation.policyName) ||
        a.observation.policyId.localeCompare(b.observation.policyId),
    );
    return best ? { policy: policyRef(best.observation), sameArea: held(best) > 0 } : null;
  };
}

/** The policy to add a missing setting to, in words, for one setting's step. */
const candidateText = (candidate: Candidate | null) =>
  candidate
    ? `policy ${candidate.policy.name}, which is assigned${
        candidate.sameArea ? " and already holds settings of the same benchmark area" : ""
      }`
    : ANY_POLICY;

/**
 * Draft states of the missing findings, as drafts.ts generates them: one
 * draft per platform and setting; a second finding with the same value is a
 * duplicate. A setting the Levels compared recommend differently
 * (levelConflicts, over every finding of the setting, whatever its verdict
 * or delivery) gets no draft at all, because no single value is the target;
 * one the pack delivers in a template policy stays templated, and its advice
 * states the choice too.
 */
function draftStates(assessment: BenchmarkAssessment): Map<string, DraftState> {
  const states = new Map<string, DraftState>();
  const conflicts = levelConflicts(assessment);
  const candidates = new Map<string, SettingFinding[]>();
  for (const finding of assessment.settings) {
    if (finding.result === "Pass" || finding.status !== "Missing") continue;
    if (!assessment.collection.complete || finding.observations.length) states.set(finding.key, "incomplete");
    else if (finding.templated) states.set(finding.key, "templated");
    else if (conflicts.has(finding.key)) states.set(finding.key, "levelConflict");
    else {
      const key = sameSetting(finding);
      candidates.set(key, [...(candidates.get(key) ?? []), finding]);
    }
  }
  for (const findings of candidates.values())
    findings.forEach((finding, index) => states.set(finding.key, index ? "duplicate" : "available"));
  return states;
}

const joinedWith = (items: readonly string[], word: "and" | "or") =>
  items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;

const conflictCache = new WeakMap<BenchmarkAssessment, Map<string, string>>();

/**
 * The findings whose setting the packs of the Levels compared recommend
 * with different values, by finding key, with the values in words: "Level 1
 * recommends 5, Level 2 recommends 10". A setting is the same where its
 * platforms and id are (sameSetting, as draftStates groups them); the
 * Levels conflict when the values each recommends are not the same. Values
 * that read alike (a group of settings is shown by its entry count) are not
 * repeated:
 * "Level 1 and Level 2 recommend different values".
 */
export function levelConflicts(assessment: BenchmarkAssessment): ReadonlyMap<string, string> {
  const known = conflictCache.get(assessment);
  if (known) return known;
  const bySetting = new Map<string, SettingFinding[]>();
  for (const finding of assessment.settings) {
    const key = sameSetting(finding);
    bySetting.set(key, [...(bySetting.get(key) ?? []), finding]);
  }
  const conflicts = new Map<string, string>();
  for (const findings of bySetting.values()) {
    const levels = [...new Set(findings.map((finding) => finding.packLevel))].sort((a, b) => a - b);
    if (levels.length < 2) continue;
    const at = (level: BenchmarkLevel) => findings.filter((finding) => finding.packLevel === level);
    const values = levels.map((level) =>
      JSON.stringify(sorted(at(level).map((finding) => JSON.stringify(comparable(finding.recommended))))),
    );
    if (new Set(values).size < 2) continue;
    const texts = levels.map((level) => joinedWith(sorted(at(level).map((finding) => finding.recommendedValue.text)), "or"));
    const text =
      new Set(texts).size === texts.length
        ? levels.map((level, index) => `Level ${level} recommends ${texts[index]}`).join(", ")
        : `${joinedWith(levels.map((level) => `Level ${level}`), "and")} recommend different values`;
    for (const finding of findings) conflicts.set(finding.key, text);
  }
  conflictCache.set(assessment, conflicts);
  return conflicts;
}

/** The step that sets a value the Levels recommend differently: "For S, Level 1 recommends 5, ...: choose ...". */
const chooseText = (name: string, conflict: string, where: string) =>
  `For ${name}, ${conflict}: choose the value for your target Level and set it in ${where}.`;

/**
 * The tenant policies to change for a Differs finding: those holding another
 * value that are assigned or of unknown assignment. A policy that is not
 * assigned applies to nobody, so its value is changed before assigning it.
 */
export function policiesToChange(finding: SettingFinding): Observation[] {
  return finding.status === "Different"
    ? finding.observations.filter(
        (observation) => observation.comparison === "differ" && observation.assignment !== "notAssigned",
      )
    : [];
}

const GROUP_TYPES = /groupsetting(collection)?instance$/i;

const UNCERTAINTY_STEP: Readonly<Record<"incomplete" | "unresolved", string>> = {
  incomplete: "Its assignments were not read completely; collect again to read them.",
  unresolved: "Its assignments overlap in a way that cannot be resolved without group memberships; review them.",
};

/**
 * What the advice says about assigning one policy that is not assigned, for
 * one finding: "assign" when the advice assigns it as it is, "change" or
 * "check" when the advice first changes or checks the finding's value in it
 * (that step is not repeated). Empty when assigning it breaks nothing.
 */
type AssignmentNote = (
  observation: Observation,
  finding: SettingFinding,
  context: "assign" | "change" | "check",
) => string;

const NO_ASSIGNMENT_NOTE: AssignmentNote = () => "";

/**
 * The sentence for one finding that is not Pass. The notAssigned family keeps
 * the drafts README wording: a policy that matches is the one to assign, a
 * policy that differs needs its value changed before it is assigned, and a
 * policy whose value cannot be read is named to check, never to change. Each
 * policy the advice would have assigned carries its assignment note.
 */
function findingAdvice(
  assessment: BenchmarkAssessment,
  finding: SettingFinding & { declared?: string },
  draft: DraftState | undefined,
  candidate: Candidate | null,
  note: AssignmentNote,
): string {
  // How each policy holds the setting the advice is about: the root, or a
  // setting declared below it (judgeDeclared); null where it is not held.
  const declared = finding.declared ?? finding.settingId;
  const comparisonOf = (observation: Observation): Observation["comparison"] | null => {
    if (declared === finding.settingId) return observation.comparison;
    const state = compareDefinition(finding.recommended, observation.value, declared);
    if (!state || state.holds === "no") return null;
    return state.holds === "maybe" ? "unknown" : state.comparison;
  };
  const list = (comparison: Observation["comparison"]) =>
    sorted(
      finding.observations
        .filter((observation) => comparisonOf(observation) === comparison)
        .map((observation) => observation.policyName),
    );
  const joined = joinedWith;
  // "policy A", or "policies A and B"; any one of several to assign: "one of the policies A or B".
  const names = (comparison: Observation["comparison"]) => {
    const items = list(comparison);
    return items.length === 1 ? `policy ${items[0]}` : `policies ${joined(items, "and")}`;
  };
  const oneOf = (comparison: Observation["comparison"]) => {
    const items = list(comparison);
    return items.length === 1 ? `policy ${items[0]}` : `one of the policies ${joined(items, "or")}`;
  };
  // The notes of the unassigned policies holding the finding with one comparison, by policy name.
  const notes = (comparison: Observation["comparison"], context: Parameters<AssignmentNote>[2]) => {
    const seen = new Set<string>();
    return finding.observations
      .filter((observation) => comparisonOf(observation) === comparison && observation.assignment === "notAssigned")
      .sort((a, b) => a.policyName.localeCompare(b.policyName) || a.policyId.localeCompare(b.policyId))
      .flatMap((observation) => {
        if (seen.has(observation.policyId)) return [];
        seen.add(observation.policyId);
        const text = note(observation, finding, context);
        return text ? [` ${text}`] : [];
      })
      .join("");
  };
  const name = settingName(assessment.settingNames, finding.settingId);
  const recommended = finding.recommendedValue.text;
  const unreadable = list("unknown").length ? names("unknown") : "";
  const many = (comparison: Observation["comparison"]) => list(comparison).length > 1;
  const conflict = levelConflicts(assessment).get(finding.key);
  const them = (comparison: Observation["comparison"]) => (many(comparison) ? "them" : "it");
  const check = unreadable
    ? ` The value in ${unreadable} could not be read; check it before assigning ${many("unknown") ? "them" : "that policy"}.${notes("unknown", "check")}`
    : "";
  if (finding.status === "Different") {
    const holders = sorted(policiesToChange(finding).map((observation) => observation.policyName));
    return conflict
      ? chooseText(name, conflict, holders.length === 1 ? `policy ${holders[0]}` : `policies ${joined(holders, "and")}`)
      : `Change ${name} in ${holders.length === 1 ? `policy ${holders[0]}` : `policies ${joined(holders, "and")}`} to the recommended value ${recommended}.`;
  }
  if (finding.status === "Missing") {
    if (draft === "levelConflict")
      return conflict
        ? `For ${name}, ${conflict}, so no draft is generated. Choose the value for your target Level and set it in ${candidateText(candidate)}.`
        : `${LEVEL_CONFLICT} Choose the value for your Level and set it in ${candidateText(candidate)}.`;
    if (draft === "duplicate")
      return `${DUPLICATE} Import that draft, or add the setting to ${candidateText(candidate)}.`;
    if (draft === "unreadablePack")
      return `${UNREADABLE_PACK} Add ${name} with the recommended value ${recommended} to ${candidateText(candidate)}.`;
    if (draft === "templated" && conflict)
      return `${chooseText(name, conflict, "the matching template policy")} ${TEMPLATED_REASON}`;
    if (draft && draft !== "available") return DRAFT_STATE_TEXT[draft];
    return `Add ${name} with the recommended value ${recommended} to ${candidateText(candidate)}. A draft policy is available.`;
  }
  switch (finding.reason) {
    case "notAssigned":
      return `${REASON_LABELS.notAssigned} Assign ${oneOf("match")} instead of importing a second one.${notes("match", "assign")}`;
    case "notAssignedMixed":
      return conflict
        ? `${REASON_LABELS.notAssignedMixed} Assign ${oneOf("match")} instead of importing a second one. ${chooseText(name, conflict, `${names("differ")} before assigning ${them("differ")}`)}${notes("match", "assign")}${notes("differ", "change")}${check}`
        : `${REASON_LABELS.notAssignedMixed} Assign ${oneOf("match")} instead of importing a second one, and change the value in ${names("differ")} before assigning ${them("differ")}.${notes("match", "assign")}${notes("differ", "change")}${check}`;
    case "notAssignedDiffers":
      return conflict
        ? `${REASON_LABELS.notAssignedDiffers} ${chooseText(name, conflict, `${names("differ")} before assigning ${them("differ")}, or in a policy that is assigned`)}${notes("differ", "change")}`
        : `${REASON_LABELS.notAssignedDiffers} Change the value in ${names("differ")} before assigning ${them("differ")}, or set the recommended value in a policy that is assigned.${notes("differ", "change")}`;
    case "otherProfiles":
      return `${REASON_LABELS.otherProfiles} Check ${otherProfilesText(assessment.collection.otherProfiles, finding.platforms)} for it.`;
    case "unreadableValue": {
      const unknown = finding.observations.filter((observation) => comparisonOf(observation) === "unknown");
      const causes = sorted(
        unknown.flatMap((observation) => (observation.current.cause ? [observation.current.cause] : [])),
      ) as UnreadableCause[];
      const why =
        causes.length === 1
          ? ` ${UNREADABLE_CAUSE_LABELS[causes[0]!]}`
          : "";
      return unknown.length
        ? `${REASON_LABELS.unreadableValue}${why} Check ${name} in ${unreadable} in the Intune admin center.`
        : `${REASON_LABELS.unreadableValue} Check ${name} in the policies that hold it in the Intune admin center.`;
    }
    case "assignmentUnknown": {
      const unknown = finding.observations.filter((observation) => observation.assignment === "unknown");
      const items = sorted(unknown.map((observation) => observation.policyName));
      const reasons = new Set(unknown.map((observation) => observation.reach.uncertainty ?? "incomplete"));
      const step = reasons.size === 1 ? ` ${UNCERTAINTY_STEP[[...reasons][0]!]}` : "";
      return `${REASON_LABELS.assignmentUnknown} Check the assignments of ${
        items.length === 0
          ? "the policy holding this setting"
          : items.length === 1
            ? `policy ${items[0]}`
            : `policies ${joined(items, "and")}`
      }.${step}`;
    }
    case "collectionIncomplete":
      return `${REASON_LABELS.collectionIncomplete} Collect again once the collection gaps are resolved.`;
    case "packValueUnreadable":
      return `${REASON_LABELS.packValueUnreadable} Check this setting by hand.`;
    case "profileChoice":
      return REASON_LABELS.profileChoice;
    default:
      return finding.reason ? REASON_LABELS[finding.reason] : "Review this setting.";
  }
}

/**
 * The recommended value, and the current value of one policy, of a finding
 * as one step. checkBeforeAssign checks a value that could not be read
 * before the policy holding it is assigned.
 */
function settingStep(
  assessment: BenchmarkAssessment,
  finding: SettingFinding,
  kind: FixActionKind | "checkBeforeAssign",
  observation: Observation | null,
  extra: Partial<FixSetting> = {},
  candidate: Candidate | null = null,
): FixSetting {
  const name = settingName(assessment.settingNames, finding.settingId);
  const recommended = finding.recommendedValue.text;
  const current = observation ? observation.current.text : kind === "addSetting" ? NOT_CONFIGURED : null;
  const policy = observation?.policyName ?? "";
  // From and to only where the setting's own value differs: a group of
  // settings shows entry counts, and the engine ignores extra tenant
  // entries, so its entries are named instead, with every setting below it
  // that the engine read as different (differenceText) where known.
  const type = finding.recommended["@odata.type"];
  const group = typeof type === "string" && GROUP_TYPES.test(type);
  // Whether the own value differs or a setting below it comes from the raw
  // values (differencePlace), never from the shortened texts; only a value
  // that does not differ definitely falls back to them. The own values
  // compare without the note on an unreadable part of the pack value
  // ("5 (a setting below it is not readable)").
  const own = settingValue(finding.recommended, finding.settingId, assessment.settingNames).text;
  const place = observation ? differencePlace(finding.recommended, observation.value, finding.settingId) : null;
  const below =
    group ||
    (place
      ? place !== "own"
      : current === own || current === recommended || (observation?.differences?.length ?? 0) > 0);
  const differing =
    below && observation ? differenceText(observation, assessment.settingNames, Number.POSITIVE_INFINITY) : null;
  // Values whose shortened texts read alike are shown from where they differ.
  const values =
    !below && observation
      ? contrastedTexts(
          fullValueText(findInstance(observation.value, finding.settingId), assessment.settingNames),
          fullValueText(findInstance(finding.recommended, finding.settingId), assessment.settingNames),
        )
      : null;
  const note = recommended.startsWith(own) ? recommended.slice(own.length) : "";
  const from = values?.current ?? current;
  const to = values ? `${values.recommended}${note}` : recommended;
  // Where the Levels recommend different values, a step that sets the value
  // asks for the target Level's, and one that names the value says whose.
  const conflict = levelConflicts(assessment).get(finding.key);
  const valueWords = conflict
    ? `the value Level ${finding.packLevel} recommends, ${recommended}`
    : `the recommended value ${recommended}`;
  const change = (when: string) =>
    conflict
      ? chooseText(name, conflict, `policy ${policy}${when}`)
      : below
      ? `Change the settings below ${name} in policy ${policy} to the recommended values${when}${differing ? `: ${differing}` : ""}.`
      : from === to
        ? `Change ${name} in policy ${policy} to the recommended value ${recommended}${when}: its current value ${current} ${FORM_DIFFERS}.`
        : `Change ${name} in policy ${policy} from ${from} to ${to}${when}.`;
  let text: string;
  switch (kind) {
    case "changeValue":
      text = change("");
      break;
    case "changeBeforeAssign":
      text = change(" before assigning it");
      break;
    case "assignPolicy":
      text = `Policy ${policy} holds ${name} with ${valueWords}.`;
      break;
    case "checkValue":
      text = observation
        ? `Check ${name} in policy ${policy}. ${
            observation.current.cause ? UNREADABLE_CAUSE_LABELS[observation.current.cause] : "Its value could not be read."
          }`
        : findingAdvice(assessment, finding, undefined, null, NO_ASSIGNMENT_NOTE);
      break;
    case "checkBeforeAssign":
      text = `Check ${name} in policy ${policy} before assigning it. ${
        observation?.current.cause ? UNREADABLE_CAUSE_LABELS[observation.current.cause] : "Its value could not be read."
      }`;
      break;
    case "checkAssignment":
      text = `Check the assignments of policy ${policy}, which holds ${name} with ${valueWords}.`;
      break;
    default:
      text = findingAdvice(assessment, finding, extra.draft, candidate, NO_ASSIGNMENT_NOTE);
  }
  return {
    findingKey: finding.key,
    settingId: finding.settingId,
    name,
    packLevel: finding.packLevel,
    platforms: finding.platforms,
    current,
    recommended,
    ...(observation?.current.cause && (kind === "checkValue" || kind === "checkBeforeAssign")
      ? { cause: observation.current.cause }
      : {}),
    ...(conflict ? { levelConflict: conflict } : {}),
    ...extra,
    text,
  };
}

/**
 * What the engine decides when one policy that is not assigned is assigned
 * as it is (reassess): the results needing review that would match or
 * differ, the results matching now that would no longer match, and the
 * policy's values that would then not match, each as the step to do before
 * assigning it (a change for another value, a check for one that cannot be
 * read), in pack order.
 */
interface AssignmentCheck {
  matched: AssessmentResult[];
  /** Keys of the results needing review that would differ. */
  failing: ReadonlySet<string>;
  differs: number;
  regressions: number;
  conditions: Array<{ step: FixSetting; change: boolean }>;
}

/** The conditions of a check left after the steps an action or advice already names. */
function conditionsBesides(
  check: AssignmentCheck,
  skip: { keys?: ReadonlySet<string>; texts?: ReadonlySet<string> } = {},
): AssignmentCheck["conditions"] {
  return check.conditions.filter(
    ({ step }) => !skip.keys?.has(step.findingKey) && !skip.texts?.has(step.text),
  );
}

/**
 * The steps before assigning, counted by setting (one compared at two
 * Levels is one setting): "changing 1 setting it holds to the recommended
 * value and checking 1 setting whose value could not be read". A value the
 * Levels recommend differently is a choice, not a change.
 */
function conditionsPhrase(
  conditions: AssignmentCheck["conditions"],
  form: "gerund" | "imperative",
  other = false,
): string {
  const kindOf = (item: AssignmentCheck["conditions"][number]) =>
    !item.change ? "check" : item.step.levelConflict ? "choose" : "change";
  const count = (kind: ReturnType<typeof kindOf>) =>
    new Set(conditions.filter((item) => kindOf(item) === kind).map((item) => item.step.settingId)).size;
  const changes = count("change");
  const choices = count("choose");
  const checks = count("check");
  const setting = (n: number) => plural(n, other ? "other setting" : "setting", other ? "other settings" : "settings");
  const values = (n: number) => (n === 1 ? "value" : "values");
  return joinedWith(
    [
      changes
        ? `${form === "gerund" ? "changing" : "change"} ${setting(changes)} it holds to the recommended ${values(changes)}`
        : "",
      choices
        ? `${form === "gerund" ? "choosing" : "choose"} the ${values(choices)} of ${setting(choices)} it holds for your target Level`
        : "",
      checks
        ? `${form === "gerund" ? "checking" : "check"} ${setting(checks)} it holds whose ${values(checks)} could not be read`
        : "",
    ].filter(Boolean),
    "and",
  );
}

/**
 * A change on one policy in words, counted by setting: the values to change
 * and those the Levels recommend differently, which are chosen instead.
 */
function changeText(settings: readonly FixSetting[], where: string, when: string): string {
  const chosen = new Set(settings.filter((setting) => setting.levelConflict).map((setting) => setting.settingId));
  const changes = new Set(settings.map((setting) => setting.settingId).filter((id) => !chosen.has(id))).size;
  const choices = chosen.size;
  const values = (n: number) => (n === 1 ? "value" : "values");
  const counted = (n: number) => plural(n, "setting", "settings");
  const main = changes
    ? `Change ${counted(changes)} in ${where} to the recommended ${values(changes)}${
        choices ? `, and choose the ${values(choices)} of ${counted(choices)} for your target Level` : ""
      }`
    : `Choose the ${values(choices)} of ${counted(choices)} in ${where} for your target Level`;
  return `${main}${when}${choices ? ": the Levels compared recommend different values" : ""}.`;
}

/**
 * The warning of assigning a policy as it is: the results it would make
 * differ (where the advice assigns it as it is) and those that match now and
 * would no longer match. Empty when there are none.
 */
function assignmentWarning(
  policyName: string,
  check: AssignmentCheck,
  differs: boolean,
  conditions: AssignmentCheck["conditions"],
): string {
  const effects = [
    ...(differs && check.differs ? [`${plural(check.differs, "result", "results")} differ`] : []),
    ...(check.regressions
      ? [`${plural(check.regressions, "result that matches now", "results that match now")} no longer match`]
      : []),
  ];
  if (!effects.length) return "";
  return `Assigned as it is, policy ${policyName} would make ${effects.join(" and ")}.${
    conditions.length ? "" : " Check the values it holds before assigning it."
  }`;
}

/** The fix plan of one assessment. */
export function buildFixPlan(assessment: BenchmarkAssessment): FixPlan {
  const results = assessmentResults(assessment);
  const open = results.filter((item) => item.result !== "Pass");
  // The settings of the results that are neither Matches nor Not assessed
  // and are themselves not Pass, with the findings (pack roots) they rest
  // on: an action concerns a result only through such a setting, with the
  // verdict on one of its roots the action answers (judgedOn).
  interface OpenSetting {
    item: AssessmentResult;
    /** The declared setting id: a recommendation's setting, or the finding's own. */
    id: string;
    findingKeys: readonly string[];
  }
  const openSettings: OpenSetting[] = open
    .filter((item) => item.result !== "Not assessed")
    .flatMap((item): OpenSetting[] =>
      item.kind === "recommendation"
        ? item.recommendation.settings
            .filter((setting) => setting.result !== "Pass")
            .map((setting) => ({ item, id: setting.id, findingKeys: setting.findingKeys }))
        : [{ item, id: item.finding.settingId, findingKeys: [item.finding.key] }],
    );
  const ref = (item: AssessmentResult): FixResult => ({ level: item.level, kind: item.kind, id: item.id, key: item.key });
  const findingByKey = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  // How one root judges one declared setting (judgeDeclared): an action
  // concerns a result only through a declared setting whose verdict on that
  // root is what the action answers, so a step for one setting below a root
  // never counts a result for another setting below it.
  type Judged = ReturnType<typeof judgeDeclared>;
  const judgedCache = new Map<string, Judged>();
  const judgedOn = (id: string, key: string): Judged | undefined => {
    const finding = findingByKey.get(key);
    if (!finding) return undefined;
    if (finding.settingId === id) return finding;
    const known = judgedCache.get(`${key}\n${id}`);
    if (known) return known;
    const judged = judgeDeclared(finding, id, assessment.collection);
    judgedCache.set(`${key}\n${id}`, judged);
    return judged;
  };
  const reviewFor = (reason: ReasonCode) => (verdict: Judged) => verdict.result === "Review" && verdict.reason === reason;
  const accepts: Record<Exclude<FixActionKind, "assignPolicy">, (verdict: Judged) => boolean> = {
    changeValue: (verdict) => verdict.result === "Fail",
    // Only a result whose own setting is held with another value is changed
    // by changing it, or one missing below the root the policy holds: a
    // setting of a root whose own value matches there (notAssigned) waits
    // for the assignment only.
    changeBeforeAssign: (verdict) =>
      (verdict.result === "Review" && (verdict.reason === "notAssignedDiffers" || verdict.reason === "notAssignedMixed")) ||
      (verdict.result === "Fail" && verdict.status === "Missing"),
    addSetting: (verdict) => verdict.status === "Missing",
    checkOtherProfiles: reviewFor("otherProfiles"),
    checkValue: (verdict) => reviewFor("unreadableValue")(verdict) || reviewFor("notAssignedMixed")(verdict),
    checkAssignment: reviewFor("assignmentUnknown"),
    collectAgain: reviewFor("collectionIncomplete"),
    checkPackValue: reviewFor("packValueUnreadable"),
    chooseValue: reviewFor("profileChoice"),
  };
  // An action on one policy concerns a result only where that policy's own
  // value of the declared setting is what the action answers: a root's key
  // is shared by every setting below it, so policy X differing in child A
  // and policy Y in child B each concern only the result declaring theirs.
  const policyHolds = (kind: FixActionKind, policyId: string, setting: OpenSetting, key: string, verdict: Judged) =>
    (findingByKey.get(key)?.observations ?? []).some((observation) => {
      if (observation.policyId !== policyId) return false;
      const state = compareDefinition(findingByKey.get(key)!.recommended, observation.value, setting.id);
      if (!state) return false;
      switch (kind) {
        // A setting missing below a root the policy holds is added by the
        // change of that root too (its step names it, "from Not configured").
        case "changeValue":
        case "changeBeforeAssign":
          return (state.holds === "yes" && state.comparison === "differ") || state.holds === "no";
        case "checkValue":
          return state.holds === "maybe" || (state.holds === "yes" && state.comparison === "unknown");
        case "checkAssignment":
          return state.holds === "yes" && state.comparison === "match";
        default:
          return true;
      }
    });
  type Counted = Exclude<FixActionKind, "assignPolicy">;
  const resultsOf = (kind: Counted, keys: Iterable<string>, policyId?: string): FixResult[] => {
    const wanted = new Set(keys);
    const seen = new Map<string, AssessmentResult>();
    for (const setting of openSettings)
      if (
        setting.findingKeys.some((key) => {
          if (!wanted.has(key)) return false;
          const verdict = judgedOn(setting.id, key);
          return (
            verdict !== undefined &&
            accepts[kind](verdict) &&
            (policyId === undefined || policyHolds(kind, policyId, setting, key, verdict))
          );
        })
      )
        seen.set(setting.item.key, setting.item);
    return [...seen.values()].map(ref);
  };
  const drafts = draftStates(assessment);
  const candidateOf = candidatePolicies(assessment);
  // A setting the pack delivers in a template policy goes there, not into a
  // candidate. A setting missing at two Levels is one setting: it gets the
  // candidate of its first finding.
  const additions = new Map<string, Candidate | null>();
  const bySetting = new Map<string, Candidate | null>();
  for (const finding of assessment.settings) {
    if (finding.result === "Pass" || finding.status !== "Missing" || drafts.get(finding.key) === "templated") continue;
    const setting = sameSetting(finding);
    if (!bySetting.has(setting)) bySetting.set(setting, candidateOf(finding));
    additions.set(finding.key, bySetting.get(setting)!);
  }
  // A setting missing below a root no policy holds, while the root itself
  // needs review (part of its pack value cannot be compared), is added like
  // a missing root, without a draft.
  const draftOf = (finding: SettingFinding): DraftState =>
    drafts.get(finding.key) ??
    (finding.templated ? "templated" : levelConflicts(assessment).has(finding.key) ? "levelConflict" : "unreadablePack");
  const additionOf = (finding: SettingFinding): Candidate | null => {
    if (additions.has(finding.key)) return additions.get(finding.key)!;
    if (draftOf(finding) === "templated") return null;
    const setting = sameSetting(finding);
    if (!bySetting.has(setting)) bySetting.set(setting, candidateOf(finding));
    return bySetting.get(setting)!;
  };
  // Assigning one policy that is not assigned: the engine judges again.
  const review = open.filter((item) => item.result === "Review");
  const matching = results.filter((item) => item.result === "Pass");
  const after = (item: AssessmentResult, simulated: ReturnType<typeof reassess>) =>
    item.kind === "recommendation"
      ? simulated.recommendations.get(`${item.level}:${item.id}`)
      : simulated.settings.get(item.finding.key);
  const checks = new Map<string, AssignmentCheck>();
  const checkOf = (policyId: string): AssignmentCheck => {
    const known = checks.get(policyId);
    if (known) return known;
    const simulated = reassess(assessment, (entry) => (entry.policyId === policyId ? "assigned" : entry.assignment));
    const failing = new Set<string>();
    const matched: AssessmentResult[] = [];
    for (const item of review) {
      const next = after(item, simulated);
      if (next === "Pass") matched.push(item);
      else if (next === "Fail") failing.add(item.key);
    }
    const differs = failing.size;
    // Results that match now and would not with this policy assigned (it
    // holds another value they read), so the advice never hides them.
    const regressions = matching.filter((item) => {
      const next = after(item, simulated);
      return next !== undefined && next !== "Pass";
    }).length;
    // The policy's values that would not match once it is assigned: every
    // finding it holds is judged again (profile choices are not).
    const conditions: AssignmentCheck["conditions"] = [];
    for (const finding of assessment.settings) {
      const next = simulated.settings.get(finding.key);
      if (next === undefined || next === "Pass") continue;
      for (const observation of finding.observations)
        if (observation.policyId === policyId && observation.comparison !== "match") {
          const change = observation.comparison === "differ";
          const step = settingStep(assessment, finding, change ? "changeBeforeAssign" : "checkBeforeAssign", observation);
          // A setting compared at two Levels with one value is one step.
          if (!conditions.some((item) => item.step.text === step.text)) conditions.push({ change, step });
        }
    }
    const check = { matched, failing, differs, regressions, conditions };
    checks.set(policyId, check);
    return check;
  };
  // The note of assigning a policy, in the advice of a finding it holds:
  // the warning and every step to do first, besides the one the advice names.
  const note: AssignmentNote = (observation, finding, context) => {
    const check = checkOf(observation.policyId);
    const own =
      context === "assign"
        ? []
        : [settingStep(assessment, finding, context === "change" ? "changeBeforeAssign" : "checkBeforeAssign", observation).text];
    const conditions = conditionsBesides(check, { keys: new Set([finding.key]), texts: new Set(own) });
    return [
      assignmentWarning(observation.policyName, check, context === "assign", conditions),
      ...new Set(conditions.map(({ step }) => step.text)),
    ]
      .filter(Boolean)
      .join(" ");
  };
  // Every verdict a step answers, per finding in pack order: the finding's
  // own, then each setting a recommendation declares below its root, judged
  // on that root as the engine judges it (judgeDeclared), so a root that
  // differs in one setting still gets the steps another setting below it
  // needs (collect again, check a value, check an assignment). Each is a
  // view of the finding with that verdict, with the setting it is about. A
  // setting missing below a root a policy holds is added by changing that
  // root (missingBelow), never by a draft of its own.
  type Verdict = SettingFinding & { declared: string };
  const declaredBelow = new Map<string, Set<string>>();
  for (const setting of openSettings)
    if (setting.item.kind === "recommendation")
      for (const key of setting.findingKeys)
        if (findingByKey.get(key)?.settingId !== setting.id)
          declaredBelow.set(key, (declaredBelow.get(key) ?? new Set()).add(setting.id));
  const verdictsOf = (finding: SettingFinding): Verdict[] => {
    const views: Verdict[] = finding.result === "Pass" ? [] : [{ ...finding, declared: finding.settingId }];
    for (const id of declaredBelow.get(finding.key) ?? []) {
      const judged = judgeDeclared(finding, id, assessment.collection);
      if (judged.result === "Pass") continue;
      const view: Verdict = { ...finding, status: judged.status, result: judged.result, declared: id };
      delete view.reason;
      views.push(judged.reason ? { ...view, reason: judged.reason } : view);
    }
    return views;
  };
  const verdicts = new Map(assessment.settings.map((finding) => [finding.key, verdictsOf(finding)]));
  // How a policy holds the setting a verdict is about.
  const stateOf = (finding: Verdict, observation: Observation) =>
    compareDefinition(finding.recommended, observation.value, finding.declared) ?? {
      holds: "no" as const,
      comparison: "differ" as const,
    };
  const differs = (finding: Verdict, observation: Observation) => {
    const state = stateOf(finding, observation);
    return state.holds === "yes" && state.comparison === "differ";
  };
  const unreadable = (finding: Verdict, observation: Observation) => {
    const state = stateOf(finding, observation);
    return state.holds === "maybe" || (state.holds === "yes" && state.comparison === "unknown");
  };
  // A setting missing below a root that policies hold is added there: in
  // those that apply, else before assigning one that does not.
  const missingBelow = (finding: Verdict): Array<["changeValue" | "changeBeforeAssign", Observation]> => {
    const holding = finding.observations.filter((observation) => stateOf(finding, observation).holds === "no");
    const applying = holding.filter((observation) => observation.assignment !== "notAssigned");
    return applying.length
      ? applying.map((observation) => ["changeValue", observation])
      : holding.map((observation) => ["changeBeforeAssign", observation]);
  };
  // The advice of a finding says what each of its verdicts needs.
  const advice: Record<string, string> = {};
  for (const finding of assessment.settings) {
    const sentences = (verdicts.get(finding.key) ?? []).map((view) =>
      view.status === "Missing" && view.observations.length
        ? missingBelow(view)
            .map(([kind, observation]) => settingStep(assessment, view, kind, observation).text)
            .join(" ")
        : view.status === "Missing"
          ? findingAdvice(assessment, view, draftOf(view), additionOf(view), note)
          : findingAdvice(assessment, view, drafts.get(finding.key), additions.get(finding.key) ?? null, note),
    );
    if (sentences.length) advice[finding.key] = [...new Set(sentences)].join(" ");
  }

  const actions: FixAction[] = [];
  // Actions on one policy: one per kind and policy, settings in pack order.
  const perPolicy = new Map<string, { kind: FixActionKind; policy: FixPolicy; settings: FixSetting[] }>();
  const addPolicyStep = (kind: FixActionKind, finding: SettingFinding, observation: Observation) => {
    const id = `${kind}:${observation.policyId}`;
    const entry = perPolicy.get(id) ?? { kind, policy: policyRef(observation), settings: [] };
    if (!entry.settings.some((setting) => setting.findingKey === finding.key))
      entry.settings.push(settingStep(assessment, finding, kind, observation));
    perPolicy.set(id, entry);
  };
  // Actions by reason or platform, without a policy.
  const grouped = new Map<
    string,
    {
      kind: FixActionKind;
      reason?: ReasonCode;
      platforms?: string;
      candidate?: Candidate;
      templated?: boolean;
      settings: FixSetting[];
    }
  >();
  const addGroupStep = (
    id: string,
    kind: FixActionKind,
    finding: SettingFinding,
    extra: { reason?: ReasonCode; platforms?: string; draft?: DraftState; candidate?: Candidate | null } = {},
  ) => {
    const entry = grouped.get(id) ?? {
      kind,
      ...(extra.reason ? { reason: extra.reason } : {}),
      ...(extra.platforms ? { platforms: extra.platforms } : {}),
      ...(extra.candidate ? { candidate: extra.candidate } : {}),
      ...(extra.draft === "templated" ? { templated: true } : {}),
      settings: [],
    };
    // The action says "of the same benchmark area" only when that holds for every setting.
    if (entry.candidate && extra.candidate && !extra.candidate.sameArea)
      entry.candidate = { ...entry.candidate, sameArea: false };
    const step = settingStep(assessment, finding, kind, null, extra.draft ? { draft: extra.draft } : {}, extra.candidate ?? null);
    if (!entry.settings.some((setting) => setting.findingKey === step.findingKey && setting.text === step.text))
      entry.settings.push(step);
    grouped.set(id, entry);
  };

  for (const finding of assessment.settings.flatMap((item) => verdicts.get(item.key) ?? [])) {
    if (finding.status === "Different") {
      for (const observation of finding.observations)
        if (observation.assignment !== "notAssigned" && differs(finding, observation))
          addPolicyStep("changeValue", finding, observation);
      continue;
    }
    if (finding.status === "Missing" && finding.observations.length) {
      for (const [kind, observation] of missingBelow(finding)) addPolicyStep(kind, finding, observation);
      continue;
    }
    if (finding.status === "Missing") {
      // One action per candidate policy, or per platform without one; the
      // settings of template policies are one action of their own.
      const candidate = additionOf(finding);
      const draft = draftOf(finding);
      addGroupStep(
        draft === "templated"
          ? `addSetting:templated:${finding.platforms}`
          : candidate
            ? `addSetting:${candidate.policy.id}`
            : `addSetting:${finding.platforms}`,
        "addSetting",
        finding,
        { draft, candidate, ...(candidate ? {} : { platforms: finding.platforms }) },
      );
      continue;
    }
    switch (finding.reason) {
      case "notAssignedMixed":
      case "notAssignedDiffers":
        for (const observation of finding.observations)
          if (observation.assignment === "notAssigned" && differs(finding, observation))
            addPolicyStep("changeBeforeAssign", finding, observation);
        if (finding.reason === "notAssignedMixed")
          for (const observation of finding.observations)
            if (unreadable(finding, observation)) addPolicyStep("checkValue", finding, observation);
        break;
      case "otherProfiles":
        addGroupStep(`checkOtherProfiles:${finding.platforms}`, "checkOtherProfiles", finding, {
          reason: "otherProfiles",
          platforms: finding.platforms,
        });
        break;
      case "unreadableValue": {
        const unknown = finding.observations.filter((observation) => unreadable(finding, observation));
        if (unknown.length) for (const observation of unknown) addPolicyStep("checkValue", finding, observation);
        else addGroupStep("checkValue", "checkValue", finding, { reason: "unreadableValue" });
        break;
      }
      case "assignmentUnknown":
        for (const observation of finding.observations)
          if (observation.assignment === "unknown") addPolicyStep("checkAssignment", finding, observation);
        break;
      case "collectionIncomplete":
        addGroupStep("collectAgain", "collectAgain", finding, { reason: "collectionIncomplete" });
        break;
      case "packValueUnreadable":
        addGroupStep("checkPackValue", "checkPackValue", finding, { reason: "packValueUnreadable" });
        break;
      case "profileChoice":
        addGroupStep("chooseValue", "chooseValue", finding, { reason: "profileChoice" });
        break;
      default:
        break;
    }
  }

  // A policy is advised for assignment only for results it would let match;
  // one that would only add differences is never the one to assign
  // (changeBeforeAssign names it). The results that would then differ or no
  // longer match are counted, and its values that would not match are the
  // steps to do first, so the advice does not hide them.
  // Candidates are the unassigned policies of every root on which a
  // declared setting needs review, whatever its other roots show, so a
  // root waiting for an assignment is never left out.
  const candidates = new Map<string, Observation>();
  for (const setting of openSettings)
    for (const key of setting.findingKeys)
      if (judgedOn(setting.id, key)?.result === "Review")
        for (const observation of findingByKey.get(key)?.observations ?? [])
          if (observation.assignment === "notAssigned" && !candidates.has(observation.policyId))
            candidates.set(observation.policyId, observation);
  // A result no single assignment lets match may still wait for one: an
  // open setting of it matches only on unassigned policies, and assigning
  // one of them settles that setting while the result needs other steps
  // too (it holds another setting to check, change or collect). Such an
  // assignment is advised for it as a part (partial), with the settings it
  // settles, so no output leaves out the assignment it waits for.
  const fullyMatched = new Set([...candidates.keys()].flatMap((policyId) => checkOf(policyId).matched.map((item) => item.key)));
  const settles = (policyId: string, setting: OpenSetting) =>
    setting.findingKeys.filter((key) => {
      const verdict = judgedOn(setting.id, key);
      const finding = findingByKey.get(key);
      if (!verdict || !finding || !(reviewFor("notAssigned")(verdict) || reviewFor("notAssignedMixed")(verdict))) return false;
      const assigned = {
        ...finding,
        observations: finding.observations.map((entry) =>
          entry.policyId === policyId ? { ...entry, assignment: "assigned" as const } : entry,
        ),
      };
      return judgeDeclared(assigned, setting.id, assessment.collection).result === "Pass";
    });
  const partialOf = (policyId: string) => {
    const partial: NonNullable<FixAction["partial"]> = {};
    for (const setting of openSettings) {
      if (fullyMatched.has(setting.item.key)) continue;
      for (const findingKey of settles(policyId, setting))
        (partial[setting.item.key] ??= []).push({ settingId: setting.id, findingKey });
    }
    return partial;
  };
  // An assignment that settles only part of what another assignment
  // settles for the same result is not needed for it; two that settle the
  // same are alternatives (nextStepText joins them with "or").
  const pairKey = (item: { settingId: string; findingKey: string }) => `${item.findingKey}\t${item.settingId}`;
  const partials = new Map([...candidates.keys()].map((policyId) => [policyId, partialOf(policyId)]));
  const settled = new Map(
    [...partials].map(([policyId, partial]) => [
      policyId,
      new Map(Object.entries(partial).map(([key, items]) => [key, new Set(items.map(pairKey))])),
    ]),
  );
  for (const [policyId, partial] of partials)
    for (const key of Object.keys(partial)) {
      const own = settled.get(policyId)!.get(key)!;
      const covered = [...settled].some(([other, sets]) => {
        const theirs = other === policyId ? undefined : sets.get(key);
        return theirs !== undefined && theirs.size > own.size && [...own].every((item) => theirs.has(item));
      });
      if (covered) delete partial[key];
    }
  for (const [policyId, observation] of candidates) {
    const check = checkOf(policyId);
    const { matched, differs, regressions } = check;
    const partial = partials.get(policyId)!;
    const helped = Object.keys(partial);
    if (!matched.length && !helped.length) continue;
    const matches = matched.length;
    const keys = new Set(
      matched.flatMap((item) => (item.kind === "recommendation" ? item.recommendation.findingKeys : [item.finding.key])),
    );
    const settings = [...keys]
      .map((key) => findingByKey.get(key)!)
      .filter((finding) => finding && finding.result !== "Pass")
      .flatMap((finding) => {
        const held = finding.observations.find(
          (entry) => entry.policyId === policyId && entry.comparison === "match",
        );
        return held ? [settingStep(assessment, finding, "assignPolicy", held)] : [];
      });
    const policy = policyRef(observation);
    const caution = assignmentWarning(policy.name, check, true, check.conditions);
    const first = conditionsPhrase(check.conditions, "gerund") || (caution ? "checking the values it holds" : "");
    const judged = `${plural(matches + differs, "result", "results")} be judged: ${matches.toLocaleString(
      "en-US",
    )} would match${differs ? ` and ${differs.toLocaleString("en-US")} would differ` : ""}${
      regressions
        ? `, and ${plural(regressions, "result that matches now", "results that match now")} would no longer match`
        : ""
    }`;
    const settledCount = new Set(Object.values(partial).flatMap((items) => items.map((item) => item.settingId))).size;
    const part = helped.length
      ? `${matches ? " It also holds" : first ? ". It holds" : ": it holds"} the matching value of ${plural(settledCount, "setting", "settings")} that ${plural(
          helped.length,
          "result needs",
          "results need",
        )} besides ${helped.length === 1 ? "its" : "their"} other steps.`
      : "";
    const head = first ? `Assign policy ${policy.name} after first ${first}` : `Assign policy ${policy.name}`;
    actions.push({
      id: `assignPolicy:${policyId}`,
      kind: "assignPolicy",
      policy,
      settings,
      results: [...matched.map(ref), ...open.filter((item) => helped.includes(item.key)).map(ref)],
      settles: [...matched.map((item) => item.key), ...helped],
      unlocks: { judged: matches + differs, matches, differs, regressions },
      ...(helped.length ? { partial } : {}),
      ...(check.conditions.length ? { conditions: check.conditions.map(({ step }) => step) } : {}),
      ...(caution ? { caution } : {}),
      text: matches
        ? `${first ? `${head}. Assigned as it is, it would let` : `${head}, which would let`} ${judged}.${part} Assign it to a pilot group first.`
        : `${head}${part} Assign it to a pilot group first.`,
    });
  }

  for (const [id, entry] of perPolicy) {
    // A setting compared at two Levels is one setting to change.
    const count = new Set(entry.settings.map((setting) => setting.settingId)).size;
    const settings = plural(count, "setting", "settings");
    const reach = reachText({ assignment: entry.policy.assignment, reach: entry.policy.reach });
    // Changing these values is not all that assigning the policy needs: its
    // other values that would not match are steps too, and the results it
    // would make no longer match are said.
    const check = entry.kind === "changeBeforeAssign" ? checkOf(entry.policy.id) : null;
    const conditions = check
      ? conditionsBesides(check, {
          keys: new Set(entry.settings.map((setting) => setting.findingKey)),
          texts: new Set(entry.settings.map((setting) => setting.text)),
        })
      : [];
    const warning = check ? assignmentWarning(entry.policy.name, check, false, conditions) : "";
    const also = conditionsPhrase(conditions, "imperative", true);
    const uncertainty = UNCERTAINTY_STEP[entry.policy.reach.uncertainty ?? "incomplete"];
    const text =
      entry.kind === "changeValue"
        ? changeText(entry.settings, `policy ${entry.policy.name} (${reach})`, "")
        : entry.kind === "changeBeforeAssign"
          ? `${changeText(entry.settings, `policy ${entry.policy.name}`, " before assigning it")}${
              also
                ? ` Before assigning it, also ${also}${
                    check!.regressions
                      ? `: assigned as it is, it would make ${plural(
                          check!.regressions,
                          "result that matches now",
                          "results that match now",
                        )} no longer match`
                      : ""
                  }.`
                : warning
                  ? ` ${warning}`
                  : ""
            }`
          : entry.kind === "checkValue"
            ? `Check ${settings} in policy ${entry.policy.name}: the ${count === 1 ? "value" : "values"} could not be read.`
            : `Check the assignments of policy ${entry.policy.name}. ${uncertainty}`;
    actions.push({
      id,
      kind: entry.kind,
      policy: entry.policy,
      ...(entry.kind === "checkValue" ? { reason: "unreadableValue" as const } : {}),
      ...(entry.kind === "checkAssignment" ? { reason: "assignmentUnknown" as const, caution: uncertainty } : {}),
      ...(conditions.length ? { conditions: conditions.map(({ step }) => step) } : {}),
      ...(warning ? { caution: warning } : {}),
      settings: entry.settings,
      results: resultsOf(
        entry.kind as Counted,
        entry.settings.map((setting) => setting.findingKey),
        entry.policy.id,
      ),
      text,
    });
  }

  for (const [id, entry] of grouped) {
    // A setting compared at two Levels is one setting.
    const count = new Set(entry.settings.map((setting) => setting.settingId)).size;
    const settings = plural(count, "setting", "settings");
    let text: string;
    switch (entry.kind) {
      case "checkOtherProfiles":
        text = `Check ${otherProfilesText(assessment.collection.otherProfiles, entry.platforms ?? "")} for ${settings} not found in the Settings Catalog.`;
        break;
      case "collectAgain":
        text = `Collect again once the collection gaps are resolved: ${settings} cannot be shown to match or to be missing until then.`;
        break;
      case "checkPackValue":
        text = `Check ${settings} by hand: the delivered pack holds values that cannot be compared.`;
        break;
      case "chooseValue":
        text = `Choose one of the delivered values for ${settings}: the pack holds several.`;
        break;
      case "checkValue":
        text = `Check ${settings} in the policies that hold them: the values could not be read.`;
        break;
      default: {
        const available = new Set(
          entry.settings.filter((setting) => setting.draft === "available").map((setting) => setting.settingId),
        ).size;
        const target = entry.candidate
          ? `policy ${entry.candidate.policy.name} (${reachText(entry.candidate.policy)})${
              entry.candidate.sameArea ? ", which already holds settings of the same benchmark area" : ""
            }`
          : ANY_POLICY;
        // Settings the Levels recommend differently are a choice, never one value.
        const chosen = new Set(
          entry.settings.filter((setting) => setting.levelConflict).map((setting) => setting.settingId),
        ).size;
        const choice = chosen
          ? ` The Levels compared recommend different values for ${
              chosen === count ? (count === 1 ? "it" : "them") : plural(chosen, "of them", "of them")
            }: choose the value for your target Level.`
          : "";
        text = entry.templated
          ? `Configure ${settings} in the matching template ${count === 1 ? "policy" : "policies"}: the pack delivers ${
              count === 1 ? "it" : "them"
            } in a policy created from a template, which drafts do not generate.${choice}`
          : `Add ${settings} to ${target}${
              available ? `; draft policies are available for ${plural(available, "of them", "of them")}` : ""
            }.${choice}`;
      }
    }
    actions.push({
      id,
      kind: entry.kind,
      ...(entry.candidate ? { policy: entry.candidate.policy } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.platforms ? { platforms: entry.platforms } : {}),
      settings: entry.settings,
      results: resultsOf(entry.kind as Counted, entry.settings.map((setting) => setting.findingKey)),
      text,
    });
  }

  // Changing values of a policy and assigning it is one step: the change
  // joins the assignment as its conditions, with the results it changes.
  const assigning = new Map(
    actions.filter((action) => action.kind === "assignPolicy").map((action) => [action.policy!.id, action]),
  );
  const merged = actions.filter((action) => {
    const assign = action.kind === "changeBeforeAssign" ? assigning.get(action.policy!.id) : undefined;
    if (!assign) return true;
    const keys = new Set(assign.results.map((result) => result.key));
    assign.results.push(...action.results.filter((result) => !keys.has(result.key)));
    const conditions = assign.conditions ?? [];
    const texts = new Set(conditions.map((setting) => setting.text));
    assign.conditions = [...conditions, ...action.settings.filter((setting) => !texts.has(setting.text))];
    return false;
  });
  // The results of an assignment that assigning it as it is neither lets
  // match nor makes differ, so a view counting those that would differ
  // never takes them for such.
  for (const action of merged) {
    if (action.kind !== "assignPolicy") continue;
    const check = checkOf(action.policy!.id);
    const matched = new Set(check.matched.map((item) => item.key));
    const stillOpen = action.results.filter((result) => !matched.has(result.key) && !check.failing.has(result.key)).length;
    if (stillOpen) action.unlocks = { ...action.unlocks!, stillOpen };
  }
  // An action no counted result asks for is left out (the drafts README
  // still names the policies to change, policiesToChange).
  const asked = merged.filter((action) => action.results.length > 0);
  actions.length = 0;
  actions.push(...asked);
  actions.sort(
    (a, b) =>
      FIX_ACTION_ORDER.indexOf(a.kind) - FIX_ACTION_ORDER.indexOf(b.kind) ||
      (b.unlocks?.judged ?? b.results.length) - (a.unlocks?.judged ?? a.results.length) ||
      (a.policy?.name ?? "").localeCompare(b.policy?.name ?? "") ||
      a.id.localeCompare(b.id),
  );
  // Assigning policies that would let the same results match are
  // alternatives for those results: one of them is enough. Each says so,
  // by the step numbers the plan is shown with.
  // Only results an assignment settles whole make alternatives: not one it
  // settles in part, nor one whose change it only takes as a condition.
  const whole = (action: FixAction) =>
    action.results.filter((result) => action.settles?.includes(result.key) && !action.partial?.[result.key]);
  for (const action of actions) {
    if (action.kind !== "assignPolicy") continue;
    const own = new Set(whole(action).map((result) => result.key));
    const others = actions.flatMap((other, at) =>
      other !== action && other.kind === "assignPolicy" && whole(other).some((result) => own.has(result.key))
        ? [{ other, step: at + 1 }]
        : [],
    );
    if (!others.length) continue;
    const shared = new Set(
      others.flatMap(({ other }) => whole(other).filter((result) => own.has(result.key)).map((result) => result.key)),
    ).size;
    const steps = others.map(({ step }) => step);
    const list = steps.length === 1 ? `${steps[0]}` : `${steps.slice(0, -1).join(", ")} and ${steps.at(-1)}`;
    action.alternatives = others.map(({ other }) => other.id);
    action.text = `${action.text} ${steps.length === 1 ? `Step ${list} is an alternative` : `Steps ${list} are alternatives`} for ${plural(
      shared,
      "of these results",
      "of these results",
    )}: assigning one of the policies is enough for ${shared === 1 ? "it" : "them"}.`;
  }
  const byResult: Record<string, string[]> = {};
  for (const action of actions)
    for (const result of action.results) (byResult[result.key] ??= []).push(action.id);
  const withoutAction = open.filter((item) => item.result !== "Not assessed" && !byResult[item.key]).length;
  return {
    actions,
    byResult,
    advice,
    levelConflicts: Object.fromEntries(levelConflicts(assessment)),
    withoutAction,
  };
}

/** The actions of one result, in plan order. */
export function actionsForResult(plan: FixPlan, resultKey: string): FixAction[] {
  const ids = plan.byResult[resultKey] ?? [];
  return plan.actions.filter((action) => ids.includes(action.id));
}

/** What an action tells each of its results besides its own steps: its caution, then its conditions. */
export function actionCautionLines(action: FixAction): string[] {
  return [...(action.caution ? [action.caution] : []), ...(action.conditions ?? []).map((setting) => setting.text)];
}

/**
 * The next step of one result as one line: the steps of its findings in
 * its highest impact actions ("Change S in policy P from A to B."), or the
 * action text when none of its findings is listed, each followed by the
 * action's caution and conditions (actionCautionLines, or what cautionLines
 * gives for an action, such as where a view lists its conditions in full).
 */
export function nextStepText(
  plan: FixPlan,
  result: AssessmentResult,
  cautionLines: (action: FixAction) => string[] = actionCautionLines,
): string {
  const actions = actionsForResult(plan, result.key);
  if (!actions.length) return "";
  const keys = new Set(
    result.kind === "recommendation" ? result.recommendation.findingKeys : [result.finding.key],
  );
  const lines: string[] = [];
  // Assigning any one of the policies is enough, so they are one step;
  // what assigning each would break follows it. Assignments that settle
  // only part of the result are one step per set of settings they settle.
  // An assignment that only takes this result's change as a condition is a
  // step of its own, never an alternative.
  const assign = actions.filter((action) => action.kind === "assignPolicy");
  const groups = new Map<string, FixAction[]>();
  const afterChanges: FixAction[] = [];
  for (const action of assign) {
    if (!action.settles?.includes(result.key)) {
      afterChanges.push(action);
      continue;
    }
    const part = action.partial?.[result.key];
    const group = part ? `part:${sorted(part.map((item) => `${item.findingKey}\t${item.settingId}`)).join("\n")}` : "whole";
    groups.set(group, [...(groups.get(group) ?? []), action]);
  }
  for (const group of groups.values()) {
    lines.push(`Assign policy ${group.map((action) => action.policy!.name).join(" or ")}.`);
    for (const action of group) lines.push(...cautionLines(action));
  }
  for (const action of afterChanges) {
    lines.push(`Assign policy ${action.policy!.name} after the changes below.`);
    lines.push(...cautionLines(action));
  }
  // A value check another step of this result already names as a
  // condition of assigning the same policy, for the same setting (one step
  // for a setting compared at two Levels), is not repeated.
  const where = (policyId: string, setting: FixSetting) => `${policyId}\n${sameSetting(setting)}`;
  const conditioned = new Set(
    actions.flatMap((action) =>
      action.policy ? (action.conditions ?? []).map((setting) => where(action.policy!.id, setting)) : [],
    ),
  );
  for (const action of actions) {
    if (action.kind === "assignPolicy") continue;
    const own = action.settings.filter((setting) => keys.has(setting.findingKey));
    const shown =
      action.kind === "checkValue" && action.policy
        ? own.filter((setting) => !conditioned.has(where(action.policy!.id, setting)))
        : own;
    if (own.length && !shown.length) continue;
    if (shown.length) lines.push(...shown.map((setting) => setting.text));
    else lines.push(action.text);
    lines.push(...cautionLines(action));
  }
  return [...new Set(lines)].join(" ");
}
