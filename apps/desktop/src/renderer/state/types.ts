import type { AssessmentScope } from "../../../../../src/lib/compliance/types";
import type {
  AppInfo,
  AppSettings,
  AuthStatus,
  CollectProgress,
  ComplianceFrameworkId,
  FullCollectionSummary,
  LicenseStatus,
  SectionItemsResult,
  UpdateStatus,
} from "../../shared/ipc-types";
import type { ScopeItemRef } from "../../shared/export-scope";
import type { CollectionStep } from "../lib/collection-steps";

export type Screen =
  | "overview"
  | "section"
  | "compliance"
  | "export"
  | "license"
  | "settings";

export type ToastState = "hidden" | "running" | "success" | "warning" | "error";

export interface CollectionState {
  running: boolean;
  cancelling: boolean;
  steps: CollectionStep[];
  loaded: number;
  summary: FullCollectionSummary | null;
  error: string | null;
  toast: ToastState;
}

export type ExportFormat = "pdf" | "docx";

// A configuration chosen on a section screen. Keyed by section and stable
// item id; the names are kept for titles and file names.
export interface SelectedItem extends ScopeItemRef {
  name: string;
  sectionLabel: string;
}

export interface ExportState {
  phase: "form" | "running" | "done" | "error";
  format: ExportFormat;
  // What the Export screen exports when a selection exists.
  scope: "tenant" | "selection";
  // The scope title of the running or finished export; null for the whole
  // tenant.
  label: string | null;
  // The family screen a scoped export was started from.
  returnFamilyKey: string | null;
  stage: number;
  percent: number;
  savedPath: string | null;
  savedFormat: ExportFormat | null;
  error: string | null;
  notice: string | null;
  warnings: number;
}

export interface ComplianceReportState {
  phase: "idle" | "running" | "done" | "error";
  frameworkId: ComplianceFrameworkId | null;
  stage: number;
  savedPath: string | null;
  error: string | null;
  notice: string | null;
}

export interface ComplianceState {
  // Kept in the store so the scope survives switching screens.
  scope: AssessmentScope;
  report: ComplianceReportState;
}

export interface AppState {
  booted: boolean;
  settings: AppSettings | null;
  auth: AuthStatus | null;
  license: LicenseStatus | null;
  appInfo: AppInfo | null;
  update: UpdateStatus;
  wizardActive: boolean;
  screen: Screen;
  activeFamilyKey: string | null;
  sidebarOpen: boolean;
  collection: CollectionState;
  sections: Record<string, SectionItemsResult>;
  // Keyed by scopeKey(); cleared by a new collection or sign out.
  selection: Record<string, SelectedItem>;
  exportState: ExportState;
  compliance: ComplianceState;
}

export type Action =
  | {
      type: "boot";
      settings: AppSettings;
      auth: AuthStatus | null;
      license: LicenseStatus | null;
      appInfo: AppInfo | null;
      update: UpdateStatus;
      wizardActive: boolean;
    }
  | { type: "navigate"; screen: Screen; familyKey?: string | null }
  | { type: "sidebar"; open: boolean }
  | { type: "settings"; settings: AppSettings }
  | { type: "auth"; auth: AuthStatus | null }
  | { type: "license"; license: LicenseStatus | null }
  | { type: "update"; update: UpdateStatus }
  | { type: "wizard"; active: boolean }
  | { type: "collectStart" }
  | { type: "collectCancelling" }
  | { type: "collectProgress"; event: CollectProgress }
  | { type: "collectDone"; summary: FullCollectionSummary; quiet?: boolean }
  | { type: "collectFailed"; error: string }
  | { type: "toast"; toast: ToastState }
  | { type: "resetCollection" }
  | { type: "sectionLoaded"; result: SectionItemsResult }
  | { type: "export"; patch: Partial<ExportState> }
  | { type: "select"; items: SelectedItem[]; selected: boolean }
  | { type: "clearSelection" }
  | { type: "complianceScope"; scope: AssessmentScope }
  | { type: "complianceReport"; patch: Partial<ComplianceReportState> };
