"use client";

import {
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  RotateCcw,
  X,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState, useId } from "react";
import type { CollectionStep } from "~/lib/collection-progress";

export function CollectionStatus({
  loading,
  steps,
  count,
  retryAvailable,
  incomplete = false,
  onRetry,
}: {
  loading: boolean;
  steps: CollectionStep[];
  count: number;
  retryAvailable: boolean;
  incomplete?: boolean;
  onRetry: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const panelId = useId();
  const [success, setSuccess] = useState(false);
  const wasLoading = useRef(false);
  const needsRetry = retryAvailable || incomplete;
  useEffect(() => {
    if (loading) {
      wasLoading.current = true;
      setSuccess(false);
      return;
    }
    if (!wasLoading.current) return;
    wasLoading.current = false;
    if (needsRetry) return;
    setSuccess(true);
    const timer = window.setTimeout(() => setSuccess(false), 6000);
    return () => window.clearTimeout(timer);
  }, [loading, needsRetry]);
  if (typeof document === "undefined" || (!loading && !needsRetry && !success))
    return null;
  const completed = steps.filter((step) => step.status === "completed");
  const remaining = steps.filter((step) => step.status !== "completed");
  const cleanName = (name: string) => name.replace(/ \(\d+\/\d+\)$/, "");
  return createPortal(
    <section
      aria-label="Collection notification"
      className="text-petrol-950 border-petrol-950/10 fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] left-4 z-[1000] overflow-hidden rounded-2xl border bg-white shadow-[0_12px_48px_-12px_rgba(8,47,54,0.3)] sm:right-6 sm:bottom-6 sm:left-auto sm:w-[360px]"
    >
      <div className="flex items-start gap-3 p-4">
        <span
          aria-hidden="true"
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${needsRetry && !loading ? "bg-amber-50 text-amber-700" : "bg-teal-50 text-teal-700"}`}
        >
          {loading ? (
            <LoaderCircle className="h-5 w-5 motion-safe:animate-spin" />
          ) : needsRetry ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <CheckCircle2 className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0 flex-1" role="status">
          <p className="text-sm leading-5 font-semibold">
            {loading
              ? "Updating your dashboard"
              : needsRetry
                ? "Some data needs another try"
                : "Your dashboard is up to date"}
          </p>
          <p className="text-petrol-600 mt-1 text-xs leading-5">
            <span className="font-semibold tabular-nums">
              {count.toLocaleString()}
            </span>{" "}
            {count === 1 ? "resource" : "resources"}{" "}
            {loading ? "loaded this collection" : "ready to browse"}
          </p>
        </div>
        {loading ? (
          <button
            type="button"
            aria-label={
              expanded
                ? "Minimize collection details"
                : "Expand collection details"
            }
            aria-expanded={expanded}
            aria-controls={panelId}
            onClick={() => setExpanded((value) => !value)}
            className="hover:bg-mint-50 text-petrol-600 -mt-1 -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            {expanded ? (
              <ChevronDown aria-hidden="true" className="h-4 w-4" />
            ) : (
              <ChevronUp aria-hidden="true" className="h-4 w-4" />
            )}
          </button>
        ) : (
          !needsRetry && (
            <button
              type="button"
              aria-label="Dismiss collection notification"
              onClick={() => setSuccess(false)}
              className="hover:bg-mint-50 text-petrol-600 -mt-1 -mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )
        )}
      </div>
      {loading && (
        <>
          <div className="px-4 pb-3">
            <div className="text-petrol-600 mb-2 flex items-center justify-between text-[11px] leading-4">
              <span className="tabular-nums">
                {completed.length} of {steps.length} steps ready
              </span>
              <span>
                {remaining.length
                  ? `${remaining.length} remaining`
                  : "Finishing up…"}
              </span>
            </div>
            <div
              role="progressbar"
              aria-label="Collection steps completed"
              aria-valuemin={0}
              aria-valuemax={Math.max(steps.length, 1)}
              aria-valuenow={completed.length}
              aria-valuetext={`${completed.length} of ${steps.length} steps ready`}
              className="flex gap-1"
            >
              {steps.map((step, index) => (
                <span
                  key={index}
                  aria-hidden="true"
                  className={`h-1 flex-1 rounded-full ${step.status === "completed" ? "bg-teal-600" : step.status === "error" ? "bg-amber-500" : "bg-petrol-950/10"}`}
                />
              ))}
            </div>
          </div>
          <div
            id={panelId}
            hidden={!expanded}
            className="border-petrol-950/6 max-h-[min(45dvh,320px)] overflow-y-auto overscroll-contain border-t"
          >
            {remaining.length > 0 && (
              <ul aria-label="Unfinished categories" className="space-y-2 p-3">
                {remaining.map((step, index) => (
                  <li
                    key={index}
                    className={`rounded-xl px-3 py-2.5 ${step.status === "error" ? "bg-amber-50" : "bg-mint-50"}`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 text-xs leading-5 font-semibold break-words">
                        {cleanName(step.name)}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] font-semibold ${step.status === "error" ? "text-amber-800" : "text-teal-700"}`}
                      >
                        {step.status === "error"
                          ? "Needs retry"
                          : step.status === "pending"
                            ? "Queued"
                            : "Loading…"}
                      </span>
                    </div>
                    {step.total !== undefined &&
                      step.total > 0 &&
                      step.current !== undefined && (
                        <p className="text-petrol-600 mt-1 text-[11px] tabular-nums">
                          Batch {step.current.toLocaleString()} of{" "}
                          {step.total.toLocaleString()}
                        </p>
                      )}
                  </li>
                ))}
              </ul>
            )}
            {completed.length > 0 && (
              <details className="group border-petrol-950/6 border-t px-4">
                <summary className="text-petrol-600 flex min-h-10 cursor-pointer list-none items-center gap-2 text-[11px] font-medium hover:text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600">
                  <Check
                    aria-hidden="true"
                    className="h-3.5 w-3.5 text-teal-700"
                  />
                  {completed.length} completed
                  <ChevronDown
                    aria-hidden="true"
                    className="ml-auto h-3.5 w-3.5 group-open:rotate-180"
                  />
                </summary>
                <ul
                  aria-label="Completed categories"
                  className="space-y-2 pb-3"
                >
                  {completed.map((step, index) => (
                    <li
                      key={index}
                      className="text-petrol-600 flex items-start gap-2 text-[11px] leading-4"
                    >
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 h-3 w-3 shrink-0 text-teal-700"
                      />
                      <span className="break-words">
                        {cleanName(step.name)}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </>
      )}
      {!loading && needsRetry && (
        <div className="border-petrol-950/6 border-t px-4 py-3">
          <p className="text-petrol-600 mb-2 text-xs leading-5">
            Loaded data is kept. Retry only what is unfinished.
          </p>
          <button
            type="button"
            onClick={onRetry}
            className="bg-petrol-950 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl px-3 text-xs font-semibold text-white hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          >
            <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
            Retry unfinished categories
          </button>
        </div>
      )}
    </section>,
    document.body,
  );
}

export function CollectionPlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section
      aria-busy="true"
      className="border-petrol-950/6 rounded-2xl border bg-white p-6"
    >
      <p className="text-petrol-950 text-sm font-semibold">{title}</p>
      <p className="text-petrol-600 mt-1 text-sm">{description}</p>
      <div
        className="mt-5 space-y-3 motion-safe:animate-pulse"
        aria-hidden="true"
      >
        {["w-3/4", "w-full", "w-5/6"].map((width) => (
          <div key={width} className={`bg-mint-50 h-10 rounded-xl ${width}`} />
        ))}
      </div>
    </section>
  );
}
