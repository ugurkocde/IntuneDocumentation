"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { graphScopes } from "~/lib/msal-config";
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
  Download,
  Laptop,
  CheckSquare,
  Layers,
  Clock,
  Server,
  X,
  Search,
  Filter,
  Info
} from "lucide-react";

interface IntuneConfigurations {
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  securityBaselines: any[];
  compliancePolicies: any[];
  scripts: {
    macOS: any[];
    windows: any[];
  };
  appConfigurations: any[];
  windowsUpdatePolicies: any[];
  enrollmentConfigurations: any[];
  summary: {
    totalConfigurations: number;
    byType: {
      settingsCatalog: number;
      deviceConfigurations: number;
      administrativeTemplates: number;
      securityBaselines: number;
      compliancePolicies: number;
      scripts: number;
      appConfigurations: number;
      windowsUpdatePolicies: number;
      enrollmentConfigurations: number;
    };
  };
}

export default function DashboardPage() {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const [configurations, setConfigurations] = useState<IntuneConfigurations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTipBanner, setShowTipBanner] = useState(true);
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
      { name: "Fetching Scripts", status: "pending" },
      { name: "Fetching App Configurations", status: "pending" },
      { name: "Fetching Windows Update Policies", status: "pending" },
      { name: "Fetching Enrollment Configurations", status: "pending" }
    ],
    currentStep: 0
  });

  useEffect(() => {
    if (accounts.length === 0) {
      router.push("/");
    } else {
      fetchConfigurations();
    }
  }, [accounts, router]);

  const getAccessToken = async () => {
    if (accounts.length === 0) throw new Error("No authenticated account");
    
    const request = {
      ...graphScopes,
      account: accounts[0],
    };

    try {
      const response = await instance.acquireTokenSilent(request);
      return response.accessToken;
    } catch (error) {
      const response = await instance.acquireTokenPopup(request);
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

  const fetchConfigurations = async () => {
    try {
      setLoading(true);
      setError(null);
      // Reset selections when refreshing
      setSelectedConfigs(new Set());
      setSelectAll(false);
      setActiveFilter(null);
      
      // Step 1: Connect to Graph API
      updateFetchProgress(0, "loading");
      const accessToken = await getAccessToken();
      updateFetchProgress(0, "completed");
      
      // Start fetching with progress updates
      for (let i = 1; i <= 9; i++) {
        updateFetchProgress(i, "loading");
      }
      
      // Always fetch detailed configurations
      const response = await fetch("/api/intune/detailed-configurations", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.details || "Failed to fetch configurations");
      }
      
      // Mark all as completed as data comes in
      for (let i = 1; i <= 9; i++) {
        updateFetchProgress(i, "completed");
        await new Promise(resolve => setTimeout(resolve, 100)); // Small delay for visual effect
      }
      
      // Process the response data
      const data = await response.json();
      setConfigurations(data);
      setLastFetched(new Date());
      
    } catch (err) {
      // Mark current step as error
      const currentStep = fetchProgress.currentStep;
      updateFetchProgress(currentStep, "error");
      setError(err instanceof Error ? err.message : "An error occurred");
      console.error("Error fetching configurations:", err);
    } finally {
      setLoading(false);
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
    configurations.scripts?.macOS?.forEach(c => ids.push(`script-mac-${c.id}`));
    configurations.scripts?.windows?.forEach(c => ids.push(`script-win-${c.id}`));
    configurations.appConfigurations?.forEach(c => ids.push(`app-${c.id}`));
    configurations.windowsUpdatePolicies?.forEach(c => ids.push(`update-${c.id}`));
    configurations.enrollmentConfigurations?.forEach(c => ids.push(`enrollment-${c.id}`));
    
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
    filterConfigurations(configurations?.scripts?.macOS || []).forEach(c => filteredIds.push(`script-mac-${c.id}`));
    filterConfigurations(configurations?.scripts?.windows || []).forEach(c => filteredIds.push(`script-win-${c.id}`));
    filterConfigurations(configurations?.appConfigurations || []).forEach(c => filteredIds.push(`app-${c.id}`));
    filterConfigurations(configurations?.windowsUpdatePolicies || []).forEach(c => filteredIds.push(`update-${c.id}`));
    filterConfigurations(configurations?.enrollmentConfigurations || []).forEach(c => filteredIds.push(`enrollment-${c.id}`));
    
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
      count += filterConfigurations(configurations.scripts?.macOS || []).length;
      count += filterConfigurations(configurations.scripts?.windows || []).length;
      count += filterConfigurations(configurations.appConfigurations || []).length;
      count += filterConfigurations(configurations.windowsUpdatePolicies || []).length;
      count += filterConfigurations(configurations.enrollmentConfigurations || []).length;
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

  const handleGeneratePdf = async () => {
    if (selectedConfigs.size === 0) {
      alert("Please select at least one configuration to export");
      return;
    }

    setGeneratingPdf(true);
    try {
      const accessToken = await getAccessToken();
      
      // Build the data to send based on selected configs
      const selectedData = {
        settingsCatalog: configurations?.settingsCatalog?.filter(c => 
          selectedConfigs.has(`catalog-${c.id}`)
        ) ?? [],
        deviceConfigurations: configurations?.deviceConfigurations?.filter(c =>
          selectedConfigs.has(`device-${c.id}`)
        ) ?? [],
        administrativeTemplates: configurations?.administrativeTemplates?.filter(c =>
          selectedConfigs.has(`admx-${c.id}`)
        ) ?? [],
        securityBaselines: configurations?.securityBaselines?.filter(c =>
          selectedConfigs.has(`security-${c.id}`)
        ) ?? [],
        compliancePolicies: configurations?.compliancePolicies?.filter(c =>
          selectedConfigs.has(`compliance-${c.id}`)
        ) ?? [],
        scripts: {
          macOS: configurations?.scripts?.macOS?.filter(c =>
            selectedConfigs.has(`script-mac-${c.id}`)
          ) ?? [],
          windows: configurations?.scripts?.windows?.filter(c =>
            selectedConfigs.has(`script-win-${c.id}`)
          ) ?? []
        },
        appConfigurations: configurations?.appConfigurations?.filter(c =>
          selectedConfigs.has(`app-${c.id}`)
        ) ?? [],
        windowsUpdatePolicies: configurations?.windowsUpdatePolicies?.filter(c =>
          selectedConfigs.has(`update-${c.id}`)
        ) ?? [],
        enrollmentConfigurations: configurations?.enrollmentConfigurations?.filter(c =>
          selectedConfigs.has(`enrollment-${c.id}`)
        ) ?? []
      };

      // Always use detailed PDF generation
      const pdfEndpoint = "/api/pdf/generate-detailed";
      
      const response = await fetch(pdfEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(selectedData),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Intune-Configuration-Documentation-${new Date().toISOString().split("T")[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error("Error generating PDF:", err);
      alert("Failed to generate PDF. Please try again.");
    } finally {
      setGeneratingPdf(false);
    }
  };
  
  // Filter configurations based on search query
  const filterConfigurations = (items: any[]) => {
    if (!searchQuery) return items;
    return items.filter(item => {
      const name = (item.displayName || item.name || "").toLowerCase();
      const description = (item.description || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  };
  

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-subtle">
        <NavigationHeader />
        <div className="max-w-3xl mx-auto px-6 lg:px-8 py-12">
          <Card>
            <CardContent className="py-8">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-slate-900 mb-2">Loading Intune Configurations</h2>
                <p className="text-sm text-slate-600">Please wait while we fetch all your configuration data with detailed settings...</p>
              </div>
              <ProgressBar steps={fetchProgress.steps} currentStep={fetchProgress.currentStep} />
            </CardContent>
          </Card>
        </div>
      </div>
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
    <div className="min-h-screen bg-gradient-subtle">
      <NavigationHeader />

      <div className="max-w-8xl mx-auto px-6 lg:px-8 py-8">
        {/* First-time user tip banner */}
        {showTipBanner && configurations && !searchQuery && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <Info className="w-5 h-5 text-blue-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm text-blue-900 font-medium">Tip: Getting started with documentation</p>
              <p className="text-sm text-blue-700 mt-1">
                Select the policies you want to document using the checkboxes, then click "Export Selected" to generate a comprehensive PDF report.
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
        
        {/* Search results tip */}
        {searchQuery && getFilteredCount() > 0 && (
          <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-center justify-between">
            <div className="flex items-start gap-3">
              <Search className="w-5 h-5 text-green-600 mt-0.5" />
              <div>
                <p className="text-sm text-green-900 font-medium">
                  Found {getFilteredCount()} matching configuration{getFilteredCount() !== 1 ? 's' : ''}
                </p>
                <p className="text-sm text-green-700 mt-0.5">
                  Search: "{searchQuery}"
                </p>
              </div>
            </div>
            <div className="text-sm text-green-700">
              Click "Select Filtered" to select all search results for export
            </div>
          </div>
        )}
        {/* Action Bar */}
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col gap-4">
              {/* Header row */}
              <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-2">
                    <Layers className="w-5 h-5 text-slate-500" />
                    <h2 className="text-xl font-semibold text-slate-900">Configuration Overview</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="info" size="md">
                      {configurations?.summary.totalConfigurations || 0} Total
                    </Badge>
                    {lastFetched && (
                      <span className="text-xs text-slate-500 hidden sm:inline">
                        Last updated: {lastFetched.toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => fetchConfigurations()}
                  disabled={loading}
                  loading={loading}
                  variant="secondary"
                  size="md"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
                <label className="flex items-center gap-2 cursor-pointer group">
                  <input
                    type="checkbox"
                    checked={selectAll}
                    onChange={handleSelectAll}
                    className="checkbox-enhanced"
                  />
                  <span className="text-sm text-slate-700 group-hover:text-slate-900 transition-colors">
                    Select All
                  </span>
                </label>
                {searchQuery && (
                  <Button
                    onClick={handleSelectFiltered}
                    variant="secondary"
                    size="md"
                    title={`Select ${getFilteredCount()} filtered items`}
                  >
                    <CheckSquare className="w-4 h-4" />
                    Select Filtered ({getFilteredCount()})
                  </Button>
                )}
                <Button
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                  loading={generatingPdf}
                  variant={selectedConfigs.size === 0 ? "secondary" : "primary"}
                  size="md"
                  title={selectedConfigs.size === 0 ? "Select items to export" : `Export ${selectedConfigs.size} selected items`}
                >
                  <Download className="w-4 h-4" />
                  {generatingPdf ? "Generating..." : selectedConfigs.size === 0 ? "Export Selected" : `Export Selected (${selectedConfigs.size})`}
                </Button>
              </div>
              
              {/* Search row */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search configurations by name or description..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
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
            </div>
            </div>
          </CardContent>
        </Card>

        {/* Active Filter Display */}
        {activeFilter && (
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-full">
              <span className="text-sm font-medium text-blue-700">
                Filtering: {activeFilter === "settingsCatalog" ? "Settings Catalog" :
                          activeFilter === "deviceConfigurations" ? "Device Configurations" :
                          activeFilter === "administrativeTemplates" ? "Administrative Templates" :
                          activeFilter === "securityBaselines" ? "Security Baselines" :
                          activeFilter === "compliancePolicies" ? "Compliance Policies" :
                          activeFilter === "scripts" ? "Scripts" :
                          activeFilter === "appConfigurations" ? "App Configurations" :
                          activeFilter === "windowsUpdatePolicies" ? "Windows Update Policies" :
                          activeFilter === "enrollmentConfigurations" ? "Enrollment Configurations" :
                          activeFilter}
              </span>
              <button
                onClick={() => setActiveFilter(null)}
                className="p-0.5 hover:bg-blue-200 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-3 h-3 text-blue-700" />
              </button>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div className="mb-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <SummaryCard
              icon={<Settings className="w-5 h-5" />}
              title="Settings Catalog"
              count={configurations?.summary.byType.settingsCatalog ?? 0}
              color="blue"
              isActive={activeFilter === "settingsCatalog"}
              onClick={() => setActiveFilter(activeFilter === "settingsCatalog" ? null : "settingsCatalog")}
              lastUpdated={configurations?.settingsCatalog?.[0]?.lastModifiedDateTime}
            />
            <SummaryCard
              icon={<Laptop className="w-5 h-5" />}
              title="Device Configs"
              count={configurations?.summary.byType.deviceConfigurations ?? 0}
              color="emerald"
              isActive={activeFilter === "deviceConfigurations"}
              onClick={() => setActiveFilter(activeFilter === "deviceConfigurations" ? null : "deviceConfigurations")}
              lastUpdated={configurations?.deviceConfigurations?.[0]?.lastModifiedDateTime}
            />
            <SummaryCard
              icon={<FileText className="w-5 h-5" />}
              title="Admin Templates"
              count={configurations?.summary.byType.administrativeTemplates ?? 0}
              color="purple"
              isActive={activeFilter === "administrativeTemplates"}
              onClick={() => setActiveFilter(activeFilter === "administrativeTemplates" ? null : "administrativeTemplates")}
              lastUpdated={configurations?.administrativeTemplates?.[0]?.lastModifiedDateTime}
            />
            <SummaryCard
              icon={<Shield className="w-5 h-5" />}
              title="Security Baselines"
              count={configurations?.summary.byType.securityBaselines ?? 0}
              color="orange"
              isActive={activeFilter === "securityBaselines"}
              onClick={() => setActiveFilter(activeFilter === "securityBaselines" ? null : "securityBaselines")}
              lastUpdated={configurations?.securityBaselines?.[0]?.lastModifiedDateTime}
            />
            <SummaryCard
              icon={<CheckSquare className="w-5 h-5" />}
              title="Compliance"
              count={configurations?.summary.byType.compliancePolicies ?? 0}
              color="red"
              isActive={activeFilter === "compliancePolicies"}
              onClick={() => setActiveFilter(activeFilter === "compliancePolicies" ? null : "compliancePolicies")}
              lastUpdated={configurations?.compliancePolicies?.[0]?.lastModifiedDateTime}
            />
            <SummaryCard
              icon={<Code className="w-5 h-5" />}
              title="Scripts"
              count={configurations?.summary.byType.scripts ?? 0}
              color="indigo"
              isActive={activeFilter === "scripts"}
              onClick={() => setActiveFilter(activeFilter === "scripts" ? null : "scripts")}
            />
            <SummaryCard
              icon={<Package className="w-5 h-5" />}
              title="App Configs"
              count={configurations?.summary.byType.appConfigurations ?? 0}
              color="teal"
              isActive={activeFilter === "appConfigurations"}
              onClick={() => setActiveFilter(activeFilter === "appConfigurations" ? null : "appConfigurations")}
            />
            <SummaryCard
              icon={<RefreshCw className="w-5 h-5" />}
              title="Windows Update"
              count={configurations?.summary.byType.windowsUpdatePolicies ?? 0}
              color="amber"
              isActive={activeFilter === "windowsUpdatePolicies"}
              onClick={() => setActiveFilter(activeFilter === "windowsUpdatePolicies" ? null : "windowsUpdatePolicies")}
            />
            <SummaryCard
              icon={<UserCheck className="w-5 h-5" />}
              title="Enrollment"
              count={configurations?.summary.byType.enrollmentConfigurations ?? 0}
              color="pink"
              isActive={activeFilter === "enrollmentConfigurations"}
              onClick={() => setActiveFilter(activeFilter === "enrollmentConfigurations" ? null : "enrollmentConfigurations")}
            />
            <div 
              className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4 border border-slate-300 transition-all hover:shadow-md cursor-pointer"
              onClick={() => setActiveFilter(null)}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 bg-slate-200 rounded-lg flex items-center justify-center">
                  <Server className="w-5 h-5 text-slate-600" />
                </div>
              </div>
              <h3 className="font-medium text-slate-600 text-xs uppercase tracking-wider mb-1">Total</h3>
              <p className="text-2xl font-bold text-slate-900">
                {configurations?.summary.totalConfigurations ?? 0}
              </p>
            </div>
          </div>
        </div>

        {/* Configuration Details */}
        {configurations && (
          <div className="space-y-6">
            {(!activeFilter || activeFilter === "settingsCatalog") && filterConfigurations(configurations.settingsCatalog)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "deviceConfigurations") && filterConfigurations(configurations.deviceConfigurations)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "administrativeTemplates") && filterConfigurations(configurations.administrativeTemplates)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "securityBaselines") && filterConfigurations(configurations.securityBaselines)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "compliancePolicies") && filterConfigurations(configurations.compliancePolicies)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "scripts") && (configurations.scripts?.macOS?.length > 0 || configurations.scripts?.windows?.length > 0) && (
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
            {(!activeFilter || activeFilter === "appConfigurations") && filterConfigurations(configurations.appConfigurations)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "windowsUpdatePolicies") && filterConfigurations(configurations.windowsUpdatePolicies)?.length > 0 && (
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
            {(!activeFilter || activeFilter === "enrollmentConfigurations") && filterConfigurations(configurations.enrollmentConfigurations)?.length > 0 && (
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
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ 
  icon, 
  title, 
  count, 
  color,
  isActive,
  onClick,
  lastUpdated
}: { 
  icon: React.ReactNode;
  title: string;
  count: number;
  color: 'blue' | 'emerald' | 'purple' | 'orange' | 'red' | 'indigo' | 'teal' | 'amber' | 'pink';
  isActive?: boolean;
  onClick?: () => void;
  lastUpdated?: string;
}) {
  const colorClasses = {
    blue: "from-blue-50 to-blue-100 border-blue-200 text-blue-600",
    emerald: "from-emerald-50 to-emerald-100 border-emerald-200 text-emerald-600",
    purple: "from-purple-50 to-purple-100 border-purple-200 text-purple-600",
    orange: "from-orange-50 to-orange-100 border-orange-200 text-orange-600",
    red: "from-red-50 to-red-100 border-red-200 text-red-600",
    indigo: "from-indigo-50 to-indigo-100 border-indigo-200 text-indigo-600",
    teal: "from-teal-50 to-teal-100 border-teal-200 text-teal-600",
    amber: "from-amber-50 to-amber-100 border-amber-200 text-amber-600",
    pink: "from-pink-50 to-pink-100 border-pink-200 text-pink-600"
  };

  const baseColor = colorClasses[color];
  const textColor = baseColor.split(' ')[3];

  return (
    <div 
      className={`bg-white rounded-xl p-4 border transition-all hover:shadow-md ${onClick ? 'cursor-pointer' : ''} ${isActive ? 'ring-2 ring-' + color + '-500 border-' + color + '-500' : 'border-slate-200'}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 bg-gradient-to-br ${baseColor} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
          <div className={textColor}>
            {icon}
          </div>
        </div>
        {count > 0 && lastUpdated && (
          <span className="text-xs text-slate-400">
            {new Date(lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
      <h3 className="font-medium text-slate-600 text-xs uppercase tracking-wider mb-1">{title}</h3>
      <p className="text-2xl font-bold text-slate-900">{count}</p>
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