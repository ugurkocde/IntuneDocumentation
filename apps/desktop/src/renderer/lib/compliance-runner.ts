import type { Dispatch } from "react";
import type { AssessmentScope } from "../../../../../src/lib/compliance/types";
import type { ComplianceFrameworkId } from "../../shared/ipc-types";
import type { Action } from "../state/types";
import { errorMessage, ipc } from "./ipc";

export const REPORT_STAGES = [
  { label: "Resolving group names", percent: 15 },
  { label: "Generating the evidence report", percent: 45 },
  { label: "Saving the file", percent: 85 },
] as const;

const STAGE_INDEX = { groups: 0, generating: 1, saving: 2 } as const;

let running = false;

// Runs outside React components so the report keeps going while the user
// browses other screens; progress lands in the store.
export async function runComplianceReport(
  dispatch: Dispatch<Action>,
  frameworkId: ComplianceFrameworkId,
  scope: AssessmentScope,
  onFinished: () => void,
): Promise<void> {
  if (running) return;
  running = true;
  dispatch({
    type: "complianceReport",
    patch: {
      phase: "running",
      frameworkId,
      stage: 0,
      savedPath: null,
      error: null,
      notice: null,
    },
  });
  const unsubscribe = ipc.onComplianceProgress((progress) =>
    dispatch({
      type: "complianceReport",
      patch: { stage: STAGE_INDEX[progress.stage] },
    }),
  );
  try {
    const saved = await ipc.complianceSaveReport({ frameworkId, scope });
    dispatch({
      type: "complianceReport",
      patch: saved
        ? { phase: "done", savedPath: saved, stage: REPORT_STAGES.length }
        : {
            phase: "idle",
            stage: 0,
            notice: "Save cancelled. Nothing was saved.",
          },
    });
  } catch (error) {
    dispatch({
      type: "complianceReport",
      patch: { phase: "error", error: errorMessage(error) },
    });
  } finally {
    unsubscribe();
    running = false;
    onFinished();
  }
}
