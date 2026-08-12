"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { graphScopes } from "~/lib/msal-config";
import { useTenantLogging } from "~/hooks/use-tenant-logging";
import { Card, CardHeader, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { DashboardLoading } from "~/components/dashboard-loading";
import { NavigationHeader } from "~/components/navigation-header";
// Settings is now an in-dashboard view; no external link needed here
import {
  Settings,
  Shield,
  FileText,
  Code,
  Package,
  RefreshCw,
  UserCheck,
  Download,
  Laptop,
  CheckSquare,
  Layers,
  Clock,
  X,
  Search,
  Info,
  LayoutGrid,
  ChevronLeft,
  Menu,
  Palette,
  AlertCircle
} from "lucide-react";
import { BrandingSettingsModal } from "~/components/branding-settings-modal";
import { ExportModal, type ExportState } from "~/components/export-modal";
import { FloatingExportNotification } from "~/components/floating-export-notification";
import { useExportHandler } from "~/hooks/use-export-handler";
import type { BrandingOptions } from "~/types/branding";

interface PermissionError {
  resource: string;
  requiredPermission: string;
  message: string;
}

interface FetchError {
  policyId: string;
  policyName: string;
  policyType: string;
  error: string;
  errorCode?: string;
  statusCode?: number;
}

interface IntuneConfigurations {
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  securityBaselines: any[];
  compliancePolicies: any[];
  appProtectionPolicies: any[];
  scripts: {
    macOS: any[];
    windows: any[];
  };
  appConfigurations: any[];
  windowsUpdatePolicies: any[];
  enrollmentConfigurations: any[];
  conditionalAccessPolicies: any[];
  permissionErrors?: PermissionError[];
  fetchErrors?: FetchError[];
  summary: {
    totalConfigurations: number;
    byType: {
      settingsCatalog: number;
      deviceConfigurations: number;
      administrativeTemplates: number;
      securityBaselines: number;
      compliancePolicies: number;
      appProtectionPolicies: number;
      scripts: number;
      appConfigurations: number;
      windowsUpdatePolicies: number;
      enrollmentConfigurations: number;
      conditionalAccessPolicies: number;
    };
  };
}

export default function DashboardPage() {
  const { instance, accounts, inProgress } = useMsal();
  const router = useRouter();

  // Log tenant access server-side only
  useTenantLogging("Dashboard-Access");
  const [configurations, setConfigurations] = useState<IntuneConfigurations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTipBanner, setShowTipBanner] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<string>("overview");
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [includeCA, setIncludeCA] = useState(false);
  const [brandingOptions, setBrandingOptions] = useState<BrandingOptions | undefined>(() => {
    // Load saved branding options from localStorage on mount
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('intune-branding-options');
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error('Failed to parse saved branding options:', e);
        }
      }
    }
    return undefined;
  });
  const [caConsentStatus, setCaConsentStatus] = useState<'unknown' | 'included' | 'missing'>('unknown');
  const [fetchProgress, setFetchProgress] = useState<{
    steps: { name: string; status: "pending" | "loading" | "completed" | "error" }[];
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
      { name: "Fetching Conditional Access Policies", status: "pending" }
    ],
    currentStep: 0
  });

  // Export state management
  const [exportState, setExportState] = useState<ExportState>({
    selectedFormat: 'pdf-detailed',
    isExporting: false,
    exportComplete: false,
    exportError: null,
    exportErrors: [],
    exportStats: null,
    currentStage: 0,
    overallProgress: 0,
  });
  const [showFloatingNotification, setShowFloatingNotification] = useState(false);

  const updateExportState = (partial: Partial<ExportState>) => {
    setExportState(prev => ({ ...prev, ...partial }));
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

  const getAccessToken = async (extraScopes?: string[]) => {
    if (accounts.length === 0) throw new Error("No authenticated account");
    
    const request = {
      scopes: extraScopes && extraScopes.length > 0 ? [...graphScopes.scopes, ...extraScopes] : [...graphScopes.scopes],
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

  const updateFetchProgress = (stepIndex: number, status: "pending" | "loading" | "completed" | "error") => {
    setFetchProgress(prev => {
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
      const stepsFor = (withCA: boolean) => ([
        { name: "Connecting to Microsoft Graph API", status: "pending" as const },
        { name: "Fetching Settings Catalog configurations", status: "pending" as const },
        { name: "Fetching Device Configurations", status: "pending" as const },
        { name: "Fetching Administrative Templates", status: "pending" as const },
        { name: "Fetching Security Baselines", status: "pending" as const },
        { name: "Fetching Compliance Policies", status: "pending" as const },
        { name: "Fetching App Protection Policies", status: "pending" as const },
        { name: "Fetching Scripts", status: "pending" as const },
        { name: "Fetching App Configurations", status: "pending" as const },
        { name: "Fetching Windows Update Policies", status: "pending" as const },
        { name: "Fetching Enrollment Configurations", status: "pending" as const },
        ...(withCA ? [{ name: "Fetching Conditional Access Policies", status: "pending" as const }] : [])
      ]);

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

      setCaConsentStatus(wantCA ? (caIncluded ? 'included' : 'missing') : 'unknown');

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
        }).then(async (response) => {
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
                      const stepIndex = stepsFor(caIncluded).findIndex(s => s.name.includes(data.step));
                      if (stepIndex !== -1) {
                        setFetchProgress(prev => ({
                          ...prev,
                          steps: prev.steps.map((step, idx) =>
                            idx === stepIndex
                              ? { ...step, name: `${data.step} (${data.current}/${data.total})` }
                              : step
                          )
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
        }).catch(reject);
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
    configurations.settingsCatalog?.forEach(c => ids.push(`catalog-${c.id}`));
    configurations.deviceConfigurations?.forEach(c => ids.push(`device-${c.id}`));
    configurations.administrativeTemplates?.forEach(c => ids.push(`admx-${c.id}`));
    configurations.securityBaselines?.forEach(c => ids.push(`security-${c.id}`));
    configurations.compliancePolicies?.forEach(c => ids.push(`compliance-${c.id}`));
    configurations.appProtectionPolicies?.forEach(c => ids.push(`app-protection-${c.id}`));
    configurations.scripts?.macOS?.forEach(c => ids.push(`script-mac-${c.id}`));
    configurations.scripts?.windows?.forEach(c => ids.push(`script-win-${c.id}`));
    configurations.appConfigurations?.forEach(c => ids.push(`app-${c.id}`));
    configurations.windowsUpdatePolicies?.forEach(c => ids.push(`update-${c.id}`));
    configurations.enrollmentConfigurations?.forEach(c => ids.push(`enrollment-${c.id}`));
    configurations.conditionalAccessPolicies?.forEach(c => ids.push(`ca-${c.id}`));

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
    filterConfigurations(configurations?.settingsCatalog || []).forEach(c => filteredIds.push(`catalog-${c.id}`));
    filterConfigurations(configurations?.deviceConfigurations || []).forEach(c => filteredIds.push(`device-${c.id}`));
    filterConfigurations(configurations?.administrativeTemplates || []).forEach(c => filteredIds.push(`admx-${c.id}`));
    filterConfigurations(configurations?.securityBaselines || []).forEach(c => filteredIds.push(`security-${c.id}`));
    filterConfigurations(configurations?.compliancePolicies || []).forEach(c => filteredIds.push(`compliance-${c.id}`));
    filterConfigurations(configurations?.appProtectionPolicies || []).forEach(c => filteredIds.push(`app-protection-${c.id}`));
    filterConfigurations(configurations?.scripts?.macOS || []).forEach(c => filteredIds.push(`script-mac-${c.id}`));
    filterConfigurations(configurations?.scripts?.windows || []).forEach(c => filteredIds.push(`script-win-${c.id}`));
    filterConfigurations(configurations?.appConfigurations || []).forEach(c => filteredIds.push(`app-${c.id}`));
    filterConfigurations(configurations?.windowsUpdatePolicies || []).forEach(c => filteredIds.push(`update-${c.id}`));
    filterConfigurations(configurations?.enrollmentConfigurations || []).forEach(c => filteredIds.push(`enrollment-${c.id}`));
    filterConfigurations(configurations?.conditionalAccessPolicies || []).forEach(c => filteredIds.push(`ca-${c.id}`));

    setSelectedConfigs(new Set(filteredIds));
  };
  
  const getFilteredCount = () => {
    let count = 0;
    if (configurations) {
      count += filterConfigurations(configurations.settingsCatalog || []).length;
      count += filterConfigurations(configurations.deviceConfigurations || []).length;
      count += filterConfigurations(configurations.administrativeTemplates || []).length;
      count += filterConfigurations(configurations.securityBaselines || []).length;
      count += filterConfigurations(configurations.compliancePolicies || []).length;
      count += filterConfigurations(configurations.appProtectionPolicies || []).length;
      count += filterConfigurations(configurations.scripts?.macOS || []).length;
      count += filterConfigurations(configurations.scripts?.windows || []).length;
      count += filterConfigurations(configurations.appConfigurations || []).length;
      count += filterConfigurations(configurations.windowsUpdatePolicies || []).length;
      count += filterConfigurations(configurations.enrollmentConfigurations || []).length;
      count += filterConfigurations(configurations.conditionalAccessPolicies || []).length;
    }
    return count;
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
    idsToRemove.forEach(id => newSelected.delete(id));
    idsToAdd.forEach(id => newSelected.add(id));
    setSelectedConfigs(newSelected);
    setSelectAll(newSelected.size === getAllConfigIds().length);
  };

  // Filter configurations based on search query
  const filterConfigurations = (items: any[]) => {
    if (!searchQuery) return items;
    return items.filter(item => {
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
      <div className="min-h-screen bg-gradient-subtle pt-16">
        <NavigationHeader />
        <div className="flex items-center justify-center min-h-[60vh] px-4">
          <div className="max-w-lg w-full">
            <Card>
              <CardContent className="text-center py-10">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-8 h-8 text-blue-600" />
                </div>
                <h2 className="text-xl font-semibold text-slate-900 mb-2">Intune Documentation Dashboard</h2>
                <p className="text-sm text-slate-600 mb-6">
                  Sign in with your Microsoft account to access your Intune tenant and generate documentation.
                </p>

                <div className="grid grid-cols-2 gap-3 mb-6 text-left">
                  <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                    <FileText className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-900">Export to PDF/DOCX</p>
                      <p className="text-xs text-slate-500">Professional audit-ready reports</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                    <LayoutGrid className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-900">10+ Config Types</p>
                      <p className="text-xs text-slate-500">Policies, profiles, scripts</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                    <Search className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-900">Search & Filter</p>
                      <p className="text-xs text-slate-500">Find configurations quickly</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 p-3 bg-slate-50 rounded-lg">
                    <Palette className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-medium text-slate-900">Custom Branding</p>
                      <p className="text-xs text-slate-500">Logo, colors, headers</p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => router.push("/")}
                  variant="primary"
                  className="w-full"
                >
                  Sign In to Get Started
                </Button>

                <div className="mt-4 flex items-center justify-center gap-4 text-xs text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="w-3 h-3" />
                    Read-only access
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3 h-3" />
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
      <div className="flex min-h-screen items-center justify-center bg-gradient-subtle">
        <Card className="max-w-md w-full">
          <CardContent className="text-center py-12">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900 mb-2">Error Loading Configurations</h2>
            <p className="text-sm text-slate-600 mb-6">{error}</p>
            <Button
              onClick={() => fetchConfigurations()}
              variant="primary"
            >
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

      {/* Optional CA toggle removed; managed in Settings page */}

      <div className="flex">
        {/* Sidebar */}
        <div className={`${sidebarOpen ? 'w-64' : 'w-16'} transition-all duration-300 bg-white border-r border-slate-200 h-[calc(100vh-64px)] fixed top-16 left-0 z-30 overflow-y-auto`}>
          <div className="p-4">
            {/* Collapse button at the top */}
            <div className="flex justify-end mb-4">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              >
                {sidebarOpen ? <ChevronLeft className="w-5 h-5 text-slate-600" /> : <Menu className="w-5 h-5 text-slate-600" />}
              </button>
            </div>
            
            {/* Sidebar Navigation */}
            <nav className="space-y-1">
              <button
                onClick={() => setActiveView("overview")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "overview" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <LayoutGrid className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Overview</span>
                    <span className="text-xs font-semibold bg-slate-200 px-2 py-0.5 rounded">
                      {configurations?.summary.totalConfigurations || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <div className={`${sidebarOpen ? 'block' : 'hidden'} my-4 border-t border-slate-200`} />
              
              <button
                onClick={() => setActiveView("settingsCatalog")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "settingsCatalog" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Settings className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Settings Catalog</span>
                    <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.settingsCatalog || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView("deviceConfigurations")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "deviceConfigurations" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Laptop className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Device Configs</span>
                    <span className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.deviceConfigurations || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView("administrativeTemplates")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "administrativeTemplates" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <FileText className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Admin Templates</span>
                    <span className="text-xs font-semibold bg-purple-100 text-purple-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.administrativeTemplates || 0}
                    </span>
                  </div>
                )}
              </button>

              {(includeCA && caConsentStatus === 'included') && (
                <button
                  onClick={() => setActiveView("conditionalAccessPolicies")}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                    activeView === "conditionalAccessPolicies" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <Shield className="w-5 h-5 flex-shrink-0" />
                  {sidebarOpen && (
                    <div className="flex justify-between items-center w-full">
                      <span className="text-sm font-medium">Conditional Access</span>
                      <span className="text-xs font-semibold bg-slate-200 px-2 py-0.5 rounded">
                        {configurations?.summary.byType.conditionalAccessPolicies || 0}
                      </span>
                    </div>
                  )}
                </button>
              )}
              
              <button
                onClick={() => setActiveView("securityBaselines")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "securityBaselines" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Shield className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Security Baselines</span>
                    <span className="text-xs font-semibold bg-orange-100 text-orange-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.securityBaselines || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView("compliancePolicies")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "compliancePolicies" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <CheckSquare className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Compliance</span>
                    <span className="text-xs font-semibold bg-red-100 text-red-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.compliancePolicies || 0}
                    </span>
                  </div>
                )}
              </button>

              <button
                onClick={() => setActiveView("appProtectionPolicies")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "appProtectionPolicies" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Shield className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">App Protection</span>
                    <span className="text-xs font-semibold bg-cyan-100 text-cyan-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.appProtectionPolicies || 0}
                    </span>
                  </div>
                )}
              </button>

              <button
                onClick={() => setActiveView("scripts")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "scripts" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Code className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Scripts</span>
                    <span className="text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.scripts || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView("appConfigurations")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "appConfigurations" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Package className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">App Configs</span>
                    <span className="text-xs font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.appConfigurations || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView("windowsUpdatePolicies")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "windowsUpdatePolicies" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <RefreshCw className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Windows Update</span>
                    <span className="text-xs font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.windowsUpdatePolicies || 0}
                    </span>
                  </div>
                )}
              </button>
              
              <button
                onClick={() => setActiveView("enrollmentConfigurations")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "enrollmentConfigurations" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <UserCheck className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium">Enrollment</span>
                    <span className="text-xs font-semibold bg-pink-100 text-pink-700 px-2 py-0.5 rounded">
                      {configurations?.summary.byType.enrollmentConfigurations || 0}
                    </span>
                  </div>
                )}
              </button>
            </nav>

            {/* Sidebar footer */}
            <div className="mt-6 pt-4 border-t border-slate-200">
              <button
                onClick={() => setActiveView("settings")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                  activeView === "settings" ? 'bg-blue-50 text-blue-700' : 'hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Settings className="w-5 h-5 flex-shrink-0" />
                {sidebarOpen && (
                  <span className="text-sm font-medium">Settings</span>
                )}
              </button>
            </div>
          </div>
        </div>
        
        {/* Main Content */}
        <div className={`flex-1 ${sidebarOpen ? 'ml-64' : 'ml-16'} transition-all duration-300 px-6 lg:px-8 py-8`}>
        {/* First-time user tip banner */}
        {showTipBanner && configurations && !searchQuery && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-blue-900 font-medium">Tip: Getting started with documentation</p>
              <p className="text-sm text-blue-700 mt-1">
                Select the policies you want to document using the checkboxes, then click &ldquo;Export Selected&rdquo; to generate a comprehensive PDF report.
                Use the search bar and filters to quickly find specific configurations.
              </p>
            </div>
            <button
              onClick={() => setShowTipBanner(false)}
              className="text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Permission Warnings */}
        {configurations?.permissionErrors && configurations.permissionErrors.length > 0 && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-amber-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-amber-900 font-medium">Limited permissions detected</p>
                <p className="text-sm text-amber-700 mt-1 mb-2">
                  Some configuration types could not be retrieved due to missing permissions.
                  To access all features, ensure your Azure AD app has the following permissions:
                </p>
                <ul className="text-sm text-amber-700 space-y-1">
                  {configurations.permissionErrors.map((error, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="text-amber-600">•</span>
                      <span>
                        <strong>{error.resource}:</strong> Requires {error.requiredPermission}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-600 mt-3">
                  Contact your administrator to grant these permissions to the application.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Fetch Errors Warning */}
        {configurations?.fetchErrors && configurations.fetchErrors.length > 0 && (
          <div className="mb-6 bg-orange-50 border border-orange-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-600 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-orange-900 font-medium">
                  {configurations.fetchErrors.length} {configurations.fetchErrors.length === 1 ? 'policy' : 'policies'} could not be fully loaded
                </p>
                <p className="text-sm text-orange-700 mt-1 mb-2">
                  The following policies are visible but their settings could not be retrieved due to Microsoft Graph API errors.
                  The policies appear correctly in the Intune admin center but have issues when accessed via the API.
                </p>
                <details className="mt-2">
                  <summary className="text-sm font-medium text-orange-900 cursor-pointer hover:text-orange-800">
                    View affected policies
                  </summary>
                  <ul className="text-sm text-orange-700 space-y-1 mt-2">
                    {configurations.fetchErrors.map((error, index) => (
                      <li key={index} className="flex items-start gap-2 bg-white border border-orange-200 rounded p-2">
                        <span className="text-orange-600 mt-0.5">•</span>
                        <span className="flex-1">
                          <strong>{error.policyType}:</strong> {error.policyName}
                          <br />
                          <span className="text-xs text-orange-600">{error.error}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
                <p className="text-xs text-orange-600 mt-3">
                  These policies will still appear in the list but may have incomplete settings data in exports.
                  This is a known Microsoft Graph API issue with certain policies.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action Bar */}
        <div className="mb-6 space-y-3">
          {/* Main Header Bar */}
          <Card>
            <CardContent className="py-3 px-6">
              <div className="flex flex-col lg:flex-row lg:items-center gap-4">
                {/* Left: Title and Count */}
                <div className="flex items-center gap-3 flex-shrink-0">
                  <Layers className="w-5 h-5 text-slate-500" />
                  <h2 className="text-lg font-semibold text-slate-900">Configuration Overview</h2>
                  <Badge variant="info" size="sm">
                    {configurations?.summary.totalConfigurations || 0} Total
                  </Badge>
                </div>

                {/* Center: Search (more prominent) */}
                <div className="flex-1 max-w-xl">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search configurations by name or description..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery("")}
                        className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Spacer to push Refresh to the right */}
                <div className="flex-1 hidden lg:block" />

                {/* Right: Last Updated and Refresh Button */}
                <div className="flex items-center gap-4 flex-shrink-0 ml-auto">
                  {lastFetched && (
                    <span className="text-xs text-slate-500 whitespace-nowrap">
                      Last updated: {lastFetched.toLocaleTimeString()}
                    </span>
                  )}
                  <Button
                    onClick={() => fetchConfigurations()}
                    disabled={loading}
                    loading={loading}
                    variant="secondary"
                    size="sm"
                    className="whitespace-nowrap"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Selection Bar - Shows when items can be selected */}
          <div className="bg-white border border-slate-200 rounded-lg px-4 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="checkbox-enhanced"
                  />
                  <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                    Select All
                  </span>
                </label>
                {searchQuery && getFilteredCount() < (configurations?.summary.totalConfigurations || 0) && (
                  <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 px-2 py-1 rounded transition-colors">
                    <Button
                      onClick={handleSelectFiltered}
                      variant="ghost"
                      size="sm"
                      className="px-2 py-1"
                    >
                      <CheckSquare className="w-4 h-4 mr-2" />
                      Select Filtered ({getFilteredCount()})
                    </Button>
                  </label>
                )}
              </div>
              
              <div className="flex gap-2">
                <Button
                  onClick={() => setShowBrandingModal(true)}
                  variant="secondary"
                  size="sm"
                  className="min-w-[120px]"
                >
                  <Palette className="w-4 h-4 mr-2" />
                  Branding
                </Button>
                <Button
                  onClick={() => setShowExportModal(true)}
                  disabled={selectedConfigs.size === 0}
                  variant={selectedConfigs.size === 0 ? "ghost" : "primary"}
                  size="sm"
                  className="min-w-[160px] whitespace-nowrap"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {selectedConfigs.size > 0 ? `Export (${selectedConfigs.size})` : 'Export Selected'}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Settings Panel (inline view) */}
        {activeView === "settings" && (
          <Card className="mb-6">
            <CardContent className="py-5 px-6">
              <div className="flex items-center gap-3 mb-2">
                <Settings className="w-5 h-5 text-slate-600" />
                <h2 className="text-lg font-semibold text-slate-900">Settings</h2>
              </div>
              <p className="text-sm text-slate-600 mb-4">
                Control optional data that can be included in your dashboard and reports.
              </p>
              <label className="inline-flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={includeCA}
                  onChange={async (e) => {
                    const next = e.target.checked;
                    setIncludeCA(next);
                    localStorage.setItem('include-ca', String(next));
                    // If turning CA off and currently viewing CA, go back to overview
                    if (!next && (activeView as string) === 'conditionalAccessPolicies') {
                      setActiveView('overview');
                    }
                    await fetchConfigurations(next);
                  }}
                  className="checkbox-enhanced"
                />
                <span className="text-sm text-slate-800">Include Conditional Access (may require admin consent)</span>
              </label>

              {includeCA && caConsentStatus === 'missing' && (
                <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                  <Info className="w-5 h-5 text-amber-600 mt-0.5" />
                  <div>
                    <p className="text-sm text-amber-800 font-medium">Admin consent required</p>
                    <p className="text-xs text-amber-700 mt-1">
                      Conditional Access policies could not be loaded because Microsoft Graph permission <code className="px-1 py-0.5 bg-amber-100 rounded">Policy.Read.All</code> is not admin‑consented for this tenant.
                      Ask a tenant administrator to grant consent in Azure AD &gt; Enterprise applications, or see the
                      <a href="https://learn.microsoft.com/azure/active-directory/develop/v2-permissions-and-consent" target="_blank" rel="noreferrer" className="ml-1 underline">permissions and consent guide</a>.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Configuration Details */}
        {activeView !== "settings" && configurations && (
          <div className="space-y-6">
            {(activeView === "overview" || activeView === "settingsCatalog") && filterConfigurations(configurations.settingsCatalog)?.length > 0 && (
              <ConfigurationSection
                title="Settings Catalog"
                items={filterConfigurations(configurations.settingsCatalog)}
                prefix="catalog"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<Settings className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "deviceConfigurations") && filterConfigurations(configurations.deviceConfigurations)?.length > 0 && (
              <ConfigurationSection
                title="Device Configurations (Templates)"
                items={filterConfigurations(configurations.deviceConfigurations)}
                prefix="device"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<Laptop className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "administrativeTemplates") && filterConfigurations(configurations.administrativeTemplates)?.length > 0 && (
              <ConfigurationSection
                title="Administrative Templates (Group Policy)"
                items={filterConfigurations(configurations.administrativeTemplates)}
                prefix="admx"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<FileText className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "securityBaselines") && filterConfigurations(configurations.securityBaselines)?.length > 0 && (
              <ConfigurationSection
                title="Security Baselines & Endpoint Security"
                items={filterConfigurations(configurations.securityBaselines)}
                prefix="security"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<Shield className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "compliancePolicies") && filterConfigurations(configurations.compliancePolicies)?.length > 0 && (
              <ConfigurationSection
                title="Compliance Policies"
                items={filterConfigurations(configurations.compliancePolicies)}
                prefix="compliance"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<CheckSquare className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "appProtectionPolicies") && filterConfigurations(configurations.appProtectionPolicies)?.length > 0 && (
              <ConfigurationSection
                title="App Protection Policies"
                items={filterConfigurations(configurations.appProtectionPolicies)}
                prefix="app-protection"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<Shield className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "scripts") && (configurations.scripts?.macOS?.length > 0 || configurations.scripts?.windows?.length > 0) && (
              <Card className="overflow-hidden border-slate-200">
                <CardHeader className="bg-white border-b border-slate-200">
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                      {(() => {
                        const allScripts = [
                          ...(configurations.scripts?.macOS || []).map(s => ({ ...s, prefix: 'script-mac' })),
                          ...(configurations.scripts?.windows || []).map(s => ({ ...s, prefix: 'script-win' }))
                        ];
                        const allScriptsSelected = allScripts.every(item => 
                          selectedConfigs.has(`${item.prefix}-${item.id}`)
                        );
                        const someScriptsSelected = allScripts.some(item => 
                          selectedConfigs.has(`${item.prefix}-${item.id}`)
                        ) && !allScriptsSelected;
                        
                        return (
                          <input
                            type="checkbox"
                            checked={allScriptsSelected}
                            ref={input => {
                              if (input) {
                                input.indeterminate = someScriptsSelected;
                              }
                            }}
                            onChange={() => {
                              const macIds = configurations.scripts?.macOS?.map(item => `script-mac-${item.id}`) || [];
                              const winIds = configurations.scripts?.windows?.map(item => `script-win-${item.id}`) || [];
                              const allScriptIds = [...macIds, ...winIds];
                              
                              if (allScriptsSelected) {
                                // Deselect all scripts
                                handleBulkSelect([], allScriptIds);
                              } else {
                                // Select all scripts
                                handleBulkSelect(allScriptIds, []);
                              }
                            }}
                            className="checkbox-enhanced"
                            title="Select all scripts"
                          />
                        );
                      })()}
                      <Code className="w-5 h-5 text-slate-500" />
                      <h3 className="text-base font-semibold text-slate-900">Scripts</h3>
                      <Badge variant="default" size="sm">
                        {(configurations.scripts?.macOS?.length || 0) + (configurations.scripts?.windows?.length || 0)}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <div className="divide-y divide-slate-200">
                  {filterConfigurations(configurations.scripts?.macOS)?.map((item) => (
                    <ConfigItem
                      key={item.id}
                      item={item}
                      prefix="script-mac"
                      selectedConfigs={selectedConfigs}
                      onSelectConfig={handleSelectConfig}
                      badge="macOS"
                      badgeVariant="default"
                    />
                  ))}
                  {filterConfigurations(configurations.scripts?.windows)?.map((item) => (
                    <ConfigItem
                      key={item.id}
                      item={item}
                      prefix="script-win"
                      selectedConfigs={selectedConfigs}
                      onSelectConfig={handleSelectConfig}
                      badge="Windows"
                      badgeVariant="info"
                    />
                  ))}
                </div>
              </Card>
            )}
            {(activeView === "overview" || activeView === "appConfigurations") && filterConfigurations(configurations.appConfigurations)?.length > 0 && (
              <ConfigurationSection
                title="App Configuration Policies"
                items={filterConfigurations(configurations.appConfigurations)}
                prefix="app"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<Package className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "windowsUpdatePolicies") && filterConfigurations(configurations.windowsUpdatePolicies)?.length > 0 && (
              <ConfigurationSection
                title="Windows Update Policies"
                items={filterConfigurations(configurations.windowsUpdatePolicies)}
                prefix="update"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<RefreshCw className="w-5 h-5" />}
              />
            )}
            {(activeView === "overview" || activeView === "enrollmentConfigurations") && filterConfigurations(configurations.enrollmentConfigurations)?.length > 0 && (
              <ConfigurationSection
                title="Enrollment Configurations"
                items={filterConfigurations(configurations.enrollmentConfigurations)}
                prefix="enrollment"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<UserCheck className="w-5 h-5" />}
              />
            )}
            {(includeCA && caConsentStatus === 'included') && (activeView === "overview" || activeView === "conditionalAccessPolicies") && filterConfigurations(configurations.conditionalAccessPolicies || [])?.length > 0 && (
              <ConfigurationSection
                title="Conditional Access Policies"
                items={filterConfigurations(configurations.conditionalAccessPolicies || [])}
                prefix="ca"
                selectedConfigs={selectedConfigs}
                onSelectConfig={handleSelectConfig}
                onBulkSelect={handleBulkSelect}
                icon={<Shield className="w-5 h-5" />}
              />
            )}
          </div>
        )}
        </div>
      </div>
      
      {/* Branding Settings Modal */}
      <BrandingSettingsModal
        isOpen={showBrandingModal}
        onClose={() => setShowBrandingModal(false)}
        onSave={(options) => {
          console.log('Saving branding options:', options);
          setBrandingOptions(options);
          localStorage.setItem('intune-branding-options', JSON.stringify(options));
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
          (['Preparing export data...', 'Resolving group names...', 'Fetching device counts...', 'Generating document...', 'Starting download...'][exportState.currentStage]) ?? 'Processing...'
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
              selectedFormat: 'pdf-detailed',
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

function ConfigurationSection({
  title,
  items,
  prefix,
  selectedConfigs,
  onSelectConfig,
  onBulkSelect,
  icon
}: {
  title: string;
  items: any[];
  prefix: string;
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  onBulkSelect?: (idsToAdd: string[], idsToRemove: string[]) => void;
  icon?: React.ReactNode;
}) {

  // Check if all items in this section are selected
  const allItemsSelected = items.every(item => 
    selectedConfigs.has(`${prefix}-${item.id}`)
  );
  
  // Check if some (but not all) items are selected
  const someItemsSelected = items.some(item => 
    selectedConfigs.has(`${prefix}-${item.id}`)
  ) && !allItemsSelected;

  const handleSelectAllSection = () => {
    if (onBulkSelect) {
      const itemIds = items.map(item => `${prefix}-${item.id}`);
      
      if (allItemsSelected) {
        // Deselect all items in this section
        onBulkSelect([], itemIds);
      } else {
        // Select all items in this section
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
              ref={input => {
                if (input) {
                  input.indeterminate = someItemsSelected;
                }
              }}
              onChange={handleSelectAllSection}
              className="checkbox-enhanced"
              title="Select all items in this section"
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

function ConfigItem({
  item,
  prefix,
  selectedConfigs,
  onSelectConfig,
  badge,
  badgeVariant = "default"
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
    <div className={`px-6 py-4 transition-colors hover:bg-slate-50 ${isSelected ? 'bg-blue-50/30' : ''}`}>
      <label className="flex items-start cursor-pointer group">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectConfig(`${prefix}-${item.id}`)}
          className="checkbox-enhanced mt-1"
        />
        <div className="ml-3 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">
              {item.displayName || item.name}
            </p>
            {item.hasFetchError && (
              <span className="inline-flex items-center gap-1 text-orange-600" title="Settings unavailable due to API error">
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
            <p className="text-sm text-slate-600 mt-1 line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="flex items-center gap-4 text-xs text-slate-500 mt-2">
            {item.lastModifiedDateTime && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(item.lastModifiedDateTime).toLocaleDateString()}
              </span>
            )}
            {item.version && (
              <span className="font-medium">v{item.version}</span>
            )}
            {item.technologies && (
              <Badge variant="default" size="sm">
                {item.technologies}
              </Badge>
            )}
            {item.fileName && (
              <span className="font-mono text-xs">{item.fileName}</span>
            )}
          </div>
        </div>
      </label>
    </div>
  );
}
