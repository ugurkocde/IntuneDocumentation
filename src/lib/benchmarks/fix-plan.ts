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
 * advice holds one sentence per finding that is not Pass, the same words the
 * drafts README uses (drafts.ts), so the plan and the README never disagree.
 */
import {
  assessmentResults,
  reassess,
  type AssessmentResult,
  type BenchmarkAssessment,
  type BenchmarkLevel,
  type Observation,
  type ReasonCode,
  type SettingFinding,
} from "./assessment";
import { REASON_LABELS, UNREADABLE_CAUSE_LABELS, otherProfilesText, reachText } from "./display";
import type { AssignmentReach, AssignmentState } from "./tenant-settings";
import { comparable } from "./policies";
import { NOT_CONFIGURED, differenceText, settingName, settingValue, type UnreadableCause } from "./values";

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
  | "levelConflict";

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
   * longer match.
   */
  unlocks?: { judged: number; matches: number; differs: number; regressions: number };
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
  /** Results that are neither Matches nor Not assessed and have no action; normally none. */
  withoutAction: number;
}

const INCOMPLETE =
  "The collection could not establish that the setting is missing. Refresh the policies with a complete collection and generate the drafts again.";
const TEMPLATED =
  "The pack delivers this setting in a policy created from a template, which drafts do not generate. Configure it in the matching template policy.";
const DUPLICATE = "Another draft in this ZIP already holds this setting.";
const LEVEL_CONFLICT =
  "The packs compared recommend different values for this setting, so no draft is generated.";

export const DRAFT_STATE_TEXT: Readonly<Record<Exclude<DraftState, "available">, string>> = {
  incomplete: INCOMPLETE,
  templated: TEMPLATED,
  duplicate: DUPLICATE,
  levelConflict: LEVEL_CONFLICT,
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
 * duplicate, and findings with different values (Level 1 and Level 2 packs
 * that disagree) get no draft at all, because two drafts would conflict.
 */
function draftStates(assessment: BenchmarkAssessment): Map<string, DraftState> {
  const states = new Map<string, DraftState>();
  const candidates = new Map<string, SettingFinding[]>();
  for (const finding of assessment.settings) {
    if (finding.result === "Pass" || finding.status !== "Missing") continue;
    if (!assessment.collection.complete || finding.observations.length) states.set(finding.key, "incomplete");
    else if (finding.templated) states.set(finding.key, "templated");
    else {
      const key = `${finding.platforms}:${finding.settingId}`;
      candidates.set(key, [...(candidates.get(key) ?? []), finding]);
    }
  }
  for (const findings of candidates.values()) {
    const values = new Set(findings.map((finding) => JSON.stringify(comparable(finding.recommended))));
    findings.forEach((finding, index) =>
      states.set(finding.key, values.size > 1 ? "levelConflict" : index ? "duplicate" : "available"),
    );
  }
  return states;
}

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
  finding: SettingFinding,
  draft: DraftState | undefined,
  candidate: Candidate | null,
  note: AssignmentNote,
): string {
  const list = (comparison: Observation["comparison"]) =>
    sorted(
      finding.observations
        .filter((observation) => observation.comparison === comparison)
        .map((observation) => observation.policyName),
    );
  const joined = (items: readonly string[], word: "and" | "or") =>
    items.length < 2 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} ${word} ${items.at(-1)}`;
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
      .filter((observation) => observation.comparison === comparison && observation.assignment === "notAssigned")
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
  const check = unreadable
    ? ` The value in ${unreadable} could not be read; check it before assigning ${many("unknown") ? "them" : "that policy"}.${notes("unknown", "check")}`
    : "";
  if (finding.status === "Different") {
    const policies = sorted(policiesToChange(finding).map((observation) => observation.policyName)).join(", ");
    return `Change ${name} in policy ${policies} to the recommended value ${recommended}.`;
  }
  if (finding.status === "Missing") {
    if (draft === "levelConflict")
      return `${LEVEL_CONFLICT} Choose the value for your Level and set it in ${candidateText(candidate)}.`;
    if (draft === "duplicate")
      return `${DUPLICATE} Import that draft, or add the setting to ${candidateText(candidate)}.`;
    if (draft && draft !== "available") return DRAFT_STATE_TEXT[draft];
    return `Add ${name} with the recommended value ${recommended} to ${candidateText(candidate)}. A draft policy is available.`;
  }
  switch (finding.reason) {
    case "notAssigned":
      return `${REASON_LABELS.notAssigned} Assign ${oneOf("match")} instead of importing a second one.${notes("match", "assign")}`;
    case "notAssignedMixed":
      return `${REASON_LABELS.notAssignedMixed} Assign ${oneOf("match")} instead of importing a second one, and change the value in ${names("differ")} before assigning ${many("differ") ? "them" : "it"}.${notes("match", "assign")}${notes("differ", "change")}${check}`;
    case "notAssignedDiffers":
      return `${REASON_LABELS.notAssignedDiffers} Change the value in ${names("differ")} before assigning ${many("differ") ? "them" : "it"}, or set the recommended value in a policy that is assigned.${notes("differ", "change")}`;
    case "otherProfiles":
      return `${REASON_LABELS.otherProfiles} Check ${otherProfilesText(assessment.collection.otherProfiles, finding.platforms)} for it.`;
    case "unreadableValue": {
      const unknown = finding.observations.filter((observation) => observation.comparison === "unknown");
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
  // entries, so its entries are named instead, with the settings below it
  // that the engine read as different (differenceText) where known.
  const type = finding.recommended["@odata.type"];
  const group = typeof type === "string" && GROUP_TYPES.test(type);
  // The own values compare without the note on an unreadable part of the
  // pack value ("5 (a setting below it is not readable)"); a difference
  // the engine read below the setting makes it a change below too.
  const own = settingValue(finding.recommended, finding.settingId, assessment.settingNames).text;
  const below = group || current === own || current === recommended || (observation?.differences?.length ?? 0) > 0;
  const differing = below && observation ? differenceText(observation, assessment.settingNames) : null;
  const change = (when: string) =>
    below
      ? `Change the settings below ${name} in policy ${policy} to the recommended values${when}${differing ? `: ${differing}` : ""}.`
      : `Change ${name} in policy ${policy} from ${current} to ${recommended}${when}.`;
  let text: string;
  switch (kind) {
    case "changeValue":
      text = change("");
      break;
    case "changeBeforeAssign":
      text = change(" before assigning it");
      break;
    case "assignPolicy":
      text = `Policy ${policy} holds ${name} with the recommended value ${recommended}.`;
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
      text = `Check the assignments of policy ${policy}, which holds ${name} with the recommended value ${recommended}.`;
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
 * value and checking 1 setting whose value could not be read".
 */
function conditionsPhrase(
  conditions: AssignmentCheck["conditions"],
  form: "gerund" | "imperative",
  other = false,
): string {
  const count = (change: boolean) =>
    new Set(conditions.filter((item) => item.change === change).map((item) => item.step.settingId)).size;
  const changes = count(true);
  const checks = count(false);
  const setting = (n: number) => plural(n, other ? "other setting" : "setting", other ? "other settings" : "settings");
  return [
    changes
      ? `${form === "gerund" ? "changing" : "change"} ${setting(changes)} it holds to the recommended ${changes === 1 ? "value" : "values"}`
      : "",
    checks
      ? `${form === "gerund" ? "checking" : "check"} ${setting(checks)} it holds whose ${checks === 1 ? "value" : "values"} could not be read`
      : "",
  ]
    .filter(Boolean)
    .join(" and ");
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
  // and are themselves not Pass, with the findings they rest on: an action
  // concerns a result only through such a setting, with a verdict the
  // action answers (Differs for a change, Missing for an addition, Needs
  // review for the rest).
  interface OpenSetting {
    item: AssessmentResult;
    status: SettingFinding["status"] | "Unmapped";
    result: SettingFinding["result"];
    reason?: ReasonCode;
    findingKeys: readonly string[];
  }
  const openSettings: OpenSetting[] = open
    .filter((item) => item.result !== "Not assessed")
    .flatMap((item): OpenSetting[] =>
      item.kind === "recommendation"
        ? item.recommendation.settings
            .filter((setting) => setting.result !== "Pass")
            .map((setting) => ({
              item,
              status: setting.status,
              result: setting.result,
              ...(setting.reason ? { reason: setting.reason } : {}),
              findingKeys: setting.findingKeys,
            }))
        : [
            {
              item,
              status: item.finding.status,
              result: item.finding.result,
              ...(item.finding.reason ? { reason: item.finding.reason } : {}),
              findingKeys: [item.finding.key],
            },
          ],
    );
  const accepts: Partial<Record<FixActionKind, (setting: OpenSetting) => boolean>> = {
    changeValue: (setting) => setting.result === "Fail",
    // Only a result whose own setting is held with another value is changed
    // by changing it: a setting of a root whose own value matches there
    // (notAssigned) waits for the assignment only.
    changeBeforeAssign: (setting) =>
      setting.result === "Review" && (setting.reason === "notAssignedDiffers" || setting.reason === "notAssignedMixed"),
    addSetting: (setting) => setting.status === "Missing",
  };
  const ref = (item: AssessmentResult): FixResult => ({ level: item.level, kind: item.kind, id: item.id, key: item.key });
  const resultsOf = (kind: FixActionKind, keys: Iterable<string>): FixResult[] => {
    const wanted = new Set(keys);
    const accept = accepts[kind] ?? ((setting: OpenSetting) => setting.result === "Review");
    const seen = new Map<string, AssessmentResult>();
    for (const setting of openSettings)
      if (accept(setting) && setting.findingKeys.some((key) => wanted.has(key))) seen.set(setting.item.key, setting.item);
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
    const setting = `${finding.platforms}:${finding.settingId}`;
    if (!bySetting.has(setting)) bySetting.set(setting, candidateOf(finding));
    additions.set(finding.key, bySetting.get(setting)!);
  }
  // Assigning one policy that is not assigned: the engine judges again.
  const review = open.filter((item) => item.result === "Review");
  const matching = results.filter((item) => item.result === "Pass");
  const findingByKey = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  const after = (item: AssessmentResult, simulated: ReturnType<typeof reassess>) =>
    item.kind === "recommendation"
      ? simulated.recommendations.get(`${item.level}:${item.id}`)
      : simulated.settings.get(item.finding.key);
  const checks = new Map<string, AssignmentCheck>();
  const checkOf = (policyId: string): AssignmentCheck => {
    const known = checks.get(policyId);
    if (known) return known;
    const simulated = reassess(assessment, (entry) => (entry.policyId === policyId ? "assigned" : entry.assignment));
    let differs = 0;
    const matched: AssessmentResult[] = [];
    for (const item of review) {
      const next = after(item, simulated);
      if (next === "Pass") matched.push(item);
      else if (next === "Fail") differs += 1;
    }
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
    const check = { matched, differs, regressions, conditions };
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
  const advice: Record<string, string> = {};
  for (const finding of assessment.settings)
    if (finding.result !== "Pass")
      advice[finding.key] = findingAdvice(
        assessment,
        finding,
        drafts.get(finding.key),
        additions.get(finding.key) ?? null,
        note,
      );

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
    entry.settings.push(
      settingStep(assessment, finding, kind, null, extra.draft ? { draft: extra.draft } : {}, extra.candidate ?? null),
    );
    grouped.set(id, entry);
  };

  for (const finding of assessment.settings) {
    if (finding.result === "Pass") continue;
    if (finding.status === "Different") {
      for (const observation of policiesToChange(finding)) addPolicyStep("changeValue", finding, observation);
      continue;
    }
    if (finding.status === "Missing") {
      // One action per candidate policy, or per platform without one; the
      // settings of template policies are one action of their own.
      const candidate = additions.get(finding.key) ?? null;
      const draft = drafts.get(finding.key)!;
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
          if (observation.comparison === "differ" && observation.assignment === "notAssigned")
            addPolicyStep("changeBeforeAssign", finding, observation);
        if (finding.reason === "notAssignedMixed")
          for (const observation of finding.observations)
            if (observation.comparison === "unknown") addPolicyStep("checkValue", finding, observation);
        break;
      case "otherProfiles":
        addGroupStep(`checkOtherProfiles:${finding.platforms}`, "checkOtherProfiles", finding, {
          reason: "otherProfiles",
          platforms: finding.platforms,
        });
        break;
      case "unreadableValue": {
        const unknown = finding.observations.filter((observation) => observation.comparison === "unknown");
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
  const candidates = new Map<string, Observation>();
  for (const setting of openSettings)
    if (setting.result === "Review")
      for (const key of setting.findingKeys)
        for (const observation of findingByKey.get(key)?.observations ?? [])
          if (observation.assignment === "notAssigned" && !candidates.has(observation.policyId))
            candidates.set(observation.policyId, observation);
  for (const [policyId, observation] of candidates) {
    const check = checkOf(policyId);
    const { matched, differs, regressions } = check;
    if (!matched.length) continue;
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
    actions.push({
      id: `assignPolicy:${policyId}`,
      kind: "assignPolicy",
      policy,
      settings,
      results: matched.map(ref),
      unlocks: { judged: matches + differs, matches, differs, regressions },
      ...(check.conditions.length ? { conditions: check.conditions.map(({ step }) => step) } : {}),
      ...(caution ? { caution } : {}),
      text: first
        ? `Assign policy ${policy.name} after first ${first}. Assigned as it is, it would let ${judged}. Assign it to a pilot group first.`
        : `Assign policy ${policy.name}, which would let ${judged}. Assign it to a pilot group first.`,
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
        ? `Change ${settings} in policy ${entry.policy.name} (${reach}) to the recommended ${count === 1 ? "value" : "values"}.`
        : entry.kind === "changeBeforeAssign"
          ? `Change ${settings} in policy ${entry.policy.name} to the recommended ${count === 1 ? "value" : "values"} before assigning it.${
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
      results: resultsOf(entry.kind, entry.settings.map((setting) => setting.findingKey)),
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
        text = entry.templated
          ? `Configure ${settings} in the matching template ${count === 1 ? "policy" : "policies"}: the pack delivers ${
              count === 1 ? "it" : "them"
            } in a policy created from a template, which drafts do not generate.`
          : `Add ${settings} to ${target}${
              available ? `; draft policies are available for ${plural(available, "of them", "of them")}` : ""
            }.`;
      }
    }
    actions.push({
      id,
      kind: entry.kind,
      ...(entry.candidate ? { policy: entry.candidate.policy } : {}),
      ...(entry.reason ? { reason: entry.reason } : {}),
      ...(entry.platforms ? { platforms: entry.platforms } : {}),
      settings: entry.settings,
      results: resultsOf(entry.kind, entry.settings.map((setting) => setting.findingKey)),
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
  for (const action of actions) {
    if (action.kind !== "assignPolicy") continue;
    const own = new Set(action.results.map((result) => result.key));
    const others = actions.flatMap((other, at) =>
      other !== action && other.kind === "assignPolicy" && other.results.some((result) => own.has(result.key))
        ? [{ other, step: at + 1 }]
        : [],
    );
    if (!others.length) continue;
    const shared = new Set(
      others.flatMap(({ other }) => other.results.filter((result) => own.has(result.key)).map((result) => result.key)),
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
  return { actions, byResult, advice, withoutAction };
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
 * action's caution and conditions (actionCautionLines).
 */
export function nextStepText(plan: FixPlan, result: AssessmentResult): string {
  const actions = actionsForResult(plan, result.key);
  if (!actions.length) return "";
  const keys = new Set(
    result.kind === "recommendation" ? result.recommendation.findingKeys : [result.finding.key],
  );
  const lines: string[] = [];
  // Assigning any one of the policies is enough, so they are one step;
  // what assigning each would break follows it.
  const assign = actions.filter((action) => action.kind === "assignPolicy");
  if (assign.length) {
    lines.push(`Assign policy ${assign.map((action) => action.policy!.name).join(" or ")}.`);
    for (const action of assign) lines.push(...actionCautionLines(action));
  }
  for (const action of actions) {
    if (action.kind === "assignPolicy") continue;
    const own = action.settings.filter((setting) => keys.has(setting.findingKey));
    if (own.length) lines.push(...own.map((setting) => setting.text));
    else lines.push(action.text);
    lines.push(...actionCautionLines(action));
  }
  return [...new Set(lines)].join(" ");
}
