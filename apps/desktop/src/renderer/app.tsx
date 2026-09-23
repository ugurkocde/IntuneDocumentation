import { DashboardShell } from "./DashboardShell";
import { WizardShell } from "./components/wizard/WizardShell";
import { Spinner } from "./components/ui/Spinner";
import { AppProvider, useApp } from "./state/context";

function Root() {
  const { state } = useApp();
  if (!state.booted) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <img src="./logo.svg" alt="" className="h-14 w-14 rounded-2xl" draggable={false} />
          <Spinner label="Starting Intune Documentation" />
        </div>
      </div>
    );
  }
  return state.wizardActive ? <WizardShell /> : <DashboardShell />;
}

export function App() {
  return (
    <AppProvider>
      <Root />
    </AppProvider>
  );
}
