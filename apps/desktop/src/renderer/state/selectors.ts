import type { AppState } from "./types";

// Each returns null when the action is allowed, otherwise the reason shown
// next to the disabled control.
export function collectBlocker(state: AppState): string | null {
  if (state.collection.running) return "A collection is already running.";
  if (!state.auth?.signedIn) return "Sign in to your tenant to collect data.";
  if (state.license?.entitled) return null;
  if (!state.license?.hasKey) return "Add a license key to collect tenant data.";
  return (
    state.license.message ??
    "The license is not active for this tenant. Open License and account to activate it."
  );
}

export function exportBlocker(state: AppState): string | null {
  if (state.collection.running) return "Available when the collection finishes.";
  if (!state.collection.summary) return "Collect tenant data first.";
  if (!state.auth?.signedIn) return "Sign in again to export.";
  if (!state.license?.entitled) return "An active license is required to export.";
  return null;
}

// Exports started from a section screen: the export blockers, and one
// export at a time.
export function quickExportBlocker(state: AppState): string | null {
  const blocker = exportBlocker(state);
  if (blocker) return blocker;
  if (state.exportState.phase === "running") {
    return "Available when the current export finishes.";
  }
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

export type LicenseKind = "none" | "signedOut" | "cached" | "offline" | "saved" | "active";

export interface LicenseView {
  kind: LicenseKind;
  // Short status for badges and headings.
  label: string;
  // One sentence that explains the status and what to do next.
  detail: string;
  tone: "neutral" | "warning" | "active";
}

// The single license status shown everywhere, so the Overview, the license
// panel and the sidebar never disagree.
export function licenseView(state: AppState): LicenseView {
  const license = state.license;
  const signedIn = Boolean(state.auth?.signedIn);
  if (license?.entitled) {
    const plan = license.plan === "msp" ? "MSP" : "Pro";
    return license.source === "tenant"
      ? {
          kind: "active",
          label: `Active through your organization, ${plan} plan`,
          detail: `Licensed through your organization (${plan}).`,
          tone: "active",
        }
      : {
          kind: "active",
          label: `Active, ${plan} plan`,
          detail: `${plan} plan active for this tenant.`,
          tone: "active",
        };
  }
  if (!signedIn && license?.cachedTenantId) {
    return {
      kind: "cached",
      label: "Active",
      detail: `Active, last verified for tenant ${license.cachedTenantId}. Sign in to that tenant to collect.`,
      tone: "active",
    };
  }
  if (!license?.hasKey) {
    return {
      kind: "none",
      label: "No license key",
      detail: "Add the license key from your purchase email.",
      tone: "neutral",
    };
  }
  if (!signedIn) {
    return {
      kind: "signedOut",
      label: "Not signed in",
      detail: "Your license key is saved. It activates for your tenant after you sign in.",
      tone: "neutral",
    };
  }
  if (license.offline) {
    return {
      kind: "offline",
      label: "Offline",
      detail: "The licensing service could not be reached. Check the connection and retry.",
      tone: "warning",
    };
  }
  return {
    kind: "saved",
    label: "Key saved, not active",
    detail:
      license.message ??
      "Your license key is saved but not active for this tenant. Retry the activation or check your subscription.",
    tone: "warning",
  };
}

export function warningCount(state: AppState): number {
  const summary = state.collection.summary;
  return summary
    ? summary.fetchErrors.length + summary.permissionErrors.length
    : 0;
}
