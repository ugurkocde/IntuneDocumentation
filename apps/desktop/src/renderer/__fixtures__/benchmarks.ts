import type {
  BenchmarkAssessment,
  LevelSummary,
  RecommendationResult,
  ResultState,
  SettingFinding,
} from "../../../../../src/lib/benchmarks/assessment";
import {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
} from "../../../../../src/lib/benchmarks/manual";
import type { BenchmarkCatalog, BenchmarkLevel } from "../../shared/ipc-types";

// Synthetic benchmark data for renderer tests and screenshots. Nothing here
// comes from a delivered pack: the benchmark id is synthetic-bench and every
// title says Synthetic.

export const SYNTHETIC_CATALOG: BenchmarkCatalog = {
  benchmarks: [
    { id: "synthetic-bench", name: "Synthetic Bench for Settings Catalog", version: "2.0.0", levels: [1, 2] },
    { id: "synthetic-bench", name: "Synthetic Bench for Settings Catalog", version: "1.0.0", levels: [1] },
    { id: "synthetic-bench-mobile", name: "Synthetic Bench Mobile", version: "1.1.0", levels: [1] },
  ],
};

const LONG_TITLE =
  " with a deliberately long synthetic title that wraps across several lines to check that the review list keeps its layout, chips and spacing intact at every width";

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
} = {}): BenchmarkAssessment {
  const settings: SettingFinding[] = [];
  const recommendations: RecommendationResult[] = [];
  for (let index = 0; index < count; index += 1) {
    const { result, status, reason } = outcome(index, complete);
    const level = levels[index % levels.length]!;
    const settingId = `device_vendor_msft_policy_config_synthetic_area_synthetic_setting_${index + 1}`;
    const key = `0:${index}`;
    if (status !== "Unmapped") {
      const current = status === "Different" ? "Disabled" : status === "Review" ? "Not readable" : "Enabled";
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
        recommended: { settingDefinitionId: settingId, choiceSettingValue: { value: `${settingId}_1` } },
        recommendedValue: { text: "Enabled", raw: null },
        observations:
          status === "Missing"
            ? []
            : [
                {
                  policyId: `policy-${index}`,
                  policyName: `Synthetic tenant policy ${index + 1}`,
                  templated: false,
                  assignment: reason === "notAssigned" ? "notAssigned" : "assigned",
                  reach:
                    reason === "notAssigned"
                      ? { targets: [], exclusions: [], removals: [], filters: 0 }
                      : { targets: ["Group: Synthetic pilot devices"], exclusions: [], removals: [], filters: 0 },
                  current: { text: current, raw: null },
                  value: { settingDefinitionId: settingId },
                  comparison: status === "Different" ? "differ" : status === "Review" ? "unknown" : "match",
                },
              ],
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
  return {
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
    settingNames: {},
  };
}
