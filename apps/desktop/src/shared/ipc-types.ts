// Types shared by the main process, the preload bridge and the renderer.
// Keep this file free of runtime imports so every bundle can use it.
import type { ResolvedExportData } from "../../../../src/lib/client-export-resolver";
import type { ExportScopeRequest } from "./export-scope";
import type {
  AssessmentScope,
  CapabilityResult,
  CollectionCoverage,
  ComplianceCapability,
  ControlAssessment,
  FrameworkAssessment,
  PolicyDeviceStatusRow,
  PolicyStatusSource,
  TenantPolicyCollectionStatus,
} from "../../../../src/lib/compliance/types";
import type {
  BaselineDelta,
  CrosswalkIssue,
  ManagementLocale,
  ManagementSummary,
} from "../../../../src/lib/compliance/management/types";
import type {
  ControlStatusChange,
  IdentityDiff,
  NotComparedFamily,
  NotComparedItem,
  PolicyChange,
  SnapshotDiffTotals,
} from "../../../../src/lib/snapshots/diff";
import type { ManagementReportChanges } from "../../../../src/lib/compliance/management/management-report-pdf";
import type {
  CompareGroup,
  ComparisonCounts,
  ComparisonPart,
  NotComparedSettingsFamily,
} from "../../../../src/lib/snapshots/reference-types";
import type {
  BenchmarkCatalog,
  BenchmarkIdentity,
  BenchmarkLevel,
} from "../../../../src/lib/benchmarks/pack";
import type { BenchmarkAssessment } from "../../../../src/lib/benchmarks/assessment";
import type { BenchmarkDraftGap } from "../../../../src/lib/benchmarks/drafts";
import type { BenchmarkException } from "../../../../src/lib/benchmarks/exceptions";
import type { StoredBenchmarkRun } from "../../../../src/lib/benchmarks/history";
import type { DriftEntry, TrendPoint } from "../../../../src/lib/benchmarks/trend";
import type {
  PortfolioBenchmark,
  PortfolioRow,
} from "../../../../src/lib/benchmarks/portfolio";

// Scheduled collection interval in hours; 0 is off.
export type ScheduleHours = 0 | 6 | 12 | 24;

export interface AppSettings {
  clientId: string;
  tenantId: string;
  autoUpdate: boolean;
  checkForUpdates: boolean;
  keepHistory: boolean;
  scheduleHours: ScheduleHours;
}

// The app registration fields Settings and the setup wizard save together.
export type ConnectionSettings = Pick<AppSettings, "clientId" | "tenantId">;

export interface AuthStatus {
  signedIn: boolean;
  account: string | null;
  tenantId: string | null;
  expiresOn: string | null;
}

export interface SignInResult {
  account: string;
  tenantId: string | null;
  expiresOn: string | null;
}

export interface SignInOptions {
  consent?: boolean;
}

export interface PermissionValidation {
  granted: string[];
  missing: string[];
}

export interface SectionCount {
  key: string;
  familyKey: string;
  label: string;
  count: number;
  error?: string;
  // Items created by Microsoft rather than an administrator. They stay in
  // count and are documented and exported like every other item.
  microsoftDefaults?: number;
  // Set when the items of one Graph section belong to several display
  // families, for example Settings Catalog policies that are endpoint
  // security policies or security baselines. The counts add up to count.
  families?: SectionFamilyCount[];
}

export interface SectionFamilyCount {
  familyKey: string;
  count: number;
  microsoftDefaults?: number;
}

// What the collected items are. Every item is in exactly one of policies,
// apps or rbac or is a Microsoft default outside RBAC, so
// policies + apps + rbac + (microsoftDefaults - microsoftDefaultsInRbac)
// equals totalConfigurations.
export interface CollectionBreakdown {
  policies: number;
  apps: number;
  appsAssigned: number;
  rbac: number;
  microsoftDefaults: number;
  // Built in role definitions and the Default scope tag: Microsoft defaults
  // that are already counted in rbac.
  microsoftDefaultsInRbac: number;
}

export interface FetchErrorSummary {
  policyName: string;
  policyType: string;
  familyKey?: string;
  error: string;
  permissionHint?: string;
}

export interface PermissionErrorSummary {
  resource: string;
  requiredPermission: string;
  message: string;
}

// Estimated PDF length of a configuration export, which never includes
// compliance evidence.
export interface PdfEstimate {
  pages: number;
  isLarge: boolean;
}

export interface FullCollectionSummary {
  collectedAt: string;
  totalConfigurations: number;
  sectionCounts: SectionCount[];
  fetchErrors: FetchErrorSummary[];
  permissionErrors: PermissionErrorSummary[];
  pdfEstimate: PdfEstimate | null;
  // Missing on summaries from older builds.
  breakdown?: CollectionBreakdown;
}

export interface CollectProgress {
  step: string;
  type: "policy-type" | "batch-progress" | "completed" | "error" | "section";
  current?: number;
  total?: number;
  message?: string;
  loaded: number;
}

export interface SectionItemSummary {
  id: string;
  displayName: string;
  odataType: string | null;
  description: string | null;
  platforms: string | null;
  technologies: string | null;
  lastModifiedDateTime: string | null;
  // Null when the resource type has no assignments (for example Conditional
  // Access or tenant wide settings).
  assignmentCount: number | null;
  assignedToAllUsers: boolean;
  assignedToAllDevices: boolean;
  hasFetchError: boolean;
  // Display family when the section is split across families.
  familyKey?: string;
  microsoftDefault?: boolean;
}

export interface SectionItemsResult {
  key: string;
  familyKey: string;
  label: string;
  error: string | null;
  items: SectionItemSummary[];
}

export interface SettingsSearchRequest {
  query: string;
  // Family keys; empty or missing searches every family.
  families?: string[];
  // Platform labels such as "Windows"; empty or missing searches all.
  platforms?: string[];
  // Maximum hits returned; defaults to 200.
  limit?: number;
}

export interface SettingSearchHit {
  sectionKey: string;
  sectionLabel: string;
  familyKey: string;
  policyId: string;
  policyName: string;
  platforms: string[];
  assignmentCount: number | null;
  assignedToAllUsers: boolean;
  assignedToAllDevices: boolean;
  name: string;
  value: string;
  definitionId: string | null;
  path: string[];
  category: string | null;
}

// IPC errors reach the renderer as a message only, so the search names the
// one failure the renderer can act on.
export const SEARCH_NEEDS_COLLECTION = "Collect tenant data first.";

export interface SettingsSearchFacet {
  value: string;
  count: number;
}

export interface SettingsSearchResult {
  query: string;
  // Matches after filters; hits holds at most limit of them.
  total: number;
  hits: SettingSearchHit[];
  // Match counts of the query alone, so filters can show what they hold.
  families: SettingsSearchFacet[];
  platforms: SettingsSearchFacet[];
  indexedSettings: number;
}

export interface ExportOptions {
  // Without a scope the export covers the whole tenant.
  scope?: ExportScopeRequest;
}

export interface ExportProgress {
  stage: "groups" | "devices";
  message: string;
}

export type PreparedExport = ResolvedExportData;

export type ComplianceFrameworkId =
  | "essential-eight"
  | "iso-27001-2022"
  | "soc2-tsc"
  | "nist-800-53-r5"
  | "nist-csf-2"
  | "bsi-it-grundschutz"
  | "def-stan-05-138-i4"
  | "cyber-essentials-v3"
  | "nist-800-171-r2"
  | "nist-800-171-r3"
  | "nis2-2022-2555"
  | "dora-2022-2554"
  | "hipaa-security-rule";

export interface ComplianceRequest {
  frameworkId: ComplianceFrameworkId | null;
  scope: AssessmentScope;
}

export interface ComplianceFrameworkSummary {
  id: ComplianceFrameworkId;
  name: string;
  version: string;
  totalRequirements?: number;
  totalControls: number;
  coverageLabel?: string;
}

// A capability result without its detection signals, which the view never
// shows.
export interface ComplianceCapabilityView
  extends Omit<CapabilityResult, "capability"> {
  capability: Pick<ComplianceCapability, "id" | "name" | "caveat">;
}

// A mapped capability configured on a policy that is not assigned, with the
// framework controls that list it.
export interface ManagementUnassignedConfig {
  capabilityId: string;
  name: string;
  controlIds: string[];
}

export interface ComplianceFrameworkView {
  framework: FrameworkAssessment["framework"];
  coverageLabel?: string;
  controls: ControlAssessment[];
  capabilities: ComplianceCapabilityView[];
  management: ManagementSummary;
  // Null without a loaded baseline, or when the loaded one no longer matches
  // the current tenant, framework or scope.
  delta: BaselineDelta | null;
  // The baseline loaded for this framework, if any. mismatch explains why it
  // cannot be compared with the current run, for example after a scope change.
  baseline: {
    generatedAt: string;
    rulesetChanged: boolean;
    mismatch: string | null;
  } | null;
  // The customer crosswalk held in memory, if any; issues is a count.
  crosswalk: { rows: number; issues: number; fileName: string } | null;
  // Control id -> customer-supplied CIS safeguard ids (ISO and NIS2 only).
  crosswalkCis: Record<string, string[]>;
  unassigned: ManagementUnassignedConfig[];
}

export interface ComplianceView {
  disclaimer: string;
  scope: AssessmentScope;
  collectedAt: string | null;
  rulesetVersion: string;
  collectionCoverage: CollectionCoverage[];
  frameworks: ComplianceFrameworkSummary[];
  selected: ComplianceFrameworkView | null;
}

export type { ManagementLocale };

export type BaselineLoadResult =
  | { ok: true }
  | { ok: false; message: string }
  | { canceled: true };

export type CrosswalkImportResult =
  | { ok: true; rows: number; issues: CrosswalkIssue[] }
  | { ok: false; message: string }
  | { canceled: true };

export interface ComplianceReportProgress {
  stage: "groups" | "generating" | "saving";
}

// The evidence register: CSV holds the Checks table, Excel every sheet.
export type ComplianceRegisterFormat = "csv" | "xlsx";

// What a draft fix pack would contain, shown before it is saved.
export interface FixPackPreview {
  summary: { draftPolicies: number; notGeneratable: number };
  policies: Array<{ fileName: string; name: string; capabilityId: string }>;
  notGeneratable: Array<{ capabilityId: string; name: string; reason: string }>;
}

export type PolicyDeviceStatusCounts = Pick<
  PolicyDeviceStatusRow,
  "succeeded" | "error" | "conflict" | "notApplicable" | "pending"
>;

// Intune's device status counts for the items of one collected section.
// Context only: never used for an evidence status. A missing row means Intune
// reported no status for the policy, never a count of zero.
export interface PolicyDeviceStatusView {
  source: PolicyStatusSource;
  sourceLabel: string;
  state: TenantPolicyCollectionStatus;
  error: string | null;
  collectedAt: string | null;
  // Keyed by the section item id.
  rows: Record<string, PolicyDeviceStatusCounts>;
}

// One stored snapshot of the signed in tenant.
export interface HistoryEntry {
  id: string;
  collectedAt: string;
  items: number;
  // Some family, policy or permission could not be collected.
  partial: boolean;
  rulesetVersion: string;
  bytes: number;
}

export interface HistoryStatus {
  // The "Keep history on this computer" setting.
  enabled: boolean;
  // False when snapshots cannot be stored or read securely; reason says why.
  available: boolean;
  reason: string | null;
  // Snapshots of the signed in tenant.
  count: number;
  // History that cannot be read is still on this computer and can be
  // deleted as a whole. Only set when available is false.
  unreadableData?: boolean;
  // History is intact but could not be read right now, for example while
  // the keychain is locked: try again, never delete. Only set when
  // available is false.
  locked?: boolean;
}

export interface HistoryDiffRequest {
  // Both default to the two latest snapshots: previous and latest.
  fromId?: string;
  toId?: string;
  // Framework of the control changes; defaults to the first with changes.
  frameworkId?: string;
}

// Diff rows are capped in main; totals count everything.
export interface HistoryDiffView {
  from: HistoryEntry;
  to: HistoryEntry;
  policies: PolicyChange[];
  totals: SnapshotDiffTotals;
  notCompared: NotComparedFamily[];
  notComparedItems: NotComparedItem[];
  // Entra tenant identity settings, outside the policy totals.
  identity: IdentityDiff;
  controls: {
    fromRuleset: string;
    toRuleset: string;
    rulesetChanged: boolean;
    frameworks: Array<{ id: string; name: string; changed: number }>;
    frameworkId: string | null;
    changes: ControlStatusChange[];
    // Changes of the selected framework before capping.
    total: number;
  };
}

export type { ManagementReportChanges };

// The management panel's "Changes since" section. none says why there is
// nothing to show: history cannot be read, no earlier snapshot of this
// tenant, or the selected scope differs from the stored full scope.
export type ManagementChangesResult =
  | { state: "ready"; changes: ManagementReportChanges }
  | { state: "none"; reason: "unavailable" | "noSnapshot" | "scope" };

export interface ScheduleStatus {
  hours: ScheduleHours;
  // paused: due runs wait until the reason is resolved.
  state: "off" | "waiting" | "running" | "paused";
  reason: string | null;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: "collected" | "failed" | null;
  lastError: string | null;
  lastSkippedAt: string | null;
  lastSkippedReason: string | null;
}

// A reference file loaded for comparison, kept in main for this session.
export interface ReferenceSummary {
  // The source tenant as a shortened label.
  label: string;
  createdAt: string;
  rulesetVersion: string;
  settings: number;
  // Families the file does not cover because their collection was incomplete.
  notCompared: number;
}

export type ReferenceLoadResult =
  | { ok: true; reference: ReferenceSummary }
  | { ok: false; message: string }
  | { canceled: true };

export type CompareSource =
  | { kind: "reference" }
  // The latest snapshot of another stored tenant. MSP plan only.
  | { kind: "tenant"; tenantId: string };

export interface CompareTenant {
  tenantId: string;
  label: string;
  collectedAt: string;
  partial: boolean;
}

// Rows are capped in main; counts cover everything.
export interface CompareView {
  source: {
    kind: CompareSource["kind"];
    label: string;
    collectedAt: string;
    rulesetVersion: string;
  };
  current: { collectedAt: string; rulesetVersion: string };
  totals: ComparisonCounts;
  groups: CompareGroup[];
  notCompared: NotComparedSettingsFamily[];
  // Entra tenant identity settings, counted on their own.
  identity: ComparisonPart;
  rulesetChanged: boolean;
}

export interface PortfolioFramework {
  id: string;
  name: string;
  withEvidence: number;
  partial: number;
  applicableControls: number;
  totalControls: number;
}

// One stored tenant, from the encrypted index only.
export interface PortfolioTenant {
  tenantId: string;
  // The name the user gave the tenant, or null.
  label: string | null;
  shortLabel: string;
  current: boolean;
  snapshots: number;
  latest: {
    collectedAt: string;
    partial: boolean;
    rulesetVersion: string;
  } | null;
  frameworks: PortfolioFramework[];
}

export interface PortfolioView {
  available: boolean;
  reason: string | null;
  tenants: PortfolioTenant[];
}

export type LicenseIssueCause =
  | "certificate"
  | "proxy"
  | "proxyAuth"
  | "blocked"
  | "dns"
  | "offline"
  | "timeout"
  | "service"
  | "unknown";

export interface LicenseConnectionIssue {
  cause: LicenseIssueCause;
  // A Chromium net error (net::ERR_...), "Timeout", or "HTTP <status>".
  code: string;
  endpoint: string;
  at: string;
  appVersion: string;
  platform: string;
}

export interface LicenseStatus {
  hasKey: boolean;
  keyHint: string | null;
  // Where the signed in tenant's active license comes from: this machine's
  // key, or the organization license the key holder shared with the tenant.
  source: "key" | "tenant" | null;
  // Key licenses: whether other admins in the tenant may use it, as last
  // confirmed by the licensing service; null when unknown.
  shared: boolean | null;
  // Key licenses: sharing could not be confirmed without a fresh sign-in.
  shareNeedsSignIn: boolean;
  // Organization licenses: the masked key, such as ****ABCDEF.
  displayKey: string | null;
  persisted: boolean;
  tenantId: string | null;
  entitled: boolean;
  plan: "pro" | "msp" | null;
  tenants: number | null;
  expiresAt: string | null;
  message: string | null;
  // The last call to the licensing service failed to reach it.
  offline: boolean;
  // Why that call failed; null once the service answers again.
  connectionIssue: LicenseConnectionIssue | null;
  // A tenant with a still valid cached activation, reported while no tenant
  // is signed in.
  cachedTenantId: string | null;
}

export type UpdateState =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error"
  | "none"
  | "disabled";

export interface UpdateStatus {
  state: UpdateState;
  version?: string;
  percent?: number;
  message?: string;
}

export interface AppInfo {
  version: string;
  electron: string;
  platform: string;
  arch: string;
  packaged: boolean;
}

// CIS Benchmarks, internal only until the CIS agreement covers this app.
// Only availability answers without the signed licence claim; every other
// channel refuses with BENCHMARKS_COMING_SOON. Content stays in main memory.
export const BENCHMARKS_COMING_SOON = "CIS comparisons are coming soon.";

export type {
  BenchmarkCatalog,
  BenchmarkException,
  BenchmarkIdentity,
  BenchmarkLevel,
  DriftEntry,
  PortfolioBenchmark,
  PortfolioRow,
  StoredBenchmarkRun,
  TrendPoint,
};

export interface BenchmarkAvailability {
  state: "internal" | "comingSoon";
}

// benchmarks:assess: the engine's assessment (assessBenchmark in
// src/lib/benchmarks) of the signed in owner's last collection, with the
// tenant's exceptions applied to the adjusted headline. Titles and policy
// names come from the delivered pack and stay in memory; main keeps the last
// assessment per tenant and owner for the exports and purges it with the
// content. With history on, the stored form of the run (ids, result codes,
// open setting ids and the pack digest), one run per Level shown, is added
// to the snapshot of the assessed collection; history says whether it was
// and, when not, why.
export type BenchmarkAssessmentView = BenchmarkAssessment & { history?: BenchmarkRunRecord };

// Whether the runs of a comparison were stored with the snapshot of its
// collection. reason is plain text for display when they were not.
export interface BenchmarkRunRecord {
  recorded: boolean;
  reason: string | null;
}

export type BenchmarkExportFormat = "pdf" | "csv" | "json" | "drafts";

// Exports the last assessment. Drafts are saved only with confirmed set,
// after the user accepted the draft warnings.
export interface BenchmarkExportRequest {
  format: BenchmarkExportFormat;
  confirmed?: boolean;
}

// benchmarks:previewDrafts: what the draft policies ZIP of the last
// assessment would hold, shown before it is saved (generateBenchmarkDrafts
// with the assessed pack). draftSettings counts the settings the drafts hold;
// notGenerated lists the settings without a draft and why.
export interface BenchmarkDraftsPreview {
  draftPolicies: number;
  draftSettings: number;
  notGenerated: BenchmarkDraftGap[];
}

// An accepted exception, keyed by benchmark, version, level and setting id.
export interface BenchmarkExceptionInput {
  settingId: string;
  owner: string;
  reason: string;
  // YYYY-MM-DD; the exception is active through this date.
  expiresOn: string;
}

// benchmarks:exceptions answers with the exceptions of the requested
// benchmark, version and level, stored encrypted per tenant (BenchmarkException
// adds id and createdAt). Set adds one, or changes the one with the same
// setting id; remove drops it.
export type BenchmarkExceptionsRequest =
  | ({ action: "list" } & BenchmarkIdentity)
  | ({ action: "set" } & BenchmarkIdentity & BenchmarkExceptionInput)
  | ({ action: "remove"; settingId: string } & BenchmarkIdentity);

// benchmarks:history, for the signed in tenant: trend points of every stored
// benchmark, version and level (oldest first), drift in the newest point of
// each, and the stored runs of the requested benchmark, version and level
// (oldest first; none without a request). Runs hold ids and result codes
// only: titles come from the assessment of the delivered pack in memory.
export type BenchmarkHistoryRequest = BenchmarkIdentity;

export interface BenchmarkHistoryView {
  // Keep history is on; runs are stored only then. Runs stored before it
  // was turned off are still shown.
  enabled: boolean;
  // False when history cannot be used on this computer; reason says why.
  available: boolean;
  reason: string | null;
  trend: TrendPoint[];
  drift: DriftEntry[];
  runs: StoredBenchmarkRun[];
}

// benchmarks:portfolio, MSP plan only: the newest stored run of every level
// per stored tenant for one benchmark and version, by default the one most
// tenants ran. Tenants without a run of it are rows without levels.
export interface BenchmarkPortfolioRequest {
  benchmark: string;
  version: string;
}

export interface BenchmarkPortfolioView {
  available: boolean;
  reason: string | null;
  // Every benchmark and version stored for any tenant.
  benchmarks: PortfolioBenchmark[];
  selected: BenchmarkPortfolioRequest | null;
  // tenantName is the stored label or the short tenant label; current marks
  // the signed in tenant.
  rows: Array<PortfolioRow & { current: boolean }>;
}

export type HelpKey = "cisBenchmarks" | "entraAppRegistrations" | "gettingStarted" | "support";

export type MenuCommand = "open-settings" | "check-updates";

export interface IntunedocApi {
  settingsGet(): Promise<AppSettings>;
  settingsSave(settings: ConnectionSettings): Promise<AppSettings>;
  authStatus(): Promise<AuthStatus>;
  signInInteractive(options?: SignInOptions): Promise<SignInResult>;
  signOut(): Promise<AuthStatus>;
  validatePermissions(): Promise<PermissionValidation>;
  collectAll(): Promise<FullCollectionSummary>;
  collectCancel(): Promise<boolean>;
  collectSectionItems(key: string): Promise<SectionItemsResult>;
  collectLast(): Promise<FullCollectionSummary | null>;
  collectSearchSettings(
    request: SettingsSearchRequest,
  ): Promise<SettingsSearchResult>;
  prepareExport(options: ExportOptions): Promise<PreparedExport>;
  estimateExport(scope: ExportScopeRequest): Promise<PdfEstimate>;
  licenseStatus(): Promise<LicenseStatus>;
  licenseSetKey(key: string): Promise<LicenseStatus>;
  licenseDeactivate(): Promise<LicenseStatus>;
  licenseRetry(): Promise<LicenseStatus>;
  licenseSetShared(shared: boolean): Promise<LicenseStatus>;
  licenseOpen(target: "buy" | "portal"): Promise<boolean>;
  complianceAssess(request: ComplianceRequest): Promise<ComplianceView>;
  // Both return the saved path, or null when the save dialog was cancelled.
  complianceSaveReport(request: ComplianceRequest): Promise<string | null>;
  complianceSaveRecord(request: ComplianceRequest): Promise<string | null>;
  complianceOpenSource(frameworkId: ComplianceFrameworkId): Promise<boolean>;
  // Management report, baseline and crosswalk. Saves return the saved path,
  // or null when the save dialog was cancelled. Baseline and crosswalk live in
  // memory for the signed in account only and are never written by the app.
  complianceSaveManagementReport(
    request: ComplianceRequest,
    locale: ManagementLocale,
  ): Promise<string | null>;
  complianceSaveBaseline(request: ComplianceRequest): Promise<string | null>;
  complianceLoadBaseline(
    request: ComplianceRequest,
  ): Promise<BaselineLoadResult>;
  complianceClearBaseline(frameworkId: ComplianceFrameworkId): Promise<boolean>;
  complianceImportCrosswalk(): Promise<CrosswalkImportResult>;
  complianceClearCrosswalk(): Promise<boolean>;
  complianceSaveCrosswalkTemplate(): Promise<string | null>;
  // Evidence register, Purview evidence pack and draft fix pack for the
  // selected framework and scope. Saves return the saved path, or null when
  // the save dialog was cancelled. The fix pack is only saved with
  // confirmed set after the user accepted its warnings.
  complianceSaveRegister(
    request: ComplianceRequest,
    format: ComplianceRegisterFormat,
  ): Promise<string | null>;
  complianceSaveEvidencePack(request: ComplianceRequest): Promise<string | null>;
  compliancePreviewFixPack(request: ComplianceRequest): Promise<FixPackPreview>;
  complianceSaveFixPack(
    request: ComplianceRequest,
    confirmed: boolean,
  ): Promise<string | null>;
  // Null when Intune reports no device status for the section's family.
  compliancePolicyDeviceStatus(
    sectionKey: string,
  ): Promise<PolicyDeviceStatusView | null>;
  // Opens an https Intune or Entra admin center link from a next action.
  openPortalLink(url: string): Promise<boolean>;
  saveFile(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  // Without a path these act on the most recent save. A path is honored only
  // when this session saved it.
  openLastFile(path?: string | null): Promise<boolean>;
  showLastFileInFolder(path?: string | null): Promise<boolean>;
  copyText(text: string): Promise<boolean>;
  appInfo(): Promise<AppInfo>;
  openHelp(key: HelpKey): Promise<boolean>;
  updateCheck(): Promise<UpdateStatus>;
  // Starts downloading an available update the user chose to install.
  updateDownload(): Promise<UpdateStatus>;
  updateInstall(): Promise<boolean>;
  updateSetAuto(enabled: boolean): Promise<AppSettings>;
  // Turns background update checks on or off.
  updateSetCheck(enabled: boolean): Promise<AppSettings>;
  updateStatus(): Promise<UpdateStatus>;
  exportDiagnostics(): Promise<string | null>;
  clearLocalData(): Promise<boolean>;
  // Local history of the signed in tenant. Snapshots never leave main; the
  // diff arrives as capped rows.
  historyStatus(): Promise<HistoryStatus>;
  historySetEnabled(enabled: boolean): Promise<HistoryStatus>;
  historyList(): Promise<HistoryEntry[]>;
  historyDiff(request: HistoryDiffRequest): Promise<HistoryDiffView>;
  historyDelete(id: string): Promise<HistoryEntry[]>;
  historyDeleteAll(): Promise<HistoryStatus>;
  // Changes of the current collection since the previous snapshot, for the
  // management panel and report.
  historyChanges(
    request: ComplianceRequest & { frameworkId: ComplianceFrameworkId },
  ): Promise<ManagementChangesResult>;
  historyScheduleStatus(): Promise<ScheduleStatus>;
  // Saves the interval only; unlike settingsSave it keeps the sign in.
  historySetSchedule(hours: ScheduleHours): Promise<ScheduleStatus>;
  // Golden baseline. Saves return the saved path, or null when cancelled.
  compareExportReference(): Promise<string | null>;
  compareLoadReference(): Promise<ReferenceLoadResult>;
  compareClearReference(): Promise<boolean>;
  // The reference loaded in main for the signed in account, or null.
  compareReferenceStatus(): Promise<ReferenceSummary | null>;
  compareRun(source: CompareSource): Promise<CompareView>;
  // Stored tenants other than the signed in one. MSP plan only.
  compareTenants(): Promise<CompareTenant[]>;
  // MSP plan only. Built from the encrypted index, never every snapshot.
  portfolioList(): Promise<PortfolioView>;
  portfolioSetLabel(tenantId: string, label: string): Promise<PortfolioView>;
  portfolioDeleteTenant(tenantId: string): Promise<PortfolioView>;
  // CIS Benchmarks. availability never throws; the rest refuse without the
  // licence claim. Export returns the saved path, or null when cancelled.
  benchmarksAvailability(): Promise<BenchmarkAvailability>;
  benchmarksCatalog(): Promise<BenchmarkCatalog>;
  benchmarksAssess(request: BenchmarkIdentity): Promise<BenchmarkAssessmentView>;
  benchmarksPreviewDrafts(): Promise<BenchmarkDraftsPreview>;
  benchmarksExport(request: BenchmarkExportRequest): Promise<string | null>;
  benchmarksExceptions(
    request: BenchmarkExceptionsRequest,
  ): Promise<BenchmarkException[]>;
  benchmarksHistory(
    request?: BenchmarkHistoryRequest,
  ): Promise<BenchmarkHistoryView>;
  // MSP plan only.
  benchmarksPortfolio(
    request?: BenchmarkPortfolioRequest,
  ): Promise<BenchmarkPortfolioView>;
  onCollectProgress(callback: (progress: CollectProgress) => void): () => void;
  onExportProgress(callback: (progress: ExportProgress) => void): () => void;
  onComplianceProgress(
    callback: (progress: ComplianceReportProgress) => void,
  ): () => void;
  onLicenseChanged(callback: (status: LicenseStatus) => void): () => void;
  // Sent after sign-in, sign-out, a settings change that signs out, and when
  // a token refresh fails or recovers, whichever path caused it.
  onAuthChanged(callback: (status: AuthStatus) => void): () => void;
  onUpdateStatus(callback: (status: UpdateStatus) => void): () => void;
  onMenuCommand(callback: (command: MenuCommand) => void): () => void;
  // Sent after a snapshot was saved or history was cleared.
  onHistoryChanged(callback: () => void): () => void;
  // Sent when the snapshot of a manual collection could not be saved, with
  // the reason.
  onSnapshotNotSaved(callback: (message: string) => void): () => void;
  onScheduleStatus(callback: (status: ScheduleStatus) => void): () => void;
}
