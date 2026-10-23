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
import type {
  BenchmarkAssessment,
  Observation,
  SettingFinding,
} from "./assessment";
import { READINESS_DISCLAIMER, REASON_LABELS } from "./display";
import type { BenchmarkPack } from "./pack";
import {
  parsePolicies,
  record,
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
  json: BenchmarkDraftDocument;
}

/** A setting held with another value: change the named tenant policies. */
export interface BenchmarkDraftChange {
  settingId: string;
  recommendationIds: string[];
  /** Tenant policy names, as the collection shows them. */
  policies: string[];
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

const INCOMPLETE =
  "The collection could not establish that the setting is missing. Refresh the policies with a complete collection and generate the drafts again.";
const TEMPLATED =
  "The pack delivers this setting in a policy created from a template, which drafts do not generate. Configure it in the matching template policy.";

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

/** Why a Missing finding gets no draft, or null when a draft may be generated. */
function blocker(
  finding: SettingFinding,
  complete: boolean,
  templated: boolean,
): string | null {
  if (!complete || finding.observations.length) return INCOMPLETE;
  if (templated) return TEMPLATED;
  return null;
}

/**
 * The README line for a finding that is neither a draft nor in place. Only
 * unassigned policies hold a setting with a notAssigned reason: a policy that
 * matches is the one to assign, a policy that differs needs its value changed
 * before it is assigned, and a policy whose value cannot be read is named to
 * check, never to change (notAssignedDiffers has none: such a value makes
 * the reason unreadableValue).
 */
function gapReason(finding: SettingFinding): string {
  const names = (comparison: Observation["comparison"]) =>
    sorted(
      finding.observations
        .filter((observation) => observation.comparison === comparison)
        .map((observation) => observation.policyName),
    ).join(", ");
  const unreadable = names("unknown");
  const check = unreadable
    ? ` The value in policy ${unreadable} could not be read; check it before assigning that policy.`
    : "";
  if (finding.reason === "notAssigned")
    return `${REASON_LABELS.notAssigned} Assign policy ${names("match")} instead of importing a second one.`;
  if (finding.reason === "notAssignedMixed")
    return `${REASON_LABELS.notAssignedMixed} Assign policy ${names("match")} instead of importing a second one, and change the value in policy ${names("differ")} before assigning it.${check}`;
  if (finding.reason === "notAssignedDiffers")
    return `${REASON_LABELS.notAssignedDiffers} Change the value in policy ${names("differ")} before assigning it, or set the recommended value in a policy that is assigned. No draft is generated, because a second policy with this setting conflicts once both are assigned.`;
  if (finding.reason)
    return `${REASON_LABELS[finding.reason]} No draft is generated for a setting that needs review.`;
  return "No draft is generated for a setting that needs review.";
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
 * Drafts, changes and settings not generated for one assessment. The pack is
 * the delivered pack the assessment was made from: it supplies the policy
 * technologies and template references the assessment does not keep.
 */
export function generateBenchmarkDrafts(
  assessment: BenchmarkAssessment,
  pack: BenchmarkPack,
): BenchmarkDrafts {
  if (
    pack.benchmark !== assessment.benchmark ||
    pack.version !== assessment.version ||
    pack.level !== assessment.level
  )
    throw new Error(
      "The pack does not match the benchmark, version and Level of the assessment.",
    );
  const policies = parsePolicies(pack.policies);
  const complete = assessment.collection.complete;
  const recommendationIds = (finding: SettingFinding) =>
    sorted(
      assessment.recommendations
        .filter((item) => item.findingKeys.includes(finding.key))
        .map((item) => item.id),
    );
  const grouped = new Map<number, SettingFinding[]>();
  // One draft per platform and setting: a second pack policy with the same
  // root would only duplicate it.
  const drafted = new Set<string>();
  const changes: BenchmarkDraftChange[] = [];
  const notGenerated: BenchmarkDraftGap[] = [];
  for (const finding of assessment.settings) {
    const policy = policies[finding.policyIndex];
    const declared = policy?.settings[finding.settingIndex]?.settingInstance;
    if (!policy || declared?.settingDefinitionId !== finding.settingId)
      throw new Error(
        "The pack does not match the settings of the assessment.",
      );
    const ids = recommendationIds(finding);
    if (finding.result === "Pass") continue;
    if (finding.status === "Different") {
      const differing = finding.observations.filter(
        (observation) => observation.comparison === "differ",
      );
      changes.push({
        settingId: finding.settingId,
        recommendationIds: ids,
        policies: sorted(
          (differing.length ? differing : finding.observations).map(
            (observation) => observation.policyName,
          ),
        ),
      });
      continue;
    }
    if (finding.status !== "Missing") {
      notGenerated.push({
        settingId: finding.settingId,
        recommendationIds: ids,
        reason: gapReason(finding),
      });
      continue;
    }
    const blocked = blocker(
      finding,
      complete,
      Boolean(policy.templateReference?.templateId),
    );
    if (blocked) {
      notGenerated.push({
        settingId: finding.settingId,
        recommendationIds: ids,
        reason: blocked,
      });
      continue;
    }
    const key = `${finding.platforms}:${finding.settingId}`;
    if (drafted.has(key)) {
      notGenerated.push({
        settingId: finding.settingId,
        recommendationIds: ids,
        reason: "Another draft in this ZIP already holds this setting.",
      });
      continue;
    }
    drafted.add(key);
    const list = grouped.get(finding.policyIndex) ?? [];
    list.push(finding);
    grouped.set(finding.policyIndex, list);
  }

  const { benchmark, version, level } = assessment;
  const drafts = [...grouped.entries()]
    .sort(([left], [right]) => left - right)
    .map(([policyIndex, findings], index): BenchmarkDraft => {
      const policy = policies[policyIndex]!;
      const number = index + 1;
      const ids = sorted(findings.flatMap(recommendationIds));
      return {
        fileName: `${String(number).padStart(2, "0")}-${benchmark}-${version}-L${level}-draft-${number}.json`,
        recommendationIds: ids,
        settingIds: findings.map((finding) => finding.settingId),
        json: {
          name: `${benchmark} ${version} L${level} draft ${number}`,
          description: draftDescription(
            `${FIX_PACK_WARNING} Benchmark ${benchmark} ${version}, Level ${level}.`,
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

const idsText = (ids: readonly string[]) =>
  ids.length
    ? `Recommendations ${ids.join(", ")}.`
    : "No recommendation mapped.";

export function benchmarkDraftsReadme(
  result: BenchmarkDrafts,
  assessment: Pick<
    BenchmarkAssessment,
    "assessedAt" | "collection" | "settings"
  >,
): string {
  const list = (rows: string[], empty: string) =>
    rows.length ? rows.map((row) => `- ${row}`) : [empty];
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
    "Each JSON file is a draft Settings Catalog policy for benchmark settings that the last complete collection shows as missing from every Settings Catalog policy. Intune Documentation never writes to your tenant. You decide what to import.",
    "",
    "Important",
    `- ${FIX_PACK_WARNING}`,
    "- Drafts are generated only for missing settings. A setting held with another value names the policy to change instead, because a second policy with a different value conflicts on devices.",
    "- The values come from the delivered benchmark pack, not from your organisation's requirements, exceptions or change process.",
    "- Assign each policy to a pilot group first and widen the assignment after testing.",
    "",
    "How to import a policy",
    "1. Sign in to the Microsoft Intune admin center (https://intune.microsoft.com).",
    "2. Go to Devices > Manage devices > Configuration.",
    "3. Select Create > Import policy.",
    "4. Select one JSON file, enter a name for the new policy and select Save.",
    "5. Open the new policy and review its settings. Assign it to a pilot group when you are ready.",
    "Repeat these steps for each file.",
    "",
    "Drafts",
    ...list(
      result.drafts.map(
        (draft) =>
          `${draft.fileName}: ${draft.json.name}, ${draft.settingIds.length} ${draft.settingIds.length === 1 ? "setting" : "settings"}. ${idsText(draft.recommendationIds)}`,
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
          `${change.settingId}: change policy ${change.policies.join(", ")}. ${idsText(change.recommendationIds)}`,
      ),
      "None.",
    ),
    "",
    "Not generated",
    ...list(
      result.notGenerated.map(
        (gap) =>
          `${gap.settingId}: ${gap.reason} ${idsText(gap.recommendationIds)}`,
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
  assessment: Pick<
    BenchmarkAssessment,
    "assessedAt" | "collection" | "settings"
  >,
): Promise<Uint8Array> {
  return buildDraftZip(
    benchmarkDraftsReadme(result, assessment),
    result.drafts,
  );
}
