import type { LevelSummary, ResultState } from "../../../../../../src/lib/benchmarks/assessment";
import {
  READINESS_DISCLAIMER,
  REASON_LABELS,
  RESULT_LABELS,
  coverageStatement,
  exclusionsText,
  formatRate,
  headlineLabel,
} from "../../../../../../src/lib/benchmarks/display";
import { reasonCounts, type ReviewRow } from "../../lib/benchmarks-view";

const RESULT_STYLES: Record<ResultState, { chip: string; dot: string }> = {
  Pass: { chip: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  Fail: { chip: "bg-red-50 text-red-800", dot: "bg-red-600" },
  Review: { chip: "bg-amber-50 text-amber-800", dot: "bg-amber-600" },
  "Not assessed": { chip: "bg-mint-100 text-petrol-700", dot: "bg-petrol-600" },
};

export function ResultChip({ result, label }: { result: ResultState; label?: string }) {
  const style = RESULT_STYLES[result];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold whitespace-nowrap ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {label ?? RESULT_LABELS[result]}
    </span>
  );
}

function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

// Needs review or Not assessed of one Level with the reasons, never hidden.
function OutsideRate({ rows, result }: { rows: readonly ReviewRow[]; result: "Review" | "Not assessed" }) {
  const reasons = reasonCounts(rows, result);
  const total = reasons.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-2">
        <ResultChip result={result} />
        <span className="text-petrol-950 text-sm font-semibold tabular-nums">{total.toLocaleString()}</span>
      </p>
      {reasons.length > 0 && (
        <ul className="text-petrol-600 mt-1.5 space-y-1 text-[11px] leading-4">
          {reasons.map(({ reason, count }) => (
            <li key={reason ?? "none"} className="flex gap-1.5">
              <span className="text-petrol-800 shrink-0 font-semibold tabular-nums">{count.toLocaleString()}</span>
              <span className="min-w-0 break-words">
                {reason ? REASON_LABELS[reason] : "No reason was given for these results."}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// The headline of each Level: Matches out of Matches plus Differs, or n/a when
// nothing was assessed. Needs review and Not assessed are counted next to it.
export function LevelHeadlines({
  levels,
  rows,
}: {
  levels: readonly LevelSummary[];
  rows: readonly ReviewRow[];
}) {
  return (
    <div className={`grid gap-4 ${levels.length > 1 ? "@4xl:grid-cols-2" : ""}`} aria-label="Headline per Level">
      {levels.map((level) => {
        const { headline } = level;
        const own = rows.filter((row) => row.level === level.level);
        const assessed = headline.counts.pass + headline.counts.fail;
        const exclusions = exclusionsText(headline);
        return (
          <section
            key={level.level}
            aria-labelledby={`benchmark-level-${level.level}`}
            className="border-petrol-950/6 shadow-card flex flex-col rounded-2xl border bg-white p-5 @xl:p-6"
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3
                id={`benchmark-level-${level.level}`}
                className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase"
              >
                Level {level.level}
              </h3>
              <span className="text-petrol-600 text-[11px] font-medium">{headlineLabel(headline.basis)}</span>
            </div>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-petrol-950 text-3xl font-semibold tracking-[-0.04em] tabular-nums">
                {headline.rate === null ? "n/a" : formatRate(headline.rate)}
              </span>
              <span className="text-petrol-700 text-sm tabular-nums">
                {headline.rate === null
                  ? "Nothing could be assessed as Matches or Differs."
                  : `${headline.counts.pass.toLocaleString()} ${RESULT_LABELS.Pass} out of ${plural(
                      assessed,
                      "result",
                      "results",
                    )} (${RESULT_LABELS.Pass} plus ${RESULT_LABELS.Fail})`}
              </span>
            </p>
            <p className="mt-1.5 text-xs font-semibold text-teal-700">{READINESS_DISCLAIMER}</p>
            {exclusions && <p className="text-petrol-700 mt-1 text-xs">{exclusions}</p>}
            <div className="border-petrol-950/6 mt-4 grid gap-4 border-t pt-4 @xl:grid-cols-2">
              <OutsideRate rows={own} result="Review" />
              <OutsideRate rows={own} result="Not assessed" />
            </div>
            <p className="text-petrol-600 mt-4 text-[11px] leading-5">
              {RESULT_LABELS.Review} and {RESULT_LABELS["Not assessed"]} never lower the headline.{" "}
              {coverageStatement(level)}
            </p>
          </section>
        );
      })}
    </div>
  );
}
