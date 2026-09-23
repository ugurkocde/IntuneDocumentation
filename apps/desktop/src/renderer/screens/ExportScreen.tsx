import { ExportPanel } from "../components/export/ExportModal";
import { Header } from "../components/layout/Header";
import { useApp } from "../state/context";

export function ExportScreen() {
  const { state } = useApp();
  const phase = state.exportState.phase;
  const label = state.exportState.label;
  return (
    <div className="max-w-4xl space-y-5">
      <Header
        title="Export documentation"
        description={
          phase === "running"
            ? label
              ? `Generating the documentation for ${label}.`
              : "Generating your documentation."
            : phase === "done"
              ? "Your documentation is ready."
              : "Choose what to export and a format. Documents contain configuration details and assignments from the last collection."
        }
      />
      <ExportPanel />
    </div>
  );
}
