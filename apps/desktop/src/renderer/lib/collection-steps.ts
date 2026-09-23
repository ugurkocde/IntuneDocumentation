import type { CollectProgress } from "../../shared/ipc-types";

export interface CollectionStep {
  // Step name as emitted by src/lib/intune-detailed-client.ts.
  key: string;
  label: string;
  status: "pending" | "loading" | "completed" | "error";
  current?: number;
  total?: number;
}

export const CONNECT_STEP = "connect";

// The twelve policy type streams of getAllDetailedConfigurations, in the
// order the website dashboard lists them.
const CANONICAL: Array<{ key: string; label: string }> = [
  { key: "Settings Catalog", label: "Settings Catalog" },
  { key: "Device Configurations", label: "Device configurations" },
  { key: "Administrative Templates", label: "Administrative templates" },
  { key: "Security Baselines", label: "Security baselines" },
  { key: "Compliance Policies", label: "Compliance policies" },
  { key: "App Protection Policies", label: "App protection policies" },
  { key: "Scripts", label: "Scripts" },
  { key: "App Configurations", label: "App configurations" },
  { key: "Windows Update Policies", label: "Windows Update policies" },
  { key: "Enrollment Configurations", label: "Enrollment configurations" },
  { key: "Additional Intune coverage", label: "Additional Intune coverage" },
  { key: "Conditional Access Policies", label: "Conditional Access policies" },
];

export function initialSteps(): CollectionStep[] {
  return [
    { key: CONNECT_STEP, label: "Connecting to Microsoft Graph", status: "loading" },
    ...CANONICAL.map((step) => ({ ...step, status: "pending" as const })),
  ];
}

export function applyProgress(
  steps: CollectionStep[],
  event: CollectProgress,
): CollectionStep[] {
  return steps.map((step) => {
    if (step.key === CONNECT_STEP) {
      return step.status === "completed" ? step : { ...step, status: "completed" };
    }
    // Every stream starts in parallel once Graph answers.
    let next: CollectionStep =
      step.status === "pending" ? { ...step, status: "loading" } : step;
    if (step.key !== event.step) return next;
    if (event.type === "completed") {
      next = { ...next, status: "completed" };
    } else if (event.type === "error") {
      next = { ...next, status: "error" };
    } else if (event.type === "batch-progress" && next.status === "loading") {
      next = { ...next, current: event.current, total: event.total };
    }
    return next;
  });
}

export function completeSteps(steps: CollectionStep[]): CollectionStep[] {
  return steps.map((step) =>
    step.status === "error" ? step : { ...step, status: "completed" },
  );
}
