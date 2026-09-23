import { scopeKey } from "../../shared/export-scope";
import {
  applyProgress,
  completeSteps,
  initialSteps,
} from "../lib/collection-steps";
import type {
  Action,
  AppState,
  ComplianceReportState,
  ExportState,
} from "./types";

const SIDEBAR_KEY = "intunedoc.sidebar.open";

function initialSidebar(): boolean {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_KEY);
    if (stored !== null) return stored === "true";
  } catch {
    // Storage unavailable; fall back to the width based default.
  }
  return window.innerWidth >= 1100;
}

export function persistSidebar(open: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_KEY, String(open));
  } catch {
    // Not critical.
  }
}

export const initialExportState: ExportState = {
  phase: "form",
  format: "pdf",
  scope: "tenant",
  label: null,
  returnFamilyKey: null,
  stage: 0,
  percent: 0,
  savedPath: null,
  savedFormat: null,
  error: null,
  notice: null,
  warnings: 0,
};

export const initialComplianceReport: ComplianceReportState = {
  phase: "idle",
  frameworkId: null,
  stage: 0,
  savedPath: null,
  error: null,
  notice: null,
};

// A new or cleared collection invalidates a finished report, not one that is
// still being written.
function resetReport(state: AppState): AppState["compliance"] {
  return state.compliance.report.phase === "running"
    ? state.compliance
    : { ...state.compliance, report: initialComplianceReport };
}

export function createInitialState(): AppState {
  return {
    booted: false,
    settings: null,
    auth: null,
    license: null,
    appInfo: null,
    update: { state: "idle" },
    wizardActive: false,
    screen: "overview",
    activeFamilyKey: null,
    sidebarOpen: initialSidebar(),
    collection: {
      running: false,
      cancelling: false,
      steps: initialSteps(),
      loaded: 0,
      summary: null,
      error: null,
      toast: "hidden",
    },
    sections: {},
    selection: {},
    exportState: initialExportState,
    compliance: { scope: {}, report: initialComplianceReport },
  };
}

// The Export screen follows the selection: it offers the selected items once
// something is selected and falls back to the whole tenant when cleared.
function withSelection(
  state: AppState,
  selection: AppState["selection"],
): AppState {
  const had = Object.keys(state.selection).length > 0;
  const has = Object.keys(selection).length > 0;
  const exportState =
    had === has || state.exportState.phase === "running"
      ? state.exportState
      : { ...state.exportState, scope: has ? "selection" : "tenant" } as const;
  return { ...state, selection, exportState };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case "boot":
      return {
        ...state,
        booted: true,
        settings: action.settings,
        auth: action.auth,
        license: action.license,
        appInfo: action.appInfo,
        update: action.update,
        wizardActive: action.wizardActive,
      };
    case "navigate":
      return {
        ...state,
        screen: action.screen,
        activeFamilyKey:
          action.screen === "section"
            ? (action.familyKey ?? state.activeFamilyKey)
            : null,
      };
    case "sidebar":
      return { ...state, sidebarOpen: action.open };
    case "settings":
      return { ...state, settings: action.settings };
    case "auth":
      return { ...state, auth: action.auth };
    case "license":
      return { ...state, license: action.license };
    case "update":
      return { ...state, update: action.update };
    case "wizard":
      return { ...state, wizardActive: action.active };
    case "collectStart":
      return {
        ...state,
        collection: {
          ...state.collection,
          running: true,
          cancelling: false,
          steps: initialSteps(),
          loaded: 0,
          error: null,
          toast: "running",
        },
      };
    case "collectCancelling":
      return {
        ...state,
        collection: { ...state.collection, cancelling: true },
      };
    case "collectProgress":
      if (!state.collection.running) return state;
      return {
        ...state,
        collection: {
          ...state.collection,
          steps: applyProgress(state.collection.steps, action.event),
          loaded: Math.max(state.collection.loaded, action.event.loaded),
        },
      };
    case "collectDone": {
      const warnings =
        action.summary.fetchErrors.length +
        action.summary.permissionErrors.length;
      return {
        ...state,
        sections: {},
        selection: {},
        exportState:
          state.exportState.phase === "running"
            ? state.exportState
            : initialExportState,
        compliance: resetReport(state),
        collection: {
          ...state.collection,
          running: false,
          cancelling: false,
          steps: completeSteps(state.collection.steps),
          loaded: action.summary.totalConfigurations,
          summary: action.summary,
          error: null,
          toast: action.quiet ? "hidden" : warnings > 0 ? "warning" : "success",
        },
      };
    }
    case "collectFailed":
      return {
        ...state,
        collection: {
          ...state.collection,
          running: false,
          cancelling: false,
          error: action.error,
          toast: "error",
        },
      };
    case "toast":
      return {
        ...state,
        collection: { ...state.collection, toast: action.toast },
      };
    case "resetCollection":
      return {
        ...state,
        sections: {},
        selection: {},
        exportState:
          state.exportState.phase === "running"
            ? state.exportState
            : initialExportState,
        compliance: resetReport(state),
        collection: {
          ...state.collection,
          running: false,
          cancelling: false,
          steps: initialSteps(),
          loaded: 0,
          summary: null,
          error: null,
          toast: "hidden",
        },
      };
    case "sectionLoaded":
      return {
        ...state,
        sections: { ...state.sections, [action.result.key]: action.result },
      };
    case "export":
      return {
        ...state,
        exportState: { ...state.exportState, ...action.patch },
      };
    case "select": {
      const selection = { ...state.selection };
      for (const item of action.items) {
        if (action.selected) selection[scopeKey(item)] = item;
        else delete selection[scopeKey(item)];
      }
      return withSelection(state, selection);
    }
    case "clearSelection":
      return withSelection(state, {});
    case "complianceScope":
      return {
        ...state,
        compliance: { ...state.compliance, scope: action.scope },
      };
    case "complianceReport":
      return {
        ...state,
        compliance: {
          ...state.compliance,
          report: { ...state.compliance.report, ...action.patch },
        },
      };
    default:
      return state;
  }
}
