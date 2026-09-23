import type { Dispatch } from "react";
import type { DetailedExportData } from "../../../../../src/lib/configuration-analyzer";
import { generateDetailedDOCX } from "../../../../../src/lib/docx-generator-detailed";
import { generateDetailedPDF } from "../../../../../src/lib/pdf-generator-detailed";
import { localDateStamp } from "../../shared/dates";
import type { Action, ExportFormat } from "../state/types";
import { errorMessage, ipc } from "./ipc";

export const EXPORT_STAGES = [
  { label: "Preparing export data", percent: 5 },
  { label: "Resolving group names", percent: 20 },
  { label: "Fetching device counts", percent: 45 },
  { label: "Generating document", percent: 70 },
  { label: "Saving the file", percent: 90 },
] as const;

function stage(dispatch: Dispatch<Action>, index: number): void {
  dispatch({
    type: "export",
    patch: { stage: index, percent: EXPORT_STAGES[index]?.percent ?? 0 },
  });
}

// Lets the progress view paint before the generator blocks the thread.
function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 30))),
  );
}

let running = false;

// Runs outside React components so an export keeps going while the user
// browses other screens; progress lands in the store.
export async function runExport(
  dispatch: Dispatch<Action>,
  options: { format: ExportFormat; includeEvidence: boolean },
  onFinished: () => void,
): Promise<void> {
  if (running) return;
  running = true;
  dispatch({
    type: "export",
    patch: {
      phase: "running",
      stage: 0,
      percent: EXPORT_STAGES[0].percent,
      error: null,
      notice: null,
      savedPath: null,
      savedFormat: null,
      warnings: 0,
    },
  });
  const unsubscribe = ipc.onExportProgress((progress) =>
    stage(dispatch, progress.stage === "groups" ? 1 : 2),
  );
  try {
    const data = await ipc.prepareExport({
      includeComplianceEvidence: options.includeEvidence,
    });
    unsubscribe();
    stage(dispatch, 3);
    await nextPaint();
    const exportData = data as unknown as DetailedExportData;
    const result =
      options.format === "docx"
        ? await generateDetailedDOCX(exportData)
        : await generateDetailedPDF(exportData);
    stage(dispatch, 4);
    const saved = await ipc.saveFile(
      `Intune-Configuration-Documentation-${localDateStamp()}.${options.format}`,
      result.buffer,
    );
    if (!saved) {
      dispatch({
        type: "export",
        patch: {
          phase: "form",
          stage: 0,
          percent: 0,
          notice: "Export cancelled. Nothing was saved.",
        },
      });
      return;
    }
    const warnings =
      result.errors.length +
      (data.resolutionWarnings?.length ?? 0) +
      (data.fetchErrors?.length ?? 0);
    dispatch({
      type: "export",
      patch: {
        phase: "done",
        percent: 100,
        stage: EXPORT_STAGES.length,
        savedPath: saved,
        savedFormat: options.format,
        warnings,
      },
    });
  } catch (error) {
    dispatch({
      type: "export",
      patch: { phase: "error", error: errorMessage(error) },
    });
  } finally {
    unsubscribe();
    running = false;
    onFinished();
  }
}
