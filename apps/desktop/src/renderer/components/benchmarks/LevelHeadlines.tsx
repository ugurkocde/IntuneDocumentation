import { Info } from "lucide-react";
import type { BenchmarkLevel, LevelSummary, ResultState } from "../../../../../../src/lib/benchmarks/assessment";
import {
  LEVEL_2_NOTE,
  NEEDS_REVIEW_NOTE,
  REASON_LABELS,
  RESULT_LABELS,
  SETTINGS_BASIS_NOTE,
  coverageStatement,
  exclusionsText,
  formatRate,
  headlineBaseText,
  headlineLabel,
  rateIsHero,
} from "../../../../../../src/lib/benchmarks/display";
import { NOT_CONFIGURED } from "../../../../../../src/lib/benchmarks/values";
import { ROW_STATES, reasonCounts, type ReviewRow, type RowState } from "../../lib/benchmarks-view";

const RESULT_STYLES: Record<ResultState, { chip: string; dot: string }> = {
  Pass: { chip: "bg-emerald-50 text-emerald-800", dot: "bg-emerald-600" },
  Fail: { chip: "bg-red-50 text-red-800", dot: "bg-red-600" },
  Review: { chip: "bg-amber-50 text-amber-800", dot: "bg-amber-600" },
  "Not assessed": { chip: "bg-mint-100 text-petrol-700", dot: "bg-petrol-600" },
};

// The five states with their labels, always all of them so the cards of two
// Levels line up (stateCounts leaves out a zero Not configured).
export const STATE_LABELS: Readonly<Record<RowState, string>> = {
  matches: RESULT_LABELS.Pass,
  differs: RESULT_LABELS.Fail,
  notConfigured: NOT_CONFIGURED,
  needsReview: RESULT_LABELS.Review,
  notAssessed: RESULT_LABELS["Not assessed"],
};

const STATE_RESULT: Record<RowState, ResultState> = {
  matches: "Pass",
  differs: "Fail",
  notConfigured: "Fail",
  needsReview: "Review",
  notAssessed: "Not assessed",
};

export function ResultChip({ result, label }: { result: ResultState; label?: string }) {
  const style = RESULT_STYLES[result];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] leading-4 font-bold whitespace-nowrap ${style.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot}`} aria-hidden="true" />
      {label ?? RESULT_LABELS[result]}
    </span>
  );
}

// Needs review or Not assessed of one Level with the reasons, never hidden.
function OutsideRate({ rows, result }: { rows: readonly ReviewRow[]; result: "Review" | "Not assessed" }) {
  const reasons = reasonCounts(rows, result);
  if (!reasons.length) return null;
  return (
    <div className="min-w-0">
      <p className="text-petrol-800 text-[11px] font-semibold">{RESULT_LABELS[result]}, by reason</p>
      <ul className="text-petrol-600 mt-1 space-y-1 text-[11px] leading-4">
        {reasons.map(({ reason, count }) => (
          <li key={reason ?? "none"} className="flex gap-1.5">
            <span className="text-petrol-800 w-6 shrink-0 text-right font-semibold tabular-nums">
              {count.toLocaleString()}
            </span>
            <span className="min-w-0 break-words">
              {reason ? REASON_LABELS[reason] : "No reason was given for these results."}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

// The headline of each Level. The per state counts lead; the rate (Matches
// out of the assessed results) is the hero only where rateIsHero allows it,
// and it always carries its base. Each count opens the list on that state.
export function LevelHeadlines({
  levels,
  rows,
  compared,
  onShow,
}: {
  levels: readonly LevelSummary[];
  rows: readonly ReviewRow[];
  // The compared Level: comparing Level 2 shows Level 1 too.
  compared: BenchmarkLevel;
  onShow: (state: RowState, level: BenchmarkLevel) => void;
}) {
  const notes = [
    ...(compared === 2 && levels.length > 1 ? [LEVEL_2_NOTE] : []),
    ...(levels.some((level) => level.headline.basis === "settings") ? [SETTINGS_BASIS_NOTE] : []),
    NEEDS_REVIEW_NOTE,
  ];
  return (
    <section aria-label="Headline per Level" className="space-y-3">
      <div className={`grid gap-4 ${levels.length > 1 ? "@4xl:grid-cols-2" : ""}`}>
        {levels.map((level) => {
          const { headline } = level;
          const own = rows.filter((row) => row.level === level.level);
          const exclusions = exclusionsText(headline);
          const hero = headline.rate !== null && rateIsHero(headline.states);
          return (
            <section
              key={level.level}
              aria-labelledby={`benchmark-level-${level.level}`}
              className="border-petrol-950/6 shadow-card @container flex flex-col rounded-2xl border bg-white p-5 @xl:p-6"
            >
              <h3
                id={`benchmark-level-${level.level}`}
                className="text-petrol-600 text-[11px] font-bold tracking-[0.14em] uppercase"
              >
                Level {level.level}
              </h3>
              {hero ? (
                <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="text-petrol-950 text-3xl font-semibold tracking-[-0.04em] tabular-nums">
                    {formatRate(headline.rate)}
                  </span>
                  <span className="text-petrol-700 text-sm tabular-nums">{headlineBaseText(headline.counts)}</span>
                  <span className="text-petrol-600 basis-full text-xs">{headlineLabel(headline.basis)}</span>
                </p>
              ) : (
                <div className="mt-2">
                  <p className="text-petrol-950 text-lg font-semibold tracking-[-0.02em] tabular-nums">
                    {headline.rate === null
                      ? "No rate"
                      : `${formatRate(headline.rate)} ${headlineBaseText(headline.counts)}`}
                  </p>
                  <p className="text-petrol-600 mt-0.5 text-xs leading-5">
                    {headline.rate === null
                      ? `${headlineLabel(headline.basis)}: nothing could be assessed as Matches or Differs.`
                      : `${headlineLabel(headline.basis)}. Too few results could be assessed for the rate to lead, so the counts below say more.`}
                  </p>
                </div>
              )}
              {exclusions && <p className="text-petrol-700 mt-1 text-xs tabular-nums">{exclusions}</p>}
              <ul className="mt-4 flex flex-wrap gap-2" aria-label={`Results of Level ${level.level}`}>
                {ROW_STATES.map((state) => {
                  const count = headline.states[state];
                  const label = STATE_LABELS[state];
                  const style = RESULT_STYLES[STATE_RESULT[state]];
                  const body = (
                    <>
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${count ? style.dot : "bg-petrol-600"}`}
                        aria-hidden="true"
                      />
                      {label}
                      <span className="text-sm font-bold tabular-nums">{count.toLocaleString()}</span>
                    </>
                  );
                  const chip = "inline-flex min-h-8 items-center gap-2 rounded-full px-3 text-xs font-semibold";
                  // A zero opens nothing, so it is a count, not a button.
                  return (
                    <li key={state}>
                      {count === 0 ? (
                        <span className={`${chip} bg-mint-100 text-petrol-700`}>{body}</span>
                      ) : (
                        <button
                          type="button"
                          aria-label={`${label}: ${count.toLocaleString()}. Show in the list`}
                          onClick={() => onShow(state, level.level)}
                          className={`${chip} cursor-pointer transition-[filter] hover:brightness-95 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none ${style.chip}`}
                        >
                          {body}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {(own.some((row) => row.result === "Review") || own.some((row) => row.result === "Not assessed")) && (
                <div className="border-petrol-950/6 mt-4 grid gap-4 border-t pt-4 @xl:grid-cols-2">
                  <OutsideRate rows={own} result="Review" />
                  <OutsideRate rows={own} result="Not assessed" />
                </div>
              )}
              <p className="text-petrol-600 mt-4 text-[11px] leading-5">
                {RESULT_LABELS.Review} and {RESULT_LABELS["Not assessed"]} never lower the headline.{" "}
                {coverageStatement(level)}
              </p>
            </section>
          );
        })}
      </div>
      <ul className="text-petrol-700 max-w-3xl space-y-1.5 text-xs leading-5" aria-label="About these results">
        {notes.map((note) => (
          <li key={note} className="flex items-start gap-2">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700" aria-hidden="true" />
            <span className="min-w-0">{note}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
