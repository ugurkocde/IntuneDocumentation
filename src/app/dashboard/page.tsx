"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { graphScopes } from "~/lib/msal-config";
import { useTenantLogging } from "~/hooks/use-tenant-logging";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { DashboardLoading } from "~/components/dashboard-loading";
import { NavigationHeader } from "~/components/navigation-header";
// Settings is now an in-dashboard view; no external link needed here
import {
  Clock,
  FileText,
  LayoutGrid,
  Palette,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { BrandingSettingsModal } from "~/components/branding-settings-modal";
import { ExportModal, type ExportState } from "~/components/export-modal";
import { FloatingExportNotification } from "~/components/floating-export-notification";
import { useExportHandler } from "~/hooks/use-export-handler";
import type { BrandingOptions } from "~/types/branding";
import { DashboardSidebar } from "~/components/dashboard/dashboard-sidebar";
import { DashboardContent } from "~/components/dashboard/dashboard-content";
import {
  buildDashboardTypeStats,
  type DashboardView,
  type IntuneConfigurations,
} from "~/components/dashboard/types";

export default function DashboardPage() {
  const { instance, accounts, inProgress } = useMsal();
  const router = useRouter();

  // Log tenant access server-side only
  useTenantLogging("Dashboard-Access");
  const [configurations, setConfigurations] =
    useState<IntuneConfigurations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(
    new Set(),
  );
  const [selectAll, setSelectAll] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTipBanner, setShowTipBanner] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [includeCA, setIncludeCA] = useState(false);
  const [brandingOptions, setBrandingOptions] = useState<
    BrandingOptions | undefined
  >(() => {
    // Load saved branding options from localStorage on mount
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
  const [caConsentStatus, setCaConsentStatus] = useState<
    "unknown" | "included" | "missing"
  >("unknown");
  const [fetchProgress, setFetchProgress] = useState<{
    steps: {
      name: string;
      status: "pending" | "loading" | "completed" | "error";
    }[];
    currentStep: number;
  }>({
    steps: [
      { name: "Connecting to Microsoft Graph API", status: "pending" },
      { name: "Fetching Settings Catalog configurations", status: "pending" },
      { name: "Fetching Device Configurations", status: "pending" },
      { name: "Fetching Administrative Templates", status: "pending" },
      { name: "Fetching Security Baselines", status: "pending" },
      { name: "Fetching Compliance Policies", status: "pending" },
      { name: "Fetching App Protection Policies", status: "pending" },
      { name: "Fetching Scripts", status: "pending" },
      { name: "Fetching App Configurations", status: "pending" },
      { name: "Fetching Windows Update Policies", status: "pending" },
      { name: "Fetching Enrollment Configurations", status: "pending" },
      { name: "Fetching Conditional Access Policies", status: "pending" },
    ],
    currentStep: 0,
  });

  // Export state management
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
  const [showFloatingNotification, setShowFloatingNotification] =
    useState(false);

  const updateExportState = (partial: Partial<ExportState>) => {
    setExportState((prev) => ({ ...prev, ...partial }));
  };

  // Prevent duplicate fetches on React Strict Mode double-mount
  const hasFetchedRef = useRef(false);
  const isFetchingRef = useRef(false);

  useEffect(() => {
    if (accounts.length === 0) {
      router.push("/");
    } else if (!hasFetchedRef.current && !isFetchingRef.current) {
      hasFetchedRef.current = true;
      void fetchConfigurations();
    }
  }, [accounts, router]);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const getAccessToken = async (extraScopes?: string[]) => {
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
  };

  const updateFetchProgress = (
    stepIndex: number,
    status: "pending" | "loading" | "completed" | "error",
  ) => {
    setFetchProgress((prev) => {
      const newSteps = [...prev.steps];
      if (newSteps[stepIndex]) {
        newSteps[stepIndex] = { name: newSteps[stepIndex].name, status };
      }
      return { ...prev, steps: newSteps, currentStep: stepIndex };
    });
  };

  const fetchConfigurations = async (caRequested?: boolean) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log("Fetch already in progress, skipping duplicate request");
      return;
    }

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);
      // Reset selections when refreshing
      setSelectedConfigs(new Set());
      setSelectAll(false);

      // Build steps dynamically based on whether CA is effectively included
      const stepsFor = (withCA: boolean) => [
        {
          name: "Connecting to Microsoft Graph API",
          status: "pending" as const,
        },
        {
          name: "Fetching Settings Catalog configurations",
          status: "pending" as const,
        },
        { name: "Fetching Device Configurations", status: "pending" as const },
        {
          name: "Fetching Administrative Templates",
          status: "pending" as const,
        },
        { name: "Fetching Security Baselines", status: "pending" as const },
        { name: "Fetching Compliance Policies", status: "pending" as const },
        {
          name: "Fetching App Protection Policies",
          status: "pending" as const,
        },
        { name: "Fetching Scripts", status: "pending" as const },
        { name: "Fetching App Configurations", status: "pending" as const },
        {
          name: "Fetching Windows Update Policies",
          status: "pending" as const,
        },
        {
          name: "Fetching Enrollment Configurations",
          status: "pending" as const,
        },
        ...(withCA
          ? [
              {
                name: "Fetching Conditional Access Policies",
                status: "pending" as const,
              },
            ]
          : []),
      ];

      // Step 1: Connect to Graph API (base scopes)
      setFetchProgress({ steps: stepsFor(false), currentStep: 0 });
      updateFetchProgress(0, "loading");
      let accessToken = await getAccessToken();
      updateFetchProgress(0, "completed");

      // Optionally include Conditional Access if requested AND token can be acquired silently or via prompt
      let caIncluded = false;
      const wantCA = caRequested ?? includeCA;
      if (wantCA) {
        try {
          accessToken = await getAccessToken(["Policy.Read.All"]);
          caIncluded = true;
        } catch {
          caIncluded = false; // continue without CA
        }
      }

      setCaConsentStatus(
        wantCA ? (caIncluded ? "included" : "missing") : "unknown",
      );

      // Refresh steps with/without CA and start progress
      setFetchProgress({ steps: stepsFor(caIncluded), currentStep: 0 });
      updateFetchProgress(0, "completed");

      // Use Server-Sent Events for real-time progress
      // Since EventSource doesn't support Authorization header, we use fetch with streaming
      await new Promise<void>((resolve, reject) => {
        fetch("/api/intune/detailed-configurations-stream", {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error("Failed to start configuration stream");
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
              throw new Error("No response body");
            }

            let buffer = "";

            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                resolve();
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("event:")) {
                  const regex = /event: (\w+)\ndata: (.+)/s;
                  const eventMatch = regex.exec(line);
                  if (eventMatch && eventMatch[2]) {
                    const [, eventType, dataStr] = eventMatch;
                    const data = JSON.parse(dataStr);

                    if (eventType === "progress") {
                      // Update progress based on event
                      if (data.stepIndex !== undefined) {
                        updateFetchProgress(data.stepIndex, data.status);
                      }

                      // Update current step for batch progress
                      if (data.type === "batch-progress" && data.message) {
                        const stepIndex = stepsFor(caIncluded).findIndex((s) =>
                          s.name.includes(data.step),
                        );
                        if (stepIndex !== -1) {
                          setFetchProgress((prev) => ({
                            ...prev,
                            steps: prev.steps.map((step, idx) =>
                              idx === stepIndex
                                ? {
                                    ...step,
                                    name: `${data.step} (${data.current}/${data.total})`,
                                  }
                                : step,
                            ),
                          }));
                        }
                      }
                    } else if (eventType === "complete") {
                      // Set the final configuration data
                      setConfigurations(data.data);
                      setLastFetched(new Date());
                      resolve();
                    } else if (eventType === "error") {
                      throw new Error(data.error || "Stream error");
                    }
                  }
                }
              }
            }
          })
          .catch(reject);
      });
    } catch (err) {
      // Mark current step as error
      const currentStep = fetchProgress.currentStep;
      updateFetchProgress(currentStep, "error");
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching configurations:", err);
    } finally {
      setLoading(false);
      isFetchingRef.current = false;
    }
  };

  const getAllConfigIds = () => {
    if (!configurations) return [];
    const ids: string[] = [];

    // Add all configuration IDs with unique prefixes
    configurations.settingsCatalog?.forEach((c) => ids.push(`catalog-${c.id}`));
    configurations.deviceConfigurations?.forEach((c) =>
      ids.push(`device-${c.id}`),
    );
    configurations.administrativeTemplates?.forEach((c) =>
      ids.push(`admx-${c.id}`),
    );
    configurations.securityBaselines?.forEach((c) =>
      ids.push(`security-${c.id}`),
    );
    configurations.compliancePolicies?.forEach((c) =>
      ids.push(`compliance-${c.id}`),
    );
    configurations.appProtectionPolicies?.forEach((c) =>
      ids.push(`app-protection-${c.id}`),
    );
    configurations.scripts?.macOS?.forEach((c) =>
      ids.push(`script-mac-${c.id}`),
    );
    configurations.scripts?.windows?.forEach((c) =>
      ids.push(`script-win-${c.id}`),
    );
    configurations.appConfigurations?.forEach((c) => ids.push(`app-${c.id}`));
    configurations.windowsUpdatePolicies?.forEach((c) =>
      ids.push(`update-${c.id}`),
    );
    configurations.enrollmentConfigurations?.forEach((c) =>
      ids.push(`enrollment-${c.id}`),
    );
    configurations.conditionalAccessPolicies?.forEach((c) =>
      ids.push(`ca-${c.id}`),
    );

    return ids;
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedConfigs(new Set());
    } else {
      setSelectedConfigs(new Set(getAllConfigIds()));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectFiltered = () => {
    const filteredIds: string[] = [];

    // Get all filtered configuration IDs
    filterConfigurations(configurations?.settingsCatalog || []).forEach((c) =>
      filteredIds.push(`catalog-${c.id}`),
    );
    filterConfigurations(configurations?.deviceConfigurations || []).forEach(
      (c) => filteredIds.push(`device-${c.id}`),
    );
    filterConfigurations(configurations?.administrativeTemplates || []).forEach(
      (c) => filteredIds.push(`admx-${c.id}`),
    );
    filterConfigurations(configurations?.securityBaselines || []).forEach((c) =>
      filteredIds.push(`security-${c.id}`),
    );
    filterConfigurations(configurations?.compliancePolicies || []).forEach(
      (c) => filteredIds.push(`compliance-${c.id}`),
    );
    filterConfigurations(configurations?.appProtectionPolicies || []).forEach(
      (c) => filteredIds.push(`app-protection-${c.id}`),
    );
    filterConfigurations(configurations?.scripts?.macOS || []).forEach((c) =>
      filteredIds.push(`script-mac-${c.id}`),
    );
    filterConfigurations(configurations?.scripts?.windows || []).forEach((c) =>
      filteredIds.push(`script-win-${c.id}`),
    );
    filterConfigurations(configurations?.appConfigurations || []).forEach((c) =>
      filteredIds.push(`app-${c.id}`),
    );
    filterConfigurations(configurations?.windowsUpdatePolicies || []).forEach(
      (c) => filteredIds.push(`update-${c.id}`),
    );
    filterConfigurations(
      configurations?.enrollmentConfigurations || [],
    ).forEach((c) => filteredIds.push(`enrollment-${c.id}`));
    filterConfigurations(
      configurations?.conditionalAccessPolicies || [],
    ).forEach((c) => filteredIds.push(`ca-${c.id}`));

    setSelectedConfigs(new Set(filteredIds));
  };

  const handleSelectConfig = (id: string) => {
    const newSelected = new Set(selectedConfigs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedConfigs(newSelected);
    setSelectAll(newSelected.size === getAllConfigIds().length);
  };

  const handleBulkSelect = (idsToAdd: string[], idsToRemove: string[]) => {
    const newSelected = new Set(selectedConfigs);
    idsToRemove.forEach((id) => newSelected.delete(id));
    idsToAdd.forEach((id) => newSelected.add(id));
    setSelectedConfigs(newSelected);
    setSelectAll(newSelected.size === getAllConfigIds().length);
  };

  // Filter configurations based on search query
  const filterConfigurations = (items: any[]) => {
    if (!searchQuery) return items;
    return items.filter((item) => {
      const name = String(item.displayName || item.name || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  };

  // Export handler hook
  const {
    showExportModal,
    setShowExportModal,
    exportConfig,
    handleExport: handleExportWithModal,
  } = useExportHandler({
    configurations,
    selectedConfigs,
    brandingOptions,
    includeCA,
    caConsentStatus,
    getAccessToken,
    onProgress: (progress) => {
      updateExportState({
        currentStage: progress.stage,
        overallProgress: progress.progress,
      });
    },
  });

  // Show sign-in prompt instead of loading UI for unauthenticated users
  // Wait for MSAL to finish initializing before deciding
  if (inProgress === "none" && accounts.length === 0) {
    return (
      <div className="bg-mint-50 min-h-screen pt-16">
        <NavigationHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="w-full max-w-lg">
            <Card className="border-petrol-950/6 shadow-soft rounded-3xl">
              <CardContent className="py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50">
                  <Shield className="h-8 w-8 text-teal-700" />
                </div>
                <h2 className="text-petrol-950 mb-2 text-xl font-semibold">
                  Intune Documentation dashboard
                </h2>
                <p className="text-petrol-600 mb-6 text-sm">
                  Sign in with your Microsoft account to access your Intune
                  tenant and generate documentation.
                </p>

                <div className="mb-6 grid grid-cols-2 gap-3 text-left">
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        Export to PDF or Word
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Professional audit-ready reports
                      </p>
                    </div>
                  </div>
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <LayoutGrid className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        10+ configuration types
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Policies, profiles, scripts
                      </p>
                    </div>
                  </div>
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <Search className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        Search and filter
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Find configurations quickly
                      </p>
                    </div>
                  </div>
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <Palette className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        Custom branding
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Logo, colors, headers
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => router.push("/")}
                  variant="primary"
                  className="w-full rounded-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-600"
                >
                  Sign in to get started
                </Button>

                <div className="text-petrol-600 mt-4 flex items-center justify-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Read-only access
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    3-min exports
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <>
        <NavigationHeader />
        <DashboardLoading
          steps={fetchProgress.steps}
          currentStep={fetchProgress.currentStep}
        />
      </>
    );
  }

  if (error) {
    return (
      <div className="bg-mint-50 flex min-h-screen items-center justify-center px-4">
        <Card className="border-petrol-950/6 shadow-soft w-full max-w-md rounded-3xl">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-petrol-950 mb-2 text-lg font-semibold">
              Error loading configurations
            </h2>
            <p className="text-petrol-600 mb-6 text-sm">{error}</p>
            <Button
              onClick={() => fetchConfigurations()}
              variant="primary"
              className="rounded-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-600"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!configurations) {
    return null;
  }

  const typeStats = buildDashboardTypeStats(configurations, selectedConfigs);
  const showConditionalAccess = includeCA && caConsentStatus === "included";

  return (
    <div className="bg-mint-50 min-h-screen pt-16">
      <a
        href="#dashboard-content"
        className="bg-petrol-950 sr-only fixed top-3 left-3 z-[60] rounded-full px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
      >
        Skip to dashboard content
      </a>
      <NavigationHeader />
      <div className="flex">
        <DashboardSidebar
          isOpen={sidebarOpen}
          activeView={activeView}
          counts={configurations.summary.byType}
          totalCount={configurations.summary.totalConfigurations}
          selectedCount={selectedConfigs.size}
          showConditionalAccess={showConditionalAccess}
          onToggle={() => setSidebarOpen((current) => !current)}
          onViewChange={setActiveView}
          onOpenBranding={() => setShowBrandingModal(true)}
          onOpenExport={() => setShowExportModal(true)}
        />
        <DashboardContent
          configurations={configurations}
          activeView={activeView}
          searchQuery={searchQuery}
          selectedConfigs={selectedConfigs}
          selectAll={selectAll}
          lastFetched={lastFetched}
          showTipBanner={showTipBanner}
          includeCA={includeCA}
          caConsentStatus={caConsentStatus}
          sidebarOpen={sidebarOpen}
          refreshing={loading}
          typeStats={typeStats}
          onSearchChange={setSearchQuery}
          onRefresh={() => void fetchConfigurations()}
          onDismissTip={() => setShowTipBanner(false)}
          onSelectAll={handleSelectAll}
          onSelectFiltered={handleSelectFiltered}
          onSelectConfig={handleSelectConfig}
          onBulkSelect={handleBulkSelect}
          onIncludeCAChange={async (next) => {
            setIncludeCA(next);
            localStorage.setItem("include-ca", String(next));
            if (!next && activeView === "conditionalAccessPolicies") {
              setActiveView("overview");
            }
            await fetchConfigurations(next);
          }}
        />
      </div>
      {/* Branding Settings Modal */}
      <BrandingSettingsModal
        isOpen={showBrandingModal}
        onClose={() => setShowBrandingModal(false)}
        onSave={(options) => {
          console.log("Saving branding options:", options);
          setBrandingOptions(options);
          localStorage.setItem(
            "intune-branding-options",
            JSON.stringify(options),
          );
          setShowBrandingModal(false);
        }}
        currentOptions={brandingOptions}
      />

      {/* Export Modal */}
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

      {/* Floating Export Notification */}
      <FloatingExportNotification
        isVisible={showFloatingNotification && !showExportModal}
        isExporting={exportState.isExporting}
        exportComplete={exportState.exportComplete}
        exportError={exportState.exportError}
        overallProgress={exportState.overallProgress}
        currentStageName={
          [
            "Preparing export data...",
            "Resolving group names...",
            "Fetching device counts...",
            "Generating document...",
            "Starting download...",
          ][exportState.currentStage] ?? "Processing..."
        }
        policyCount={exportConfig.selectedCount}
        hasWarnings={exportState.exportErrors.length > 0}
        onClick={() => {
          setShowExportModal(true);
          setShowFloatingNotification(false);
        }}
        onDismiss={() => {
          setShowFloatingNotification(false);
          // Reset export state if completed
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
