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
      return <AlertCircle className="w-5 h-5 text-red-600" />;
    }
    if (exportComplete) {
      return hasWarnings ? (
        <AlertCircle className="w-5 h-5 text-yellow-600" />
      ) : (
        <CheckCircle2 className="w-5 h-5 text-green-600" />
      );
    }
    return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
  };

  const getStatusText = () => {
    if (exportError) return "Export failed";
    if (exportComplete) {
      return hasWarnings ? "Export completed with warnings" : "Export complete";
    }
    return currentStageName;
  };

  const getStatusColor = () => {
    if (exportError) return "bg-red-50 border-red-200";
    if (exportComplete) {
      return hasWarnings ? "bg-yellow-50 border-yellow-200" : "bg-green-50 border-green-200";
    }
    return "bg-white border-slate-200";
  };

  return (
    <div
      className={`fixed bottom-6 right-6 w-80 rounded-lg border-2 shadow-lg transition-all duration-300 ease-in-out transform ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
      } ${getStatusColor()} z-50`}
    >
      <div
        onClick={onClick}
        className="cursor-pointer p-4 hover:bg-opacity-80 transition-colors"
      >
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">{getStatusIcon()}</div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {getStatusText()}
              </p>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDismiss();
                }}
                className="flex-shrink-0 p-1 hover:bg-slate-200 rounded transition-colors"
                aria-label="Dismiss notification"
              >
                <X className="w-4 h-4 text-slate-600" />
              </button>
            </div>

            <p className="text-xs text-slate-600 mb-2">
              {policyCount} {policyCount === 1 ? "policy" : "policies"}
            </p>

            {isExporting && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span>Progress</span>
                  <span className="font-medium">{overallProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>
            )}

            {!isExporting && (
              <p className="text-xs text-slate-500 mt-1">
                Click to view details
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
