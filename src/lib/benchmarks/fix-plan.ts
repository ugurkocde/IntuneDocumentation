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
import { NOT_CONFIGURED, settingName, type UnreadableCause } from "./values";

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
 * The sentence for one finding that is not Pass. The notAssigned family keeps
 * the drafts README wording: a policy that matches is the one to assign, a
 * policy that differs needs its value changed before it is assigned, and a
 * policy whose value cannot be read is named to check, never to change.
 */
function findingAdvice(
  assessment: BenchmarkAssessment,
  finding: SettingFinding,
  draft: DraftState | undefined,
  candidate: Candidate | null = null,
): string {
  const names = (comparison: Observation["comparison"], filter: (o: Observation) => boolean = () => true) =>
    sorted(
      finding.observations
        .filter((observation) => observation.comparison === comparison && filter(observation))
        .map((observation) => observation.policyName),
    ).join(", ");
  const name = settingName(assessment.settingNames, finding.settingId);
  const recommended = finding.recommendedValue.text;
  const unreadable = names("unknown");
  const check = unreadable
    ? ` The value in policy ${unreadable} could not be read; check it before assigning that policy.`
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
      return `${REASON_LABELS.notAssigned} Assign policy ${names("match")} instead of importing a second one.`;
    case "notAssignedMixed":
      return `${REASON_LABELS.notAssignedMixed} Assign policy ${names("match")} instead of importing a second one, and change the value in policy ${names("differ")} before assigning it.${check}`;
    case "notAssignedDiffers":
      return `${REASON_LABELS.notAssignedDiffers} Change the value in policy ${names("differ")} before assigning it, or set the recommended value in a policy that is assigned.`;
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
        ? `${REASON_LABELS.unreadableValue}${why} Check ${name} in policy ${unreadable} in the Intune admin center.`
        : `${REASON_LABELS.unreadableValue} Check ${name} in the policies that hold it in the Intune admin center.`;
    }
    case "assignmentUnknown": {
      const unknown = finding.observations.filter((observation) => observation.assignment === "unknown");
      const policies = sorted(unknown.map((observation) => observation.policyName)).join(", ");
      const reasons = new Set(unknown.map((observation) => observation.reach.uncertainty ?? "incomplete"));
      const step = reasons.size === 1 ? ` ${UNCERTAINTY_STEP[[...reasons][0]!]}` : "";
      return `${REASON_LABELS.assignmentUnknown} Check the assignments of policy ${policies || "holding this setting"}.${step}`;
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

/** The recommended value, and the current value of one policy, of a finding as one step. */
function settingStep(
  assessment: BenchmarkAssessment,
  finding: SettingFinding,
  kind: FixActionKind,
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
  // entries, so its entries are named instead.
  const type = finding.recommended["@odata.type"];
  const group = typeof type === "string" && GROUP_TYPES.test(type);
  const change =
    group || current === recommended
      ? `Change the settings below ${name} in policy ${policy} to the recommended values`
      : `Change ${name} in policy ${policy} from ${current} to ${recommended}`;
  let text: string;
  switch (kind) {
    case "changeValue":
      text = `${change}.`;
      break;
    case "changeBeforeAssign":
      text = `${change} before assigning it.`;
      break;
    case "assignPolicy":
      text = `Policy ${policy} holds ${name} with the recommended value ${recommended}.`;
      break;
    case "checkValue":
      text = observation
        ? `Check ${name} in policy ${policy}. ${
            observation.current.cause ? UNREADABLE_CAUSE_LABELS[observation.current.cause] : "Its value could not be read."
          }`
        : findingAdvice(assessment, finding, undefined);
      break;
    case "checkAssignment":
      text = `Check the assignments of policy ${policy}, which holds ${name} with the recommended value ${recommended}.`;
      break;
    default:
      text = findingAdvice(assessment, finding, extra.draft, candidate);
  }
  return {
    findingKey: finding.key,
    settingId: finding.settingId,
    name,
    packLevel: finding.packLevel,
    platforms: finding.platforms,
    current,
    recommended,
    ...(observation?.current.cause && kind === "checkValue" ? { cause: observation.current.cause } : {}),
    ...extra,
    text,
  };
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
    findingKeys: readonly string[];
  }
  const openSettings: OpenSetting[] = open
    .filter((item) => item.result !== "Not assessed")
    .flatMap((item): OpenSetting[] =>
      item.kind === "recommendation"
        ? item.recommendation.settings
            .filter((setting) => setting.result !== "Pass")
            .map((setting) => ({ item, status: setting.status, result: setting.result, findingKeys: setting.findingKeys }))
        : [{ item, status: item.finding.status, result: item.finding.result, findingKeys: [item.finding.key] }],
    );
  const accepts: Partial<Record<FixActionKind, (setting: OpenSetting) => boolean>> = {
    changeValue: (setting) => setting.result === "Fail",
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
  const advice: Record<string, string> = {};
  for (const finding of assessment.settings)
    if (finding.result !== "Pass")
      advice[finding.key] = findingAdvice(
        assessment,
        finding,
        drafts.get(finding.key),
        additions.get(finding.key) ?? null,
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

  // Assigning one policy that is not assigned: the engine judges again.
  const review = open.filter((item) => item.result === "Review");
  const findingByKey = new Map(assessment.settings.map((finding) => [finding.key, finding]));
  const candidates = new Map<string, Observation>();
  for (const setting of openSettings)
    if (setting.result === "Review")
      for (const key of setting.findingKeys)
        for (const observation of findingByKey.get(key)?.observations ?? [])
          if (observation.assignment === "notAssigned" && !candidates.has(observation.policyId))
            candidates.set(observation.policyId, observation);
  const matching = results.filter((item) => item.result === "Pass");
  const after = (item: AssessmentResult, simulated: ReturnType<typeof reassess>) =>
    item.kind === "recommendation"
      ? simulated.recommendations.get(`${item.level}:${item.id}`)
      : simulated.settings.get(item.finding.key);
  for (const [policyId, observation] of candidates) {
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
    // A policy is advised for assignment only for results it would let
    // match; one that would only add differences is never the one to assign
    // (changeBeforeAssign names it). The results that would then differ are
    // counted so the advice does not hide them.
    if (!matched.length) continue;
    const matches = matched.length;
    const judged = matched;
    const keys = new Set(
      judged.flatMap((item) => (item.kind === "recommendation" ? item.recommendation.findingKeys : [item.finding.key])),
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
    actions.push({
      id: `assignPolicy:${policyId}`,
      kind: "assignPolicy",
      policy,
      settings,
      results: judged.map(ref),
      unlocks: { judged: matches + differs, matches, differs, regressions },
      text: `Assign policy ${policy.name}, which would let ${plural(matches + differs, "result", "results")} be judged: ${matches.toLocaleString(
        "en-US",
      )} would match${differs ? ` and ${differs.toLocaleString("en-US")} would differ` : ""}${
        regressions
          ? `, and ${plural(regressions, "result that matches now", "results that match now")} would no longer match`
          : ""
      }.${differs || regressions ? " Change the values it holds first." : ""} Assign it to a pilot group first.`,
    });
  }

  for (const [id, entry] of perPolicy) {
    // A setting compared at two Levels is one setting to change.
    const count = new Set(entry.settings.map((setting) => setting.settingId)).size;
    const settings = plural(count, "setting", "settings");
    const reach = reachText({ assignment: entry.policy.assignment, reach: entry.policy.reach });
    const text =
      entry.kind === "changeValue"
        ? `Change ${settings} in policy ${entry.policy.name} (${reach}) to the recommended ${count === 1 ? "value" : "values"}.`
        : entry.kind === "changeBeforeAssign"
          ? `Change ${settings} in policy ${entry.policy.name} to the recommended ${count === 1 ? "value" : "values"} before assigning it.`
          : entry.kind === "checkValue"
            ? `Check ${settings} in policy ${entry.policy.name}: the ${count === 1 ? "value" : "values"} could not be read.`
            : `Check the assignments of policy ${entry.policy.name}. ${UNCERTAINTY_STEP[entry.policy.reach.uncertainty ?? "incomplete"]}`;
    actions.push({
      id,
      kind: entry.kind,
      policy: entry.policy,
      ...(entry.kind === "checkValue" ? { reason: "unreadableValue" as const } : {}),
      ...(entry.kind === "checkAssignment" ? { reason: "assignmentUnknown" as const } : {}),
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

  // An action no counted result asks for is left out (the drafts README
  // still names the policies to change, policiesToChange).
  const asked = actions.filter((action) => action.results.length > 0);
  actions.length = 0;
  actions.push(...asked);
  actions.sort(
    (a, b) =>
      FIX_ACTION_ORDER.indexOf(a.kind) - FIX_ACTION_ORDER.indexOf(b.kind) ||
      (b.unlocks?.judged ?? b.results.length) - (a.unlocks?.judged ?? a.results.length) ||
      (a.policy?.name ?? "").localeCompare(b.policy?.name ?? "") ||
      a.id.localeCompare(b.id),
  );
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

/**
 * The next step of one result as one line: the steps of its findings in
 * its highest impact actions ("Change S in policy P from A to B."), or the
 * action text when none of its findings is listed.
 */
export function nextStepText(plan: FixPlan, result: AssessmentResult): string {
  const actions = actionsForResult(plan, result.key);
  if (!actions.length) return "";
  const keys = new Set(
    result.kind === "recommendation" ? result.recommendation.findingKeys : [result.finding.key],
  );
  const lines: string[] = [];
  // Assigning any one of the policies is enough, so they are one step.
  const assign = actions.filter((action) => action.kind === "assignPolicy").map((action) => action.policy!.name);
  if (assign.length) lines.push(`Assign policy ${assign.join(" or ")}.`);
  for (const action of actions) {
    if (action.kind === "assignPolicy") continue;
    const own = action.settings.filter((setting) => keys.has(setting.findingKey));
    if (own.length) lines.push(...own.map((setting) => setting.text));
    else lines.push(action.text);
  }
  return [...new Set(lines)].join(" ");
}
