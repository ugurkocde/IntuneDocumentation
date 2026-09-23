import { Check, ChevronDown } from "lucide-react";
import type { CollectionStep } from "../../lib/collection-steps";

export function CollectionStepsList({ steps }: { steps: CollectionStep[] }) {
  const completed = steps.filter((step) => step.status === "completed");
  const remaining = steps.filter((step) => step.status !== "completed");
  return (
    <>
      {remaining.length > 0 && (
        <ul aria-label="Unfinished categories" className="space-y-1.5 p-3">
          {remaining.map((step) => (
            <li
              key={step.key}
              className={`rounded-xl px-3 py-2.5 ${step.status === "error" ? "bg-amber-50" : "bg-mint-50"}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-xs leading-5 font-semibold">{step.label}</span>
                <span
                  className={`shrink-0 text-[10px] font-semibold ${step.status === "error" ? "text-amber-800" : "text-teal-700"}`}
                >
                  {step.status === "error"
                    ? "Incomplete"
                    : step.status === "pending"
                      ? "Queued"
                      : "Loading"}
                </span>
              </div>
              {step.status === "loading" && step.total !== undefined && step.total > 0 && step.current !== undefined && (
                <p className="text-petrol-600 mt-1 text-[11px] tabular-nums">
                  Batch {step.current.toLocaleString()} of {step.total.toLocaleString()}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {completed.length > 0 && (
        <details className="group border-petrol-950/6 border-t px-4">
          <summary className="text-petrol-600 flex min-h-10 cursor-pointer list-none items-center gap-2 text-[11px] font-medium hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600">
            <Check aria-hidden="true" className="h-3.5 w-3.5 text-teal-700" />
            {completed.length} completed
            <ChevronDown aria-hidden="true" className="ml-auto h-3.5 w-3.5 transition-transform group-open:rotate-180" />
          </summary>
          <ul aria-label="Completed categories" className="space-y-2 pb-3">
            {completed.map((step) => (
              <li key={step.key} className="text-petrol-600 flex items-start gap-2 text-[11px] leading-4">
                <Check aria-hidden="true" className="mt-0.5 h-3 w-3 shrink-0 text-teal-700" />
                <span>{step.label}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </>
  );
}
