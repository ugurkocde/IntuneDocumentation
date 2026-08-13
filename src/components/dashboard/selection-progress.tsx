import { ListChecks } from "lucide-react";
import type {
  ConfigurationTypeKey,
  DashboardTypeStat,
} from "~/components/dashboard/types";

interface SelectionProgressProps {
  stats: DashboardTypeStat[];
  selectedCount: number;
  totalCount: number;
  onToggleFamily: (key: ConfigurationTypeKey) => void;
}

export function SelectionProgress({
  stats,
  selectedCount,
  totalCount,
  onToggleFamily,
}: SelectionProgressProps) {
  const visibleStats = stats.filter((stat) => stat.total > 0);
  const overallPercent =
    totalCount > 0 ? Math.round((selectedCount / totalCount) * 100) : 0;

  return (
    <section className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ListChecks
              className="h-[18px] w-[18px] text-teal-700"
              aria-hidden="true"
            />
            <h2 className="text-petrol-950 text-sm font-semibold">
              Selection progress
            </h2>
          </div>
          <p className="text-petrol-600 mt-1.5 text-xs">
            Select entire categories or track export coverage across your
            tenant.
          </p>
        </div>
        <div className="rounded-xl bg-teal-50 px-3 py-2 text-right">
          <p className="text-petrol-950 text-sm font-semibold tabular-nums">
            {selectedCount.toLocaleString()} of {totalCount.toLocaleString()}
          </p>
          <p className="text-petrol-600 text-[10px] font-semibold tracking-[0.08em] uppercase">
            {overallPercent}% selected
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {visibleStats.map((stat) => {
          const percent =
            stat.total > 0 ? Math.round((stat.selected / stat.total) * 100) : 0;
          const allSelected = stat.selected === stat.total;
          const partiallySelected = stat.selected > 0 && !allSelected;

          return (
            <label
              key={stat.key}
              className="group hover:bg-mint-50 focus-within:bg-mint-50 flex min-h-14 cursor-pointer touch-manipulation items-center gap-3 rounded-xl p-2 transition-colors"
            >
              <input
                type="checkbox"
                name={`export-family-${stat.key}`}
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = partiallySelected;
                }}
                onChange={() => onToggleFamily(stat.key)}
                className="checkbox-enhanced checkbox-enhanced--round shrink-0"
                aria-label={`${allSelected ? "Remove" : "Add"} all ${stat.compactLabel} ${allSelected ? "from" : "to"} the export`}
              />
              <span className="min-w-0 flex-1">
                <span className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-petrol-700 truncate text-xs font-medium transition-colors group-hover:text-teal-700">
                    {stat.compactLabel}
                  </span>
                  <span className="text-petrol-600 shrink-0 text-[10px] font-semibold tabular-nums">
                    {stat.selected}/{stat.total}
                  </span>
                </span>
                <span
                  className="bg-mint-100 block h-1.5 overflow-hidden rounded-full"
                  role="progressbar"
                  aria-label={`${stat.label}: ${stat.selected} of ${stat.total} selected`}
                  aria-valuemin={0}
                  aria-valuemax={stat.total}
                  aria-valuenow={stat.selected}
                >
                  <span
                    className="block h-full w-full origin-left rounded-full bg-teal-600 transition-transform duration-300 motion-reduce:transition-none"
                    style={{ transform: `scaleX(${percent / 100})` }}
                  />
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </section>
  );
}
