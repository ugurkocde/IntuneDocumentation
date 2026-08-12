import { ChartNoAxesColumnIncreasing } from "lucide-react";
import type { DashboardTypeStat } from "~/components/dashboard/types";

const PALETTE = [
  "#082f36",
  "#26777c",
  "#318990",
  "#45a0a5",
  "#9fc9cc",
  "#dceff0",
];

interface DonutSegment {
  label: string;
  value: number;
  color: string;
  percent: number;
}

interface TypeDonutProps {
  stats: DashboardTypeStat[];
  total: number;
}

function getSegments(
  stats: DashboardTypeStat[],
  total: number,
): DonutSegment[] {
  const sorted = stats
    .filter((stat) => stat.total > 0)
    .sort((a, b) => b.total - a.total);
  const top = sorted.slice(0, 5);
  const otherValue = sorted.slice(5).reduce((sum, stat) => sum + stat.total, 0);
  const values = otherValue
    ? [
        ...top.map(({ label, total: value }) => ({ label, value })),
        { label: "Other", value: otherValue },
      ]
    : top.map(({ label, total: value }) => ({ label, value }));

  return values.map((segment, index) => ({
    ...segment,
    color: PALETTE[index] ?? PALETTE[PALETTE.length - 1]!,
    percent: total > 0 ? (segment.value / total) * 100 : 0,
  }));
}

export function TypeDonut({ stats, total }: TypeDonutProps) {
  const segments = getSegments(stats, total);
  let runningOffset = 0;

  return (
    <section className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <ChartNoAxesColumnIncreasing className="h-[18px] w-[18px] text-teal-700" />
        <h2 className="text-petrol-950 text-sm font-semibold">
          By configuration type
        </h2>
      </div>

      <div className="mt-5 grid items-center gap-6 sm:grid-cols-[minmax(150px,0.8fr)_minmax(0,1.2fr)]">
        <div className="relative mx-auto aspect-square w-full max-w-52">
          <svg
            viewBox="0 0 120 120"
            role="img"
            aria-label={`${total.toLocaleString()} configurations across ${segments.length.toLocaleString()} chart categories`}
            className="h-full w-full -rotate-90"
          >
            <circle
              cx="60"
              cy="60"
              r="45"
              pathLength="100"
              fill="none"
              stroke="#e7eeec"
              strokeWidth="13"
            />
            {segments.map((segment) => {
              const dash = Math.max(segment.percent - 1.1, 0);
              const offset = -runningOffset;
              runningOffset += segment.percent;
              return (
                <circle
                  key={segment.label}
                  cx="60"
                  cy="60"
                  r="45"
                  pathLength="100"
                  fill="none"
                  stroke={segment.color}
                  strokeWidth="13"
                  strokeLinecap="round"
                  strokeDasharray={`${dash} ${100 - dash}`}
                  strokeDashoffset={offset}
                />
              );
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-petrol-600 text-[10px] font-semibold tracking-[0.1em] uppercase">
              Total
            </span>
            <span className="text-petrol-950 mt-1 text-2xl font-semibold tracking-[-0.045em] tabular-nums">
              {total.toLocaleString()}
            </span>
          </div>
        </div>

        <ul className="space-y-2.5" aria-label="Configuration type totals">
          {segments.length > 0 ? (
            segments.map((segment) => (
              <li
                key={segment.label}
                className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-2 text-xs"
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: segment.color }}
                  aria-hidden="true"
                />
                <span className="text-petrol-700 truncate">
                  {segment.label}
                </span>
                <span className="text-petrol-600 tabular-nums">
                  {segment.value.toLocaleString()}
                </span>
                <span className="text-petrol-950 w-9 text-right font-semibold tabular-nums">
                  {Math.round(segment.percent)}%
                </span>
              </li>
            ))
          ) : (
            <li className="text-petrol-600 text-sm">
              No configuration data available yet.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
