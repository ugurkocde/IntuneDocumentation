"use client";

import { AlertCircle, Info, Shield, X } from "lucide-react";
import type { FetchError, PermissionError } from "~/components/dashboard/types";

interface DashboardBannersProps {
  showTip: boolean;
  permissionErrors: PermissionError[];
  fetchErrors: FetchError[];
  onDismissTip: () => void;
}

export function DashboardBanners({
  showTip,
  permissionErrors,
  fetchErrors,
  onDismissTip,
}: DashboardBannersProps) {
  return (
    <div className="space-y-3">
      {showTip && (
        <aside className="flex items-start gap-3 rounded-2xl border border-teal-600/20 bg-teal-50 p-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
            <Info className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-petrol-950 text-sm font-semibold">
              Start with the policies that matter most
            </p>
            <p className="text-petrol-700 mt-1 text-xs leading-5">
              Select policies with the checkboxes, then export a complete PDF or
              Word report. Search and type views help you narrow the list.
            </p>
          </div>
          <button
            type="button"
            onClick={onDismissTip}
            className="text-petrol-600 hover:text-petrol-950 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            aria-label="Dismiss tip"
          >
            <X className="h-4 w-4" />
          </button>
        </aside>
      )}

      {permissionErrors.length > 0 && (
        <aside className="rounded-2xl border border-amber-600/20 bg-amber-50/80 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700">
              <Shield className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950">
                Limited permissions detected
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                Some configuration types could not be retrieved. Ask a tenant
                administrator to grant the following permissions.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-amber-950/85">
                {permissionErrors.map((error) => (
                  <li
                    key={`${error.resource}-${error.requiredPermission}`}
                    className="flex items-start gap-2"
                  >
                    <span aria-hidden="true">•</span>
                    <span>
                      <strong>{error.resource}:</strong> Requires{" "}
                      {error.requiredPermission}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      )}

      {fetchErrors.length > 0 && (
        <aside className="rounded-2xl border border-orange-600/20 bg-orange-50/80 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-orange-700">
              <AlertCircle className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-orange-950">
                {fetchErrors.length}{" "}
                {fetchErrors.length === 1 ? "policy" : "policies"} could not be
                fully loaded
              </p>
              <p className="mt-1 text-xs leading-5 text-orange-900/80">
                These policies remain visible, but some settings may be missing
                from exports because the API did not return their complete data.
              </p>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-orange-950 underline decoration-orange-600/30 underline-offset-2 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none">
                  View affected policies
                </summary>
                <ul className="mt-2 space-y-2">
                  {fetchErrors.map((error) => (
                    <li
                      key={`${error.policyId}-${error.policyName}`}
                      className="rounded-xl border border-orange-600/15 bg-white p-3 text-xs text-orange-950/85"
                    >
                      <strong>{error.policyType}:</strong> {error.policyName}
                      <span className="mt-1 block text-[11px] text-orange-800">
                        {error.error}
                      </span>
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}
