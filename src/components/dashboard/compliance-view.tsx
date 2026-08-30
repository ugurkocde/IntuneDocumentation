"use client";

import { useMsal } from "@azure/msal-react";
import { ChevronDown, Download, LoaderCircle, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { IntuneConfigurations } from "~/components/dashboard/types";
import type { DetailedExportData } from "~/lib/configuration-analyzer";
import { assessCompliance, compareControlIds } from "~/lib/compliance";
import type {
  CapabilityResult,
  CapabilityStatus,
  ControlAssessment,
  ControlStatus,
} from "~/lib/compliance/types";

type FrameworkId = "bsi-it-grundschutz" | "nist-800-53-r5" | "nist-csf-2";

interface ComplianceViewProps {
  configurations: IntuneConfigurations;
}

const FRAMEWORK_TABS: ReadonlyArray<{
  id: FrameworkId;
  label: string;
}> = [
  { id: "bsi-it-grundschutz", label: "BSI IT-Grundschutz" },
  { id: "nist-800-53-r5", label: "NIST SP 800-53" },
  { id: "nist-csf-2", label: "NIST CSF 2.0" },
];

const CONTROL_STATUS_ORDER: Record<ControlStatus, number> = {
  evidenceFound: 0,
  partialEvidence: 1,
  noEvidence: 2,
};

const CONTROL_STATUS_DETAILS: Record<
  ControlStatus,
  { label: string; chipClassName: string; dotClassName: string }
> = {
  evidenceFound: {
    label: "Configuration evidence",
    chipClassName: "bg-emerald-50 text-emerald-800",
    dotClassName: "bg-emerald-600",
  },
  partialEvidence: {
    label: "Partial configuration evidence",
    chipClassName: "bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-600",
  },
  noEvidence: {
    label: "No recognized configuration evidence",
    chipClassName: "bg-slate-100 text-slate-700",
    dotClassName: "bg-slate-500",
  },
};

const CAPABILITY_STATUS_LABELS: Record<CapabilityStatus, string> = {
  enforced: "Compliant configuration assigned",
  configuredNotAssigned: "Configured, not assigned",
  disabledByPolicy: "Deviating configuration detected",
  noEvidence: "No evidence",
};

function hasLegacyConfigurations(configurations: IntuneConfigurations) {
  return (
    configurations.settingsCatalog.length > 0 ||
    configurations.deviceConfigurations.length > 0 ||
    configurations.administrativeTemplates.length > 0 ||
    configurations.securityBaselines.length > 0 ||
    configurations.compliancePolicies.length > 0 ||
    configurations.appProtectionPolicies.length > 0 ||
    configurations.scripts.windows.length > 0 ||
    configurations.scripts.macOS.length > 0 ||
    configurations.appConfigurations.length > 0 ||
    configurations.windowsUpdatePolicies.length > 0 ||
    configurations.enrollmentConfigurations.length > 0 ||
    configurations.conditionalAccessPolicies.length > 0
  );
}

function ControlStatusChip({ status }: { status: ControlStatus }) {
  const details = CONTROL_STATUS_DETAILS[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${details.chipClassName}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${details.dotClassName}`} />
      {details.label}
    </span>
  );
}

function CapabilityStatusChip({ status }: { status: CapabilityStatus }) {
  const className =
    status === "enforced"
      ? "bg-emerald-50 text-emerald-800"
      : status === "configuredNotAssigned"
        ? "bg-amber-50 text-amber-800"
        : status === "disabledByPolicy"
          ? "bg-red-50 text-red-800"
          : "bg-slate-100 text-slate-700";

  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${className}`}
    >
      {CAPABILITY_STATUS_LABELS[status]}
    </span>
  );
}

function EvidenceList({ capability }: { capability: CapabilityResult }) {
  if (capability.evidence.length === 0) {
    return (
      <p className="text-petrol-600 mt-3 text-xs">
        No matching Intune policy detected.
      </p>
    );
  }

  return (
    <div className="mt-3 space-y-2">
      {capability.evidence.map((evidence, index) => {
        const isCounterEvidence = evidence.verdict === "disabled";
        const isAssignedCounterEvidence =
          isCounterEvidence && evidence.assignment.state === "assigned";
        const isUnassignedCounterEvidence =
          isCounterEvidence && evidence.assignment.state === "notAssigned";
        const assignment =
          evidence.assignment.state === "assigned" &&
          evidence.assignment.targets.length > 0
            ? evidence.assignment.targets.join(", ")
            : "Not assigned";

        return (
          <div
            key={`${evidence.policyId}-${evidence.settingId}-${index}`}
            className={`rounded-xl border p-3 ${
              isAssignedCounterEvidence
                ? "border-red-200 bg-red-50/60 text-red-900"
                : isUnassignedCounterEvidence
                  ? "border-amber-200 bg-amber-50/60 text-amber-900"
                  : "border-petrol-950/6 bg-mint-50/60 text-petrol-800"
            }`}
          >
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.8fr_1.3fr_0.75fr_1fr]">
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-65">
                  Policy
                </p>
                <p className="mt-1 text-xs font-semibold break-words">
                  {evidence.policyName}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-65">
                  Type
                </p>
                <p className="mt-1 text-xs break-words">
                  {evidence.policyType}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-65">
                  Setting
                </p>
                <p className="mt-1 font-mono text-[10px] leading-4 break-all">
                  {evidence.settingId}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-65">
                  Observed value
                </p>
                <p className="mt-1 font-mono text-[10px] leading-4 break-all">
                  {isAssignedCounterEvidence
                    ? `Risk: ${evidence.observedValue}`
                    : evidence.observedValue}
                </p>
              </div>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-65">
                  Assignment
                </p>
                <p className="mt-1 text-xs break-words">{assignment}</p>
              </div>
            </div>

            {(isCounterEvidence || evidence.note) && (
              <div className="mt-3 flex flex-wrap items-start gap-2 border-t border-current/10 pt-3">
                {isCounterEvidence && (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[9px] font-bold text-white ${
                      isAssignedCounterEvidence ? "bg-red-700" : "bg-amber-700"
                    }`}
                  >
                    {isAssignedCounterEvidence
                      ? "Deviating configuration detected and assigned (risk)"
                      : "Deviating configuration detected, but not assigned"}
                  </span>
                )}
                {evidence.note && (
                  <p className="min-w-0 flex-1 text-[11px] leading-5 italic">
                    {evidence.note}
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ControlRow({
  control,
  capabilitiesById,
  expanded,
  onToggle,
}: {
  control: ControlAssessment;
  capabilitiesById: Map<string, CapabilityResult>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const panelId = `compliance-control-${control.control.id.replace(
    /[^a-z0-9]/gi,
    "-",
  )}`;

  return (
    <article className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="hover:bg-mint-50/60 flex min-h-16 w-full cursor-pointer items-start gap-3 px-4 py-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset sm:items-center sm:px-5"
      >
        <ChevronDown
          className={`text-petrol-600 mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none sm:mt-0 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col-reverse items-start gap-2 sm:flex-row sm:items-center">
            <p className="text-petrol-950 min-w-0 flex-1 text-sm font-semibold">
              <span className="mr-2 font-mono text-xs text-teal-700">
                {control.control.id}
              </span>
              {control.control.title}
            </p>
            <ControlStatusChip status={control.status} />
          </div>
          {control.control.tier && (
            <p className="text-petrol-600 mt-1 text-xs">
              {control.control.tier}
            </p>
          )}
        </div>
      </button>

      {expanded && (
        <div
          id={panelId}
          className="border-petrol-950/6 divide-petrol-950/6 divide-y border-t bg-slate-50/55 px-4 sm:px-5"
        >
          {control.capabilityIds.map((capabilityId) => {
            const capability = capabilitiesById.get(capabilityId);
            if (!capability) return null;

            return (
              <section key={capabilityId} className="py-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-petrol-950 text-sm font-semibold">
                      {capability.capability.name}
                    </h3>
                    {capability.capability.caveat &&
                      capability.evidence.length > 0 && (
                        <p className="text-petrol-600 mt-1 text-[11px] leading-4 italic">
                          {capability.capability.caveat.en}
                        </p>
                      )}
                  </div>
                  <CapabilityStatusChip status={capability.status} />
                </div>
                <EvidenceList capability={capability} />
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}

function SummaryCard({
  label,
  count,
  total,
  tone,
}: {
  label: string;
  count: number;
  total: number;
  tone: "green" | "amber" | "slate";
}) {
  const toneClassName =
    tone === "green"
      ? "border-l-emerald-600 bg-emerald-50/35"
      : tone === "amber"
        ? "border-l-amber-600 bg-amber-50/35"
        : "border-l-slate-500 bg-slate-50";

  return (
    <div
      className={`border-petrol-950/6 shadow-card rounded-2xl border border-l-4 px-5 py-4 ${toneClassName}`}
    >
      <p className="text-petrol-600 text-xs font-medium">{label}</p>
      <p className="text-petrol-950 mt-1 text-2xl font-semibold tracking-[-0.04em] tabular-nums">
        {count.toLocaleString()}
      </p>
      <p className="text-petrol-600 mt-1 text-[11px] tabular-nums">
        of {total.toLocaleString()} assessable controls
      </p>
    </div>
  );
}

function ComplianceHeader({ disclaimer }: { disclaimer: string }) {
  return (
    <div className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <ShieldCheck className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2
            id="compliance-evidence-title"
            className="text-petrol-950 text-lg font-semibold"
          >
            Compliance Evidence
          </h2>
          <p className="text-petrol-600 mt-1 max-w-3xl text-sm leading-6">
            Review the technical evidence found in your loaded Intune policies
            and assignments for each supported framework.
          </p>
          <p className="text-petrol-600/80 mt-3 max-w-4xl text-[11px] leading-5">
            {disclaimer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function ComplianceView({ configurations }: ComplianceViewProps) {
  const { accounts } = useMsal();
  const assessment = useMemo(
    () => assessCompliance(configurations as unknown as DetailedExportData),
    [configurations],
  );
  const [selectedFrameworkId, setSelectedFrameworkId] =
    useState<FrameworkId>("bsi-it-grundschutz");
  const [expandedControls, setExpandedControls] = useState<Set<string>>(
    new Set(),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const tenantLabel = accounts[0]?.tenantId
    ? `${accounts[0].tenantId.slice(0, 8)}...`
    : undefined;

  const selectedFramework = assessment.frameworks.find(
    (framework) => framework.framework.id === selectedFrameworkId,
  );
  const capabilitiesById = useMemo(
    () =>
      new Map(
        assessment.capabilities.map((capability) => [
          capability.capability.id,
          capability,
        ]),
      ),
    [assessment],
  );
  const sortedControls = useMemo(
    () =>
      [...(selectedFramework?.controls ?? [])].sort(
        (left, right) =>
          CONTROL_STATUS_ORDER[left.status] -
            CONTROL_STATUS_ORDER[right.status] ||
          compareControlIds(left.control.id, right.control.id),
      ),
    [selectedFramework],
  );

  const isEmpty =
    configurations.sections.length === 0 &&
    !hasLegacyConfigurations(configurations);

  const handleFrameworkChange = (frameworkId: FrameworkId) => {
    setSelectedFrameworkId(frameworkId);
    setDownloadError(null);
  };

  const handleDownload = async () => {
    setIsGenerating(true);
    setDownloadError(null);

    try {
      const { generateComplianceReportPDF, complianceReportFileName } =
        await import("~/lib/compliance/report-pdf");
      const bytes = await generateComplianceReportPDF(
        configurations as unknown as DetailedExportData,
        {
          frameworkId: selectedFrameworkId,
          metadata: tenantLabel ? { tenantLabel } : undefined,
        },
      );
      const blob = new Blob([new Uint8Array(bytes)], {
        type: "application/pdf",
      });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = complianceReportFileName(
        selectedFrameworkId,
        tenantLabel,
      );
      document.body.appendChild(link);
      try {
        link.click();
      } finally {
        link.remove();
        URL.revokeObjectURL(objectUrl);
      }
    } catch {
      setDownloadError(
        "The PDF report could not be generated. Please try again.",
      );
    } finally {
      setIsGenerating(false);
    }
  };

  if (isEmpty) {
    return (
      <section
        className="space-y-5"
        aria-labelledby="compliance-evidence-title"
      >
        <ComplianceHeader disclaimer={assessment.disclaimer} />
        <div className="border-petrol-950/6 shadow-card rounded-2xl border bg-white px-6 py-12 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <h3 className="text-petrol-950 mt-4 text-sm font-semibold">
            Load tenant data to assess compliance evidence
          </h3>
          <p className="text-petrol-600 mx-auto mt-1 max-w-lg text-xs leading-5">
            Compliance evidence appears after your Intune configurations and
            assignments finish loading. Refresh the dashboard to load tenant
            data first.
          </p>
        </div>
      </section>
    );
  }

  if (!selectedFramework) return null;

  return (
    <section className="space-y-5" aria-labelledby="compliance-evidence-title">
      <ComplianceHeader disclaimer={assessment.disclaimer} />

      <div
        className="border-petrol-950/6 shadow-card flex flex-col gap-2 rounded-2xl border bg-white p-2 sm:flex-row"
        aria-label="Compliance frameworks"
      >
        {FRAMEWORK_TABS.map((framework) => {
          const selected = framework.id === selectedFrameworkId;
          return (
            <button
              key={framework.id}
              type="button"
              aria-pressed={selected}
              onClick={() => handleFrameworkChange(framework.id)}
              className={`min-h-11 flex-1 cursor-pointer rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                selected
                  ? "bg-petrol-950 text-white"
                  : "text-petrol-700 hover:bg-mint-50 hover:text-petrol-950"
              }`}
            >
              {framework.label}
            </button>
          );
        })}
      </div>

      <div
        className="grid gap-3 sm:grid-cols-3"
        aria-label={`${selectedFramework.framework.name} summary`}
      >
        <SummaryCard
          label="Evidence"
          count={selectedFramework.summary.withEvidence}
          total={selectedFramework.summary.totalControls}
          tone="green"
        />
        <SummaryCard
          label="Partial"
          count={selectedFramework.summary.partial}
          total={selectedFramework.summary.totalControls}
          tone="amber"
        />
        <SummaryCard
          label="No evidence"
          count={selectedFramework.summary.withoutEvidence}
          total={selectedFramework.summary.totalControls}
          tone="slate"
        />
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-petrol-950 text-lg font-semibold">
            {selectedFramework.framework.name}
          </h2>
          <p className="text-petrol-600 mt-1 text-xs">
            {selectedFramework.framework.version}
          </p>
        </div>
        <div className="sm:text-right">
          <button
            type="button"
            onClick={() => void handleDownload()}
            disabled={isGenerating}
            aria-busy={isGenerating}
            className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isGenerating ? (
              <LoaderCircle className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            {isGenerating ? "Generating report…" : "Download report (PDF)"}
          </button>
          {downloadError && (
            <p className="mt-2 text-xs text-red-700" role="alert">
              {downloadError}
            </p>
          )}
        </div>
      </div>

      {selectedFramework.framework.note && (
        <p className="text-petrol-600 text-xs leading-5">
          {selectedFramework.framework.note}
        </p>
      )}

      <div className="space-y-3">
        {sortedControls.map((control) => {
          const expansionKey = `${selectedFrameworkId}:${control.control.id}`;
          return (
            <ControlRow
              key={control.control.id}
              control={control}
              capabilitiesById={capabilitiesById}
              expanded={expandedControls.has(expansionKey)}
              onToggle={() =>
                setExpandedControls((current) => {
                  const next = new Set(current);
                  if (next.has(expansionKey)) next.delete(expansionKey);
                  else next.add(expansionKey);
                  return next;
                })
              }
            />
          );
        })}
      </div>
    </section>
  );
}
