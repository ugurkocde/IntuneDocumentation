"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
  Palette
} from "lucide-react";
import { BrandingSettingsModal } from "~/components/branding-settings-modal";
import type { BrandingOptions } from "~/types/branding";

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
  
  // Log tenant access server-side only
  useTenantLogging("Dashboard-Access");
  const [configurations, setConfigurations] = useState<IntuneConfigurations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [showTipBanner, setShowTipBanner] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<string>("overview");
  const [showBrandingModal, setShowBrandingModal] = useState(false);
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
      void fetchConfigurations();
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
      
      // Log branding data being sent
      console.log('Sending branding to PDF generator:', {
        hasBranding: !!brandingOptions,
        companyName: brandingOptions?.companyName,
        department: brandingOptions?.department,
        hasLogo: !!brandingOptions?.logo?.dataUrl,
        logoPosition: brandingOptions?.logo?.position,
        colors: brandingOptions?.colors
      });
      
      const response = await fetch(pdfEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          ...selectedData,
          branding: brandingOptions
        }),
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
                
                {/* Middle: Last Updated */}
                {lastFetched && (
                  <span className="text-xs text-slate-500 flex-shrink-0">
                    Last updated: {lastFetched.toLocaleTimeString()}
                  </span>
                )}
                
                {/* Right: Refresh Button */}
                <Button
                  onClick={() => fetchConfigurations()}
                  disabled={loading}
                  loading={loading}
                  variant="secondary"
                  size="sm"
                  className="flex-shrink-0"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh
                </Button>
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
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf || selectedConfigs.size === 0}
                  loading={generatingPdf}
                  variant={selectedConfigs.size === 0 ? "ghost" : "primary"}
                  size="sm"
                  className="min-w-[140px]"
                >
                  <Download className="w-4 h-4 mr-2" />
                  {selectedConfigs.size > 0 ? `Export (${selectedConfigs.size})` : 'Export Selected'}
                </Button>
              </div>
            </div>
          </div>
        </div>



        {/* Configuration Details */}
        {configurations && (
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