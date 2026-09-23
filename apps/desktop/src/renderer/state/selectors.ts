import type { AppState } from "./types";

// Each returns null when the action is allowed, otherwise the reason shown
// next to the disabled control.
export function collectBlocker(state: AppState): string | null {
  if (state.collection.running) return "A collection is already running.";
  if (!state.auth?.signedIn) return "Sign in to your tenant to collect data.";
  if (!state.license?.hasKey) return "Add a license key to collect tenant data.";
  if (!state.license.entitled) {
    return (
      state.license.message ??
      "The license is not active for this tenant. Open License and account to activate it."
    );
  }
  return null;
}

export function exportBlocker(state: AppState): string | null {
  if (state.collection.running) return "Available when the collection finishes.";
  if (!state.collection.summary) return "Collect tenant data first.";
  if (!state.auth?.signedIn) return "Sign in again to export.";
  if (!state.license?.entitled) return "An active license is required to export.";
  return null;
}

// Sign out, settings changes and resets wait for running work to finish.
export function busyBlocker(state: AppState): string | null {
  if (state.collection.running) return "Available when the collection finishes.";
  if (state.exportState.phase === "running") return "Available when the export finishes.";
  if (state.compliance.report.phase === "running") {
    return "Available when the evidence report is saved.";
  }
  return null;
}

export function licenseLabel(state: AppState): string {
  const license = state.license;
  if (!license?.hasKey) return "No license";
  if (license.entitled) return license.plan === "msp" ? "MSP plan" : "Pro plan";
  if (!license.tenantId) return "Sign in to activate";
  return "Not active for this tenant";
}

export function warningCount(state: AppState): number {
  const summary = state.collection.summary;
  return summary
    ? summary.fetchErrors.length + summary.permissionErrors.length
    : 0;
}
