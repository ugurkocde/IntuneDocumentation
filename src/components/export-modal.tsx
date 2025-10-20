"use client";

import { useState, useEffect } from "react";
import { X, Download, FileText, AlertCircle, CheckCircle2, Loader2, File } from "lucide-react";
import { Button } from "~/components/ui/button";

export type ExportFormat = 'pdf-detailed' | 'pdf-executive' | 'docx';

export interface ExportProgress {
  policyType: string;
  total: number;
  completed: number;
  failed: number;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface ExportError {
  policyType: string;
  policyName: string;
  error: string;
}

export interface ExportConfig {
  selectedCount: number;
  policyTypes: { name: string; count: number }[];
}

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (format: ExportFormat) => Promise<{ success: boolean; error?: string }>;
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
  const [progress, setProgress] = useState<ExportProgress[]>([]);
  const [overallProgress, setOverallProgress] = useState(0);

  // Initialize progress items when export starts
  useEffect(() => {
    if (isExporting && config.policyTypes.length > 0) {
      // Initialize progress for each policy type
      const initialProgress: ExportProgress[] = config.policyTypes.map(pt => ({
        policyType: pt.name,
        total: pt.count,
        completed: 0,
        failed: 0,
        status: 'pending' as const,
      }));
      setProgress(initialProgress);
    }
  }, [isExporting, config.policyTypes]);

  // Simulate progress updates
  useEffect(() => {
    if (!isExporting || progress.length === 0) return;

    const interval = setInterval(() => {
      setProgress(prev => {
        const updated = [...prev];
        let changed = false;

        // Find the first non-completed item
        for (let i = 0; i < updated.length; i++) {
          if (updated[i].status !== 'completed') {
            // Start processing if pending
            if (updated[i].status === 'pending') {
              updated[i].status = 'processing';
              changed = true;
              break;
            }

            // Increment progress if processing
            if (updated[i].status === 'processing' && updated[i].completed < updated[i].total) {
              updated[i].completed += 1;

              // Mark as completed when done
              if (updated[i].completed >= updated[i].total) {
                updated[i].status = 'completed';
              }

              changed = true;
              break;
            }
          }
        }

        // Calculate overall progress
        if (changed) {
          const totalItems = updated.reduce((sum, p) => sum + p.total, 0);
          const completedItems = updated.reduce((sum, p) => sum + p.completed, 0);
          const newOverallProgress = totalItems > 0 ? Math.floor((completedItems / totalItems) * 100) : 0;
          setOverallProgress(newOverallProgress);
        }

        return updated;
      });
    }, 100); // Update every 100ms for smooth progress

    return () => clearInterval(interval);
  }, [isExporting, progress.length]);

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
    setProgress([]);
    setOverallProgress(0);
  };

  const handleExport = async () => {
    setIsExporting(true);
    setExportComplete(false);
    setExportError(null);
    setProgress([]);
    setOverallProgress(0);

    try {
      const result = await onExport(selectedFormat);

      if (result.success) {
        setExportComplete(true);
        setOverallProgress(100);

        // Mark all as completed
        setProgress(prev => prev.map(p => ({
          ...p,
          completed: p.total,
          status: 'completed' as const,
        })));
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

  const totalPolicies = progress.reduce((sum, p) => sum + p.total, 0);
  const completedPolicies = progress.reduce((sum, p) => sum + p.completed, 0);
  const failedPolicies = progress.reduce((sum, p) => sum + p.failed, 0);

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Export Documentation</h2>
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
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
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
            <div className="space-y-4">
              {/* Overall Progress Bar */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Overall Progress</span>
                  <span className="text-sm text-slate-600">
                    {completedPolicies} / {totalPolicies} policies
                  </span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full transition-all duration-300"
                    style={{ width: `${overallProgress}%` }}
                  />
                </div>
              </div>

              {/* Policy Type Progress */}
              <div className="space-y-3 mt-6">
                {progress.map((item, index) => (
                  <PolicyProgress key={index} item={item} />
                ))}
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
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle2 className="w-8 h-8 text-green-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">Export Complete!</h3>
              <p className="text-sm text-slate-600 mb-6">
                Successfully exported {completedPolicies} policies
                {failedPolicies > 0 && ` (${failedPolicies} warnings)`}
              </p>

              {/* Summary Stats */}
              <div className="bg-slate-50 rounded-lg p-4 mb-6 inline-block">
                <div className="grid grid-cols-2 gap-6 text-left">
                  <div>
                    <div className="text-xs text-slate-600 font-medium">Total Policies</div>
                    <div className="text-2xl font-bold text-slate-900 mt-1">{totalPolicies}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-600 font-medium">Successfully Exported</div>
                    <div className="text-2xl font-bold text-green-600 mt-1">{completedPolicies}</div>
                  </div>
                  {failedPolicies > 0 && (
                    <>
                      <div>
                        <div className="text-xs text-slate-600 font-medium">Warnings</div>
                        <div className="text-2xl font-bold text-amber-600 mt-1">{failedPolicies}</div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <p className="text-xs text-slate-500">
                Your download should start automatically. If not, check your downloads folder.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t p-6 bg-slate-50">
          <div className="flex justify-end gap-3">
            {!isExporting && !exportComplete && !exportError && (
              <>
                <Button
                  onClick={handleClose}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleExport}
                  variant="primary"
                  disabled={config.selectedCount === 0}
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
                      setProgress([]);
                    }}
                    variant="secondary"
                  >
                    Try Again
                  </Button>
                )}
                <Button
                  onClick={handleClose}
                  variant="primary"
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
  id,
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
      className={`w-full text-left p-4 rounded-lg border-2 transition-all ${
        selected
          ? 'border-blue-500 bg-blue-50'
          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${selected ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-600'}`}>
          {icon}
        </div>
        <div className="flex-1">
          <div className="font-medium text-slate-900">{label}</div>
          <div className="text-sm text-slate-600 mt-1">{description}</div>
        </div>
        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
          selected ? 'border-blue-500' : 'border-slate-300'
        }`}>
          {selected && <div className="w-3 h-3 rounded-full bg-blue-500" />}
        </div>
      </div>
    </button>
  );
}

function PolicyProgress({ item }: { item: ExportProgress }) {
  const getStatusIcon = () => {
    switch (item.status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-green-600" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      case 'processing':
        return <Loader2 className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-slate-300" />;
    }
  };

  const getStatusColor = () => {
    switch (item.status) {
      case 'completed':
        return 'text-green-700';
      case 'error':
        return 'text-red-700';
      case 'processing':
        return 'text-blue-700';
      default:
        return 'text-slate-500';
    }
  };

  const progress = item.total > 0 ? (item.completed / item.total) * 100 : 0;

  return (
    <div className="border border-slate-200 rounded-lg p-4">
      <div className="flex items-center gap-3 mb-2">
        {getStatusIcon()}
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <span className={`text-sm font-medium ${getStatusColor()}`}>
              {item.policyType}
            </span>
            <span className="text-xs text-slate-600">
              {item.completed}/{item.total}
              {item.failed > 0 && <span className="text-amber-600 ml-1">({item.failed} failed)</span>}
            </span>
          </div>
        </div>
      </div>
      <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div
          className={`h-1.5 rounded-full transition-all duration-300 ${
            item.status === 'error' ? 'bg-red-500' : item.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
