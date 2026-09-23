import { ExportPanel } from "../components/export/ExportModal";
import { Header } from "../components/layout/Header";
import { useApp } from "../state/context";

export function ExportScreen() {
  const { state } = useApp();
  const phase = state.exportState.phase;
  return (
    <div className="max-w-4xl space-y-5">
      <Header
        title="Export documentation"
        description={
          phase === "running"
            ? "Generating your documentation."
            : phase === "done"
              ? "Your documentation is ready."
              : "Choose a format and create documentation from the last collection."
        }
      />
      <ExportPanel />
    </div>
  );
}
