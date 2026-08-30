"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Code,
  Download,
  FileText,
  LayoutGrid,
  Laptop,
  LogOut,
  Package,
  Palette,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  Shield,
  ShieldCheck,
  User,
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

// Everyday policy families stay visible; the long-tail coverage families
// live behind a collapsible "More coverage" toggle so the list stays short
// enough that nothing below it disappears under the fold.
const CORE_CONFIGURATION_ITEMS: SidebarItem[] = [
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

const EXTENDED_CONFIGURATION_ITEMS: SidebarItem[] = [
  { key: "windowsUpdateProfiles", icon: RefreshCw },
  { key: "scriptsAndRemediations", icon: Code },
  { key: "enrollmentAndProvisioning", icon: UserCheck },
  { key: "applications", icon: Package },
  { key: "assignmentAndRbac", icon: Shield },
  { key: "tenantAndService", icon: Settings },
  { key: "connectors", icon: Laptop },
  { key: "specialistPolicies", icon: FileText },
];

const EXTENDED_COVERAGE_STORAGE_KEY = "sidebar-extended-coverage";

interface DashboardSidebarProps {
  isOpen: boolean;
  activeView: DashboardView;
  counts: ConfigurationTypeCounts;
  totalCount: number;
  selectedCount: number;
  affectedFamilyKeys: string[];
  showConditionalAccess: boolean;
  userName: string;
  onToggle: () => void;
  onViewChange: (view: DashboardView) => void;
  onOpenBranding: () => void;
  onOpenExport: () => void;
  onSignOut: () => void;
}

interface NavButtonProps {
  isOpen: boolean;
  active: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
  badge?: string;
  onClick: () => void;
}

function NavButton({
  isOpen,
  active,
  icon: Icon,
  label,
  count,
  badge,
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
          {badge && (
            <span className="rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">
              {badge}
            </span>
          )}
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
  affectedFamilyKeys,
  showConditionalAccess,
  userName,
  onToggle,
  onViewChange,
  onOpenBranding,
  onOpenExport,
  onSignOut,
}: DashboardSidebarProps) {
  const isVisibleItem = ({ key }: SidebarItem) =>
    (key !== "conditionalAccessPolicies" || showConditionalAccess) &&
    ((counts[key] || 0) > 0 ||
      affectedFamilyKeys.includes(key) ||
      [
        "settingsCatalog",
        "deviceConfigurations",
        "administrativeTemplates",
        "securityBaselines",
        "compliancePolicies",
        "appProtectionPolicies",
        "scripts",
        "appConfigurations",
        "windowsUpdatePolicies",
        "enrollmentConfigurations",
        "conditionalAccessPolicies",
      ].includes(key));

  const visibleCoreItems = CORE_CONFIGURATION_ITEMS.filter(isVisibleItem);
  const visibleExtendedItems =
    EXTENDED_CONFIGURATION_ITEMS.filter(isVisibleItem);

  const [showExtended, setShowExtended] = useState(false);
  useEffect(() => {
    try {
      setShowExtended(
        window.localStorage.getItem(EXTENDED_COVERAGE_STORAGE_KEY) === "true",
      );
    } catch {
      // Storage unavailable; keep the collapsed default.
    }
  }, []);
  // Never hide the group the user is currently inside.
  useEffect(() => {
    if (EXTENDED_CONFIGURATION_ITEMS.some(({ key }) => key === activeView)) {
      setShowExtended(true);
    }
  }, [activeView]);
  const toggleExtended = () => {
    setShowExtended((value) => {
      try {
        window.localStorage.setItem(
          EXTENDED_COVERAGE_STORAGE_KEY,
          String(!value),
        );
      } catch {
        // Storage unavailable; the toggle still works for this session.
      }
      return !value;
    });
  };

  return (
    <aside
      className={`border-petrol-950/6 fixed inset-y-0 left-0 z-40 flex border-r bg-white transition-[width] duration-300 ${
        isOpen ? "shadow-soft w-72 lg:shadow-none" : "w-[4.5rem]"
      }`}
      aria-label="Dashboard navigation"
    >
      <div className="flex min-h-0 w-full flex-col px-3 py-4">
        <div
          className={`border-petrol-950/6 -mx-3 flex border-b px-4 pb-3.5 ${
            isOpen
              ? "items-center justify-between gap-2"
              : "flex-col items-center gap-2"
          }`}
        >
          <Link
            href="/"
            className={`group flex min-w-0 items-center rounded-xl focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
              isOpen ? "gap-2.5" : "justify-center"
            }`}
            title="Intune Documentation home"
          >
            <Image
              src="/logo.svg"
              alt="Intune Documentation"
              width={36}
              height={36}
              className="h-9 w-auto shrink-0 rounded-md transition-transform group-hover:scale-105"
              priority
            />
            {isOpen && (
              <div className="min-w-0 leading-tight">
                <p className="text-petrol-950 truncate text-sm font-bold transition-colors group-hover:text-teal-700">
                  Intune Documentation
                </p>
                <p className="text-petrol-600 truncate text-[11px]">
                  Workspace
                </p>
              </div>
            )}
          </Link>
          <button
            type="button"
            onClick={onToggle}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
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

        <nav className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-0.5">
          <section aria-labelledby="sidebar-main-label">
            <p
              id="sidebar-main-label"
              className={`text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase ${
                isOpen ? "block" : "sr-only"
              }`}
            >
              Main
            </p>
            <div className="space-y-1">
              <NavButton
                isOpen={isOpen}
                active={activeView === "overview"}
                icon={LayoutGrid}
                label="Overview"
                count={totalCount}
                onClick={() => onViewChange("overview")}
              />
              <NavButton
                isOpen={isOpen}
                active={activeView === "compliance"}
                icon={ShieldCheck}
                label="Compliance Evidence"
                badge="New"
                onClick={() => onViewChange("compliance")}
              />
            </div>
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
              {visibleCoreItems.map(({ key, icon }) => (
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
              {visibleExtendedItems.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={toggleExtended}
                    aria-expanded={showExtended}
                    aria-label={
                      isOpen
                        ? undefined
                        : `More coverage (${visibleExtendedItems.length})`
                    }
                    title={
                      isOpen
                        ? undefined
                        : `More coverage (${visibleExtendedItems.length})`
                    }
                    className={`text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 group flex min-h-9 w-full cursor-pointer items-center rounded-xl text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                      isOpen ? "gap-3 px-3" : "justify-center px-2"
                    }`}
                  >
                    {showExtended ? (
                      <ChevronDown
                        className="h-[18px] w-[18px] shrink-0"
                        strokeWidth={1.8}
                      />
                    ) : (
                      <ChevronRight
                        className="h-[18px] w-[18px] shrink-0"
                        strokeWidth={1.8}
                      />
                    )}
                    {isOpen && (
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">
                        More coverage
                      </span>
                    )}
                    {isOpen && !showExtended && (
                      <span className="bg-mint-100 text-petrol-700 min-w-7 rounded-full px-2 py-0.5 text-center text-[10px] font-bold tabular-nums">
                        {visibleExtendedItems.length}
                      </span>
                    )}
                  </button>
                  {showExtended &&
                    visibleExtendedItems.map(({ key, icon }) => (
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
                </>
              )}
            </div>
          </section>

          <section aria-labelledby="sidebar-settings-label">
            <p
              id="sidebar-settings-label"
              className={`text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase ${
                isOpen ? "block" : "sr-only"
              }`}
            >
              Workspace
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

          {isOpen ? (
            <div className="mt-3 flex items-center gap-2 px-1">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                <User className="h-4 w-4" />
              </span>
              <span className="text-petrol-800 min-w-0 flex-1 truncate text-sm font-medium">
                {userName}
              </span>
              <button
                type="button"
                onClick={onSignOut}
                className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onSignOut}
              className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 mx-auto mt-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              aria-label={`Sign out ${userName}`}
              title={`Sign out (${userName})`}
            >
              <LogOut className="h-[18px] w-[18px]" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
