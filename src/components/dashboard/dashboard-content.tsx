"use client";

import {
  CheckSquare,
  Code,
  FileText,
  Info,
  Laptop,
  Package,
  RefreshCw,
  Settings,
  Shield,
  UserCheck,
} from "lucide-react";
import {
  ConfigurationSection,
  ScriptsSection,
} from "~/components/dashboard/config-section";
import { DashboardBanners } from "~/components/dashboard/dashboard-banners";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { KpiCards } from "~/components/dashboard/kpi-cards";
import { SelectionProgress } from "~/components/dashboard/selection-progress";
import { TypeDonut } from "~/components/dashboard/type-donut";
import type {
  DashboardConfigurationItem,
  DashboardTypeStat,
  DashboardView,
  IntuneConfigurations,
} from "~/components/dashboard/types";
import { DASHBOARD_VIEW_LABELS } from "~/components/dashboard/types";

interface DashboardContentProps {
  configurations: IntuneConfigurations;
  activeView: DashboardView;
  searchQuery: string;
  selectedConfigs: Set<string>;
  selectAll: boolean;
  lastFetched: Date | null;
  showTipBanner: boolean;
  includeCA: boolean;
  caConsentStatus: "unknown" | "included" | "missing";
  sidebarOpen: boolean;
  refreshing?: boolean;
  typeStats: DashboardTypeStat[];
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onDismissTip: () => void;
  onSelectAll: () => void;
  onSelectFiltered: () => void;
  onSelectConfig: (id: string) => void;
  onBulkSelect: (idsToAdd: string[], idsToRemove: string[]) => void;
  onIncludeCAChange: (next: boolean) => void | Promise<void>;
}

function filterConfigurations(
  items: DashboardConfigurationItem[],
  searchQuery: string,
) {
  if (!searchQuery) return items;
  const query = searchQuery.toLowerCase();
  return items.filter((item) => {
    const name = String(item.displayName || item.name || "").toLowerCase();
    const description = String(item.description || "").toLowerCase();
    return name.includes(query) || description.includes(query);
  });
}

function getFilteredCount(
  configurations: IntuneConfigurations,
  searchQuery: string,
) {
  return [
    configurations.settingsCatalog,
    configurations.deviceConfigurations,
    configurations.administrativeTemplates,
    configurations.securityBaselines,
    configurations.compliancePolicies,
    configurations.appProtectionPolicies,
    configurations.scripts.macOS,
    configurations.scripts.windows,
    configurations.appConfigurations,
    configurations.windowsUpdatePolicies,
    configurations.enrollmentConfigurations,
    configurations.conditionalAccessPolicies,
  ].reduce(
    (count, items) => count + filterConfigurations(items, searchQuery).length,
    0,
  );
}

function SelectionToolbar({
  selectAll,
  searchQuery,
  filteredCount,
  totalCount,
  onSelectAll,
  onSelectFiltered,
}: {
  selectAll: boolean;
  searchQuery: string;
  filteredCount: number;
  totalCount: number;
  onSelectAll: () => void;
  onSelectFiltered: () => void;
}) {
  return (
    <div className="border-petrol-950/6 shadow-card flex flex-col gap-3 rounded-2xl border bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <label className="text-petrol-700 hover:bg-mint-50 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-2 text-sm font-semibold transition-colors">
        <input
          type="checkbox"
          checked={selectAll}
          onChange={onSelectAll}
          className="checkbox-enhanced"
        />
        Select all configurations
      </label>
      {searchQuery && filteredCount < totalCount && (
        <button
          type="button"
          onClick={onSelectFiltered}
          className="text-petrol-700 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition-colors hover:bg-teal-50 hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          <CheckSquare className="h-4 w-4" />
          Select matching ({filteredCount.toLocaleString()})
        </button>
      )}
    </div>
  );
}

function SettingsView({
  includeCA,
  caConsentStatus,
  onIncludeCAChange,
}: Pick<
  DashboardContentProps,
  "includeCA" | "caConsentStatus" | "onIncludeCAChange"
>) {
  return (
    <section className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Shield className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">
            Optional data source
          </p>
          <h2 className="text-petrol-950 mt-1 text-lg font-semibold">
            Conditional Access
          </h2>
          <p className="text-petrol-600 mt-2 max-w-2xl text-sm leading-6">
            Include Conditional Access policies in the dashboard and exported
            reports. This may require administrator consent for an additional
            read-only Microsoft Graph permission.
          </p>

          <label className="border-petrol-950/6 bg-mint-50 mt-5 flex cursor-pointer items-center justify-between gap-4 rounded-2xl border p-4">
            <span>
              <span className="text-petrol-950 block text-sm font-semibold">
                Include Conditional Access
              </span>
              <span className="text-petrol-600 mt-1 block text-xs">
                Fetch policies using Policy.Read.All
              </span>
            </span>
            <span className="relative inline-flex shrink-0 items-center">
              <input
                type="checkbox"
                checked={includeCA}
                onChange={(event) =>
                  void onIncludeCAChange(event.target.checked)
                }
                className="peer sr-only"
                aria-label="Include Conditional Access policies"
              />
              <span className="bg-petrol-950/15 h-7 w-12 rounded-full transition-colors peer-checked:bg-teal-600 peer-focus-visible:ring-2 peer-focus-visible:ring-teal-600 peer-focus-visible:ring-offset-2" />
              <span className="pointer-events-none absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
            </span>
          </label>

          {includeCA && caConsentStatus === "missing" && (
            <div className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-600/20 bg-amber-50 p-4">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="text-sm font-semibold text-amber-950">
                  Admin consent required
                </p>
                <p className="mt-1 text-xs leading-5 text-amber-900/80">
                  Conditional Access policies could not be loaded because{" "}
                  <code className="rounded bg-amber-100 px-1 py-0.5">
                    Policy.Read.All
                  </code>{" "}
                  has not been granted for this tenant. Ask a tenant
                  administrator to grant consent in Entra ID Enterprise
                  applications, or read the{" "}
                  <a
                    href="https://learn.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold underline decoration-amber-700/35 underline-offset-2 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    permissions and consent guide
                  </a>
                  .
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function DashboardContent({
  configurations,
  activeView,
  searchQuery,
  selectedConfigs,
  selectAll,
  lastFetched,
  showTipBanner,
  includeCA,
  caConsentStatus,
  sidebarOpen,
  refreshing = false,
  typeStats,
  onSearchChange,
  onRefresh,
  onDismissTip,
  onSelectAll,
  onSelectFiltered,
  onSelectConfig,
  onBulkSelect,
  onIncludeCAChange,
}: DashboardContentProps) {
  const filteredCount = getFilteredCount(configurations, searchQuery);
  const warningCount =
    (configurations.permissionErrors?.length ?? 0) +
    (configurations.fetchErrors?.length ?? 0);
  const populatedTypeCount = typeStats.filter((stat) => stat.total > 0).length;
  const showConditionalAccess = includeCA && caConsentStatus === "included";
  const filter = (items: DashboardConfigurationItem[]) =>
    filterConfigurations(items, searchQuery);

  return (
    <main
      id="dashboard-content"
      className={`min-w-0 flex-1 px-4 py-6 transition-[margin] duration-300 sm:px-6 lg:px-8 lg:py-8 ${
        sidebarOpen ? "md:ml-72" : "ml-[4.5rem]"
      }`}
    >
      <div className="mx-auto max-w-[1500px] space-y-5">
        <DashboardHeader
          title={DASHBOARD_VIEW_LABELS[activeView]}
          searchQuery={searchQuery}
          lastFetched={lastFetched}
          refreshing={refreshing}
          onSearchChange={onSearchChange}
          onRefresh={onRefresh}
        />

        <KpiCards
          totalConfigurations={configurations.summary.totalConfigurations}
          selectedCount={selectedConfigs.size}
          configurationTypeCount={populatedTypeCount}
          warningCount={warningCount}
        />

        {activeView === "overview" && (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,0.75fr)]">
            <SelectionProgress
              stats={typeStats}
              selectedCount={selectedConfigs.size}
              totalCount={configurations.summary.totalConfigurations}
            />
            <TypeDonut
              stats={typeStats}
              total={configurations.summary.totalConfigurations}
            />
          </div>
        )}

        <DashboardBanners
          showTip={showTipBanner && !searchQuery}
          permissionErrors={configurations.permissionErrors ?? []}
          fetchErrors={configurations.fetchErrors ?? []}
          onDismissTip={onDismissTip}
        />

        {activeView === "settings" ? (
          <SettingsView
            includeCA={includeCA}
            caConsentStatus={caConsentStatus}
            onIncludeCAChange={onIncludeCAChange}
          />
        ) : (
          <>
            <SelectionToolbar
              selectAll={selectAll}
              searchQuery={searchQuery}
              filteredCount={filteredCount}
              totalCount={configurations.summary.totalConfigurations}
              onSelectAll={onSelectAll}
              onSelectFiltered={onSelectFiltered}
            />

            <div className="space-y-4">
              {(activeView === "overview" ||
                activeView === "settingsCatalog") &&
                filter(configurations.settingsCatalog).length > 0 && (
                  <ConfigurationSection
                    title="Settings Catalog"
                    items={filter(configurations.settingsCatalog)}
                    prefix="catalog"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Settings className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "deviceConfigurations") &&
                filter(configurations.deviceConfigurations).length > 0 && (
                  <ConfigurationSection
                    title="Device Configurations (Templates)"
                    items={filter(configurations.deviceConfigurations)}
                    prefix="device"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Laptop className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "administrativeTemplates") &&
                filter(configurations.administrativeTemplates).length > 0 && (
                  <ConfigurationSection
                    title="Administrative Templates (Group Policy)"
                    items={filter(configurations.administrativeTemplates)}
                    prefix="admx"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<FileText className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "securityBaselines") &&
                filter(configurations.securityBaselines).length > 0 && (
                  <ConfigurationSection
                    title="Security Baselines & Endpoint Security"
                    items={filter(configurations.securityBaselines)}
                    prefix="security"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Shield className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "compliancePolicies") &&
                filter(configurations.compliancePolicies).length > 0 && (
                  <ConfigurationSection
                    title="Compliance Policies"
                    items={filter(configurations.compliancePolicies)}
                    prefix="compliance"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<CheckSquare className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "appProtectionPolicies") &&
                filter(configurations.appProtectionPolicies).length > 0 && (
                  <ConfigurationSection
                    title="App Protection Policies"
                    items={filter(configurations.appProtectionPolicies)}
                    prefix="app-protection"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Shield className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" || activeView === "scripts") &&
                (configurations.scripts.macOS.length > 0 ||
                  configurations.scripts.windows.length > 0) && (
                  <ScriptsSection
                    macOSItems={filter(configurations.scripts.macOS)}
                    windowsItems={filter(configurations.scripts.windows)}
                    allMacOSItems={configurations.scripts.macOS}
                    allWindowsItems={configurations.scripts.windows}
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Code className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "appConfigurations") &&
                filter(configurations.appConfigurations).length > 0 && (
                  <ConfigurationSection
                    title="App Configuration Policies"
                    items={filter(configurations.appConfigurations)}
                    prefix="app"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Package className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "windowsUpdatePolicies") &&
                filter(configurations.windowsUpdatePolicies).length > 0 && (
                  <ConfigurationSection
                    title="Windows Update Policies"
                    items={filter(configurations.windowsUpdatePolicies)}
                    prefix="update"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<RefreshCw className="h-[18px] w-[18px]" />}
                  />
                )}
              {(activeView === "overview" ||
                activeView === "enrollmentConfigurations") &&
                filter(configurations.enrollmentConfigurations).length > 0 && (
                  <ConfigurationSection
                    title="Enrollment Configurations"
                    items={filter(configurations.enrollmentConfigurations)}
                    prefix="enrollment"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<UserCheck className="h-[18px] w-[18px]" />}
                  />
                )}
              {showConditionalAccess &&
                (activeView === "overview" ||
                  activeView === "conditionalAccessPolicies") &&
                filter(configurations.conditionalAccessPolicies).length > 0 && (
                  <ConfigurationSection
                    title="Conditional Access Policies"
                    items={filter(configurations.conditionalAccessPolicies)}
                    prefix="ca"
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<Shield className="h-[18px] w-[18px]" />}
                  />
                )}
            </div>

            {filteredCount === 0 && (
              <div className="border-petrol-950/6 shadow-card rounded-2xl border bg-white px-6 py-12 text-center">
                <p className="text-petrol-950 text-sm font-semibold">
                  No configurations match your search
                </p>
                <p className="text-petrol-600 mt-1 text-xs">
                  Try a different name or description.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
