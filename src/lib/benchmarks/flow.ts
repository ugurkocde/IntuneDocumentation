/**
 * The three steps of the Benchmarks screen, ported from TenuVault
 * (cis-flow.ts): load a benchmark, compare it with the last collection,
 * review the results.
 */

export type StepState = "complete" | "current" | "upcoming";

export interface FlowStep {
  step: 1 | 2 | 3;
  label: string;
  state: StepState;
}

export const FLOW_LABELS = [
  "Load benchmark",
  "Compare with tenant",
  "Review results",
] as const;

/** Stepper state. While a comparison runs step 2 is current, even when older results are still shown. */
export function flowSteps(
  hasPack: boolean,
  hasAssessment: boolean,
  isRunning = false,
): FlowStep[] {
  const states: [StepState, StepState, StepState] = isRunning
    ? [hasPack ? "complete" : "upcoming", "current", "upcoming"]
    : hasAssessment
      ? [hasPack ? "complete" : "upcoming", "complete", "current"]
      : hasPack
        ? ["complete", "current", "upcoming"]
        : ["current", "upcoming", "upcoming"];
  return FLOW_LABELS.map((label, index) => ({
    step: (index + 1) as 1 | 2 | 3,
    label,
    state: states[index]!,
  }));
}

export type FlowStage = "setup" | "running" | "results";

/**
 * The staged view: a first run owns the screen, a finished comparison shows
 * its results, and setup shows until results exist or the user asks for a
 * new comparison. A re-run keeps the previous results visible.
 */
export function flowStage(input: {
  hasRun: boolean;
  hasAssessment: boolean;
  setupRequested: boolean;
}): FlowStage {
  if (input.hasRun && (!input.hasAssessment || input.setupRequested))
    return "running";
  if (input.hasAssessment && !input.setupRequested) return "results";
  return "setup";
}
