import type {
  BenchmarkAssessment,
  ExceptionUse,
  LevelSummary,
  Observation,
  RecommendationResult,
  ResultState,
  SettingFinding,
} from "../../../../../src/lib/benchmarks/assessment";
import { buildFixPlan } from "../../../../../src/lib/benchmarks/fix-plan";
import {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
} from "../../../../../src/lib/benchmarks/manual";
import type { RecordJson } from "../../../../../src/lib/benchmarks/policies";
import type { SettingNames } from "../../../../../src/lib/benchmarks/tenant-settings";
import type { BenchmarkAssessmentView, BenchmarkCatalog, BenchmarkLevel } from "../../shared/ipc-types";

// Synthetic benchmark data for renderer tests and screenshots. Nothing here
// comes from a delivered pack: the benchmark id is synthetic-bench and every
// title says Synthetic. Values are Settings Catalog instances in the shapes
// Graph returns, so the engine's fix plan (buildFixPlan) runs on them.

export const SYNTHETIC_CATALOG: BenchmarkCatalog = {
  benchmarks: [
    { id: "synthetic-bench", name: "Synthetic Bench for Settings Catalog", version: "2.0.0", levels: [1, 2] },
    { id: "synthetic-bench", name: "Synthetic Bench for Settings Catalog", version: "1.0.0", levels: [1] },
    { id: "synthetic-bench-mobile", name: "Synthetic Bench Mobile", version: "1.1.0", levels: [1] },
  ],
};

const LONG_TITLE =
  " with a deliberately long synthetic title that wraps across several lines to check that the review list keeps its layout, chips and spacing intact at every width";

const T = "#microsoft.graph.deviceManagementConfiguration";

// A choice instance as Graph returns it: the value is "<definition id>_<option>".
function choiceInstance(id: string, option: string): RecordJson {
  return {
    "@odata.type": `${T}ChoiceSettingInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    choiceSettingValue: { settingValueTemplateReference: null, value: `${id}_${option}`, children: [] },
  };
}

// A secret value, which Graph never returns readable.
function secretInstance(id: string): RecordJson {
  return {
    "@odata.type": `${T}SimpleSettingInstance`,
    settingDefinitionId: id,
    settingInstanceTemplateReference: null,
    simpleSettingValue: { "@odata.type": `${T}SecretSettingValue`, valueState: "encryptedValueToken" },
  };
}

// Tenant policies the synthetic settings sit in.
const POLICIES = {
  a: {
    policyId: "00000000-0000-0000-0000-0000000000a1",
    policyName: "Synthetic security policy A",
    assignment: "assigned" as const,
    reach: { targets: ["Group: Synthetic pilot devices"], exclusions: [], removals: [], filters: 0 },
  },
  b: {
    policyId: "00000000-0000-0000-0000-0000000000b2",
    policyName: "Synthetic security policy B with a longer name for the wrapping check",
    assignment: "assigned" as const,
    reach: { targets: ["All devices"], exclusions: ["Group: Synthetic kiosks"], removals: [], filters: 1 },
  },
  pilot: {
    policyId: "00000000-0000-0000-0000-0000000000c3",
    policyName: "Synthetic pilot policy",
    assignment: "notAssigned" as const,
    reach: { targets: [], exclusions: [], removals: [], filters: 0 },
  },
};

type Outcome = {
  result: ResultState;
  status: SettingFinding["status"] | "Unmapped";
  reason?: SettingFinding["reason"];
};

// Cycles through every result and reason the engine can return.
function outcome(index: number, complete: boolean): Outcome {
  switch (index % 6) {
    case 0:
    case 5:
      return { result: "Pass", status: "Present" };
    case 1:
      return { result: "Fail", status: "Different" };
    case 2:
      return complete
        ? { result: "Fail", status: "Missing" }
        : { result: "Review", status: "Review", reason: "collectionIncomplete" };
    case 3:
      return { result: "Review", status: "Review", reason: index % 4 === 3 ? "notAssigned" : "unreadableValue" };
    default:
      return { result: "Not assessed", status: "Unmapped", reason: "settingOutsidePack" };
  }
}

// The policy holding one setting with its value, as the engine observes it.
function observation(index: number, settingId: string, { status, reason }: Outcome): Observation[] {
  if (status === "Missing" || status === "Unmapped" || reason === "collectionIncomplete") return [];
  const policy = reason === "notAssigned" ? POLICIES.pilot : Math.floor(index / 6) % 2 ? POLICIES.b : POLICIES.a;
  if (reason === "unreadableValue") {
    const value = secretInstance(settingId);
    return [
      { ...policy, templated: false, value, comparison: "unknown", current: { text: "Not readable", raw: value, cause: "secret" } },
    ];
  }
  const differs = status === "Different";
  const value = choiceInstance(settingId, differs ? "0" : "1");
  return [
    {
      ...policy,
      templated: false,
      value,
      comparison: differs ? "differ" : "match",
      current: { text: differs ? "Disabled" : "Enabled", raw: value },
    },
  ];
}

export function syntheticAssessment({
  count = 12,
  complete = true,
  levels = [1] as BenchmarkLevel[],
  longTitles = false,
  basis = "recommendations" as LevelSummary["headline"]["basis"],
  version = "2.0.0",
  level: compared = levels[0]!,
}: {
  count?: number;
  complete?: boolean;
  levels?: BenchmarkLevel[];
  longTitles?: boolean;
  basis?: LevelSummary["headline"]["basis"];
  version?: string;
  // The Level that was compared; defaults to the first of levels.
  level?: BenchmarkLevel;
} = {}): BenchmarkAssessmentView {
  const settings: SettingFinding[] = [];
  const recommendations: RecommendationResult[] = [];
  const settingNames: SettingNames = {};
  for (let index = 0; index < count; index += 1) {
    const found = outcome(index, complete);
    const { result, status, reason } = found;
    const level = levels[index % levels.length]!;
    const settingId = `device_vendor_msft_policy_config_synthetic_area_synthetic_setting_${index + 1}`;
    // Every seventh setting has no definition name and is shown by its id.
    if (index % 7 !== 6)
      settingNames[settingId] = {
        name: `Synthetic setting ${index + 1}${longTitles ? " with a long display name" : ""}`,
        options: { [`${settingId}_1`]: "Enabled", [`${settingId}_0`]: "Disabled" },
      };
    const key = `0:${index}`;
    if (status !== "Unmapped") {
      const recommended = choiceInstance(settingId, "1");
      settings.push({
        key,
        packLevel: basis === "recommendations" ? 1 : levels[0]!,
        policyIndex: 0,
        settingIndex: index,
        templated: false,
        policyName: "Synthetic pack policy",
        platforms: "windows10",
        settingId,
        status,
        result,
        ...(reason ? { reason } : {}),
        recommended,
        recommendedValue: { text: "Enabled", raw: recommended },
        observations: observation(index, settingId, found),
      });
    }
    recommendations.push({
      id: `${(index % 9) + 1}.${Math.floor(index / 9) + 1}.${index + 1}`,
      packLevel: 1,
      title: `Synthetic recommendation ${index + 1}${longTitles ? LONG_TITLE : ""}`,
      level,
      result,
      ...(reason ? { reason } : {}),
      settings: [
        {
          id: settingId,
          status,
          result,
          ...(reason ? { reason } : {}),
          findingKeys: status === "Unmapped" ? [] : [key],
        },
      ],
      findingKeys: status === "Unmapped" ? [] : [key],
      openSettingIds: result === "Pass" ? [] : [settingId],
    });
  }
  const summaries = (basis === "recommendations" ? levels : [levels[0]!]).map((level): LevelSummary => {
    const own = basis === "recommendations" ? recommendations.filter((item) => item.level === level) : settings;
    const count = (state: ResultState) => own.filter((item) => item.result === state).length;
    const counts = {
      pass: count("Pass"),
      fail: count("Fail"),
      review: count("Review"),
      notAssessed: count("Not assessed"),
    };
    const assessed = counts.pass + counts.fail;
    const notConfigured = own.filter((item) =>
      "status" in item ? item.status === "Missing" : item.settings.every((setting) => setting.status === "Missing"),
    ).length;
    return {
      level,
      headline: {
        basis,
        rate: assessed ? counts.pass / assessed : null,
        adjusted: null,
        exceptionIds: [],
        counts,
        states: {
          matches: counts.pass,
          differs: counts.fail - notConfigured,
          notConfigured,
          needsReview: counts.review,
          notAssessed: counts.notAssessed,
          assessed,
          total: own.length,
        },
      },
      coverage: {
        level,
        source: "none",
        denominator: null,
        numerator: 0,
        coverage: null,
        coveredIds: [],
        notCoveredIds: [],
        outsideListIds: [],
        enumeratedIds: [],
      },
      manual: [1, 2].map((n) => ({
        identifier: `9.${level}.${n}`,
        level,
        title: `Synthetic manual recommendation ${n}`,
        description: "Synthetic description of a manual check.",
        hasText: true,
        notice: MANUAL_RECOMMENDATIONS_NOTICE,
        noticeUrl: MANUAL_RECOMMENDATIONS_URL,
        state: "Manual" as const,
      })),
      listIdentifiers: [],
    };
  });
  const assessment: BenchmarkAssessment = {
    benchmark: "synthetic-bench",
    version,
    level: compared,
    assessedAt: "2026-10-22T09:30:00.000Z",
    collection: {
      collectedAt: "2026-10-22T09:00:00.000Z",
      complete,
      gaps: complete
        ? []
        : ["Synthetic policy 3: settings were not read completely.", "A Settings Catalog entry could not be read."],
      otherProfilePlatforms: [],
      otherProfiles: [],
    },
    basis,
    settings,
    recommendations: basis === "recommendations" ? recommendations : [],
    levels: summaries,
    listUsed: false,
    manualNote: MANUAL_NOT_ASSESSED_NOTE,
    notice: { text: MANUAL_RECOMMENDATIONS_NOTICE, url: MANUAL_RECOMMENDATIONS_URL },
    settingNames,
  };
  return withFixPlan(assessment);
}

// The view main returns for an assessment: the engine's fix plan added, as
// benchmarks:assess does (apps/desktop/src/main/benchmarks.ts).
export function withFixPlan(
  assessment: BenchmarkAssessment & Partial<Pick<BenchmarkAssessmentView, "history" | "tenantName">>,
): BenchmarkAssessmentView {
  return { tenantName: "Synthetic Contoso Lab", ...assessment, fixPlan: buildFixPlan(assessment) };
}

// The exception state assessBenchmark records, for a synthetic view judged
// by recommendations: each exception in effect on the open settings it names
// (by setting id), and the result credited when every open setting differs
// with one that applies. Headlines stay as they are; set them in the test.
export function withExceptionUses(
  view: BenchmarkAssessmentView,
  uses: Readonly<Record<string, ExceptionUse>>,
): BenchmarkAssessmentView {
  return {
    ...view,
    recommendations: view.recommendations.map((item) => {
      const settings = item.settings.map((setting) => {
        const use = setting.result === "Pass" ? undefined : uses[setting.id];
        return use ? { ...setting, exception: use } : setting;
      });
      const open = settings.filter((setting) => setting.result !== "Pass");
      const credited =
        item.result === "Fail" &&
        open.length > 0 &&
        open.every((setting) => setting.result === "Fail" && setting.exception?.applies);
      return { ...item, settings, ...(credited ? { credited: true as const } : {}) };
    }),
  };
}
