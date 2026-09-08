"use client";

import { CollectionStatus, CollectionPlaceholder } from "./collection-status";
import { stepForFamily, type CollectionStep } from "~/lib/collection-progress";
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
  groupNames?: Map<string, string> | null;
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
  refreshError?: string | null;
  collectionSteps?: CollectionStep[];
  loadedResourceCount?: number;
  retryAvailable?: boolean;
  onRetry?: () => void;
  typeStats: DashboardTypeStat[];
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onRetryConditionalAccess?: () => void;
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
            <div className="mt-4 rounded-xl bg-amber-50 p-4 text-xs leading-5 text-amber-900">
              Microsoft sign-in did not provide access to Conditional Access.
              This can happen if sign-in was cancelled, the session expired, or
              Policy.Read.All consent is unavailable. Use the Conditional Access
              page to retry; if Microsoft requests administrator approval, ask
              an administrator to grant it.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export function DashboardContent({
  configurations,
  groupNames,
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
  refreshError,
  collectionSteps = [],
  loadedResourceCount = 0,
  retryAvailable = false,
  onRetry,
  typeStats,
  onSearchChange,
  onRefresh,
  onRetryConditionalAccess,
  onDismissTip,
  onSelectAll,
  onSelectFiltered,
  onSelectConfig,
  onBulkSelect,
  onToggleFamily,
  onIncludeCAChange,
}: DashboardContentProps) {
  const showConditionalAccess = includeCA && caConsentStatus === "included";
  const activeStep = collectionSteps[stepForFamily(activeView)];
  const activeLoading =
    refreshing &&
    (!activeStep || ["pending", "loading"].includes(activeStep.status));
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
        <CollectionStatus
          loading={refreshing}
          steps={collectionSteps}
          count={
            refreshing
              ? loadedResourceCount
              : configurations.summary.totalConfigurations
          }
          retryAvailable={retryAvailable}
          incomplete={!!refreshError || warningCount > 0}
          onRetry={retryAvailable ? (onRetry ?? onRefresh) : onRefresh}
        />
        {refreshError && (
          <p
            role="alert"
            className="rounded-xl bg-orange-50 p-3 text-sm text-orange-900"
          >
            Data collection did not complete. Available data remains visible.{" "}
            {refreshError}
          </p>
        )}

        <KpiCards
          totalConfigurations={configurations.summary.totalConfigurations}
          selectedCount={selectedConfigs.size}
          configurationTypeCount={populatedTypeCount}
          warningCount={warningCount}
          loading={refreshing}
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
          showTip={showTipBanner && !searchQuery && activeView !== "compliance"}
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
        ) : activeView === "conditionalAccessPolicies" &&
          includeCA &&
          (caConsentStatus === "missing" ||
            (!refreshing && caConsentStatus !== "included")) ? (
          <section className="border-petrol-950/6 rounded-2xl border bg-white p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <Info
                aria-hidden="true"
                className="mt-0.5 h-5 w-5 shrink-0 text-amber-700"
              />
              <div>
                <h2 className="text-petrol-950 text-base font-semibold">
                  Conditional Access wasn’t loaded
                </h2>
                <p className="text-petrol-600 mt-2 max-w-2xl text-sm leading-6">
                  Conditional Access is enabled, but Microsoft sign-in did not
                  provide the access needed to read its policies. This does not
                  mean your tenant has no Conditional Access policies.
                </p>
                <p className="text-petrol-600 mt-2 max-w-2xl text-sm leading-6">
                  Try signing in again. If Microsoft requests administrator
                  approval, ask an administrator to grant{" "}
                  <code>Policy.Read.All</code>.
                </p>
                <button
                  type="button"
                  disabled={refreshing}
                  onClick={onRetryConditionalAccess ?? onRefresh}
                  className="bg-petrol-950 mt-4 min-h-11 rounded-xl px-4 text-sm font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-wait disabled:opacity-50"
                >
                  {refreshing
                    ? "Collection in progress…"
                    : "Retry Conditional Access"}
                </button>
              </div>
            </div>
          </section>
        ) : activeView === "compliance" && refreshing ? (
          <CollectionPlaceholder
            title="Checking policy evidence"
            description="Results will appear when collection finishes. Settings still loading will not be marked as missing."
          />
        ) : activeView === "compliance" ? (
          <ComplianceView
            configurations={configurations}
            groupNames={groupNames}
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

            {visibleFilteredCount === 0 && activeLoading ? (
              <CollectionPlaceholder
                title="Loading configurations"
                description="This category is still loading. You can browse another category while it finishes."
              />
            ) : (
              visibleFilteredCount === 0 && (
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
              )
            )}
          </>
        )}
      </div>
    </main>
  );
}
