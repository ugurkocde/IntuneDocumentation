/**
 * Draft Settings Catalog policies for benchmark settings the collection
 * proves missing. The app never writes them to a tenant: the admin imports
 * the files (Devices > Manage devices > Configuration > Create > Import
 * policy), as with the compliance fix pack, whose warning, gating style and
 * ZIP writer are reused here.
 *
 * Owner decision (2026-10-22): a draft only for a Missing setting on a
 * complete collection. A Different setting names the tenant policy to change
 * in the README, because a second policy with another value conflicts on
 * devices. Pack policies created from a template are not generated. Drafts
 * carry generic names and recommendation ids only: never a pack policy name
 * or recommendation text.
 *
 * The document shape is the one the fix pack verified by creating an
 * unassigned policy in the lab tenant (fix-pack.ts); the plain Settings
 * Catalog properties (templateReference with an empty templateId and family
 * none, roleScopeTagIds, platforms and technologies strings) were read back
 * from the lab tenant again on 2026-10-22 (GET only).
 */
import {
  buildDraftZip,
  FIX_PACK_DESCRIPTION_MAX,
  FIX_PACK_WARNING,
} from "../compliance/fix-pack";
import type { BenchmarkAssessment, SettingFinding } from "./assessment";
import { READINESS_DISCLAIMER } from "./display";
import { settingName } from "./values";
import {
  DRAFT_STATE_TEXT,
  buildFixPlan,
  policiesToChange,
  type FixPlan,
} from "./fix-plan";
import type { BenchmarkPack } from "./pack";
import {
  parsePolicies,
  record,
  type BaselinePolicy,
  type Json,
  type SettingInstance,
} from "./policies";

/** Body of POST /beta/deviceManagement/configurationPolicies, never with assignments. */
export interface BenchmarkDraftDocument {
  name: string;
  description: string;
  platforms: string;
  technologies: string;
  roleScopeTagIds: string[];
  templateReference: { templateId: ""; templateFamily: "none" };
  settings: Array<{
    "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting";
    settingInstance: SettingInstance;
  }>;
}

export interface BenchmarkDraft {
  fileName: string;
  /** Recommendation ids the settings of this draft implement. */
  recommendationIds: string[];
  settingIds: string[];
  /**
   * The assigned tenant policies the fix plan names to add these settings
   * to instead (fix-plan.ts candidatePolicies); empty when there is none.
   */
  addTo: string[];
  json: BenchmarkDraftDocument;
}

/** A setting held with another value: change the named tenant policies. */
export interface BenchmarkDraftChange {
  settingId: string;
  recommendationIds: string[];
  /** Tenant policy names, as the collection shows them. */
  policies: string[];
  /**
   * The values the Levels compared recommend when they differ (fix-plan.ts
   * levelConflicts): the value of the target Level is chosen, so no single
   * value is named.
   */
  levelConflict?: string;
}

export interface BenchmarkDraftGap {
  settingId: string;
  recommendationIds: string[];
  reason: string;
}

export interface BenchmarkDrafts {
  benchmark: string;
  version: string;
  level: 1 | 2;
  drafts: BenchmarkDraft[];
  changes: BenchmarkDraftChange[];
  notGenerated: BenchmarkDraftGap[];
}

const INCOMPLETE = DRAFT_STATE_TEXT.incomplete;

const sorted = (values: Iterable<string>) =>
  [...new Set(values)].sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true }),
  );

/** Template references belong to template policies; a plain draft has none. */
function withoutTemplateReferences(value: Json): Json {
  if (Array.isArray(value)) return value.map(withoutTemplateReferences);
  if (!record(value)) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !key.endsWith("TemplateReference"))
      .map(([key, entry]) => [key, withoutTemplateReferences(entry)]),
  );
}

/**
 * The README line for a finding that is neither a draft nor in place: the
 * fix plan's advice (fix-plan.ts), so the README and the plan say the same,
 * and why no draft is generated where the advice does not say it already.
 */
function gapReason(finding: SettingFinding, plan: FixPlan): string {
  const advice = plan.advice[finding.key] ?? "";
  if (finding.status === "Missing") return advice;
  if (finding.reason === "notAssigned" || finding.reason === "notAssignedMixed")
    return advice;
  if (finding.reason === "notAssignedDiffers")
    return `${advice} No draft is generated, because a second policy with this setting conflicts once both are assigned.`;
  return `${advice} No draft is generated for a setting that needs review.`;
}

/** The fixed text plus as many recommendation ids as fit. */
function draftDescription(fixed: string, ids: readonly string[]): string {
  if (!ids.length) return `${fixed} Recommendations: none mapped.`;
  for (let shown = ids.length; shown > 0; shown--) {
    const rest = ids.length - shown;
    const text = `${fixed} Recommendations: ${ids.slice(0, shown).join(", ")}${rest ? `, and ${rest} more in README.txt` : ""}.`;
    if (text.length <= FIX_PACK_DESCRIPTION_MAX) return text;
  }
  return `${fixed} Recommendations: ${ids.length}, listed in README.txt.`;
}

/**
 * Drafts, changes and settings not generated for one assessment. The packs
 * are the delivered packs the assessment was made from, one per pack Level
 * (Level 2 is compared together with Level 1): they supply the policy
 * technologies and template references the assessment does not keep. What
 * gets a draft, what is a change and why the rest is not generated come
 * from the fix plan.
 */
export function generateBenchmarkDrafts(
  assessment: BenchmarkAssessment,
  packs: BenchmarkPack | readonly BenchmarkPack[],
  plan: FixPlan = buildFixPlan(assessment),
): BenchmarkDrafts {
  const list = Array.isArray(packs) ? packs : [packs as BenchmarkPack];
  const byLevel = new Map<number, BaselinePolicy[]>();
  for (const pack of list) {
    if (
      pack.benchmark !== assessment.benchmark ||
      pack.version !== assessment.version
    )
      throw new Error(
        "The pack does not match the benchmark, version and Level of the assessment.",
      );
    byLevel.set(pack.level, parsePolicies(pack.policies));
  }
  const recommendationIds = (finding: SettingFinding) =>
    sorted(
      assessment.recommendations
        .filter((item) => item.findingKeys.includes(finding.key))
        .map((item) => item.id),
    );
  const available = new Set(
    plan.actions
      .filter((action) => action.kind === "addSetting")
      .flatMap((action) => action.settings)
      .filter((setting) => setting.draft === "available")
      .map((setting) => setting.findingKey),
  );
  // The policy the plan names for each missing setting, so the README says the same.
  const addTo = new Map(
    plan.actions
      .filter((action) => action.kind === "addSetting" && action.policy)
      .flatMap((action) => action.settings.map((setting) => [setting.findingKey, action.policy!.name] as const)),
  );
  const grouped = new Map<string, { level: number; policyIndex: number; findings: SettingFinding[] }>();
  const changes: BenchmarkDraftChange[] = [];
  const notGenerated: BenchmarkDraftGap[] = [];
  for (const finding of assessment.settings) {
    const policies = byLevel.get(finding.packLevel);
    if (!policies)
      throw new Error(
        "The pack does not match the benchmark, version and Level of the assessment.",
      );
    const policy = policies[finding.policyIndex];
    const declared = policy?.settings[finding.settingIndex]?.settingInstance;
    if (!policy || declared?.settingDefinitionId !== finding.settingId)
      throw new Error(
        "The pack does not match the settings of the assessment.",
      );
    const ids = recommendationIds(finding);
    if (finding.result === "Pass") continue;
    if (finding.status === "Different") {
      const change: BenchmarkDraftChange = {
        settingId: finding.settingId,
        recommendationIds: ids,
        policies: sorted(
          policiesToChange(finding).map((observation) => observation.policyName),
        ),
        ...(plan.levelConflicts[finding.key]
          ? { levelConflict: plan.levelConflicts[finding.key] }
          : {}),
      };
      // A setting compared at two Levels in the same policies is one
      // change, as the fix plan counts it; its recommendations are joined.
      const same = changes.find(
        (other) =>
          other.settingId === change.settingId &&
          other.policies.join("\n") === change.policies.join("\n") &&
          other.levelConflict === change.levelConflict,
      );
      if (same)
        same.recommendationIds = sorted([
          ...same.recommendationIds,
          ...change.recommendationIds,
        ]);
      else changes.push(change);
      continue;
    }
    if (!available.has(finding.key)) {
      notGenerated.push({
        settingId: finding.settingId,
        recommendationIds: ids,
        reason: gapReason(finding, plan),
      });
      continue;
    }
    const key = `${finding.packLevel}:${finding.policyIndex}`;
    const entry = grouped.get(key) ?? {
      level: finding.packLevel,
      policyIndex: finding.policyIndex,
      findings: [],
    };
    entry.findings.push(finding);
    grouped.set(key, entry);
  }

  const { benchmark, version, level } = assessment;
  const drafts = [...grouped.values()]
    .sort((a, b) => a.level - b.level || a.policyIndex - b.policyIndex)
    .map(({ level: packLevel, policyIndex, findings }, index): BenchmarkDraft => {
      const policy = byLevel.get(packLevel)![policyIndex]!;
      const number = index + 1;
      const ids = sorted(findings.flatMap(recommendationIds));
      return {
        fileName: `${String(number).padStart(2, "0")}-${benchmark}-${version}-L${packLevel}-draft-${number}.json`,
        recommendationIds: ids,
        settingIds: findings.map((finding) => finding.settingId),
        addTo: sorted(findings.flatMap((finding) => addTo.get(finding.key) ?? [])),
        json: {
          name: `${benchmark} ${version} L${packLevel} draft ${number}`,
          description: draftDescription(
            `${FIX_PACK_WARNING} Benchmark ${benchmark} ${version}, Level ${packLevel}.`,
            ids,
          ),
          platforms: policy.platforms,
          technologies: policy.technologies,
          roleScopeTagIds: ["0"],
          templateReference: { templateId: "", templateFamily: "none" },
          settings: findings.map((finding) => ({
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationSetting" as const,
            settingInstance: withoutTemplateReferences(
              finding.recommended,
            ) as SettingInstance,
          })),
        },
      };
    });
  return { benchmark, version, level, drafts, changes, notGenerated };
}

/** The fix plan's alternative to importing a draft, as the README says it. */
const addToText = (policies: readonly string[]) =>
  !policies.length
    ? ""
    : policies.length === 1
      ? ` Instead of importing it, you can add its settings to policy ${policies[0]}, which is assigned (as the fix plan says).`
      : ` Instead of importing it, you can add its settings to the assigned policies the fix plan names for them: ${policies.join(", ")}.`;

type ReadmeAssessment = Pick<
  BenchmarkAssessment,
  "assessedAt" | "collection" | "settings"
> &
  Partial<Pick<BenchmarkAssessment, "settingNames" | "basis">>;

export function benchmarkDraftsReadme(
  result: BenchmarkDrafts,
  assessment: ReadmeAssessment,
): string {
  const list = (rows: string[], empty: string) =>
    rows.length ? rows.map((row) => `- ${row}`) : [empty];
  // A setting by its readable name, its id beside it.
  const named = (settingId: string) => {
    const name = settingName(assessment.settingNames ?? {}, settingId);
    return name === settingId ? settingId : `${name} (${settingId})`;
  };
  // Settings judged by themselves map to no recommendation, so that is not said.
  const idsText = (ids: readonly string[]) =>
    ids.length
      ? ` Recommendations ${ids.join(", ")}.`
      : assessment.basis === "settings"
        ? ""
        : " No recommendation mapped.";
  const drafted = result.drafts.length > 0;
  // Missing findings without a draft (such as those in template policies)
  // are listed under Not generated, so an empty Drafts list says nothing is
  // missing only when no Missing finding exists.
  const missing = assessment.settings.some(
    (finding) => finding.result !== "Pass" && finding.status === "Missing",
  );
  return [
    `Intune Documentation benchmark drafts: ${result.benchmark} ${result.version}, Level ${result.level}`,
    "",
    "What this is",
    drafted
      ? "Each JSON file is a draft Settings Catalog policy for benchmark settings that the last complete collection shows as missing from every Settings Catalog policy. Intune Documentation never writes to your tenant. You decide what to import."
      : "This ZIP holds no draft policy. It lists the policies to change and why no draft was generated. Intune Documentation never writes to your tenant.",
    "",
    "Important",
    ...(drafted ? [`- ${FIX_PACK_WARNING}`] : []),
    "- Drafts are generated only for missing settings. A setting held with another value names the policy to change instead, because a second policy with a different value conflicts on devices.",
    "- The values come from the delivered benchmark pack, not from your organisation's requirements, exceptions or change process.",
    "- Assign each policy to a pilot group first and widen the assignment after testing.",
    "",
    ...(drafted
      ? [
          "How to import a policy",
          "1. Sign in to the Microsoft Intune admin center (https://intune.microsoft.com).",
          "2. Go to Devices > Manage devices > Configuration.",
          "3. Select Create > Import policy.",
          "4. Select one JSON file, enter a name for the new policy and select Save.",
          "5. Open the new policy and review its settings. Assign it to a pilot group when you are ready.",
          "Repeat these steps for each file.",
          "",
        ]
      : []),
    "Drafts",
    ...list(
      result.drafts.map(
        (draft) =>
          `${draft.fileName}: ${draft.json.name}, ${draft.settingIds.length} ${draft.settingIds.length === 1 ? "setting" : "settings"}.${idsText(draft.recommendationIds)}${addToText(draft.addTo)}`,
      ),
      missing
        ? "No draft policies were generated; see Not generated."
        : assessment.collection.complete
          ? "None. No setting is missing from the collection."
          : `None. ${INCOMPLETE}`,
    ),
    "",
    "Change existing policies",
    "These settings are held with another value. Change the named policy instead of importing a second one.",
    ...list(
      result.changes.map(
        (change) =>
          `${named(change.settingId)}: change ${change.policies.length === 1 ? "policy" : "policies"} ${change.policies.join(", ")}.${
            change.levelConflict
              ? ` ${change.levelConflict}: choose the value for your target Level.`
              : ""
          }${idsText(change.recommendationIds)}`,
      ),
      "None.",
    ),
    "",
    "Not generated",
    ...list(
      result.notGenerated.map(
        (gap) =>
          `${named(gap.settingId)}: ${gap.reason}${idsText(gap.recommendationIds)}`,
      ),
      "None.",
    ),
    "",
    `Summary: ${result.drafts.length} draft policies, ${result.changes.length} policy changes, ${result.notGenerated.length} not generated.`,
    `Assessment ${assessment.assessedAt}, collection ${assessment.collection.collectedAt ?? "time not recorded"}.`,
    `${READINESS_DISCLAIMER}.`,
    "",
  ].join("\r\n");
}

/** Deterministic ZIP with README.txt and one JSON file per draft. */
export async function buildBenchmarkDraftsZip(
  result: BenchmarkDrafts,
  assessment: ReadmeAssessment,
): Promise<Uint8Array> {
  return buildDraftZip(
    benchmarkDraftsReadme(result, assessment),
    result.drafts,
  );
}
