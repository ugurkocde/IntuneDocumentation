import { AlertTriangle, CheckCircle2, Files, Layers3, LoaderCircle, ShieldAlert, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: "teal" | "amber";
  spin?: boolean;
}

function KpiCard({ icon: Icon, label, value, hint, tone = "teal", spin = false }: KpiCardProps) {
  return (
    <div className="border-petrol-950/6 shadow-card flex min-h-28 items-center gap-4 rounded-2xl border bg-white px-5 py-4">
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
    </div>
  );
}

export function KpiCards({
  configurations,
  sections,
  families,
  warnings,
  permissionGaps,
  loading,
}: {
  configurations: number;
  sections: number;
  families: number;
  warnings: number;
  permissionGaps: number;
  loading: boolean;
}) {
  return (
    <section aria-label="Collection summary" className="grid grid-cols-2 gap-3 @3xl:grid-cols-4">
      <KpiCard icon={Files} label="Configurations" value={configurations.toLocaleString()} hint="Policies and profiles" />
      <KpiCard
        icon={Layers3}
        label="Sections with data"
        value={sections.toLocaleString()}
        hint={`Across ${families} ${families === 1 ? "family" : "families"}`}
      />
      <KpiCard
        icon={loading ? LoaderCircle : warnings > 0 ? AlertTriangle : CheckCircle2}
        spin={loading}
        label={loading ? "Collection status" : "Warnings"}
        value={loading ? "Loading" : warnings > 0 ? warnings.toLocaleString() : "None"}
        tone={warnings > 0 ? "amber" : "teal"}
        hint={loading ? "Collection running" : warnings > 0 ? "Partial data below" : "Every resource loaded"}
      />
      <KpiCard
        icon={permissionGaps > 0 ? ShieldAlert : ShieldCheck}
        label="Permission gaps"
        value={permissionGaps > 0 ? permissionGaps.toLocaleString() : "None"}
        tone={permissionGaps > 0 ? "amber" : "teal"}
        hint={permissionGaps > 0 ? "Ask an administrator" : "No missing access"}
      />
    </section>
  );
}
