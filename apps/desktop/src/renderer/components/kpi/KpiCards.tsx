import {
  AlertTriangle,
  BadgeInfo,
  CheckCircle2,
  Files,
  Layers3,
  LoaderCircle,
  Package,
  ShieldAlert,
  ShieldCheck,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { CollectionBreakdown } from "../../../shared/ipc-types";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "teal" | "amber";
  spin?: boolean;
  // With both set the card is a button that drills down to the details.
  onClick?: () => void;
  actionLabel?: string;
}

function KpiCard({ icon: Icon, label, value, hint, tone = "teal", spin = false, onClick, actionLabel }: KpiCardProps) {
  const className =
    "border-petrol-950/6 shadow-card flex min-h-28 items-center gap-4 rounded-2xl border bg-white px-5 py-4";
  const content = (
    <>
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
        }`}
      >
        <Icon className={`h-5 w-5 ${spin ? "motion-safe:animate-spin" : ""}`} strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <p className="text-petrol-600 truncate text-xs font-medium">{label}</p>
        <p className="text-petrol-950 mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums">{value}</p>
        {hint && <p className="text-petrol-600 mt-0.5 truncate text-[11px]">{hint}</p>}
      </div>
    </>
  );
  if (onClick && actionLabel) {
    return (
      <button
        type="button"
        aria-label={actionLabel}
        title={actionLabel}
        onClick={onClick}
        className={`${className} hover:bg-mint-50/40 w-full cursor-pointer text-left transition-[border-color,background-color,box-shadow] hover:border-teal-700/25 hover:shadow-[0_16px_40px_-30px_rgba(8,47,54,0.55)] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none`}
      >
        {content}
      </button>
    );
  }
  return <div className={className}>{content}</div>;
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export function KpiCards({
  configurations,
  breakdown,
  sections,
  families,
  warnings,
  permissionGaps,
  loading,
  onShowFamilies,
  onShowWarnings,
  onShowPermissionGaps,
  onShowApps,
  onShowRbac,
}: {
  // Every collected item, as documented in a whole tenant export.
  configurations: number;
  // Missing on summaries from older builds; the headline then shows every item.
  breakdown?: CollectionBreakdown;
  sections: number;
  families: number;
  warnings: number;
  permissionGaps: number;
  loading: boolean;
  onShowFamilies?: () => void;
  onShowWarnings?: () => void;
  onShowPermissionGaps?: () => void;
  onShowApps?: () => void;
  onShowRbac?: () => void;
}) {
  // Drill downs are off while collecting and for zero values.
  const drill = (count: number, handler: (() => void) | undefined) =>
    !loading && count > 0 ? handler : undefined;
  const headline = breakdown?.policies ?? configurations;
  const summaryCards = (
    <section aria-label="Collection summary" className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
      <KpiCard
        icon={Files}
        label={breakdown ? "Policies and profiles" : "Configurations"}
        value={headline.toLocaleString()}
        hint={breakdown ? `Of ${plural(configurations, "collected item", "collected items")}` : "Policies and profiles"}
        onClick={drill(headline, onShowFamilies)}
        actionLabel={
          breakdown
            ? `Show ${plural(headline, "policy or profile", "policies and profiles")} by family`
            : `Show ${plural(configurations, "configuration", "configurations")} by family`
        }
      />
      <KpiCard
        icon={Layers3}
        label="Sections with data"
        value={sections.toLocaleString()}
        hint={`Across ${families} ${families === 1 ? "family" : "families"}`}
        onClick={drill(sections, onShowFamilies)}
        actionLabel={`Show ${plural(sections, "section", "sections")} with data by family`}
      />
      <KpiCard
        icon={loading ? LoaderCircle : warnings > 0 ? AlertTriangle : CheckCircle2}
        spin={loading}
        label={loading ? "Collection status" : "Warnings"}
        value={loading ? "Loading" : warnings > 0 ? warnings.toLocaleString() : "None"}
        tone={warnings > 0 ? "amber" : "teal"}
        hint={loading ? "Collection running" : warnings > 0 ? "Partial data below" : "Every resource loaded"}
        onClick={drill(warnings, onShowWarnings)}
        actionLabel={`Show ${plural(warnings, "warning", "warnings")}`}
      />
      <KpiCard
        icon={permissionGaps > 0 ? ShieldAlert : ShieldCheck}
        label="Permission gaps"
        value={permissionGaps > 0 ? permissionGaps.toLocaleString() : "None"}
        tone={permissionGaps > 0 ? "amber" : "teal"}
        hint={permissionGaps > 0 ? "Ask an administrator" : "No missing access"}
        onClick={drill(permissionGaps, onShowPermissionGaps)}
        actionLabel={`Show ${plural(permissionGaps, "permission gap", "permission gaps")}`}
      />
    </section>
  );
  if (!breakdown) return summaryCards;
  const unassigned = breakdown.apps - breakdown.appsAssigned;
  return (
    <>
      {summaryCards}
      <section aria-label="Also collected" className="grid grid-cols-1 gap-3 @3xl:grid-cols-3">
        <KpiCard
          icon={Package}
          label="Apps"
          value={breakdown.apps.toLocaleString()}
          hint={`${breakdown.appsAssigned.toLocaleString()} assigned, ${unassigned.toLocaleString()} unassigned`}
          onClick={drill(breakdown.apps, onShowApps)}
          actionLabel={`Show ${plural(breakdown.apps, "app", "apps")}, ${breakdown.appsAssigned.toLocaleString()} assigned`}
        />
        <KpiCard
          icon={UserCog}
          label="Assignment and RBAC"
          value={breakdown.rbac.toLocaleString()}
          hint="Roles, scope tags, filters and reusable settings"
          onClick={drill(breakdown.rbac, onShowRbac)}
          actionLabel={`Show ${plural(breakdown.rbac, "assignment and RBAC item", "assignment and RBAC items")}`}
        />
        <KpiCard
          icon={BadgeInfo}
          label="Microsoft defaults"
          value={breakdown.microsoftDefaults.toLocaleString()}
          hint={
            breakdown.microsoftDefaultsInRbac > 0
              ? `Created by Microsoft, ${breakdown.microsoftDefaultsInRbac.toLocaleString()} of them in RBAC`
              : "Created by Microsoft, still documented"
          }
          onClick={drill(breakdown.microsoftDefaults, onShowFamilies)}
          actionLabel={`Show which families hold the ${plural(breakdown.microsoftDefaults, "Microsoft default", "Microsoft defaults")}`}
        />
      </section>
    </>
  );
}
