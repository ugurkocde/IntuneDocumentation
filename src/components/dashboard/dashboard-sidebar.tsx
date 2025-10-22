"use client";

import { useEffect } from "react";
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
  LayoutGrid,
  ChevronLeft,
  Menu,
} from "lucide-react";
import type { ViewType, IntuneConfigurations, CAConsentStatus } from "~/types/dashboard";

interface DashboardSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  activeView: ViewType;
  onViewChange: (view: ViewType) => void;
  configurations: IntuneConfigurations | null;
  includeCA: boolean;
  caConsentStatus: CAConsentStatus;
}

export function DashboardSidebar({
  isOpen,
  onToggle,
  activeView,
  onViewChange,
  configurations,
  includeCA,
  caConsentStatus,
}: DashboardSidebarProps) {
  // Persist sidebar state
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("dashboard-sidebar-open", String(isOpen));
    }
  }, [isOpen]);

  const navigationItems = [
    {
      id: "overview" as ViewType,
      label: "Overview",
      icon: LayoutGrid,
      count: configurations?.summary.totalConfigurations || 0,
      badgeColor: "bg-slate-200",
    },
  ];

  const configurationItems = [
    {
      id: "settingsCatalog" as ViewType,
      label: "Settings Catalog",
      icon: Settings,
      count: configurations?.summary.byType.settingsCatalog || 0,
      badgeColor: "bg-blue-100 text-blue-700",
    },
    {
      id: "deviceConfigurations" as ViewType,
      label: "Device Configs",
      icon: Laptop,
      count: configurations?.summary.byType.deviceConfigurations || 0,
      badgeColor: "bg-emerald-100 text-emerald-700",
    },
    {
      id: "administrativeTemplates" as ViewType,
      label: "Admin Templates",
      icon: FileText,
      count: configurations?.summary.byType.administrativeTemplates || 0,
      badgeColor: "bg-purple-100 text-purple-700",
    },
    ...(includeCA && caConsentStatus === "included"
      ? [
          {
            id: "conditionalAccessPolicies" as ViewType,
            label: "Conditional Access",
            icon: Shield,
            count: configurations?.summary.byType.conditionalAccessPolicies || 0,
            badgeColor: "bg-slate-200",
          },
        ]
      : []),
    {
      id: "securityBaselines" as ViewType,
      label: "Security Baselines",
      icon: Shield,
      count: configurations?.summary.byType.securityBaselines || 0,
      badgeColor: "bg-orange-100 text-orange-700",
    },
    {
      id: "compliancePolicies" as ViewType,
      label: "Compliance",
      icon: CheckSquare,
      count: configurations?.summary.byType.compliancePolicies || 0,
      badgeColor: "bg-red-100 text-red-700",
    },
    {
      id: "scripts" as ViewType,
      label: "Scripts",
      icon: Code,
      count: configurations?.summary.byType.scripts || 0,
      badgeColor: "bg-indigo-100 text-indigo-700",
    },
    {
      id: "appConfigurations" as ViewType,
      label: "App Configs",
      icon: Package,
      count: configurations?.summary.byType.appConfigurations || 0,
      badgeColor: "bg-teal-100 text-teal-700",
    },
    {
      id: "windowsUpdatePolicies" as ViewType,
      label: "Windows Update",
      icon: RefreshCw,
      count: configurations?.summary.byType.windowsUpdatePolicies || 0,
      badgeColor: "bg-amber-100 text-amber-700",
    },
    {
      id: "enrollmentConfigurations" as ViewType,
      label: "Enrollment",
      icon: UserCheck,
      count: configurations?.summary.byType.enrollmentConfigurations || 0,
      badgeColor: "bg-pink-100 text-pink-700",
    },
  ];

  return (
    <nav
      className={`${
        isOpen ? "w-64" : "w-16"
      } transition-all duration-300 bg-white border-r border-slate-200 h-[calc(100vh-64px)] fixed top-16 left-0 z-30 overflow-y-auto`}
      aria-label="Dashboard navigation"
    >
      <div className="p-4">
        {/* Collapse button */}
        <div className="flex justify-end mb-4">
          <button
            onClick={onToggle}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={isOpen}
          >
            {isOpen ? (
              <ChevronLeft className="w-5 h-5 text-slate-600" />
            ) : (
              <Menu className="w-5 h-5 text-slate-600" />
            )}
          </button>
        </div>

        {/* Main navigation items */}
        <div className="space-y-1">
          {navigationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                activeView === item.id
                  ? "bg-blue-50 text-blue-700"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
              aria-current={activeView === item.id ? "page" : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {isOpen && (
                <div className="flex justify-between items-center w-full">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.badgeColor}`}>
                    {item.count}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        <div className={`${isOpen ? "block" : "hidden"} my-4 border-t border-slate-200`} />

        {/* Configuration items */}
        <div className="space-y-1">
          {configurationItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
                activeView === item.id
                  ? "bg-blue-50 text-blue-700"
                  : "hover:bg-slate-50 text-slate-700"
              }`}
              aria-current={activeView === item.id ? "page" : undefined}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
              {isOpen && (
                <div className="flex justify-between items-center w-full">
                  <span className="text-sm font-medium">{item.label}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${item.badgeColor}`}>
                    {item.count}
                  </span>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Settings */}
        <div className="mt-6 pt-4 border-t border-slate-200">
          <button
            onClick={() => onViewChange("settings")}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors cursor-pointer ${
              activeView === "settings"
                ? "bg-blue-50 text-blue-700"
                : "hover:bg-slate-50 text-slate-700"
            }`}
            aria-current={activeView === "settings" ? "page" : undefined}
          >
            <Settings className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            {isOpen && <span className="text-sm font-medium">Settings</span>}
          </button>
        </div>
      </div>
    </nav>
  );
}
