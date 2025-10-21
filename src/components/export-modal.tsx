"use client";

import { useState } from "react";
import { X, Download, FileText, AlertCircle, CheckCircle2, Loader2, File } from "lucide-react";
import { Button } from "~/components/ui/button";

export type ExportFormat = 'pdf-detailed' | 'pdf-executive' | 'docx';

export interface ExportStage {
  name: string;
  status: 'pending' | 'active' | 'completed';
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
}

export interface ExportResult {
  success: boolean;
  error?: string;
  exportErrors?: PolicyExportError[];
  totalPolicies?: number;
  successfulPolicies?: number;
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => Promise<ExportResult>;
  config: ExportConfig;
}

export function ExportModal({
  isOpen,
  onClose,
  onExport,
  config,
}: ExportModalProps) {
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat>('pdf-detailed');
  const [isExporting, setIsExporting] = useState(false);
  const [exportComplete, setExportComplete] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportErrors, setExportErrors] = useState<PolicyExportError[]>([]);
  const [exportStats, setExportStats] = useState<{ total: number; successful: number } | null>(null);
  const [currentStage, setCurrentStage] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);

  const stages: ExportStage[] = [
    { name: "Preparing export data...", status: 'pending', progress: 0 },
    { name: "Generating document...", status: 'pending', progress: 0 },
    { name: "Finalizing...", status: 'pending', progress: 0 },
    { name: "Starting download...", status: 'pending', progress: 0 },
  ];

  const handleClose = () => {
    if (!isExporting) {
      resetState();
      onClose();
    }
  };

  const resetState = () => {
    setSelectedFormat('pdf-detailed');
    setIsExporting(false);
    setExportComplete(false);
    setExportError(null);
    setExportErrors([]);
    setExportStats(null);
    setCurrentStage(0);
    setOverallProgress(0);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportComplete(false);
    setExportError(null);
    setExportErrors([]);
    setExportStats(null);
    setCurrentStage(0);
    setOverallProgress(0);

    try {
      // Stage 1: Preparing (0-15%)
      setCurrentStage(0);
      setOverallProgress(5);
      await new Promise(resolve => setTimeout(resolve, 300));
      setOverallProgress(15);

      // Stage 2: Generating (15-85%) - Real work happens here
      setCurrentStage(1);
      setOverallProgress(20);

      const result = await onExport(selectedFormat);

      setOverallProgress(85);

      if (result.success) {
        // Capture export errors and stats (partial success)
        if (result.exportErrors && result.exportErrors.length > 0) {
          setExportErrors(result.exportErrors);
          setExportStats({
            total: result.totalPolicies || 0,
            successful: result.successfulPolicies || 0
          });
        }

        // Stage 3: Finalizing (85-95%)
        setCurrentStage(2);
        setOverallProgress(90);
        await new Promise(resolve => setTimeout(resolve, 200));

        // Stage 4: Downloading (95-100%)
        setCurrentStage(3);
        setOverallProgress(95);
        await new Promise(resolve => setTimeout(resolve, 200));

        setOverallProgress(100);
        setExportComplete(true);
      } else {
        setExportError(result.error || 'Export failed');
      }
    } catch (error: any) {
      console.error('Export failed:', error);
      setExportError(error?.message || 'An unexpected error occurred');
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const getStageStatus = (index: number): 'pending' | 'active' | 'completed' => {
    if (index < currentStage) return 'completed';
    if (index === currentStage && isExporting) return 'active';
    return 'pending';
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">Export Documentation</h2>
            <p className="text-sm text-slate-600 mt-1">
              {exportComplete
                ? 'Export completed successfully'
                : isExporting
                ? 'Generating your documentation...'
                : 'Select export format and start'}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={isExporting}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {!isExporting && !exportComplete && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">
                  Select export format
                </label>
                <div className="space-y-2">
                  <FormatOption
                    id="pdf-detailed"
                    label="Detailed PDF Report"
                    description="Comprehensive documentation with all policy details and settings"
                    icon={<FileText className="w-5 h-5" />}
                    selected={selectedFormat === 'pdf-detailed'}
                    onClick={() => setSelectedFormat('pdf-detailed')}
                  />
                  <FormatOption
                    id="pdf-executive"
                    label="Executive PDF Summary"
                    description="High-level overview for stakeholders and management"
                    icon={<FileText className="w-5 h-5" />}
                    selected={selectedFormat === 'pdf-executive'}
                    onClick={() => setSelectedFormat('pdf-executive')}
                  />
                  <FormatOption
                    id="docx"
                    label="Word Document (.docx)"
                    description="Editable document format for further customization"
                    icon={<File className="w-5 h-5" />}
                    selected={selectedFormat === 'docx'}
                    onClick={() => setSelectedFormat('docx')}
                  />
                </div>
              </div>
            </div>
          )}

          {isExporting && (
            <div className="space-y-6">
              {/* Current Stage Message */}
              <div className="text-center">
                <div className="inline-flex items-center gap-2 text-blue-700 bg-blue-50 px-4 py-2 rounded-lg">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-sm font-medium">{stages[currentStage]?.name}</span>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Export Progress</span>
                  <span className="text-sm text-slate-600">{overallProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-500"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>

              {/* Stage Indicators */}
              <div className="space-y-2">
                {stages.map((stage, index) => (
                  <StageIndicator
                    key={index}
                    stage={stage}
                    status={getStageStatus(index)}
                  />
                ))}
              </div>

              {/* What's Being Exported */}
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <h4 className="text-xs font-semibold text-slate-700 mb-2">Exporting {config.selectedCount} policies:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {config.policyTypes.map((type, index) => (
                    <div key={index} className="flex items-center gap-2 text-xs text-slate-600">
                      <CheckCircle2 className="w-3 h-3 text-green-600 flex-shrink-0" />
                      <span className="break-words">{type.name} ({type.count})</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {exportError && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-red-900">Export Failed</h3>
                  <p className="text-sm text-red-700 mt-1">{exportError}</p>
                </div>
              </div>
            </div>
          )}

          {exportComplete && (
            <div className="text-center py-8">
              <div className={`w-16 h-16 ${exportErrors.length > 0 ? 'bg-yellow-100' : 'bg-green-100'} rounded-full flex items-center justify-center mx-auto mb-4`}>
                {exportErrors.length > 0 ? (
                  <AlertCircle className="w-8 h-8 text-yellow-600" />
                ) : (
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {exportErrors.length > 0 ? 'Export Completed with Warnings' : 'Export Complete!'}
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                {exportStats ? (
                  <>Successfully exported {exportStats.successful} of {exportStats.total} policies</>
                ) : (
                  <>Successfully exported {config.selectedCount} policies</>
                )}
              </p>

              {/* Show warnings if there are partial failures */}
              {exportErrors.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6 text-left max-w-2xl mx-auto">
                  <div className="flex items-start gap-2 mb-3">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-semibold text-yellow-900">
                        {exportErrors.length} {exportErrors.length === 1 ? 'policy' : 'policies'} failed to export
                      </h4>
                      <p className="text-xs text-yellow-700 mt-1">
                        The remaining policies were successfully exported to your PDF.
                      </p>
                    </div>
                  </div>
                  <details className="mt-3">
                    <summary className="text-sm font-medium text-yellow-900 cursor-pointer hover:text-yellow-800">
                      View failed policies
                    </summary>
                    <div className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                      {exportErrors.map((err, index) => (
                        <div key={index} className="text-xs bg-white border border-yellow-200 rounded p-2">
                          <div className="font-medium text-slate-900 break-words">{err.policyType}: {err.policyName}</div>
                          <div className="text-slate-600 mt-1 break-words">{err.error}</div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              )}

              {/* Summary Stats */}
              <div className="bg-slate-50 rounded-lg p-4 mb-6 inline-block">
                <div className="text-left">
                  <div className="text-xs text-slate-600 font-medium mb-2">Exported Policy Types:</div>
                  <div className="space-y-1">
                    {config.policyTypes.map((type, index) => (
                      <div key={index} className="flex items-center gap-2 text-sm text-slate-700">
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                        <span>{type.name}: <strong>{type.count}</strong></span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Your download should start automatically. If not, check your downloads folder.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-4 sm:p-6 bg-slate-50">
          <div className="flex flex-col-reverse sm:flex-row justify-end gap-3">
            {!isExporting && !exportComplete && !exportError && (
              <>
                <Button
                  onClick={handleClose}
                  variant="secondary"
                  className="w-full sm:w-auto"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExport}
                  variant="primary"
                  disabled={config.selectedCount === 0}
                  className="w-full sm:w-auto"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Start Export
                </Button>
              </>
            )}
            {isExporting && (
              <Button
                variant="secondary"
                disabled
                loading
                className="w-full sm:w-auto"
              >
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Exporting...
              </Button>
            )}
            {(exportComplete || exportError) && (
              <>
                {exportError && (
                  <Button
                    onClick={() => {
                      setExportError(null);
                      setCurrentStage(0);
                      setOverallProgress(0);
                    }}
                    variant="secondary"
                    className="w-full sm:w-auto"
                  >
                    Try Again
                  </Button>
                )}
                <Button
                  onClick={handleClose}
                  variant="primary"
                  className="w-full sm:w-auto"
                >
                  {exportComplete ? 'Done' : 'Close'}
                </Button>
              </>
            )}
          </div>
        </div>
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
      onClick={onClick}
      className={`w-full text-left p-3 sm:p-4 rounded-lg border-2 transition-all touch-manipulation ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50 active:bg-slate-100'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg flex-shrink-0 ${selected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-medium text-slate-900">{label}</div>
          <div className="text-sm text-slate-600 mt-1 break-words">{description}</div>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
          selected ? 'border-blue-500' : 'border-slate-300'
        }`}>
          {selected && <div className="w-3 h-3 rounded-full bg-blue-500" />}
        </div>
      </div>
    </button>
  );
}

function StageIndicator({
  stage,
  status
}: {
  stage: ExportStage;
  status: 'pending' | 'active' | 'completed'
}) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-green-600" />;
      case 'active':
        return <Loader2 className="w-4 h-4 text-blue-600 animate-spin" />;
      default:
        return <div className="w-4 h-4 rounded-full border-2 border-slate-300" />;
    }
  };

  const getTextColor = () => {
    switch (status) {
      case 'completed':
        return 'text-green-700';
      case 'active':
        return 'text-blue-700 font-medium';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="flex items-center gap-3">
      {getStatusIcon()}
      <span className={`text-sm ${getTextColor()}`}>{stage.name}</span>
    </div>
  );
}
