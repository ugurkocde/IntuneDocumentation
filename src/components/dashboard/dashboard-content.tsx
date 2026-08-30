"use client";

import { CheckSquare, FileText, Info, Shield } from "lucide-react";
import { ConfigurationSection } from "~/components/dashboard/config-section";
import { ComplianceView } from "~/components/dashboard/compliance-view";
import { DashboardBanners } from "~/components/dashboard/dashboard-banners";
import { DashboardHeader } from "~/components/dashboard/dashboard-header";
import { KpiCards } from "~/components/dashboard/kpi-cards";
import { SelectionProgress } from "~/components/dashboard/selection-progress";
import { TypeDonut } from "~/components/dashboard/type-donut";
import type {
  ConfigurationTypeKey,
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
  onToggleFamily: (key: ConfigurationTypeKey) => void;
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
  sections: IntuneConfigurations["sections"],
  searchQuery: string,
) {
  return sections.reduce(
    (count, section) =>
      count + filterConfigurations(section.items, searchQuery).length,
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
  onToggleFamily,
  onIncludeCAChange,
}: DashboardContentProps) {
  const showConditionalAccess = includeCA && caConsentStatus === "included";
  const visibleSections = configurations.sections.filter(
    (section) =>
      (showConditionalAccess ||
        section.familyKey !== "conditionalAccessPolicies") &&
      (activeView === "overview" || section.familyKey === activeView),
  );
  const selectableSections = configurations.sections.filter(
    (section) =>
      showConditionalAccess ||
      section.familyKey !== "conditionalAccessPolicies",
  );
  const filteredCount = getFilteredCount(selectableSections, searchQuery);
  const visibleFilteredCount = getFilteredCount(visibleSections, searchQuery);
  const activeViewHasError = configurations.fetchErrors?.some(
    (error) => error.familyKey === activeView,
  );
  const warningCount =
    (configurations.permissionErrors?.length ?? 0) +
    (configurations.fetchErrors?.length ?? 0);
  const overviewTypeStats = typeStats.filter(
    (stat) => showConditionalAccess || stat.key !== "conditionalAccessPolicies",
  );
  const overviewSelectedCount = overviewTypeStats.reduce(
    (count, stat) => count + stat.selected,
    0,
  );
  const overviewTotalCount = overviewTypeStats.reduce(
    (count, stat) => count + stat.total,
    0,
  );
  const populatedTypeCount = overviewTypeStats.filter(
    (stat) => stat.total > 0,
  ).length;
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
        <p className="sr-only" aria-live="polite">
          {!refreshing
            ? `Configuration loading complete. ${configurations.summary.totalConfigurations.toLocaleString()} resources are available.`
            : ""}
        </p>
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
              stats={overviewTypeStats}
              selectedCount={overviewSelectedCount}
              totalCount={overviewTotalCount}
              onToggleFamily={onToggleFamily}
            />
            <TypeDonut stats={overviewTypeStats} total={overviewTotalCount} />
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
        ) : activeView === "compliance" ? (
          <ComplianceView configurations={configurations} />
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
              {visibleSections.map((section) => {
                const items = filter(section.items);
                if (items.length === 0) return null;
                return (
                  <ConfigurationSection
                    key={section.key}
                    title={section.label}
                    items={items}
                    prefix={section.selectionPrefix}
                    selectedConfigs={selectedConfigs}
                    onSelectConfig={onSelectConfig}
                    onBulkSelect={onBulkSelect}
                    icon={<FileText className="h-[18px] w-[18px]" />}
                  />
                );
              })}
            </div>

            {visibleFilteredCount === 0 && (
              <div className="border-petrol-950/6 shadow-card rounded-2xl border bg-white px-6 py-12 text-center">
                <p className="text-petrol-950 text-sm font-semibold">
                  {searchQuery
                    ? "No configurations match your search"
                    : activeViewHasError
                      ? "This configuration family could not be loaded"
                      : "No configurations are set up in this family"}
                </p>
                <p className="text-petrol-600 mt-1 text-xs">
                  {searchQuery
                    ? "Try a different name or description."
                    : activeViewHasError
                      ? "Review the affected-resource warning above for Microsoft Graph details."
                      : "Choose another family or return to the overview."}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
