import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";
import { assignmentDetails } from "../../../../../../src/lib/compliance/assignments";
import {
  ASSESSMENT_LABELS,
  CHECK_RESULT_LABELS,
  checkSummary,
  displayCheckValue,
} from "../../../../../../src/lib/compliance/check-results";
import { CAPABILITY_STATUS_LABELS } from "../../../../../../src/lib/compliance/presentation";
import type {
  CapabilityStatus,
  ControlAssessment,
  ControlStatus,
} from "../../../../../../src/lib/compliance/types";
import type { ComplianceCapabilityView } from "../../../shared/ipc-types";
import { DisclosureSummary } from "../ui/DisclosureSummary";
import { CheckValue } from "./CheckValue";

// Ported from the website's compliance view
// (src/components/dashboard/compliance-view.tsx); container queries replace
// its viewport breakpoints because the sidebar changes the available width.

export const CONTROL_STATUS_ORDER: Record<ControlStatus, number> = {
  notApplicable: 5,
  notAssessed: 4,
  conflictingEvidence: -2,
  evidenceFound: 0,
  partialEvidence: 1,
  noEvidence: 2,
};

const CONTROL_STATUS_DETAILS: Record<
  ControlStatus,
  { label: string; chipClassName: string; dotClassName: string }
> = {
  notApplicable: {
    label: "Outside selected scope",
    chipClassName: "bg-mint-100 text-petrol-700",
    dotClassName: "bg-petrol-600",
  },
  notAssessed: {
    label: "Not assessed",
    chipClassName: "bg-amber-50 text-amber-800",
    dotClassName: "bg-amber-600",
  },
  conflictingEvidence: {
    label: "Mixed policy evidence",
    chipClassName: "bg-red-50 text-red-800",
    dotClassName: "bg-red-600",
  },
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
    chipClassName: "bg-mint-100 text-petrol-700",
    dotClassName: "bg-petrol-600",
  },
};

function ControlStatusChip({ status, label }: { status: ControlStatus; label?: string }) {
  const details = CONTROL_STATUS_DETAILS[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold ${details.chipClassName}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${details.dotClassName}`} />
      {label ?? details.label}
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
          : "bg-mint-100 text-petrol-700";
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold ${className}`}>
      {CAPABILITY_STATUS_LABELS[status]}
    </span>
  );
}

function Field({ label, children, mono = false }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-bold tracking-[0.12em] uppercase opacity-65">{label}</p>
      <p className={`mt-1 ${mono ? "font-mono text-[10px] leading-4 break-all" : "text-xs break-words"}`}>
        {children}
      </p>
    </div>
  );
}

function EvidenceList({ capability }: { capability: ComplianceCapabilityView }) {
  if (capability.evidence.length === 0) {
    return (
      <p className="text-petrol-600 mt-3 text-xs">
        {capability.status === "collectionIncomplete"
          ? "Relevant policy data is incomplete. Evidence could not be assessed."
          : "No recognized setting detected in the available policy data."}
      </p>
    );
  }
  return (
    <div className="mt-3 space-y-2">
      {capability.evidence.map((evidence, index) => {
        const isCounterEvidence = evidence.verdict === "disabled";
        const isAssignedCounterEvidence = isCounterEvidence && evidence.assignment.state === "assigned";
        const isUnassignedCounterEvidence = isCounterEvidence && evidence.assignment.state === "notAssigned";
        const assignment =
          evidence.assignment.state === "assigned" && evidence.assignment.targets.length > 0
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
            <div className="grid gap-3 @xl:grid-cols-2 @5xl:grid-cols-[1.2fr_0.8fr_1.3fr_0.75fr_1fr]">
              <Field label="Policy">
                <span className="font-semibold">{evidence.policyName}</span>
              </Field>
              <Field label="Type">{evidence.policyType}</Field>
              <Field label="Setting" mono>
                {evidence.settingId}
              </Field>
              <Field label="Configured value" mono>
                {isAssignedCounterEvidence ? `Risk: ${evidence.observedValue}` : evidence.observedValue}
              </Field>
              <Field label="Assignment">
                {assignmentDetails(evidence.assignment).join("; ") || assignment}. Effective coverage unverified.
              </Field>
            </div>
            <p className="mt-2 text-[11px]">
              Evidence type: {evidence.kind}. Policy version: {evidence.policyVersion ?? "unknown"}. Last modified:{" "}
              {evidence.policyModifiedAt ?? "unknown"}.
            </p>
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
                      : evidence.assignment.state === "unknown"
                        ? "Non-enforcing setting; assignment unknown"
                        : "Deviating configuration detected, but not assigned"}
                  </span>
                )}
                {evidence.note && <p className="min-w-0 flex-1 text-[11px] leading-5 italic">{evidence.note}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SettingChecks({ capability }: { capability: ComplianceCapabilityView }) {
  return (
    <div className="mt-3 space-y-3">
      {capability.checks.map((check, index) => (
        <div
          key={`${check.policyId ?? "collection"}-${check.settingId}-${index}`}
          className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="bg-mint-100 text-petrol-700 rounded-full px-2 py-1 font-semibold">
              {ASSESSMENT_LABELS[check.assessmentStatus]}
            </span>
            {check.result && (
              <span
                className={`rounded-full px-2 py-1 font-semibold ${
                  check.result === "matches"
                    ? "bg-emerald-50 text-emerald-800"
                    : check.result === "different"
                      ? "bg-red-50 text-red-800"
                      : "bg-amber-50 text-amber-800"
                }`}
              >
                {CHECK_RESULT_LABELS[check.result]}
              </span>
            )}
          </div>
          {check.policyName && <p className="text-petrol-950 mt-2 font-semibold">{check.policyName}</p>}
          <p className="mt-2 font-mono text-[10px] break-all text-slate-600">{check.settingId}</p>
          <dl className="mt-2 grid gap-3 @xl:grid-cols-2">
            <div>
              <dt className="font-semibold">Expected value</dt>
              <dd className="mt-1 break-words">
                {displayCheckValue(check.expectedValue) || "No automated comparison available"}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Actual value</dt>
              <dd className="mt-1 min-w-0">
                <CheckValue
                  value={check.actualValue}
                  fallback={check.result === "missing" ? "Not found" : "Unavailable"}
                />
              </dd>
            </div>
          </dl>
          {check.reason && <p className="mt-2 text-slate-600">{check.reason}</p>}
          {check.assignment && (
            <p className="mt-2 text-slate-600">
              Assignment:{" "}
              {assignmentDetails(check.assignment).join("; ") ||
                { assigned: "Assigned", notAssigned: "Not assigned", unknown: "Unknown" }[check.assignment.state]}
              . Effective deployment is unverified.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function ControlRow({
  control,
  capabilitiesById,
  expanded,
  onToggle,
}: {
  control: ControlAssessment;
  capabilitiesById: Map<string, ComplianceCapabilityView>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const pendingCapabilities = control.capabilityIds
    .map((id) => capabilitiesById.get(id))
    .filter((result) => result?.status === "collectionIncomplete" || result?.status === "assignmentUnknown");
  const statusLabel =
    control.status === "notApplicable"
      ? "Outside selected scope"
      : checkSummary(control.capabilityIds.flatMap((id) => capabilitiesById.get(id)?.checks ?? []));
  const pendingReasons = [...new Set(pendingCapabilities.flatMap((result) => result?.limitations ?? []))];
  const panelId = `compliance-control-${control.control.id.replace(/[^a-z0-9]/gi, "-")}`;

  return (
    <article className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        aria-controls={panelId}
        aria-label={`${control.control.id} ${control.control.title}: ${statusLabel}`}
        className="hover:bg-mint-50/60 flex min-h-16 w-full cursor-pointer items-start gap-3 px-4 py-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset @xl:items-center @xl:px-5"
      >
        <ChevronDown
          className={`text-petrol-600 mt-0.5 h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none @xl:mt-0 ${
            expanded ? "rotate-180" : ""
          }`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col-reverse items-start gap-2 @xl:flex-row @xl:items-center">
            <p className="text-petrol-950 min-w-0 flex-1 text-sm font-semibold">
              <span className="mr-2 font-mono text-xs text-teal-700">{control.control.id}</span>
              {control.control.title}
            </p>
            <ControlStatusChip status={control.status} label={statusLabel} />
          </div>
          {control.status === "notAssessed" && (
            <span className="mt-2 block text-xs leading-5 text-amber-900">
              {control.capabilityIds.length === 0
                ? control.unassessedAspects.join(" ") ||
                  "This requirement needs evidence outside the collected settings or a supported platform in scope."
                : pendingReasons.join(" ") ||
                  "Required technical evidence is unavailable. Expand this control to review its checks."}
            </span>
          )}
          {/^ML[123]-/.test(control.control.id) && (
            <p className="mt-2 text-sm leading-6 text-slate-700">{control.control.summary}</p>
          )}
          {control.control.tier && <p className="text-petrol-600 mt-1 text-xs">{control.control.tier}</p>}
        </div>
      </button>

      {expanded && (
        <div
          id={panelId}
          className="border-petrol-950/6 divide-petrol-950/6 selectable animate-fade-in divide-y border-t bg-slate-50/55 px-4 @xl:px-5"
        >
          {control.unassessedAspects.length > 0 && (
            <details className="py-4 text-xs text-slate-600">
              <DisclosureSummary className="font-semibold hover:text-teal-700">
                {control.unavailableCheck ? "Unable to check" : "Scope of these policy checks"}
              </DisclosureSummary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                {control.unassessedAspects.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          )}
          {control.capabilityIds.map((capabilityId) => {
            const capability = capabilitiesById.get(capabilityId);
            if (!capability) return null;
            return (
              <section key={capabilityId} className="py-4">
                <div className="flex flex-col gap-2 @xl:flex-row @xl:items-center @xl:justify-between">
                  <div className="min-w-0">
                    <h3 className="text-petrol-950 text-sm font-semibold">{capability.capability.name}</h3>
                    {capability.capability.caveat && capability.evidence.length > 0 && (
                      <p className="text-petrol-600 mt-1 text-[11px] leading-4 italic">
                        {capability.capability.caveat.en}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 text-xs text-slate-600">{checkSummary(capability.checks)}</span>
                </div>
                <SettingChecks capability={capability} />
                {capability.evidence.length > 0 && (
                  <details className="mt-3 text-xs">
                    <DisclosureSummary className="text-petrol-950 font-semibold hover:text-teal-700">
                      Deployment and supporting evidence
                    </DisclosureSummary>
                    <div className="mt-2">
                      <CapabilityStatusChip status={capability.status} />
                    </div>
                    <EvidenceList capability={capability} />
                  </details>
                )}
              </section>
            );
          })}
        </div>
      )}
    </article>
  );
}
