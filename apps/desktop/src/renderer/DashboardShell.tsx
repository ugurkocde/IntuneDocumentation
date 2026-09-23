import { useEffect, useRef } from "react";
import { CollectionStatusToast } from "./components/collection/CollectionStatusToast";
import { Sidebar } from "./components/layout/Sidebar";
import { isMac } from "./lib/ipc";
import { ComplianceScreen } from "./screens/ComplianceScreen";
import { ExportScreen } from "./screens/ExportScreen";
import { LicenseScreen } from "./screens/LicenseScreen";
import { OverviewScreen } from "./screens/OverviewScreen";
import { SectionDetailScreen } from "./screens/SectionDetailScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useApp } from "./state/context";

export function DashboardShell() {
  const { state, actions } = useApp();
  const { screen, activeFamilyKey } = state;
  const scroller = useRef<HTMLElement>(null);
  // Main may have collected while the wizard was open, or before a reload.
  useEffect(() => {
    void actions.syncCollection();
  }, [actions]);
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [screen, activeFamilyKey]);

  return (
    <div className="flex h-full">
      <Sidebar />
      <main ref={scroller} className="relative min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]" id="content">
        {isMac && <div className="drag-region absolute inset-x-0 top-0 h-8" aria-hidden="true" />}
        <div className="@container mx-auto max-w-[1400px] px-8 pt-10 pb-12">
          <div key={`${screen}-${activeFamilyKey ?? ""}`} className="animate-fade-in-up">
            {screen === "overview" && <OverviewScreen />}
            {screen === "section" && <SectionDetailScreen />}
            {screen === "compliance" && <ComplianceScreen />}
            {screen === "export" && <ExportScreen />}
            {screen === "license" && <LicenseScreen />}
            {screen === "settings" && <SettingsScreen />}
          </div>
        </div>
      </main>
      <CollectionStatusToast />
    </div>
  );
}
