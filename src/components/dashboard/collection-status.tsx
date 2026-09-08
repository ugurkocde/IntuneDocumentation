"use client";

import {
  CheckCircle2,
  AlertTriangle,
  LoaderCircle,
  RotateCcw,
  X,
} from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
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
  const completed = steps.filter((step) => step.status === "completed").length;
  return createPortal(
    <section
      aria-label="Collection notification"
      className="text-petrol-950 fixed right-4 bottom-4 left-4 z-[1000] max-h-[min(70dvh,560px)] overflow-y-auto rounded-2xl border border-teal-700/20 bg-white p-4 shadow-2xl sm:right-6 sm:bottom-6 sm:left-auto sm:w-[380px]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 pr-6" role="status">
          {loading ? (
            <LoaderCircle className="h-5 w-5 shrink-0 animate-spin text-teal-700 motion-reduce:animate-none" />
          ) : needsRetry ? (
            <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" />
          ) : (
            <CheckCircle2 className="h-5 w-5 shrink-0 text-teal-700" />
          )}
          <div>
            <p className="text-sm font-semibold">
              {loading
                ? "Loading policy details in the background"
                : needsRetry
                  ? "Some categories need another try"
                  : "Your dashboard is up to date"}
            </p>
            <p className="text-petrol-600 mt-0.5 text-xs">
              {count.toLocaleString()} {count === 1 ? "resource" : "resources"}{" "}
              available.{" "}
              {loading
                ? "You can browse while collection continues."
                : needsRetry
                  ? "Successfully loaded categories will be kept."
                  : "Policy collection completed successfully."}
            </p>
          </div>
        </div>
        {!loading && !needsRetry && (
          <button
            type="button"
            aria-label="Dismiss collection notification"
            onClick={() => setSuccess(false)}
            className="text-petrol-600 hover:bg-mint-50 absolute top-2 right-2 grid h-9 w-9 place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {!loading && needsRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white px-3 text-xs font-semibold text-teal-800 focus-visible:outline-2 focus-visible:outline-teal-600"
          >
            <RotateCcw className="h-4 w-4" />
            Retry unfinished categories
          </button>
        )}
      </div>
      {loading && (
        <details className="text-petrol-600 mt-2 text-xs">
          <summary className="cursor-pointer py-1">
            View progress · {completed} of {steps.length} steps ready
          </summary>
          <ul className="mt-2 grid gap-y-2">
            {steps.map((step, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{step.name.replace(/ \(\d+\/\d+\)$/, "")}</span>
                <span>
                  {step.status === "completed"
                    ? "Ready"
                    : step.status === "error"
                      ? "Needs retry"
                      : step.current !== undefined && step.total
                        ? `${step.current} / ${step.total}`
                        : "Loading"}
                </span>
              </li>
            ))}
          </ul>
        </details>
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
