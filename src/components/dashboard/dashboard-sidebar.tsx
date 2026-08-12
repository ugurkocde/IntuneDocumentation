"use client";

import {
  CheckSquare,
  Code,
  Download,
  FileText,
  LayoutGrid,
  Laptop,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Shield,
  UserCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type {
  ConfigurationTypeCounts,
  ConfigurationTypeKey,
  DashboardView,
} from "~/components/dashboard/types";
import { DASHBOARD_TYPE_LABELS } from "~/components/dashboard/types";

interface SidebarItem {
  key: ConfigurationTypeKey;
  icon: LucideIcon;
}

const CONFIGURATION_ITEMS: SidebarItem[] = [
  { key: "settingsCatalog", icon: Settings },
  { key: "deviceConfigurations", icon: Laptop },
  { key: "administrativeTemplates", icon: FileText },
  { key: "conditionalAccessPolicies", icon: Shield },
  { key: "securityBaselines", icon: Shield },
  { key: "compliancePolicies", icon: CheckSquare },
  { key: "appProtectionPolicies", icon: Shield },
  { key: "scripts", icon: Code },
  { key: "appConfigurations", icon: Package },
  { key: "windowsUpdatePolicies", icon: RefreshCw },
  { key: "enrollmentConfigurations", icon: UserCheck },
];

interface DashboardSidebarProps {
  isOpen: boolean;
  activeView: DashboardView;
  counts: ConfigurationTypeCounts;
  totalCount: number;
  selectedCount: number;
  showConditionalAccess: boolean;
  onToggle: () => void;
  onViewChange: (view: DashboardView) => void;
  onOpenBranding: () => void;
  onOpenExport: () => void;
}

interface NavButtonProps {
  isOpen: boolean;
  active: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
  onClick: () => void;
}

function NavButton({
  isOpen,
  active,
  icon: Icon,
  label,
  count,
  onClick,
}: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={isOpen ? undefined : label}
      title={isOpen ? undefined : label}
      className={`group flex min-h-11 w-full cursor-pointer items-center rounded-xl text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
        isOpen ? "gap-3 px-3" : "justify-center px-2"
      } ${
        active
          ? "bg-teal-50 text-teal-700"
          : "text-petrol-600 hover:bg-mint-50 hover:text-petrol-950"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
      {isOpen && (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
            {label}
          </span>
          {typeof count === "number" && (
            <span
              className={`min-w-7 rounded-full px-2 py-0.5 text-center text-[10px] font-bold tabular-nums ${
                active
                  ? "bg-white text-teal-700"
                  : "bg-mint-100 text-petrol-700"
              }`}
            >
              {count.toLocaleString()}
            </span>
          )}
        </>
      )}
    </button>
  );
}

export function DashboardSidebar({
  isOpen,
  activeView,
  counts,
  totalCount,
  selectedCount,
  showConditionalAccess,
  onToggle,
  onViewChange,
  onOpenBranding,
  onOpenExport,
}: DashboardSidebarProps) {
  const visibleItems = CONFIGURATION_ITEMS.filter(
    ({ key }) => key !== "conditionalAccessPolicies" || showConditionalAccess,
  );

  return (
    <aside
      className={`border-petrol-950/6 fixed top-16 bottom-0 left-0 z-40 flex border-r bg-white transition-[width] duration-300 ${
        isOpen ? "shadow-soft w-72 lg:shadow-none" : "w-[4.5rem]"
      }`}
      aria-label="Dashboard navigation"
    >
      <div className="flex min-h-0 w-full flex-col px-3 py-4">
        <div className={`flex ${isOpen ? "justify-end" : "justify-center"}`}>
          <button
            type="button"
            onClick={onToggle}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
            title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          >
            {isOpen ? (
              <PanelLeftClose className="h-5 w-5" />
            ) : (
              <PanelLeftOpen className="h-5 w-5" />
            )}
          </button>
        </div>

        <nav className="mt-2 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-0.5">
          <section aria-labelledby="sidebar-main-label">
            <p
              id="sidebar-main-label"
              className={`text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase ${
                isOpen ? "block" : "sr-only"
              }`}
            >
              Main
            </p>
            <NavButton
              isOpen={isOpen}
              active={activeView === "overview"}
              icon={LayoutGrid}
              label="Overview"
              count={totalCount}
              onClick={() => onViewChange("overview")}
            />
          </section>

          <section aria-labelledby="sidebar-configurations-label">
            <p
              id="sidebar-configurations-label"
              className={`text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase ${
                isOpen ? "block" : "sr-only"
              }`}
            >
              Configurations
            </p>
            <div className="space-y-1">
              {visibleItems.map(({ key, icon }) => (
                <NavButton
                  key={key}
                  isOpen={isOpen}
                  active={activeView === key}
                  icon={icon}
                  label={DASHBOARD_TYPE_LABELS[key]}
                  count={counts[key]}
                  onClick={() => onViewChange(key)}
                />
              ))}
            </div>
          </section>

          <section aria-labelledby="sidebar-settings-label">
            <p
              id="sidebar-settings-label"
              className={`text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase ${
                isOpen ? "block" : "sr-only"
              }`}
            >
              Settings
            </p>
            <div className="space-y-1">
              <NavButton
                isOpen={isOpen}
                active={activeView === "settings"}
                icon={Settings}
                label="Settings"
                onClick={() => onViewChange("settings")}
              />
              <NavButton
                isOpen={isOpen}
                active={false}
                icon={Palette}
                label="Branding"
                onClick={onOpenBranding}
              />
            </div>
          </section>
        </nav>

        <div className="border-petrol-950/6 mt-4 border-t pt-4">
          {isOpen ? (
            <div className="border-petrol-950/6 bg-mint-50 rounded-2xl border p-4">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-white text-teal-700">
                  <Download className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-petrol-950 text-sm font-semibold">
                    Export documentation
                  </p>
                  <p className="text-petrol-600 mt-0.5 text-xs tabular-nums">
                    {selectedCount > 0
                      ? `${selectedCount.toLocaleString()} selected`
                      : "Nothing selected yet"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenExport}
                disabled={selectedCount === 0}
                className="bg-petrol-950 hover:bg-petrol-800 mt-4 flex min-h-11 w-full cursor-pointer items-center justify-center rounded-xl px-4 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              >
                Export selected
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenExport}
              disabled={selectedCount === 0}
              className="bg-petrol-950 hover:bg-petrol-800 relative mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Export ${selectedCount} selected configurations`}
              title="Export selected"
            >
              <Download className="h-[18px] w-[18px]" />
              {selectedCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-white bg-teal-600 px-1 text-[9px] font-bold text-white tabular-nums">
                  {selectedCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
