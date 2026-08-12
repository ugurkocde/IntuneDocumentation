"use client";

import { CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

export interface FloatingExportNotificationProps {
  isVisible: boolean;
  isExporting: boolean;
  exportComplete: boolean;
  exportError: string | null;
  overallProgress: number;
  currentStageName: string;
  policyCount: number;
  hasWarnings: boolean;
  onClick: () => void;
  onDismiss: () => void;
}

export function FloatingExportNotification({
  isVisible,
  isExporting,
  exportComplete,
  exportError,
  overallProgress,
  currentStageName,
  policyCount,
  hasWarnings,
  onClick,
  onDismiss,
}: FloatingExportNotificationProps) {
  if (!isVisible) return null;

  const getStatusIcon = () => {
    if (exportError) {
      return <AlertCircle className="h-5 w-5 text-red-600" />;
    }
    if (exportComplete) {
      return hasWarnings ? (
        <AlertCircle className="h-5 w-5 text-amber-600" />
      ) : (
        <CheckCircle2 className="h-5 w-5 text-teal-700" />
      );
    }
    return (
      <Loader2 className="h-5 w-5 animate-spin text-teal-700 motion-reduce:animate-none" />
    );
  };

  const getStatusText = () => {
    if (exportError) return "Export failed";
    if (exportComplete) {
      return hasWarnings ? "Export completed with warnings" : "Export complete";
    }
    return currentStageName;
  };

  const getIconSurface = () => {
    if (exportError) return "bg-red-50";
    if (exportComplete) {
      return hasWarnings ? "bg-amber-50" : "bg-teal-50";
    }
    return "bg-teal-50";
  };

  return (
    <div
      className={`border-petrol-950/8 shadow-soft fixed right-4 bottom-4 left-4 z-50 transform rounded-2xl border bg-white transition-[transform,opacity] duration-300 ease-in-out motion-reduce:transition-none sm:right-6 sm:bottom-6 sm:left-auto sm:w-80 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      }`}
    >
      <div
        onClick={onClick}
        className="hover:bg-mint-50/70 cursor-pointer rounded-2xl p-4 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div
            className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${getIconSurface()}`}
          >
            {getStatusIcon()}
          </div>

          <div className="min-w-0 flex-1">
            <div className="-mt-1 flex items-center justify-between gap-2">
              <p
                className="text-petrol-950 truncate text-sm font-semibold"
                aria-live="polite"
              >
                {getStatusText()}
              </p>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                className="text-petrol-600 hover:bg-mint-100 hover:text-petrol-950 flex h-9 w-9 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-petrol-600 mb-3 text-xs">
              {policyCount} {policyCount === 1 ? "policy" : "policies"}
            </p>

            {isExporting && (
              <div className="space-y-1.5">
                <div className="text-petrol-600 flex items-center justify-between text-xs">
                  <span>Progress</span>
                  <span className="text-petrol-800 font-semibold tabular-nums">
                    {overallProgress}%
                  </span>
                </div>
                <div className="bg-mint-100 h-1.5 w-full overflow-hidden rounded-full">
                  <div
                    className="h-1.5 rounded-full bg-teal-600 transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
            )}

            {!isExporting && (
              <p className="text-petrol-600 mt-1 text-xs">
                Click to view details
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
