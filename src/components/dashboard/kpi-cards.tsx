import {
  AlertTriangle,
  CheckCircle2,
  Files,
  Layers3,
  ListChecks,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface KpiCardsProps {
  totalConfigurations: number;
  selectedCount: number;
  configurationTypeCount: number;
  warningCount: number;
}

interface KpiCardProps {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "teal" | "amber";
}

function KpiCard({ icon: Icon, label, value, tone = "teal" }: KpiCardProps) {
  return (
    <div className="border-petrol-950/6 shadow-card flex min-h-28 items-center gap-4 rounded-2xl border bg-white px-5 py-4">
      <span
        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
          tone === "amber"
            ? "bg-amber-50 text-amber-700"
            : "bg-teal-50 text-teal-700"
        }`}
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <div className="min-w-0">
        <p className="text-petrol-600 truncate text-xs font-medium">{label}</p>
        <p className="text-petrol-950 mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums">
          {value}
        </p>
      </div>
    </div>
  );
}

export function KpiCards({
  totalConfigurations,
  selectedCount,
  configurationTypeCount,
  warningCount,
}: KpiCardsProps) {
  return (
    <section
      aria-label="Dashboard summary"
      className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      <KpiCard
        icon={Files}
        label="Total configurations"
        value={totalConfigurations.toLocaleString()}
      />
      <KpiCard
        icon={ListChecks}
        label="Selected for export"
        value={selectedCount.toLocaleString()}
      />
      <KpiCard
        icon={Layers3}
        label="Configuration types"
        value={configurationTypeCount.toLocaleString()}
      />
      <KpiCard
        icon={warningCount > 0 ? AlertTriangle : CheckCircle2}
        label={warningCount > 0 ? "Items with warnings" : "All data loaded"}
        value={warningCount > 0 ? warningCount.toLocaleString() : "100%"}
        tone={warningCount > 0 ? "amber" : "teal"}
      />
    </section>
  );
}
