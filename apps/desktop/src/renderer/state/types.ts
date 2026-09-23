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

export interface ExportState {
  phase: "form" | "running" | "done" | "error";
  format: ExportFormat;
  includeEvidence: boolean;
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
  | { type: "complianceScope"; scope: AssessmentScope }
  | { type: "complianceReport"; patch: Partial<ComplianceReportState> };
