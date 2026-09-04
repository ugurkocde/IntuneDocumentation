"use client";

import { useMsal } from "@azure/msal-react";
import {
  AnimatePresence,
  LayoutGroup,
  motion,
  useReducedMotion,
} from "framer-motion";
import {
  Check,
  ChevronDown,
  Download,
  LoaderCircle,
  ShieldCheck,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FrameworkBadge,
  type FrameworkId,
} from "~/components/dashboard/framework-badge";
import type { IntuneConfigurations } from "~/components/dashboard/types";
import type { DetailedExportData } from "~/lib/configuration-analyzer";
import { assessCompliance, compareControlIds } from "~/lib/compliance";
import type {
  CapabilityResult,
  CapabilityStatus,
  ControlAssessment,
  ControlStatus,
} from "~/lib/compliance/types";

interface ComplianceViewProps {
  configurations: IntuneConfigurations;
  groupNames?: Map<string, string> | null;
}

const FRAMEWORK_STORAGE_KEY = "compliance-framework";

const FRAMEWORK_OPTIONS: ReadonlyArray<{
  id: FrameworkId;
  label: string;
  shortLabel: string;
  description: string;
}> = [
  {
    id: "iso-27001-2022",
    label: "ISO/IEC 27001",
    shortLabel: "ISO 27001",
    description:
      "Selected Annex A technology controls mapped to managed-device configuration evidence.",
  },
  {
    id: "soc2-tsc",
    label: "SOC 2",
    shortLabel: "SOC 2",
    description:
      "Selected Trust Services Criteria mapped to managed-device configuration evidence.",
  },
  {
    id: "nist-800-53-r5",
    label: "NIST SP 800-53",
    shortLabel: "NIST 800-53",
    description:
      "Security and privacy controls for information systems and organizations.",
  },
  {
    id: "nist-csf-2",
    label: "NIST CSF 2.0",
    shortLabel: "NIST CSF",
    description:
      "Outcome-based guidance for managing and reducing cybersecurity risk.",
  },
  {
    id: "bsi-it-grundschutz",
    label: "BSI IT-Grundschutz",
    shortLabel: "BSI",
    description:
      "Baseline safeguards for systematic information security management.",
  },
  {
    id: "def-stan-05-138-i4",
    label: "Def Stan 05-138",
    shortLabel: "Def Stan",
    description:
      "UK MOD supplier controls under DEFCON 658, with the Cyber Risk Profile levels at which each applies.",
  },
  {
    id: "cyber-essentials-v3",
    label: "Cyber Essentials",
    shortLabel: "Cyber Essentials",
    description:
      "The five NCSC control themes mapped to managed-device configuration evidence.",
  },
  {
    id: "nist-800-171-r2",
    label: "NIST SP 800-171",
    shortLabel: "NIST 800-171",
    description:
      "Requirements for protecting controlled unclassified information, as referenced by CMMC 2.0 Level 2.",
  },
];

function isFrameworkId(value: string | null): value is FrameworkId {
  return FRAMEWORK_OPTIONS.some((framework) => framework.id === value);
}

function storeFrameworkSelection(frameworkId: FrameworkId) {
  try {
    window.localStorage.setItem(FRAMEWORK_STORAGE_KEY, frameworkId);
  } catch {
    // The picker remains usable when browser storage is unavailable.
  }
}

function clearFrameworkSelection() {
  try {
    window.localStorage.removeItem(FRAMEWORK_STORAGE_KEY);
  } catch {
    // The picker remains usable when browser storage is unavailable.
  }
}

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

function ComplianceHeader({
  disclaimer,
  frameworkSelector,
}: {
  disclaimer: string;
  frameworkSelector?: ReactNode;
}) {
  return (
    <div className="border-petrol-950/6 shadow-card rounded-2xl border bg-white p-5 sm:p-6">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
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
        {frameworkSelector}
      </div>
    </div>
  );
}

export function ComplianceView({
  configurations,
  groupNames,
}: ComplianceViewProps) {
  const { accounts } = useMsal();
  const prefersReducedMotion = useReducedMotion();
  const assessmentData = useMemo(
    () =>
      ({
        ...configurations,
        groupNames: groupNames ?? undefined,
      }) as unknown as DetailedExportData,
    [configurations, groupNames],
  );
  const assessment = useMemo(
    () => assessCompliance(assessmentData),
    [assessmentData],
  );
  const [selectedFrameworkId, setSelectedFrameworkId] =
    useState<FrameworkId | null>(null);
  const [expandedControls, setExpandedControls] = useState<Set<string>>(
    new Set(),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [isFrameworkMenuOpen, setIsFrameworkMenuOpen] = useState(false);
  const frameworkMenuRef = useRef<HTMLDivElement>(null);
  const frameworkTriggerRef = useRef<HTMLButtonElement>(null);
  const shouldFocusFrameworkTriggerRef = useRef(false);
  const tenantLabel = accounts[0]?.tenantId
    ? `${accounts[0].tenantId.slice(0, 8)}...`
    : undefined;

  useEffect(() => {
    try {
      const storedFrameworkId = window.localStorage.getItem(
        FRAMEWORK_STORAGE_KEY,
      );
      if (isFrameworkId(storedFrameworkId)) {
        setSelectedFrameworkId(storedFrameworkId);
      }
    } catch {
      // An unavailable storage implementation should not block the picker.
    }
  }, []);

  useEffect(() => {
    if (
      selectedFrameworkId &&
      shouldFocusFrameworkTriggerRef.current &&
      frameworkTriggerRef.current
    ) {
      shouldFocusFrameworkTriggerRef.current = false;
      frameworkTriggerRef.current.focus();
    }
  }, [selectedFrameworkId]);

  useEffect(() => {
    if (!isFrameworkMenuOpen) return;

    const handleDocumentClick = (event: MouseEvent) => {
      if (
        event.target instanceof Node &&
        !frameworkMenuRef.current?.contains(event.target)
      ) {
        setIsFrameworkMenuOpen(false);
        frameworkTriggerRef.current?.focus();
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setIsFrameworkMenuOpen(false);
        frameworkTriggerRef.current?.focus();
      }
    };

    document.addEventListener("click", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);
    frameworkMenuRef.current
      ?.querySelector<HTMLButtonElement>(
        '[role="menuitem"][data-selected="true"]',
      )
      ?.focus();

    return () => {
      document.removeEventListener("click", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isFrameworkMenuOpen]);

  const selectedFramework = assessment.frameworks.find(
    (framework) => framework.framework.id === selectedFrameworkId,
  );
  const selectedFrameworkOption = FRAMEWORK_OPTIONS.find(
    (framework) => framework.id === selectedFrameworkId,
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

  const handleFrameworkChange = (
    frameworkId: FrameworkId,
    source: "picker" | "menu",
  ) => {
    if (source === "picker") {
      shouldFocusFrameworkTriggerRef.current = true;
    }
    storeFrameworkSelection(frameworkId);
    setSelectedFrameworkId(frameworkId);
    setDownloadError(null);
  };

  const handleMenuFrameworkChange = (frameworkId: FrameworkId) => {
    handleFrameworkChange(frameworkId, "menu");
    setIsFrameworkMenuOpen(false);
    frameworkTriggerRef.current?.focus();
  };

  const handleShowAllFrameworks = () => {
    clearFrameworkSelection();
    setIsFrameworkMenuOpen(false);
    setSelectedFrameworkId(null);
    setDownloadError(null);
  };

  const handleDownload = async () => {
    if (!selectedFrameworkId) return;

    setIsGenerating(true);
    setDownloadError(null);

    try {
      const { generateComplianceReportPDF, complianceReportFileName } =
        await import("~/lib/compliance/report-pdf");
      const bytes = await generateComplianceReportPDF(assessmentData, {
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

  return (
    <section
      aria-labelledby={
        selectedFrameworkId
          ? "compliance-evidence-title"
          : "framework-picker-title"
      }
    >
      <LayoutGroup id="compliance-framework-picker">
        <motion.div
          layout={!prefersReducedMotion}
          className={
            selectedFrameworkId
              ? ""
              : "mx-auto flex min-h-[28rem] max-w-6xl flex-col justify-center py-8 sm:py-12"
          }
          transition={
            prefersReducedMotion
              ? { duration: 0 }
              : { type: "spring", stiffness: 360, damping: 34 }
          }
        >
          <AnimatePresence initial={false}>
            {!selectedFrameworkId && (
              <motion.div
                key="framework-picker-intro"
                initial={prefersReducedMotion ? { opacity: 1 } : { opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: prefersReducedMotion ? 0 : 0.16 }}
                className="text-center"
              >
                <h2
                  id="framework-picker-title"
                  className="text-petrol-950 text-xl font-semibold tracking-[-0.02em] sm:text-2xl"
                >
                  Choose a compliance framework
                </h2>
                <p className="text-petrol-600 mx-auto mt-2 max-w-2xl text-sm leading-6">
                  Select a framework to review the configuration evidence found
                  in your Intune policies and assignments.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div
            layout={!prefersReducedMotion}
            className={
              selectedFrameworkId
                ? "grid"
                : "mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-6"
            }
          >
            <AnimatePresence
              initial={false}
              custom={selectedFrameworkId}
              mode="popLayout"
            >
              {!selectedFrameworkId &&
                FRAMEWORK_OPTIONS.map((framework) => {
                  const assessmentFramework = assessment.frameworks.find(
                    (item) => item.framework.id === framework.id,
                  );

                  return (
                    <motion.button
                      key={framework.id}
                      type="button"
                      layoutId={
                        prefersReducedMotion
                          ? undefined
                          : `framework-card-${framework.id}`
                      }
                      aria-label={framework.label}
                      onClick={() =>
                        handleFrameworkChange(framework.id, "picker")
                      }
                      initial={
                        prefersReducedMotion
                          ? { opacity: 1 }
                          : { opacity: 0, scale: 0.98 }
                      }
                      animate={
                        prefersReducedMotion
                          ? { opacity: 1 }
                          : { opacity: 1, scale: 1 }
                      }
                      variants={{
                        exit: (selectedId: FrameworkId | null) =>
                          prefersReducedMotion
                            ? {
                                opacity: 1,
                                transition: { duration: 0 },
                              }
                            : selectedId === framework.id
                              ? {
                                  opacity: 1,
                                  scale: 1,
                                  transition: { duration: 0.24 },
                                }
                              : {
                                  opacity: 0,
                                  scale: 0.96,
                                  transition: { duration: 0.16 },
                                },
                      }}
                      exit="exit"
                      transition={
                        prefersReducedMotion
                          ? { duration: 0 }
                          : {
                              layout: {
                                type: "spring",
                                stiffness: 380,
                                damping: 34,
                              },
                            }
                      }
                      className={`border-petrol-950/8 shadow-card hover:bg-mint-50/35 group min-h-56 cursor-pointer touch-manipulation rounded-2xl border bg-white p-6 text-left transition-[border-color,background-color,box-shadow] duration-200 hover:border-teal-700/25 hover:shadow-[0_16px_40px_-30px_rgba(8,47,54,0.55)] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none motion-reduce:transition-none lg:col-span-2 ${
                        framework.id === "cyber-essentials-v3"
                          ? "lg:col-start-2 lg:row-start-3"
                          : ""
                      }`}
                    >
                      <motion.span
                        layoutId={
                          prefersReducedMotion
                            ? undefined
                            : `framework-badge-${framework.id}`
                        }
                        className="block w-fit"
                      >
                        <FrameworkBadge frameworkId={framework.id} />
                      </motion.span>
                      <span className="text-petrol-950 mt-5 block text-base font-semibold">
                        {framework.label}
                      </span>
                      <span className="mt-1 block text-xs font-semibold text-teal-700">
                        {assessmentFramework?.framework.version}
                      </span>
                      <span className="text-petrol-600 mt-3 block text-sm leading-6">
                        {framework.description}
                      </span>
                    </motion.button>
                  );
                })}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {selectedFrameworkId && selectedFramework && (
          <div className="space-y-5">
            <ComplianceHeader
              disclaimer={assessment.disclaimer}
              frameworkSelector={
                <div
                  ref={frameworkMenuRef}
                  className="relative ml-auto shrink-0"
                >
                  <motion.button
                    ref={frameworkTriggerRef}
                    type="button"
                    layoutId={
                      prefersReducedMotion
                        ? undefined
                        : `framework-card-${selectedFrameworkId}`
                    }
                    aria-label={`Selected framework: ${
                      selectedFrameworkOption?.label ??
                      selectedFramework.framework.name
                    }`}
                    aria-haspopup="menu"
                    aria-expanded={isFrameworkMenuOpen}
                    onClick={() =>
                      setIsFrameworkMenuOpen((current) => !current)
                    }
                    transition={
                      prefersReducedMotion
                        ? { duration: 0 }
                        : {
                            layout: {
                              type: "spring",
                              stiffness: 380,
                              damping: 34,
                            },
                          }
                    }
                    className="border-petrol-950/10 text-petrol-950 hover:bg-mint-50 inline-flex min-h-11 cursor-pointer touch-manipulation items-center gap-2 rounded-xl border bg-white px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <motion.span
                      layoutId={
                        prefersReducedMotion
                          ? undefined
                          : `framework-badge-${selectedFrameworkId}`
                      }
                      className="block shrink-0"
                    >
                      <FrameworkBadge
                        frameworkId={selectedFrameworkId}
                        size={20}
                      />
                    </motion.span>
                    <span>
                      {selectedFrameworkOption?.shortLabel ??
                        selectedFramework.framework.name}
                    </span>
                    <ChevronDown
                      className={`text-petrol-600 h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
                        isFrameworkMenuOpen && !prefersReducedMotion
                          ? "rotate-180"
                          : ""
                      }`}
                      aria-hidden="true"
                    />
                  </motion.button>

                  <AnimatePresence>
                    {isFrameworkMenuOpen && (
                      <motion.div
                        role="menu"
                        aria-label="Choose a compliance framework"
                        initial={
                          prefersReducedMotion
                            ? { opacity: 1 }
                            : { opacity: 0, y: -6, scale: 0.98 }
                        }
                        animate={
                          prefersReducedMotion
                            ? { opacity: 1 }
                            : { opacity: 1, y: 0, scale: 1 }
                        }
                        exit={
                          prefersReducedMotion
                            ? { opacity: 0 }
                            : { opacity: 0, y: -4, scale: 0.98 }
                        }
                        transition={{
                          duration: prefersReducedMotion ? 0 : 0.16,
                        }}
                        onKeyDown={(event) => {
                          if (
                            !["ArrowDown", "ArrowUp", "Home", "End"].includes(
                              event.key,
                            )
                          ) {
                            return;
                          }

                          event.preventDefault();
                          const menuItems = Array.from(
                            event.currentTarget.querySelectorAll<HTMLButtonElement>(
                              '[role="menuitem"]',
                            ),
                          );
                          const currentIndex = menuItems.indexOf(
                            document.activeElement as HTMLButtonElement,
                          );
                          const nextIndex =
                            event.key === "Home"
                              ? 0
                              : event.key === "End"
                                ? menuItems.length - 1
                                : event.key === "ArrowDown"
                                  ? (currentIndex + 1) % menuItems.length
                                  : (currentIndex - 1 + menuItems.length) %
                                    menuItems.length;
                          menuItems[nextIndex]?.focus();
                        }}
                        className="border-petrol-950/10 shadow-card absolute top-[calc(100%+0.5rem)] right-0 z-30 w-72 max-w-[calc(100vw-3rem)] overflow-hidden rounded-2xl border bg-white p-1.5"
                      >
                        {FRAMEWORK_OPTIONS.map((framework) => {
                          const selected = framework.id === selectedFrameworkId;
                          const assessmentFramework =
                            assessment.frameworks.find(
                              (item) => item.framework.id === framework.id,
                            );

                          return (
                            <button
                              key={framework.id}
                              type="button"
                              role="menuitem"
                              data-selected={selected ? "true" : undefined}
                              onClick={() =>
                                handleMenuFrameworkChange(framework.id)
                              }
                              className={`flex min-h-12 w-full cursor-pointer touch-manipulation items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                                selected
                                  ? "bg-mint-50 text-petrol-950"
                                  : "text-petrol-700 hover:bg-mint-50/70 hover:text-petrol-950"
                              }`}
                            >
                              <FrameworkBadge
                                frameworkId={framework.id}
                                size={20}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold">
                                  {framework.label}
                                  {selected && (
                                    <span className="sr-only">
                                      , currently selected
                                    </span>
                                  )}
                                </span>
                                <span className="text-petrol-600 mt-0.5 block text-[10px]">
                                  {assessmentFramework?.framework.version}
                                </span>
                              </span>
                              {selected && (
                                <Check
                                  className="h-4 w-4 shrink-0 text-teal-700"
                                  aria-hidden="true"
                                />
                              )}
                            </button>
                          );
                        })}
                        <div className="border-petrol-950/8 mt-1 border-t pt-1">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={handleShowAllFrameworks}
                            className="text-petrol-700 hover:bg-mint-50 hover:text-petrol-950 min-h-11 w-full cursor-pointer touch-manipulation rounded-xl px-3 text-left text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                          >
                            Show all frameworks
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              }
            />

            {isEmpty ? (
              <div className="border-petrol-950/6 shadow-card rounded-2xl border bg-white px-6 py-12 text-center">
                <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <ShieldCheck className="h-5 w-5" aria-hidden="true" />
                </span>
                <h3 className="text-petrol-950 mt-4 text-sm font-semibold">
                  Load tenant data to assess compliance evidence
                </h3>
                <p className="text-petrol-600 mx-auto mt-1 max-w-lg text-xs leading-5">
                  Compliance evidence appears after your Intune configurations
                  and assignments finish loading. Refresh the dashboard to load
                  tenant data first.
                </p>
              </div>
            ) : (
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={selectedFrameworkId}
                  initial={
                    prefersReducedMotion
                      ? { opacity: 1 }
                      : { opacity: 0, y: 10 }
                  }
                  animate={
                    prefersReducedMotion ? { opacity: 1 } : { opacity: 1, y: 0 }
                  }
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, y: -6 }
                  }
                  transition={{
                    duration: prefersReducedMotion ? 0 : 0.2,
                    ease: "easeOut",
                  }}
                  className="space-y-5"
                >
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
                          <LoaderCircle
                            className="h-4 w-4 animate-spin motion-reduce:animate-none"
                            aria-hidden="true"
                          />
                        ) : (
                          <Download className="h-4 w-4" aria-hidden="true" />
                        )}
                        {isGenerating
                          ? "Generating report…"
                          : "Download report (PDF)"}
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
                              if (next.has(expansionKey))
                                next.delete(expansionKey);
                              else next.add(expansionKey);
                              return next;
                            })
                          }
                        />
                      );
                    })}
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        )}
      </LayoutGroup>
    </section>
  );
}
