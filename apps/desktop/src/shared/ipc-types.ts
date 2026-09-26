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
} from "../../../../src/lib/compliance/types";

export interface AppSettings {
  clientId: string;
  tenantId: string;
  autoUpdate: boolean;
  checkForUpdates: boolean;
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
}

export interface SectionItemsResult {
  key: string;
  familyKey: string;
  label: string;
  error: string | null;
  items: SectionItemSummary[];
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
  | "nist-800-171-r3";

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

export interface ComplianceFrameworkView {
  framework: FrameworkAssessment["framework"];
  coverageLabel?: string;
  controls: ControlAssessment[];
  capabilities: ComplianceCapabilityView[];
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

export interface ComplianceReportProgress {
  stage: "groups" | "generating" | "saving";
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

export type HelpKey = "entraAppRegistrations" | "gettingStarted" | "support";

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
}
