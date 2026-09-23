import { useCallback } from "react";
import { runExport } from "../lib/export-runner";
import type { ExportTarget } from "../lib/export-targets";
import { useApp } from "../state/context";
import type { ExportFormat } from "../state/types";

// Starts an export from a section screen and shows its progress on the
// Export screen, which offers a way back afterwards.
export function useStartExport(): (target: ExportTarget, format: ExportFormat) => void {
  const { state, dispatch, actions } = useApp();
  const familyKey = state.activeFamilyKey;
  return useCallback(
    (target, format) => {
      dispatch({ type: "navigate", screen: "export" });
      void runExport(
        dispatch,
        { format, target, returnFamilyKey: familyKey },
        () => void actions.refreshLicense(),
      );
    },
    [dispatch, actions, familyKey],
  );
}
