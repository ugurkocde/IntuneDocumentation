import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../../state/context";
import { collectBlocker } from "../../state/selectors";
import { CollectionStepsList } from "./CollectionStepsList";

export function CollectionStatusToast() {
  const { state, dispatch, actions } = useApp();
  const { collection } = state;
  const { toast, steps } = collection;
  const [expanded, setExpanded] = useState(true);
  const panelId = useId();

  useEffect(() => {
    if (toast !== "success") return;
    const timer = window.setTimeout(() => dispatch({ type: "toast", toast: "hidden" }), 6000);
    return () => window.clearTimeout(timer);
  }, [toast, dispatch]);

  if (toast === "hidden") return null;
  const loading = toast === "running";
  const completed = steps.filter((step) => step.status === "completed").length;
  const remaining = steps.length - completed;
  const summary = collection.summary;
  const warnings = summary ? summary.fetchErrors.length + summary.permissionErrors.length : 0;
  const dismiss = () => dispatch({ type: "toast", toast: "hidden" });
  const count = loading ? collection.loaded : (summary?.totalConfigurations ?? 0);
  const title = loading
    ? collection.cancelling
      ? "Cancelling the collection"
      : "Collecting your tenant"
    : toast === "success"
      ? "Your workspace is up to date"
      : toast === "warning"
        ? "Collected with warnings"
        : "The collection did not finish";
  const retryBlocker = collectBlocker(state);

  return createPortal(
    <section
      aria-label="Collection status"
      className="text-petrol-950 border-petrol-950/10 animate-fade-in-up fixed right-6 bottom-6 z-[1000] w-[360px] overflow-hidden rounded-2xl border bg-white shadow-[0_12px_48px_-12px_rgba(8,47,54,0.3)]"
    >
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
            toast === "warning" || toast === "error" ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"
          }`}
        >
          {loading ? (
            <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" />
          ) : toast === "success" ? (
            <CheckCircle2 className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1" role="status" aria-live="polite">
          <p className="text-sm leading-5 font-semibold">{title}</p>
          <p className="text-petrol-600 mt-1 text-xs leading-5">
            {toast === "error" ? (
              collection.error
            ) : (
              <>
                <span className="font-semibold tabular-nums">{count.toLocaleString()}</span>{" "}
                {count === 1 ? "item" : "items"} {loading ? "loaded so far" : "ready to browse"}
                {toast === "warning" && `, ${warnings} ${warnings === 1 ? "warning" : "warnings"}`}
              </>
            )}
          </p>
        </div>
        {loading ? (
          <button
            type="button"
            aria-label={expanded ? "Minimize collection details" : "Expand collection details"}
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
            className="hover:bg-mint-50 text-petrol-600 -mt-1 -mr-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            {expanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronUp aria-hidden="true" className="h-4 w-4" />}
          </button>
        ) : (
          <button
            type="button"
            aria-label="Dismiss collection notification"
            onClick={dismiss}
            className="hover:bg-mint-50 text-petrol-600 -mt-1 -mr-1 grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        )}
      </div>

      {loading && (
        <>
          <div className="px-4 pb-3">
            <div className="text-petrol-600 mb-2 flex items-center justify-between text-[11px] leading-4">
              <span className="tabular-nums">
                {completed} of {steps.length} steps ready
              </span>
              <span>{remaining ? `${remaining} remaining` : "Finishing up"}</span>
            </div>
            <div
              role="progressbar"
              aria-label="Collection steps completed"
              aria-valuemin={0}
              aria-valuemax={steps.length}
              aria-valuenow={completed}
              aria-valuetext={`${completed} of ${steps.length} steps ready`}
              className="flex gap-1"
            >
              {steps.map((step) => (
                <span
                  key={step.key}
                  aria-hidden="true"
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    step.status === "completed"
                      ? "bg-teal-600"
                      : step.status === "error"
                        ? "bg-amber-500"
                        : "bg-petrol-950/10"
                  }`}
                />
              ))}
            </div>
          </div>
          <div
            id={panelId}
            hidden={!expanded}
            className="border-petrol-950/6 max-h-[min(40vh,300px)] overflow-y-auto overscroll-contain border-t"
          >
            <CollectionStepsList steps={steps} />
          </div>
        </>
      )}

      {toast === "warning" && (
        <div className="border-petrol-950/6 flex gap-2 border-t px-4 py-3">
          <button
            type="button"
            onClick={() => {
              actions.navigate("overview");
              dismiss();
              window.setTimeout(() => document.getElementById("collection-warnings")?.scrollIntoView({ behavior: "smooth" }), 50);
            }}
            className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-xl px-3 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            Review warnings
          </button>
        </div>
      )}
      {toast === "error" && (
        <div className="border-petrol-950/6 border-t px-4 py-3">
          <button
            type="button"
            disabled={Boolean(retryBlocker)}
            title={retryBlocker ?? undefined}
            onClick={() => void actions.collect()}
            className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-45"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Collect again
          </button>
          {retryBlocker && <p className="mt-2 text-[11px] text-amber-800">{retryBlocker}</p>}
        </div>
      )}
    </section>,
    document.body,
  );
}
