"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { graphScopes } from "~/lib/msal-config";
import { useTenantLogging } from "~/hooks/use-tenant-logging";
import { Card, CardHeader, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { ProgressBar } from "~/components/ui/progress-bar";
import { NavigationHeader } from "~/components/navigation-header";
import {
  Settings,
  Shield,
  FileText,
  Code,
  Package,
  RefreshCw,
  UserCheck,
  Laptop,
  CheckSquare,
  Clock,
  X,
  Info,
  AlertCircle,
} from "lucide-react";
import { BrandingSettingsModal } from "~/components/branding-settings-modal";
import { ExportModal, type ExportState } from "~/components/export-modal";
import { FloatingExportNotification } from "~/components/floating-export-notification";
import { useExportHandler } from "~/hooks/use-export-handler";
import type { BrandingOptions } from "~/types/branding";
import { DashboardSidebar } from "~/components/dashboard/dashboard-sidebar";
import { DashboardActionBar } from "~/components/dashboard/dashboard-action-bar";
import { PermissionErrorBanner, FetchErrorBanner } from "~/components/dashboard/error-banner";
import { EmptyState } from "~/components/dashboard/empty-state";
import { useDashboardState } from "~/hooks/use-dashboard-state";
import { useConfigurationOperations } from "~/hooks/use-configuration-operations";
import { useKeyboardShortcuts } from "~/hooks/use-keyboard-shortcuts";

export default function DashboardPage() {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const searchInputRef = useRef<HTMLInputElement>(null);

  useTenantLogging("Dashboard-Access");

  const { state, actions } = useDashboardState();
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [brandingOptions, setBrandingOptions] = useState<BrandingOptions | undefined>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("intune-branding-options");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved branding options:", e);
        }
      }
    }
    return undefined;
  });

  const [exportState, setExportState] = useState<ExportState>({
    selectedFormat: "pdf-detailed",
    isExporting: false,
    exportComplete: false,
    exportError: null,
    exportErrors: [],
    exportStats: null,
    currentStage: 0,
    overallProgress: 0,
  });
  const [showFloatingNotification, setShowFloatingNotification] = useState(false);

  const updateExportState = useCallback((partial: Partial<ExportState>) => {
    setExportState((prev) => ({ ...prev, ...partial }));
  }, []);

  // Configuration operations hook
  const { filterConfigurations, getAllConfigIds, getFilteredIds, filteredCount } =
    useConfigurationOperations(state.configurations, state.searchQuery);

  // Redirect if not authenticated
  useEffect(() => {
    if (accounts.length === 0) {
      router.push("/");
    } else {
      void fetchConfigurations();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, router]);

  const getAccessToken = useCallback(
    async (extraScopes?: string[]) => {
      if (accounts.length === 0) throw new Error("No authenticated account");

      const request = {
        scopes:
          extraScopes && extraScopes.length > 0
            ? [...graphScopes.scopes, ...extraScopes]
            : [...graphScopes.scopes],
        account: accounts[0],
      } as const;

      try {
        const response = await instance.acquireTokenSilent(request as any);
        return response.accessToken;
      } catch {
        const response = await instance.acquireTokenPopup(request as any);
        return response.accessToken;
      }
    },
    [accounts, instance]
  );

  const fetchConfigurations = useCallback(
    async (caRequested?: boolean) => {
      try {
        actions.setLoading(true);
        actions.setError(null);
        actions.resetSelections();

        const stepsFor = (withCA: boolean) => [
          { name: "Connecting to Microsoft Graph API", status: "pending" as const },
          { name: "Fetching Settings Catalog configurations", status: "pending" as const },
          { name: "Fetching Device Configurations", status: "pending" as const },
          { name: "Fetching Administrative Templates", status: "pending" as const },
          { name: "Fetching Security Baselines", status: "pending" as const },
          { name: "Fetching Compliance Policies", status: "pending" as const },
          { name: "Fetching Scripts", status: "pending" as const },
          { name: "Fetching App Configurations", status: "pending" as const },
          { name: "Fetching Windows Update Policies", status: "pending" as const },
          { name: "Fetching Enrollment Configurations", status: "pending" as const },
          ...(withCA
            ? [{ name: "Fetching Conditional Access Policies", status: "pending" as const }]
            : []),
        ];

        actions.setFetchProgress({ steps: stepsFor(false), currentStep: 0 });
        actions.updateFetchProgressStep(0, "loading");
        let accessToken = await getAccessToken();
        actions.updateFetchProgressStep(0, "completed");

        let caIncluded = false;
        const wantCA = caRequested ?? state.includeCA;
        if (wantCA) {
          try {
            accessToken = await getAccessToken(["Policy.Read.All"]);
            caIncluded = true;
          } catch {
            caIncluded = false;
          }
        }

        actions.setCaConsentStatus(wantCA ? (caIncluded ? "included" : "missing") : "unknown");

        actions.setFetchProgress({ steps: stepsFor(caIncluded), currentStep: 0 });
        actions.updateFetchProgressStep(0, "completed");
        const totalSteps = stepsFor(caIncluded).length;

        for (let i = 1; i < totalSteps; i++) {
          actions.updateFetchProgressStep(i, "loading");
        }

        const response = await fetch("/api/intune/detailed-configurations", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.details || "Failed to fetch configurations");
        }

        for (let i = 1; i < totalSteps; i++) {
          actions.updateFetchProgressStep(i, "completed");
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        const data = await response.json();
        actions.setConfigurations(data);
        actions.setLastFetched(new Date());
      } catch (err) {
        const currentStep = state.fetchProgress.currentStep;
        actions.updateFetchProgressStep(currentStep, "error");
        actions.setError(err instanceof Error ? err.message : "An error occurred");
        console.error("Error fetching configurations:", err);
      } finally {
        actions.setLoading(false);
      }
    },
    [getAccessToken, state.includeCA, state.fetchProgress.currentStep, actions]
  );

  // Selection handlers
  const handleSelectAll = useCallback(() => {
    if (state.selectAll) {
      actions.setSelectedConfigs(new Set());
      actions.toggleSelectAll(false);
    } else {
      actions.setSelectedConfigs(new Set(getAllConfigIds));
      actions.toggleSelectAll(true);
    }
  }, [state.selectAll, getAllConfigIds, actions]);

  const handleSelectFiltered = useCallback(() => {
    actions.setSelectedConfigs(new Set(getFilteredIds));
  }, [getFilteredIds, actions]);

  const handleSelectConfig = useCallback(
    (id: string) => {
      const newSelected = new Set(state.selectedConfigs);
      if (newSelected.has(id)) {
        newSelected.delete(id);
      } else {
        newSelected.add(id);
      }
      actions.setSelectedConfigs(newSelected);
      actions.toggleSelectAll(newSelected.size === getAllConfigIds.length);
    },
    [state.selectedConfigs, getAllConfigIds, actions]
  );

  const handleBulkSelect = useCallback(
    (idsToAdd: string[], idsToRemove: string[]) => {
      const newSelected = new Set(state.selectedConfigs);
      idsToRemove.forEach((id) => newSelected.delete(id));
      idsToAdd.forEach((id) => newSelected.add(id));
      actions.setSelectedConfigs(newSelected);
      actions.toggleSelectAll(newSelected.size === getAllConfigIds.length);
    },
    [state.selectedConfigs, getAllConfigIds, actions]
  );

  // Export handler hook
  const { showExportModal, setShowExportModal, exportConfig, handleExport: handleExportWithModal } =
    useExportHandler({
      configurations: state.configurations,
      selectedConfigs: state.selectedConfigs,
      brandingOptions,
      includeCA: state.includeCA,
      caConsentStatus: state.caConsentStatus,
      getAccessToken,
    });

  // Keyboard shortcuts
  useKeyboardShortcuts(
    {
      onSelectAll: handleSelectAll,
      onDeselectAll: () => {
        actions.setSelectedConfigs(new Set());
        actions.toggleSelectAll(false);
      },
      onExport: () => {
        if (state.selectedConfigs.size > 0) {
          setShowExportModal(true);
        }
      },
      onRefresh: () => void fetchConfigurations(),
      onSearch: () => searchInputRef.current?.focus(),
      onEscape: () => {
        if (showExportModal) setShowExportModal(false);
        if (showBrandingModal) setShowBrandingModal(false);
      },
    },
    !state.loading
  );

  // Check if search returns no results
  const hasSearchResults = useMemo(() => {
    if (!state.searchQuery || !state.configurations) return true;
    return filteredCount > 0;
  }, [state.searchQuery, state.configurations, filteredCount]);

  if (state.loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle pt-16">
        <NavigationHeader />
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
          <Card>
            <CardContent className="py-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">
                  Loading Intune Configurations
                </h2>
                <p className="text-sm text-slate-600">
                  Please wait while we fetch all your configuration data with detailed settings...
                </p>
              </div>
              <ProgressBar
                steps={state.fetchProgress.steps}
                currentStep={state.fetchProgress.currentStep}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">
              Error Loading Configurations
            </h2>
            <p className="text-sm text-slate-600 mb-6">{state.error}</p>
            <Button onClick={() => fetchConfigurations()} variant="primary">
              <RefreshCw className="w-4 h-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-subtle pt-16">
      <NavigationHeader />

      <div className="flex">
        {/* Sidebar */}
        <DashboardSidebar
          isOpen={state.sidebarOpen}
          onToggle={() => actions.setSidebarOpen(!state.sidebarOpen)}
          activeView={state.activeView}
          onViewChange={actions.setActiveView}
          configurations={state.configurations}
          includeCA={state.includeCA}
          caConsentStatus={state.caConsentStatus}
        />

        {/* Main Content */}
        <div
          className={`flex-1 ${
            state.sidebarOpen ? "ml-64" : "ml-16"
          } transition-all duration-300 px-6 lg:px-8 py-8`}
        >
          {/* Tip Banner */}
          {state.showTipBanner && state.configurations && !state.searchQuery && (
            <div
              className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3"
              role="status"
              aria-live="polite"
            >
              <Info className="w-5 h-5 text-blue-600 mt-0.5" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-sm text-blue-900 font-medium">
                  Tip: Getting started with documentation
                </p>
                <p className="text-sm text-blue-700 mt-1">
                  Select the policies you want to document using the checkboxes, then click &ldquo;Export Selected&rdquo; to generate a comprehensive PDF report.
                  Use the search bar and filters to quickly find specific configurations.
                  <span className="block mt-1 text-xs">
                    <kbd className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-300">Ctrl+A</kbd> Select all • <kbd className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-300">Ctrl+E</kbd> Export •{" "}
                    <kbd className="px-1.5 py-0.5 bg-blue-100 rounded border border-blue-300">/</kbd> Search
                  </span>
                </p>
              </div>
              <button
                onClick={() => actions.setShowTipBanner(false)}
                className="text-blue-600 hover:text-blue-800 cursor-pointer"
                aria-label="Dismiss tip"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Error Banners */}
          <PermissionErrorBanner
            errors={state.configurations?.permissionErrors || []}
          />
          <FetchErrorBanner errors={state.configurations?.fetchErrors || []} />

          {/* Action Bar */}
          <DashboardActionBar
            totalCount={state.configurations?.summary.totalConfigurations || 0}
            selectedCount={state.selectedConfigs.size}
            searchQuery={state.searchQuery}
            onSearchChange={actions.setSearchQuery}
            lastFetched={state.lastFetched}
            onRefresh={() => void fetchConfigurations()}
            isLoading={state.loading}
            selectAll={state.selectAll}
            onSelectAll={handleSelectAll}
            filteredCount={filteredCount}
            showSelectFiltered={
              !!state.searchQuery &&
              filteredCount < (state.configurations?.summary.totalConfigurations || 0)
            }
            onSelectFiltered={handleSelectFiltered}
            onBrandingClick={() => setShowBrandingModal(true)}
            onExportClick={() => setShowExportModal(true)}
          />

          {/* Settings Panel */}
          {state.activeView === "settings" && (
            <Card className="mb-6">
              <CardContent className="py-5 px-6">
                <div className="flex items-center gap-3 mb-2">
                  <Settings className="w-5 h-5 text-slate-600" />
                  <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
                </div>
                <p className="text-sm text-slate-600 mb-4">
                  Control optional data that can be included in your dashboard and reports.
                </p>
                <label className="inline-flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={state.includeCA}
                    onChange={async (e) => {
                      const next = e.target.checked;
                      actions.setIncludeCA(next);
                      if (!next && state.activeView === "conditionalAccessPolicies") {
                        actions.setActiveView("overview");
                      }
                      await fetchConfigurations(next);
                    }}
                    className="checkbox-enhanced"
                  />
                  <span className="text-sm text-slate-800">
                    Include Conditional Access (may require admin consent)
                  </span>
                </label>

                {state.includeCA && state.caConsentStatus === "missing" && (
                  <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                    <Info className="w-5 h-5 text-amber-600 mt-0.5" />
                    <div>
                      <p className="text-sm text-amber-800 font-medium">Admin consent required</p>
                      <p className="text-xs text-amber-700 mt-1">
                        Conditional Access policies could not be loaded because Microsoft Graph
                        permission <code className="px-1 py-0.5 bg-amber-100 rounded">Policy.Read.All</code> is not admin-consented for this tenant.
                        Ask a tenant administrator to grant consent in Azure AD &gt; Enterprise
                        applications.
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Configuration Details */}
          {state.activeView !== "settings" && state.configurations && (
            <>
              {!hasSearchResults ? (
                <EmptyState
                  type="search"
                  searchQuery={state.searchQuery}
                  onClearSearch={() => actions.setSearchQuery("")}
                />
              ) : (
                <div className="space-y-6">
                  {(state.activeView === "overview" || state.activeView === "settingsCatalog") &&
                    filterConfigurations(state.configurations.settingsCatalog)?.length > 0 && (
                      <ConfigurationSection
                        title="Settings Catalog"
                        items={filterConfigurations(state.configurations.settingsCatalog)}
                        prefix="catalog"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<Settings className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" ||
                    state.activeView === "deviceConfigurations") &&
                    filterConfigurations(state.configurations.deviceConfigurations)?.length > 0 && (
                      <ConfigurationSection
                        title="Device Configurations (Templates)"
                        items={filterConfigurations(state.configurations.deviceConfigurations)}
                        prefix="device"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<Laptop className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" ||
                    state.activeView === "administrativeTemplates") &&
                    filterConfigurations(state.configurations.administrativeTemplates)?.length >
                      0 && (
                      <ConfigurationSection
                        title="Administrative Templates (Group Policy)"
                        items={filterConfigurations(state.configurations.administrativeTemplates)}
                        prefix="admx"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<FileText className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" || state.activeView === "securityBaselines") &&
                    filterConfigurations(state.configurations.securityBaselines)?.length > 0 && (
                      <ConfigurationSection
                        title="Security Baselines & Endpoint Security"
                        items={filterConfigurations(state.configurations.securityBaselines)}
                        prefix="security"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<Shield className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" ||
                    state.activeView === "compliancePolicies") &&
                    filterConfigurations(state.configurations.compliancePolicies)?.length > 0 && (
                      <ConfigurationSection
                        title="Compliance Policies"
                        items={filterConfigurations(state.configurations.compliancePolicies)}
                        prefix="compliance"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<CheckSquare className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" || state.activeView === "scripts") &&
                    (state.configurations.scripts?.macOS?.length > 0 ||
                      state.configurations.scripts?.windows?.length > 0) && (
                      <ScriptsSection
                        macOSScripts={filterConfigurations(state.configurations.scripts?.macOS || [])}
                        windowsScripts={filterConfigurations(state.configurations.scripts?.windows || [])}
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                      />
                    )}
                  {(state.activeView === "overview" ||
                    state.activeView === "appConfigurations") &&
                    filterConfigurations(state.configurations.appConfigurations)?.length > 0 && (
                      <ConfigurationSection
                        title="App Configuration Policies"
                        items={filterConfigurations(state.configurations.appConfigurations)}
                        prefix="app"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<Package className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" ||
                    state.activeView === "windowsUpdatePolicies") &&
                    filterConfigurations(state.configurations.windowsUpdatePolicies)?.length > 0 && (
                      <ConfigurationSection
                        title="Windows Update Policies"
                        items={filterConfigurations(state.configurations.windowsUpdatePolicies)}
                        prefix="update"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<RefreshCw className="w-5 h-5" />}
                      />
                    )}
                  {(state.activeView === "overview" ||
                    state.activeView === "enrollmentConfigurations") &&
                    filterConfigurations(state.configurations.enrollmentConfigurations)?.length >
                      0 && (
                      <ConfigurationSection
                        title="Enrollment Configurations"
                        items={filterConfigurations(state.configurations.enrollmentConfigurations)}
                        prefix="enrollment"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<UserCheck className="w-5 h-5" />}
                      />
                    )}
                  {state.includeCA &&
                    state.caConsentStatus === "included" &&
                    (state.activeView === "overview" ||
                      state.activeView === "conditionalAccessPolicies") &&
                    filterConfigurations(state.configurations.conditionalAccessPolicies || [])
                      ?.length > 0 && (
                      <ConfigurationSection
                        title="Conditional Access Policies"
                        items={filterConfigurations(
                          state.configurations.conditionalAccessPolicies || []
                        )}
                        prefix="ca"
                        selectedConfigs={state.selectedConfigs}
                        onSelectConfig={handleSelectConfig}
                        onBulkSelect={handleBulkSelect}
                        icon={<Shield className="w-5 h-5" />}
                      />
                    )}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      <BrandingSettingsModal
        isOpen={showBrandingModal}
        onClose={() => setShowBrandingModal(false)}
        onSave={(options) => {
          setBrandingOptions(options);
          localStorage.setItem("intune-branding-options", JSON.stringify(options));
          setShowBrandingModal(false);
        }}
        currentOptions={brandingOptions}
      />

      <ExportModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setShowFloatingNotification(false);
        }}
        onMinimize={() => {
          setShowExportModal(false);
          setShowFloatingNotification(true);
        }}
        onExport={handleExportWithModal}
        config={exportConfig}
        state={exportState}
        onStateChange={updateExportState}
      />

      <FloatingExportNotification
        isVisible={showFloatingNotification && !showExportModal}
        isExporting={exportState.isExporting}
        exportComplete={exportState.exportComplete}
        exportError={exportState.exportError}
        overallProgress={exportState.overallProgress}
        currentStageName={
          ["Preparing export data...", "Generating document...", "Finalizing...", "Starting download..."][
            exportState.currentStage
          ] ?? "Processing..."
        }
        policyCount={exportConfig.selectedCount}
        hasWarnings={exportState.exportErrors.length > 0}
        onClick={() => {
          setShowExportModal(true);
          setShowFloatingNotification(false);
        }}
        onDismiss={() => {
          setShowFloatingNotification(false);
          if (exportState.exportComplete || exportState.exportError) {
            updateExportState({
              selectedFormat: "pdf-detailed",
              isExporting: false,
              exportComplete: false,
              exportError: null,
              exportErrors: [],
              exportStats: null,
              currentStage: 0,
              overallProgress: 0,
            });
          }
        }}
      />
    </div>
  );
}

// Component for configuration sections
function ConfigurationSection({
  title,
  items,
  prefix,
  selectedConfigs,
  onSelectConfig,
  onBulkSelect,
  icon,
}: {
  title: string;
  items: any[];
  prefix: string;
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  onBulkSelect?: (idsToAdd: string[], idsToRemove: string[]) => void;
  icon?: React.ReactNode;
}) {
  const allItemsSelected = items.every((item) => selectedConfigs.has(`${prefix}-${item.id}`));
  const someItemsSelected =
    items.some((item) => selectedConfigs.has(`${prefix}-${item.id}`)) && !allItemsSelected;

  const handleSelectAllSection = () => {
    if (onBulkSelect) {
      const itemIds = items.map((item) => `${prefix}-${item.id}`);
      if (allItemsSelected) {
        onBulkSelect([], itemIds);
      } else {
        onBulkSelect(itemIds, []);
      }
    }
  };

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="bg-white border-b border-slate-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allItemsSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = someItemsSelected;
                }
              }}
              onChange={handleSelectAllSection}
              className="checkbox-enhanced"
              aria-label={`Select all ${title}`}
            />
            {icon && <div className="text-slate-500">{icon}</div>}
            <h3 className="text-base font-semibold text-slate-900">{title}</h3>
            <Badge variant="default" size="sm">
              {items.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <div className="divide-y divide-slate-200">
        {items.map((item) => (
          <ConfigItem
            key={item.id}
            item={item}
            prefix={prefix}
            selectedConfigs={selectedConfigs}
            onSelectConfig={onSelectConfig}
          />
        ))}
      </div>
    </Card>
  );
}

// Scripts section component
function ScriptsSection({
  macOSScripts,
  windowsScripts,
  selectedConfigs,
  onSelectConfig,
  onBulkSelect,
}: {
  macOSScripts: any[];
  windowsScripts: any[];
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  onBulkSelect?: (idsToAdd: string[], idsToRemove: string[]) => void;
}) {
  const allScripts = [
    ...macOSScripts.map((s) => ({ ...s, prefix: "script-mac" })),
    ...windowsScripts.map((s) => ({ ...s, prefix: "script-win" })),
  ];
  const allScriptsSelected = allScripts.every((item) =>
    selectedConfigs.has(`${item.prefix}-${item.id}`)
  );
  const someScriptsSelected =
    allScripts.some((item) => selectedConfigs.has(`${item.prefix}-${item.id}`)) &&
    !allScriptsSelected;

  return (
    <Card className="overflow-hidden border-slate-200">
      <CardHeader className="bg-white border-b border-slate-200">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={allScriptsSelected}
              ref={(input) => {
                if (input) {
                  input.indeterminate = someScriptsSelected;
                }
              }}
              onChange={() => {
                const macIds = macOSScripts.map((item) => `script-mac-${item.id}`);
                const winIds = windowsScripts.map((item) => `script-win-${item.id}`);
                const allScriptIds = [...macIds, ...winIds];

                if (onBulkSelect) {
                  if (allScriptsSelected) {
                    onBulkSelect([], allScriptIds);
                  } else {
                    onBulkSelect(allScriptIds, []);
                  }
                }
              }}
              className="checkbox-enhanced"
              aria-label="Select all scripts"
            />
            <Code className="w-5 h-5 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900">Scripts</h3>
            <Badge variant="default" size="sm">
              {macOSScripts.length + windowsScripts.length}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <div className="divide-y divide-slate-200">
        {macOSScripts.map((item) => (
          <ConfigItem
            key={item.id}
            item={item}
            prefix="script-mac"
            selectedConfigs={selectedConfigs}
            onSelectConfig={onSelectConfig}
            badge="macOS"
            badgeVariant="default"
          />
        ))}
        {windowsScripts.map((item) => (
          <ConfigItem
            key={item.id}
            item={item}
            prefix="script-win"
            selectedConfigs={selectedConfigs}
            onSelectConfig={onSelectConfig}
            badge="Windows"
            badgeVariant="info"
          />
        ))}
      </div>
    </Card>
  );
}

// Config item component
function ConfigItem({
  item,
  prefix,
  selectedConfigs,
  onSelectConfig,
  badge,
  badgeVariant = "default",
}: {
  item: any;
  prefix: string;
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  badge?: string;
  badgeVariant?: "default" | "info" | "success" | "warning" | "danger";
}) {
  const isSelected = selectedConfigs.has(`${prefix}-${item.id}`);

  return (
    <div
      className={`px-6 py-4 transition-colors hover:bg-slate-50 ${
        isSelected ? "bg-blue-50/30" : ""
      }`}
    >
      <label className="flex items-start cursor-pointer group">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectConfig(`${prefix}-${item.id}`)}
          className="checkbox-enhanced mt-1"
          aria-labelledby={`config-${prefix}-${item.id}-label`}
        />
        <div className="ml-3 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p
              id={`config-${prefix}-${item.id}-label`}
              className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors"
            >
              {item.displayName || item.name}
            </p>
            {item.hasFetchError && (
              <span
                className="inline-flex items-center gap-1 text-orange-600"
                title="Settings unavailable due to API error"
              >
                <AlertCircle className="w-4 h-4" />
                <span className="text-xs font-medium">Settings unavailable</span>
              </span>
            )}
            {badge && (
              <Badge variant={badgeVariant} size="sm">
                {badge}
              </Badge>
            )}
            {item.platformType && (
              <Badge variant="info" size="sm">
                {item.platformType}
              </Badge>
            )}
          </div>
          {item.description && (
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">{item.description}</p>
          )}
          <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
            {item.lastModifiedDateTime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(item.lastModifiedDateTime).toLocaleDateString()}
              </span>
            )}
            {item.version && <span className="font-medium">v{item.version}</span>}
            {item.technologies && (
              <Badge variant="default" size="sm">
                {item.technologies}
              </Badge>
            )}
            {item.fileName && <span className="font-mono text-xs">{item.fileName}</span>}
          </div>
        </div>
      </label>
    </div>
  );
}
