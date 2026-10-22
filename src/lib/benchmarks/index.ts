/**
 * Benchmark comparison engine (CIS Benchmarks packs delivered from the gated
 * content service). Pure TypeScript, separate from the control based engine
 * in src/lib/compliance, and it never writes to a tenant.
 */
export {
  assessBenchmark,
  compareSettings,
  countResults,
  headlineRate,
  matchingList,
  recommendationResults,
  type AssessOptions,
  type BenchmarkAssessment,
  type BenchmarkLevel,
  type LevelHeadline,
  type LevelSummary,
  type Observation,
  type PackRecommendation,
  type ReasonCode,
  type RecommendationResult,
  type RecommendationSettingResult,
  type ResultCounts,
  type ResultState,
  type SettingFinding,
  type SettingStatus,
} from "./assessment";
export {
  tenantSettings,
  type AssignmentState,
  type BenchmarkCollection,
  type TenantPolicy,
  type TenantSettings,
} from "./tenant-settings";
export {
  compareDefinition,
  compareRoot,
  definitionIds,
  parsePolicies,
  readableOwnValue,
  type BaselinePolicy,
  type Comparison,
} from "./policies";
export {
  computeCoverage,
  extractRecommendationIds,
  type LevelCoverage,
} from "./coverage";
export {
  MANUAL_NOT_ASSESSED_NOTE,
  MANUAL_RECOMMENDATIONS_NOTICE,
  MANUAL_RECOMMENDATIONS_URL,
  manualItemsForLevel,
  type ManualItemView,
} from "./manual";
export {
  MAX_EXCEPTIONS,
  appliesOn,
  exceptionKey,
  isActive,
  isDateOnly,
  localDate,
  validateExceptions,
  validateNewException,
  type BenchmarkException,
  type NewBenchmarkException,
} from "./exceptions";
export {
  RESULT_CODES,
  canonicalJson,
  packDigest,
  storedRunHeadline,
  summarizeRuns,
  validateStoredRun,
  type ResultCode,
  type StoredBenchmarkRun,
  type StoredResult,
} from "./history";
export {
  benchmarkTrend,
  compareRuns,
  driftSignals,
  sparklineSegments,
  trendChangeText,
  type DriftEntry,
  type TrendPoint,
} from "./trend";
export {
  portfolioBenchmarks,
  portfolioRows,
  type PortfolioBenchmark,
  type PortfolioEntry,
  type PortfolioLevel,
  type PortfolioRow,
} from "./portfolio";
export {
  READINESS_DISCLAIMER,
  REASON_LABELS,
  RESULT_LABELS,
  SETTING_STATUS_LABELS,
  benchmarkDisplayName,
  countsText,
  coverageStatement,
  exclusionsText,
  formatRate,
  headlineLabel,
  levelCheckCounts,
  levelCheckSummary,
  levelsLabel,
  ratePercent,
} from "./display";
export {
  FLOW_LABELS,
  flowStage,
  flowSteps,
  type FlowStage,
  type FlowStep,
} from "./flow";
