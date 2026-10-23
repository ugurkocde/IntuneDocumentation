import { BookOpen, ExternalLink } from "lucide-react";
import type { BenchmarkAssessment } from "../../../../../../src/lib/benchmarks/assessment";
import { levelCheckSummary } from "../../../../../../src/lib/benchmarks/display";
import { assessedCount, type ReviewRow } from "../../lib/benchmarks-view";
import { ipc } from "../../lib/ipc";
import { CopyButton } from "../ui/CopyButton";
import { DisclosureSummary } from "../ui/DisclosureSummary";

const TEXT_FIELDS = [
  ["description", "Description"],
  ["impact", "Impact"],
  ["audit", "Audit"],
  ["remediation", "Remediation"],
] as const;

// Recommendations that need a manual check, with the CIS notice and link on
// every view. Titles and text come from the delivered list, in memory only.
export function ManualSection({ assessment, rows }: { assessment: BenchmarkAssessment; rows: readonly ReviewRow[] }) {
  return (
    <section
      aria-labelledby="benchmark-manual-title"
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
          <BookOpen className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Manual check</p>
          <h2 id="benchmark-manual-title" className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
            Recommendations to check by hand
          </h2>
          <p className="text-petrol-600 mt-1 text-xs leading-5">{assessment.manualNote}</p>
        </div>
      </div>

      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs leading-5 text-amber-950">
        <p>{assessment.notice.text}</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <code className="selectable min-w-0 font-mono text-[11px] break-all">{assessment.notice.url}</code>
          <CopyButton value={assessment.notice.url} label="Copy link" showLabel />
          {/* Main opens only its allowlisted copy of this address. */}
          <button
            type="button"
            onClick={() => void ipc.openHelp("cisBenchmarks")}
            className="text-petrol-600 hover:bg-mint-100 hover:text-petrol-950 inline-flex min-h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            Open link
          </button>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {assessment.levels.map((level) => (
          <div key={level.level}>
            <p className="text-petrol-800 text-xs leading-5">
              {levelCheckSummary(level, assessedCount(rows, level.level))}
            </p>
            {level.manual.length > 0 && (
              <ul
                className="divide-petrol-950/6 border-petrol-950/6 mt-2 max-h-96 divide-y overflow-y-auto rounded-xl border px-3"
                aria-label={`Manual recommendations, Level ${level.level}`}
              >
                {level.manual.map((item) => (
                  <li key={item.identifier} className="py-2.5 text-xs leading-5">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="font-mono text-[11px] font-semibold text-teal-700">{item.identifier}</span>
                      <span className="text-petrol-950 min-w-0 font-semibold break-words">
                        {item.title ?? "No title delivered"}
                      </span>
                    </p>
                    {item.hasText && (
                      <details className="text-petrol-700 mt-1">
                        <DisclosureSummary className="text-[11px] font-semibold hover:text-teal-700">
                          Details
                        </DisclosureSummary>
                        <dl className="mt-1.5 space-y-1.5">
                          {TEXT_FIELDS.filter(([field]) => item[field]).map(([field, label]) => (
                            <div key={field}>
                              <dt className="text-petrol-600 text-[9px] font-bold tracking-[0.12em] uppercase">{label}</dt>
                              <dd className="selectable mt-0.5 break-words whitespace-pre-line">{item[field]}</dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
