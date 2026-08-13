"use client";

import {
  AlertCircle,
  CheckCircle2,
  Download,
  File,
  FileText,
  Loader2,
  X,
} from "lucide-react";
import { Button } from "~/components/ui/button";

export type ExportFormat = "pdf-detailed" | "docx";

export interface ExportStage {
  name: string;
  status: "pending" | "active" | "completed";
  progress: number; // 0-100
}

export interface PolicyExportError {
  policyType: string;
  policyName: string;
  error: string;
}

export interface ExportConfig {
  selectedCount: number;
  policyTypes: { name: string; count: number }[];
  collectionWarningCount: number;
}

export interface ExportResult {
  success: boolean;
  error?: string;
  exportErrors?: PolicyExportError[];
  totalPolicies?: number;
  successfulPolicies?: number;
  downloadData?: {
    blob: Blob;
    filename: string;
  };
}

export interface ExportState {
  selectedFormat: ExportFormat;
  isExporting: boolean;
  exportComplete: boolean;
  exportError: string | null;
  exportErrors: PolicyExportError[];
  exportStats: { total: number; successful: number } | null;
  currentStage: number;
  overallProgress: number;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMinimize?: () => void;
  onExport: (format: ExportFormat) => Promise<ExportResult>;
  config: ExportConfig;
  state: ExportState;
  onStateChange: (state: Partial<ExportState>) => void;
}

export function ExportModal({
  isOpen,
  onClose,
  onMinimize,
  onExport,
  config,
  state,
  onStateChange,
}: ExportModalProps) {
  const {
    selectedFormat,
    isExporting,
    exportComplete,
    exportError,
    exportErrors,
    exportStats,
    currentStage,
    overallProgress,
  } = state;

  const stages: ExportStage[] = [
    { name: "Preparing export data…", status: "pending", progress: 0 },
    { name: "Resolving group names…", status: "pending", progress: 0 },
    { name: "Fetching device counts…", status: "pending", progress: 0 },
    { name: "Generating document…", status: "pending", progress: 0 },
    { name: "Starting download…", status: "pending", progress: 0 },
  ];

  const handleClose = () => {
    if (isExporting) {
      // If exporting, minimize instead of close
      if (onMinimize) {
        onMinimize();
      }
    } else {
      resetState();
      onClose();
    }
  };

  const resetState = () => {
    onStateChange({
      selectedFormat: "pdf-detailed",
      isExporting: false,
      exportComplete: false,
      exportError: null,
      exportErrors: [],
      exportStats: null,
      currentStage: 0,
      overallProgress: 0,
    });
  };

  const handleExport = async () => {
    onStateChange({
      isExporting: true,
      exportComplete: false,
      exportError: null,
      exportErrors: [],
      exportStats: null,
      currentStage: 0,
      overallProgress: 0,
    });

    try {
      // The export handler reports real progress via onProgress callback.
      // Modal state is updated by the dashboard wiring, so we just await the result.
      const result = await onExport(selectedFormat);

      if (!result.success) {
        onStateChange({ exportError: result.error || "Export failed" });
        return;
      }

      // Capture export errors and stats (partial success)
      if (result.exportErrors && result.exportErrors.length > 0) {
        onStateChange({
          exportErrors: result.exportErrors,
          exportStats: {
            total: result.totalPolicies || 0,
            successful: result.successfulPolicies || 0,
          },
        });
      }

      onStateChange({
        currentStage: 4,
        overallProgress: 100,
        exportComplete: true,
        isExporting: false,
      });

      // Show success state for 1.5 seconds before downloading
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Trigger download after success display
      if (result.downloadData) {
        const url = window.URL.createObjectURL(result.downloadData.blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = result.downloadData.filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => window.URL.revokeObjectURL(url), 100);
      }
    } catch (error: any) {
      console.error("Export failed:", error);
      onStateChange({
        exportError: error?.message || "An unexpected error occurred",
        isExporting: false,
      });
    }
  };

  if (!isOpen) return null;

  const getStageStatus = (
    index: number,
  ): "pending" | "active" | "completed" => {
    if (index < currentStage) return "completed";
    if (index === currentStage && isExporting) return "active";
    return "pending";
  };

  return (
    <div
      className="bg-petrol-950/70 fixed inset-0 z-50 flex cursor-pointer items-center justify-center p-4 backdrop-blur-sm"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
    >
      <div
        className="border-petrol-950/8 shadow-soft flex max-h-[90svh] w-full max-w-2xl cursor-default flex-col overflow-hidden rounded-3xl border bg-white"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="border-petrol-950/6 flex items-center justify-between border-b p-5 sm:p-7">
          <div className="min-w-0 flex-1 pr-4">
            <h2
              id="export-modal-title"
              className="text-petrol-950 text-2xl font-semibold tracking-[-0.025em] sm:text-3xl"
            >
              Export documentation
            </h2>
            <p className="text-petrol-600 mt-1.5 text-sm">
              {exportComplete
                ? "Export completed successfully"
                : isExporting
                  ? "Generating your documentation…"
                  : "Select export format and start"}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-11 w-11 flex-shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            title={isExporting ? "Minimize to notification" : "Close"}
            aria-label={isExporting ? "Minimize export" : "Close export modal"}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-7">
          {!isExporting && !exportComplete && (
            <div className="space-y-5">
              {config.collectionWarningCount > 0 && (
                <div className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-sm text-amber-900">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                    <p className="leading-6">
                      This document will include {config.collectionWarningCount}{" "}
                      collection{" "}
                      {config.collectionWarningCount === 1
                        ? "warning"
                        : "warnings"}
                      . Partial or unavailable data will be identified in the
                      export.
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label className="text-petrol-800 mb-3 block text-sm font-semibold">
                  Select export format
                </label>
                <div className="space-y-3">
                  <FormatOption
                    id="pdf-detailed"
                    label="Detailed PDF report"
                    description="Comprehensive documentation with all policy details and settings"
                    icon={<FileText className="h-5 w-5" />}
                    selected={selectedFormat === "pdf-detailed"}
                    onClick={() =>
                      onStateChange({ selectedFormat: "pdf-detailed" })
                    }
                  />
                  <FormatOption
                    id="docx"
                    label="Word document (.docx)"
                    description="Editable document format for further customization"
                    icon={<File className="h-5 w-5" />}
                    selected={selectedFormat === "docx"}
                    onClick={() => onStateChange({ selectedFormat: "docx" })}
                  />
                </div>
              </div>
            </div>
          )}

          {isExporting && (
            <div className="space-y-7">
              {/* Overall progress */}
              <div className="text-center" role="status" aria-live="polite">
                <p className="text-petrol-950 text-6xl font-semibold tracking-[-0.05em] tabular-nums sm:text-7xl">
                  {overallProgress}
                  <span className="text-petrol-600 ml-1 align-super text-2xl font-semibold sm:text-3xl">
                    %
                  </span>
                </p>
                <div className="mt-3 flex items-center justify-center gap-2 text-teal-700">
                  <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                  <span className="text-petrol-950 text-sm font-semibold sm:text-base">
                    {stages[currentStage]?.name}
                  </span>
                </div>
                <p className="text-petrol-600 mt-1 text-xs">
                  Step {Math.min(currentStage + 1, stages.length)} of{" "}
                  {stages.length}
                </p>
              </div>

              <div>
                <div className="bg-mint-100 h-2 w-full overflow-hidden rounded-full">
                  <div
                    className="h-2 rounded-full bg-teal-600 transition-[width] duration-500 motion-reduce:transition-none"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>

              {/* Stage Indicators */}
              <div className="border-petrol-950/6 bg-surface space-y-1 rounded-2xl border p-3 sm:p-4">
                {stages.map((stage, index) => (
                  <StageIndicator
                    key={index}
                    stage={stage}
                    status={getStageStatus(index)}
                  />
                ))}
              </div>

              {/* What's Being Exported */}
              <div className="border-petrol-950/6 bg-mint-50 rounded-2xl border p-4 sm:p-5">
                <h4 className="text-petrol-600 mb-3 text-[10px] font-bold tracking-[0.14em] uppercase">
                  Exporting {config.selectedCount} policies
                </h4>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {config.policyTypes.map((type, index) => (
                    <div
                      key={index}
                      className="text-petrol-700 flex items-center gap-2 text-xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-teal-700" />
                      <span className="break-words">
                        {type.name} ({type.count})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {exportError && (
            <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 sm:p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white text-red-600">
                  <AlertCircle className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-sm font-semibold text-red-900">
                    Export failed
                  </h3>
                  <p className="mt-1 text-sm leading-6 text-red-700">
                    {exportError}
                  </p>
                </div>
              </div>
            </div>
          )}

          {exportComplete && (
            <div className="py-5 text-center sm:py-7">
              <div
                className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full ${
                  exportErrors.length > 0 ? "bg-amber-50" : "bg-teal-50"
                }`}
              >
                {exportErrors.length > 0 ? (
                  <AlertCircle className="h-8 w-8 text-amber-600" />
                ) : (
                  <CheckCircle2 className="h-8 w-8 text-teal-700" />
                )}
              </div>
              <h3 className="text-petrol-950 mb-2 text-xl font-semibold">
                {exportErrors.length > 0
                  ? "Export completed with warnings"
                  : "Export complete"}
              </h3>
              <p className="text-petrol-600 mb-6 text-sm">
                {exportStats ? (
                  <>
                    Successfully exported {exportStats.successful} of{" "}
                    {exportStats.total} policies
                  </>
                ) : (
                  <>Successfully exported {config.selectedCount} policies</>
                )}
              </p>

              {/* Show warnings if there are partial failures */}
              {exportErrors.length > 0 && (
                <div className="mx-auto mb-6 max-w-2xl rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4 text-left sm:p-5">
                  <div className="mb-3 flex items-start gap-3">
                    <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
                    <div>
                      <h4 className="text-sm font-semibold text-amber-950">
                        {exportErrors.length}{" "}
                        {exportErrors.length === 1 ? "policy" : "policies"}{" "}
                        failed to export
                      </h4>
                      <p className="mt-1 text-xs leading-5 text-amber-800">
                        The remaining policies were successfully exported to
                        your PDF.
                      </p>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="cursor-pointer text-sm font-semibold text-amber-950 hover:text-amber-800 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none">
                      View failed policies
                    </summary>
                    <div className="mt-3 max-h-48 space-y-2 overflow-y-auto overscroll-contain">
                      {exportErrors.map((err, index) => (
                        <div
                          key={index}
                          className="border-petrol-950/6 rounded-xl border bg-white p-3 text-xs"
                        >
                          <div className="text-petrol-950 font-semibold break-words">
                            {err.policyType}: {err.policyName}
                          </div>
                          <div className="text-petrol-600 mt-1 break-words">
                            {err.error}
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {/* Summary Stats */}
              <div className="border-petrol-950/6 bg-surface mb-6 inline-block rounded-2xl border p-4 sm:p-5">
                <div className="text-left">
                  <div className="text-petrol-600 mb-3 text-[10px] font-bold tracking-[0.14em] uppercase">
                    Exported policy types
                  </div>
                  <div className="space-y-2">
                    {config.policyTypes.map((type, index) => (
                      <div
                        key={index}
                        className="text-petrol-700 flex items-center gap-2 text-sm"
                      >
                        <CheckCircle2 className="h-4 w-4 text-teal-700" />
                        <span>
                          {type.name}: <strong>{type.count}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-petrol-600 text-xs leading-5">
                Your download should start automatically. If not, check your
                downloads folder.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {!isExporting && (
          <div className="border-petrol-950/6 bg-surface border-t p-4 sm:px-7 sm:py-5">
            <div className="flex flex-col-reverse justify-end gap-3 sm:flex-row">
              {!exportComplete && !exportError && (
                <>
                  <Button
                    onClick={handleClose}
                    variant="secondary"
                    className="border-petrol-950/12 text-petrol-950 hover:bg-mint-50 hover:border-petrol-950/20 min-h-11 w-full rounded-full border bg-white px-6 shadow-none transition-colors focus-visible:ring-teal-600 sm:w-auto"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleExport}
                    variant="primary"
                    disabled={config.selectedCount === 0}
                    className="bg-petrol-950 hover:bg-petrol-800 min-h-11 w-full rounded-xl px-6 text-white shadow-sm transition-[background-color,box-shadow] hover:shadow-md focus-visible:ring-teal-600 disabled:opacity-40 sm:w-auto"
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Start export
                  </Button>
                </>
              )}
              {(exportComplete || exportError) && (
                <>
                  {exportError && (
                    <Button
                      onClick={() => {
                        onStateChange({
                          exportError: null,
                          currentStage: 0,
                          overallProgress: 0,
                        });
                      }}
                      variant="secondary"
                      className="border-petrol-950/12 text-petrol-950 hover:bg-mint-50 hover:border-petrol-950/20 min-h-11 w-full rounded-full border bg-white px-6 shadow-none transition-colors focus-visible:ring-teal-600 sm:w-auto"
                    >
                      Try again
                    </Button>
                  )}
                  <Button
                    onClick={handleClose}
                    variant="primary"
                    className="bg-petrol-950 hover:bg-petrol-800 min-h-11 w-full rounded-xl px-6 text-white shadow-sm transition-[background-color,box-shadow] hover:shadow-md focus-visible:ring-teal-600 sm:w-auto"
                  >
                    {exportComplete ? "Done" : "Close"}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FormatOption({
  id: _id,
  label,
  description,
  icon,
  selected,
  onClick,
}: {
  id: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full cursor-pointer touch-manipulation rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none sm:p-5 ${
        selected
          ? "border-teal-600 bg-teal-50"
          : "border-petrol-950/8 hover:border-petrol-950/12 hover:bg-mint-50 active:bg-mint-100 bg-white"
      }`}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${
            selected ? "bg-white text-teal-700" : "bg-mint-50 text-petrol-600"
          }`}
        >
          {icon}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-petrol-950 font-semibold">{label}</div>
          <div className="text-petrol-600 mt-1 text-sm leading-5 break-words">
            {description}
          </div>
        </div>
        <div
          className={`mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 ${
            selected
              ? "border-teal-600 bg-white"
              : "border-petrol-950/20 bg-white"
          }`}
        >
          {selected && <div className="h-3 w-3 rounded-full bg-teal-600" />}
        </div>
      </div>
    </button>
  );
}

function StageIndicator({
  stage,
  status,
}: {
  stage: ExportStage;
  status: "pending" | "active" | "completed";
}) {
  const getStatusIcon = () => {
    switch (status) {
      case "completed":
        return (
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
            <CheckCircle2 className="h-3.5 w-3.5" />
          </span>
        );
      case "active":
        return (
          <Loader2 className="h-5 w-5 shrink-0 animate-spin text-teal-700 motion-reduce:animate-none" />
        );
      default:
        return (
          <div className="border-petrol-950/20 h-4 w-4 shrink-0 rounded-full border-2" />
        );
    }
  };

  const getTextColor = () => {
    switch (status) {
      case "completed":
        return "text-petrol-700";
      case "active":
        return "text-petrol-950 font-semibold";
      default:
        return "text-petrol-600/65";
    }
  };

  return (
    <div
      className={`flex min-h-10 items-center gap-3 rounded-xl px-3 py-2 ${status === "active" ? "bg-teal-50" : ""}`}
    >
      {getStatusIcon()}
      <span className={`text-sm ${getTextColor()}`}>{stage.name}</span>
    </div>
  );
}
