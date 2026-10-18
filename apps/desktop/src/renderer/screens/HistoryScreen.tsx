import {
  ArrowRight,
  CalendarClock,
  CircleCheck,
  CirclePause,
  CircleX,
  Clock,
  FileText,
  History,
  KeyRound,
  LogIn,
  Minus,
  Plus,
  RotateCw,
  ShieldCheck,
  SkipForward,
  Trash2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  CAPABILITY_STATUS_LABELS,
  CONTROL_STATUS_LABELS,
} from "../../../../../src/lib/compliance/presentation";
import type {
  CapabilityChange,
  ControlStatusChange,
  EvidenceRef,
  IdentityChange,
  IdentityDiff,
  NotComparedFamily,
  PolicyChange,
  SettingChange,
} from "../../../../../src/lib/snapshots/diff";
import type {
  HistoryDiffView,
  HistoryEntry,
  HistoryStatus,
  ScheduleHours,
  ScheduleStatus,
} from "../../shared/ipc-types";
import { CollectButton } from "../components/collection/CollectButton";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Badge, type BadgeVariant } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useAsyncAction } from "../hooks/use-async-action";
import { errorMessage, ipc } from "../lib/ipc";
import { useApp } from "../state/context";

type Tab = "policies" | "controls";

export function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

const SIDE_TEXT: Record<NotComparedFamily["side"], string> = {
  from: "the earlier snapshot",
  to: "the later snapshot",
  both: "both snapshots",
};

function notComparedText(family: NotComparedFamily): string {
  if (family.reason === "missing") return `not in ${SIDE_TEXT[family.side]}`;
  if (family.reason === "skipped") return `not collected in ${SIDE_TEXT[family.side]}`;
  return `collection failed in ${SIDE_TEXT[family.side]}`;
}

// A long value is clamped to four lines and can be shown in full.
function Value({ value, label }: { value: string | null; label: string }) {
  const node = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [clamped, setClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const element = node.current;
    if (!element || expanded) return;
    const measure = () => setClamped(element.scrollHeight > element.clientHeight + 1);
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [value, expanded]);
  return (
    <div className="min-w-0">
      <p className="text-petrol-600 text-[10px] font-bold tracking-[0.1em] uppercase">{label}</p>
      <p
        ref={node}
        id={id}
        className={`selectable mt-0.5 text-[13px] leading-5 break-words whitespace-pre-line ${
          value === null ? "text-petrol-600 italic" : "text-petrol-900"
        } ${expanded ? "" : "line-clamp-4"}`}
      >
        {value ?? "Not set"}
      </p>
      {clamped && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 cursor-pointer rounded text-xs font-semibold text-teal-700 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          {expanded ? "Show less" : "Show full value"}
        </button>
      )}
    </div>
  );
}

function SettingRow({ setting }: { setting: SettingChange }) {
  return (
    <li className="grid gap-x-6 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,4fr)]">
      <div className="min-w-0">
        {setting.path.length > 0 && (
          <p className="text-petrol-600 selectable mb-0.5 text-[11px] leading-4 break-words">
            {setting.path.join(" › ")}
          </p>
        )}
        <p className="text-petrol-950 selectable text-sm leading-5 font-semibold break-words">
          {setting.name}
          {setting.change !== "changed" && (
            <Badge variant={setting.change === "added" ? "success" : "danger"} className="ml-2 align-[1px]">
              {setting.change === "added" ? "Added" : "Removed"}
            </Badge>
          )}
        </p>
        {setting.definitionId && setting.definitionId !== setting.name && (
          <p className="text-petrol-600 selectable mt-1 font-mono text-[11px] leading-4 break-all">
            <span className="sr-only">Technical id: </span>
            {setting.definitionId}
          </p>
        )}
      </div>
      {setting.notStored ? (
        <p className="text-petrol-700 text-[13px] leading-5 md:col-span-2">
          {setting.valueNotStored
            ? setting.change === "changed"
              ? "Value changed, not stored. History keeps only a fingerprint of this value."
              : setting.change === "added"
                ? "Value added, not stored. History keeps only a fingerprint of this value."
                : "Value removed, not stored. History keeps only a fingerprint of this value."
            : setting.change === "changed"
              ? "Content changed. Script bodies are not kept in history."
              : setting.change === "added"
                ? "Content added. Script bodies are not kept in history."
                : "Content removed. Script bodies are not kept in history."}
        </p>
      ) : (
        <>
          <Value value={setting.before} label="Before" />
          <Value value={setting.after} label="After" />
        </>
      )}
    </li>
  );
}

const KIND: Record<PolicyChange["kind"], { label: string; variant: BadgeVariant }> = {
  added: { label: "Added", variant: "success" },
  removed: { label: "Removed", variant: "danger" },
  changed: { label: "Changed", variant: "info" },
};

function PolicyCard({ policy }: { policy: PolicyChange }) {
  const kind = KIND[policy.kind];
  const hiddenSettings = policy.settingsTotal - policy.settings.length;
  const hiddenAssignments = policy.assignmentsTotal - policy.assignments.length;
  return (
    <article
      className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white"
      aria-label={`${policy.displayName}, ${kind.label.toLowerCase()}`}
    >
      <div className="border-petrol-950/6 flex items-start gap-3 px-5 py-3 [&:not(:last-child)]:border-b">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <FileText className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-petrol-950 selectable text-[15px] leading-6 font-semibold break-words">
            {policy.displayName}
          </h3>
          {policy.previousName !== undefined && (
            <p className="text-petrol-700 selectable text-[13px] leading-5 break-words">
              Renamed from <span className="font-semibold">{policy.previousName}</span>
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge variant={kind.variant}>{kind.label}</Badge>
            <Badge>{policy.sectionLabel}</Badge>
            {policy.kind === "changed" && policy.settingsTotal > 0 && (
              <span className="text-petrol-600 text-[11px]">{plural(policy.settingsTotal, "setting change")}</span>
            )}
            {policy.kind === "changed" && policy.assignmentsTotal > 0 && (
              <span className="text-petrol-600 text-[11px]">
                {plural(policy.assignmentsTotal, "assignment change")}
              </span>
            )}
          </div>
        </div>
      </div>
      {policy.settings.length > 0 && (
        <ul className="divide-petrol-950/6 divide-y" aria-label="Setting changes">
          {policy.settings.map((setting) => (
            <SettingRow key={setting.key} setting={setting} />
          ))}
        </ul>
      )}
      {hiddenSettings > 0 && (
        <p className="text-petrol-600 border-petrol-950/6 border-t px-5 py-2 text-xs">
          Showing {policy.settings.length.toLocaleString()} of {policy.settingsTotal.toLocaleString()} setting
          changes.
        </p>
      )}
      {policy.assignments.length > 0 && (
        <div className="border-petrol-950/6 border-t px-5 py-3">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.1em] uppercase">Assignments</p>
          <ul className="mt-1.5 space-y-1" aria-label="Assignment changes">
            {policy.assignments.map((assignment, index) => (
              <li key={`${assignment.change}-${index}`} className="flex items-start gap-2 text-[13px] leading-5">
                {assignment.change === "added" ? (
                  <Plus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                ) : (
                  <Minus className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                )}
                <span className="text-petrol-900 selectable min-w-0 break-words">
                  <span className="sr-only">{assignment.change === "added" ? "Added: " : "Removed: "}</span>
                  {assignment.label}
                </span>
              </li>
            ))}
          </ul>
          {hiddenAssignments > 0 && (
            <p className="text-petrol-600 mt-1.5 text-xs">
              Showing {policy.assignments.length} of {policy.assignmentsTotal} assignment changes.
            </p>
          )}
        </div>
      )}
    </article>
  );
}

function PolicyChanges({ diff }: { diff: HistoryDiffView }) {
  const { totals } = diff;
  const groups: Array<{ kind: PolicyChange["kind"]; title: string }> = [
    { kind: "changed", title: "Changed" },
    { kind: "added", title: "Added" },
    { kind: "removed", title: "Removed" },
  ];
  const shown = diff.policies.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" aria-label="Change summary">
        <Badge variant="success">{plural(totals.added, "added policy", "added policies")}</Badge>
        <Badge variant="danger">{plural(totals.removed, "removed policy", "removed policies")}</Badge>
        <Badge variant="info">{plural(totals.renamed, "renamed policy", "renamed policies")}</Badge>
        <Badge variant="info">{plural(totals.settingChanges, "setting change")}</Badge>
        <Badge variant="info">{plural(totals.assignmentChanges, "assignment change")}</Badge>
      </div>
      <p className="text-petrol-600 px-1 text-xs leading-5">
        Device configuration profiles keep only the properties the evidence checks read, so changes to their other
        properties are not shown.
      </p>
      {diff.notCompared.length > 0 && (
        <Alert tone="warning" title="Some families were not compared">
          <p>Their data was incomplete, so changes there are not shown.</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {diff.notCompared.map((family) => (
              <li key={family.sectionKey}>
                <span className="font-semibold">{family.label}</span>: {notComparedText(family)}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {totals.notComparedItems > 0 && (
        <Alert tone="warning" title={`${plural(totals.notComparedItems, "policy was", "policies were")} not compared`}>
          <p>Their details or assignments were not fully collected in one of the snapshots.</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {diff.notComparedItems.map((item) => (
              <li key={`${item.sectionKey}-${item.id}`} className="break-words">
                {item.displayName} <span className="text-amber-900/70">({item.sectionLabel})</span>
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {totals.policies === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="No configuration changes"
          description={
            diff.notCompared.length || totals.notComparedItems
              ? "Nothing changed in the policies that could be compared."
              : "The policies, settings and assignments are the same in both snapshots."
          }
        />
      ) : (
        groups.map(({ kind, title }) => {
          const policies = diff.policies.filter((policy) => policy.kind === kind);
          if (!policies.length) return null;
          return (
            <section key={kind} aria-label={`${title} policies`} className="space-y-3">
              <h2 className="text-petrol-700 px-1 text-xs font-bold tracking-[0.12em] uppercase">
                {title} <span className="text-petrol-600 font-semibold tabular-nums">({policies.length})</span>
              </h2>
              {policies.map((policy) => (
                <PolicyCard key={`${policy.sectionKey}-${policy.id}-${policy.kind}`} policy={policy} />
              ))}
            </section>
          );
        })
      )}
      {shown < totals.policies && (
        <p className="text-petrol-600 px-1 text-center text-xs">
          Showing the first {shown.toLocaleString()} of {totals.policies.toLocaleString()} changed policies.
          Compare snapshots closer together to see fewer changes at a time.
        </p>
      )}
      {diff.identity && <IdentityChanges identity={diff.identity} />}
    </div>
  );
}

function IdentityRow({ change }: { change: IdentityChange }) {
  return (
    <li className="grid gap-x-6 gap-y-2 px-5 py-3 md:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,4fr)]">
      <div className="min-w-0">
        {change.path.length > 0 && (
          <p className="text-petrol-600 selectable mb-0.5 text-[11px] leading-4 break-words">
            {change.path.join(" › ")}
          </p>
        )}
        <p className="text-petrol-950 selectable text-sm leading-5 font-semibold break-words">
          {change.name}
          {change.change !== "changed" && (
            <Badge variant={change.change === "added" ? "success" : "danger"} className="ml-2 align-[1px]">
              {change.change === "added" ? "Added" : "Removed"}
            </Badge>
          )}
        </p>
      </div>
      <Value value={change.before} label="Before" />
      <Value value={change.after} label="After" />
    </li>
  );
}

// Entra tenant settings are tenant-wide, not configuration policies, so
// they are listed and counted apart from the policy changes.
function IdentityChanges({ identity }: { identity: IdentityDiff }) {
  if (!identity.total && !identity.notCompared.length) return null;
  const policies = [...new Set(identity.changes.map((change) => change.policyLabel))];
  return (
    <section aria-labelledby="identity-changes-title" className="space-y-3">
      <h2
        id="identity-changes-title"
        className="text-petrol-700 px-1 text-xs font-bold tracking-[0.12em] uppercase"
      >
        Entra tenant settings{" "}
        <span className="text-petrol-600 font-semibold tabular-nums">({identity.total})</span>
      </h2>
      <p className="text-petrol-600 px-1 text-xs leading-5">
        Tenant-wide Entra ID settings, counted apart from the policy changes above.
      </p>
      {identity.notCompared.length > 0 && (
        <Alert tone="warning" title="Some Entra settings were not compared">
          <p>They were not read in one of the snapshots, so changes there are not shown.</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {identity.notCompared.map((entry) => (
              <li key={entry.policy}>
                <span className="font-semibold">{entry.label}</span>: not read in {SIDE_TEXT[entry.side]}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {identity.total === 0 ? (
        <p className="text-petrol-700 px-1 text-[13px] leading-5">
          No changes in the Entra settings that could be compared.
        </p>
      ) : (
        policies.map((label) => (
          <article
            key={label}
            className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white"
            aria-label={label}
          >
            <h3 className="text-petrol-950 border-petrol-950/6 border-b px-5 py-3 text-[15px] leading-6 font-semibold break-words">
              {label}
            </h3>
            <ul className="divide-petrol-950/6 divide-y" aria-label="Setting changes">
              {identity.changes
                .filter((change) => change.policyLabel === label)
                .map((change) => (
                  <IdentityRow key={change.key} change={change} />
                ))}
            </ul>
          </article>
        ))
      )}
      {identity.changes.length < identity.total && (
        <p className="text-petrol-600 px-1 text-xs">
          Showing {identity.changes.length.toLocaleString()} of {identity.total.toLocaleString()} Entra setting
          changes.
        </p>
      )}
    </section>
  );
}

function statusText(status: string | null, labels: Record<string, string>): string {
  return status === null ? "Not mapped" : (labels[status] ?? status);
}

// "<policy>: <setting>: <value>" with the readable names main resolved from
// the stored Settings Catalog definitions. The raw ids stay in the tooltip.
function EvidenceLine({ evidence }: { evidence: EvidenceRef }) {
  return (
    <>
      <span className="font-semibold">{evidence.policyName}</span>:{" "}
      {evidence.settingName ? (
        <span title={evidence.settingId}>{evidence.settingName}</span>
      ) : (
        <span className="font-mono text-[11px] break-all">{evidence.settingId}</span>
      )}
      :{" "}
      {evidence.valueLabel ? (
        <span className="text-petrol-950 font-medium" title={evidence.observedValue}>
          {evidence.valueLabel}
        </span>
      ) : (
        <span className="text-petrol-950 font-medium">{evidence.observedValue}</span>
      )}
    </>
  );
}

function CauseBlock({ cause }: { cause: CapabilityChange }) {
  const rows: ReactNode[] = [
    ...cause.evidenceAdded.map((ref, index) => (
      <li key={`a${index}`} className="flex items-start gap-2">
        <Plus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" aria-hidden="true" />
        <span className="selectable min-w-0 break-words">
          <span className="sr-only">Evidence added: </span>
          <EvidenceLine evidence={ref} />{" "}
          <span className="text-petrol-600">
            ({ref.verdict === "enforced" ? "enforcing" : "not enforcing"},{" "}
            {ref.assignment === "assigned"
              ? "assigned"
              : ref.assignment === "notAssigned"
                ? "not assigned"
                : "assignment unknown"}
            )
          </span>
        </span>
      </li>
    )),
    ...cause.evidenceRemoved.map((ref, index) => (
      <li key={`r${index}`} className="flex items-start gap-2">
        <Minus className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-600" aria-hidden="true" />
        <span className="selectable min-w-0 break-words">
          <span className="sr-only">Evidence removed: </span>
          <EvidenceLine evidence={ref} />
        </span>
      </li>
    )),
  ];
  return (
    <li className="border-petrol-950/6 bg-surface rounded-xl border px-3.5 py-2.5">
      <p className="text-petrol-950 text-[13px] font-semibold break-words">{cause.name}</p>
      <p className="text-petrol-700 mt-0.5 flex flex-wrap items-center gap-1 text-xs">
        {statusText(cause.before, CAPABILITY_STATUS_LABELS)}
        <ArrowRight className="h-3 w-3" aria-label="to" />
        {statusText(cause.after, CAPABILITY_STATUS_LABELS)}
      </p>
      {rows.length > 0 && <ul className="text-petrol-800 mt-1.5 space-y-1 text-xs leading-5">{rows}</ul>}
      {cause.checksChanged.length > 0 && rows.length === 0 && (
        <p className="text-petrol-600 mt-1 text-xs">
          {plural(cause.checksChanged.length, "technical check")} changed result.
        </p>
      )}
    </li>
  );
}

function ControlCard({ change }: { change: ControlStatusChange }) {
  return (
    <article
      className="border-petrol-950/6 shadow-card rounded-2xl border bg-white px-5 py-4"
      aria-label={`${change.controlId} ${change.title}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <h3 className="text-petrol-950 min-w-0 flex-1 basis-64 text-sm leading-5 font-semibold break-words">
          <span className="text-petrol-600 mr-2 font-mono text-xs">{change.controlId}</span>
          {change.title}
        </h3>
        <p className="flex flex-wrap items-center gap-1.5 text-xs">
          <Badge>{statusText(change.before, CONTROL_STATUS_LABELS)}</Badge>
          <ArrowRight className="text-petrol-600 h-3.5 w-3.5" aria-label="to" />
          <Badge variant="info">{statusText(change.after, CONTROL_STATUS_LABELS)}</Badge>
        </p>
      </div>
      {change.mappingChanged && (
        <p className="mt-2 text-xs leading-5 text-amber-800">
          The capabilities mapped to this control differ between the two rulesets.
        </p>
      )}
      {change.causes.length > 0 ? (
        <ul className="mt-3 space-y-2" aria-label="Causes">
          {change.causes.map((cause) => (
            <CauseBlock key={cause.capabilityId} cause={cause} />
          ))}
        </ul>
      ) : (
        !change.mappingChanged && (
          <p className="text-petrol-600 mt-2 text-xs">No evidence differs; the status rules may have changed.</p>
        )
      )}
    </article>
  );
}

function ControlChanges({
  diff,
  onFramework,
  loading,
}: {
  diff: HistoryDiffView;
  onFramework: (id: string) => void;
  loading: boolean;
}) {
  const { controls } = diff;
  const selectId = useId();
  const framework = controls.frameworks.find((entry) => entry.id === controls.frameworkId);
  return (
    <div className="space-y-4">
      {controls.rulesetChanged && (
        <Alert tone="warning" title="The evidence rules changed between these snapshots">
          Ruleset {controls.fromRuleset} was used for the earlier snapshot and {controls.toRuleset} for the
          later one. Some status changes may come from mapping updates, not from changes in the tenant.
        </Alert>
      )}
      {controls.frameworks.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor={selectId} className="text-petrol-700 text-xs font-semibold">
            Framework
          </label>
          <select
            id={selectId}
            value={controls.frameworkId ?? ""}
            disabled={loading}
            onChange={(event) => onFramework(event.target.value)}
            className="border-petrol-950/12 text-petrol-950 min-h-9 max-w-full min-w-0 cursor-pointer rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-60"
          >
            {controls.frameworks.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name} ({plural(entry.changed, "change")})
              </option>
            ))}
          </select>
        </div>
      )}
      {controls.changes.length === 0 ? (
        <EmptyState
          compact
          icon={ShieldCheck}
          title="No control status changes"
          description={`The stored assessments show the same status for every ${framework?.name ?? ""} control.`}
        />
      ) : (
        <div className="space-y-3">
          {controls.changes.map((change) => (
            <ControlCard key={change.controlId} change={change} />
          ))}
          {controls.total > controls.changes.length && (
            <p className="text-petrol-600 px-1 text-center text-xs">
              Showing {controls.changes.length.toLocaleString()} of {controls.total.toLocaleString()} control
              changes.
            </p>
          )}
        </div>
      )}
      <p className="text-petrol-600 px-1 text-xs leading-5">
        Statuses come from the assessments stored with each snapshot. This is evidence of configuration, not a
        compliance verdict.
      </p>
    </div>
  );
}

function SnapshotSelect({
  label,
  value,
  entries,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  entries: HistoryEntry[];
  onChange: (id: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1 basis-56">
      <label htmlFor={id} className="text-petrol-700 mb-1 block text-xs font-semibold">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="border-petrol-950/12 text-petrol-950 min-h-10 w-full cursor-pointer rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-60"
      >
        {entries.map((entry) => (
          <option key={entry.id} value={entry.id}>
            {formatDate(entry.collectedAt)}
            {entry.partial ? " (partial)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Tabs({ tab, onTab, diff }: { tab: Tab; onTab: (tab: Tab) => void; diff: HistoryDiffView | null }) {
  const tabs: Array<{ id: Tab; label: string; count?: number }> = [
    {
      id: "policies",
      label: "Policies",
      count: diff?.totals.policies,
    },
    {
      id: "controls",
      label: "Controls",
      count: diff ? diff.controls.frameworks.reduce((sum, entry) => sum + entry.changed, 0) : undefined,
    },
  ];
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const onKey = (event: KeyboardEvent, index: number) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = (index + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
    onTab(tabs[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label="Changes" className="border-petrol-950/8 flex gap-1 border-b">
      {tabs.map((entry, index) => (
        <button
          key={entry.id}
          ref={(node) => {
            refs.current[index] = node;
          }}
          type="button"
          role="tab"
          id={`history-tab-${entry.id}`}
          aria-selected={tab === entry.id}
          aria-controls={`history-panel-${entry.id}`}
          tabIndex={tab === entry.id ? 0 : -1}
          onClick={() => onTab(entry.id)}
          onKeyDown={(event) => onKey(event, index)}
          className={`-mb-px inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-t-lg border-b-2 px-3 text-[13px] font-semibold focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
            tab === entry.id
              ? "border-teal-600 text-teal-800"
              : "text-petrol-600 hover:text-petrol-950 border-transparent"
          }`}
        >
          {entry.label}
          {entry.count !== undefined && (
            <span className="bg-mint-100 text-petrol-700 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums">
              {entry.count.toLocaleString()}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function Compare({ entries }: { entries: HistoryEntry[] }) {
  const [pair, setPair] = useState<{ fromId: string; toId: string }>({
    fromId: entries[1]!.id,
    toId: entries[0]!.id,
  });
  // A new or deleted snapshot resets the pair to previous and latest.
  const listKey = entries.map((entry) => entry.id).join(",");
  const [shownKey, setShownKey] = useState(listKey);
  if (shownKey !== listKey) {
    setShownKey(listKey);
    setPair({ fromId: entries[1]!.id, toId: entries[0]!.id });
  }
  const [frameworkId, setFrameworkId] = useState<string | undefined>(undefined);
  const [tab, setTab] = useState<Tab>("policies");
  const [diff, setDiff] = useState<HistoryDiffView | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);

  useEffect(() => {
    const id = ++request.current;
    if (pair.fromId === pair.toId) {
      setDiff(null);
      setError("Choose two different snapshots.");
      return;
    }
    setLoading(true);
    setError(null);
    ipc
      .historyDiff({ fromId: pair.fromId, toId: pair.toId, ...(frameworkId ? { frameworkId } : {}) })
      .then((next) => {
        if (id === request.current) setDiff(next);
      })
      .catch((caught: unknown) => {
        if (id !== request.current) return;
        setError(errorMessage(caught));
        setDiff(null);
      })
      .finally(() => {
        if (id === request.current) setLoading(false);
      });
  }, [pair.fromId, pair.toId, frameworkId, attempt, listKey]);

  let body: ReactNode;
  if (error) {
    body = (
      <Alert
        tone="danger"
        title="The snapshots could not be compared"
        action={
          <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => setAttempt((count) => count + 1)}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  } else if (!diff) {
    body = (
      <div className="text-petrol-600 flex items-center gap-2 px-1 py-6 text-[13px]" role="status">
        <Spinner /> Comparing snapshots
      </div>
    );
  } else {
    body = (
      <div
        id={`history-panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`history-tab-${tab}`}
        aria-busy={loading}
        className={`transition-opacity ${loading ? "opacity-60" : ""}`}
      >
        {tab === "policies" ? (
          <PolicyChanges diff={diff} />
        ) : (
          <ControlChanges diff={diff} loading={loading} onFramework={setFrameworkId} />
        )}
      </div>
    );
  }

  return (
    <section aria-labelledby="history-compare" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="history-compare" className="text-petrol-950 text-lg font-semibold tracking-[-0.02em]">
          Compare snapshots
        </h2>
        {loading && diff && (
          <span className="text-petrol-600 inline-flex items-center gap-2 text-xs" role="status">
            <Spinner className="h-3.5 w-3.5" /> Comparing
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-3">
        <SnapshotSelect
          label="Earlier snapshot"
          value={pair.fromId}
          entries={entries}
          disabled={false}
          onChange={(fromId) => setPair((current) => ({ ...current, fromId }))}
        />
        <SnapshotSelect
          label="Later snapshot"
          value={pair.toId}
          entries={entries}
          disabled={false}
          onChange={(toId) => setPair((current) => ({ ...current, toId }))}
        />
      </div>
      {diff && (diff.from.partial || diff.to.partial) && !error && (
        <Alert tone="warning">
          {diff.from.partial && diff.to.partial
            ? "Both snapshots are partial."
            : `The ${diff.from.partial ? "earlier" : "later"} snapshot is partial.`}{" "}
          Families whose collection failed are not compared.
        </Alert>
      )}
      <Tabs tab={tab} onTab={setTab} diff={diff} />
      {body}
    </section>
  );
}

function SnapshotList({
  entries,
  onDelete,
  onDeleteAll,
  busy,
}: {
  entries: HistoryEntry[];
  onDelete: (entry: HistoryEntry) => void;
  onDeleteAll: () => void;
  busy: boolean;
}) {
  return (
    <Card padded={false}>
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
        <div className="min-w-0">
          <h2 className="text-petrol-950 text-base font-semibold">Snapshots</h2>
          <p className="text-petrol-600 mt-0.5 text-[13px]">{plural(entries.length, "snapshot")} of this tenant</p>
        </div>
        <Button variant="dangerOutline" size="sm" icon={Trash2} onClick={onDeleteAll} disabled={busy}>
          Delete all
        </Button>
      </div>
      <ul className="divide-petrol-950/6 border-petrol-950/6 divide-y border-t" aria-label="Snapshots">
        {entries.map((entry, index) => (
          <li key={entry.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5 sm:px-6">
            <div className="min-w-0 flex-1 basis-48">
              <p className="text-petrol-950 flex flex-wrap items-center gap-2 text-sm font-semibold">
                {formatDate(entry.collectedAt)}
                {index === 0 && <Badge variant="info">Latest</Badge>}
                {entry.partial && (
                  <Badge variant="warning" title="Some data could not be collected for this snapshot.">
                    Partial
                  </Badge>
                )}
              </p>
              <p className="text-petrol-600 text-xs tabular-nums">
                {plural(entry.items, "item")}, ruleset {entry.rulesetVersion}, {formatBytes(entry.bytes)}
              </p>
            </div>
            <IconButton
              icon={Trash2}
              label={`Delete snapshot of ${formatDate(entry.collectedAt)}`}
              disabled={busy}
              onClick={() => onDelete(entry)}
            />
          </li>
        ))}
      </ul>
    </Card>
  );
}

function KeepHistoryCard({
  status,
  onToggle,
  onDeleteAll,
  onRetry,
  busy,
  error,
}: {
  status: HistoryStatus;
  onToggle: (enabled: boolean) => void;
  onDeleteAll: () => void;
  onRetry: () => void;
  busy: boolean;
  error: string | null;
}) {
  return (
    <Card>
      <CardHeader
        icon={KeyRound}
        eyebrow="On this computer"
        title="Keep history on this computer"
        description="After each collection, the app saves a snapshot of the policy settings, assignments and the evidence assessment so you can see what changed later."
      />
      <div className="text-petrol-700 mt-4 max-w-3xl space-y-2 text-[13px] leading-5 sm:pl-15">
        <p>
          Snapshots are stored encrypted on this computer and never leave it. The encryption protects them if the
          disk or your user folder is copied, and from other users of this computer. It does not protect against
          software that runs under your own account.
        </p>
        <p>
          Script contents, app payloads and other details the comparison does not need are not kept. Device
          configuration profiles keep only the properties the evidence checks read, so changes to their other
          properties are not shown. Up to 30 snapshots per tenant are kept for up to a year; the oldest are removed
          first.
        </p>
      </div>
      {!status.available && (
        <Alert
          tone="warning"
          title={status.locked ? "History could not be opened right now" : "History is not available on this computer"}
          className="mt-4 sm:ml-15"
          action={
            // Locked history is intact: it is opened again, never deleted.
            status.locked ? (
              <Button variant="secondary" size="sm" icon={RotateCw} disabled={busy} onClick={onRetry}>
                Try again
              </Button>
            ) : (
              status.unreadableData && (
                <Button variant="dangerOutline" size="sm" icon={Trash2} disabled={busy} onClick={onDeleteAll}>
                  Delete all history
                </Button>
              )
            )
          }
        >
          {status.reason}
        </Alert>
      )}
      <div className="mt-4 sm:pl-13">
        <Checkbox checked={status.enabled} disabled={!status.available || busy} onChange={onToggle}>
          <span className="min-w-0">
            <span className="text-petrol-950 block text-sm font-semibold">Keep history on this computer</span>
            <span className="text-petrol-600 mt-0.5 block text-[13px] leading-5">
              {status.enabled && !status.available
                ? "On, but no snapshots can be saved until history is available again."
                : status.enabled
                  ? "On. A snapshot is saved after each collection."
                  : "Off. No new snapshots are saved; saved snapshots stay until you delete them."}
            </span>
          </span>
        </Checkbox>
      </div>
      {error && (
        <Alert tone="danger" className="mt-3 sm:ml-15">
          {error}
        </Alert>
      )}
    </Card>
  );
}

const SCHEDULE_OPTIONS: Array<{ hours: ScheduleHours; label: string }> = [
  { hours: 0, label: "Off" },
  { hours: 6, label: "Every 6 hours" },
  { hours: 12, label: "Every 12 hours" },
  { hours: 24, label: "Every 24 hours" },
];

function ScheduleState({ schedule }: { schedule: ScheduleStatus }) {
  const row = "flex items-start gap-2 text-[13px] leading-5";
  switch (schedule.state) {
    case "off":
      return (
        <p className={`${row} text-petrol-700`}>
          <Clock className="text-petrol-600 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          Off. Collections run only when you start them.
        </p>
      );
    case "waiting":
      return (
        <p className={`${row} text-petrol-900`}>
          <Clock className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <span className="min-w-0">
            {schedule.nextRunAt ? (
              <>
                Next run <span className="font-semibold">{formatDate(schedule.nextRunAt)}</span>
              </>
            ) : (
              "Next run soon"
            )}
          </span>
        </p>
      );
    case "running":
      return (
        <p className={`${row} text-petrol-900 font-semibold`}>
          <Spinner className="mt-0.5 h-4 w-4 shrink-0" />
          Running now
        </p>
      );
    case "paused":
      return (
        <p className={`${row} text-amber-900`}>
          <CirclePause className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="min-w-0 break-words">
            <span className="font-semibold">Paused:</span> {schedule.reason ?? "Waiting until runs can start."}
          </span>
        </p>
      );
  }
}

function ScheduleCard({
  history,
  schedule,
  loadError,
  onRetry,
  onChange,
  busy,
  error,
}: {
  history: HistoryStatus;
  schedule: ScheduleStatus | null;
  loadError: string | null;
  onRetry: () => void;
  onChange: (hours: ScheduleHours) => void;
  busy: boolean;
  error: string | null;
}) {
  const selectId = useId();
  const hintId = useId();
  // The chosen interval shows while it is saved; a refused change falls back.
  const [pending, setPending] = useState<ScheduleHours | null>(null);
  const historyOff = !history.enabled;
  const saved = schedule?.hours ?? 0;
  const hours = busy && pending !== null ? pending : saved;
  // With history off only Off can be chosen, so a paused schedule can still be
  // turned off. Saving does not disable it, so keyboard focus stays on it.
  const disabled = !schedule || (historyOff && saved === 0);
  return (
    <Card aria-labelledby="schedule-title">
      <CardHeader
        icon={CalendarClock}
        eyebrow="While the app is open"
        title={<span id="schedule-title">Scheduled collection</span>}
        description="Collect this tenant automatically on a fixed interval, so history keeps up without a manual collection."
      />
      <div className="mt-4 max-w-[54rem] space-y-4 sm:pl-15">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div className="min-w-0 basis-56">
            <label htmlFor={selectId} className="text-petrol-700 mb-1 block text-xs font-semibold">
              Collect automatically
            </label>
            <select
              id={selectId}
              value={hours}
              disabled={disabled}
              aria-describedby={historyOff ? hintId : undefined}
              onChange={(event) => {
                if (busy) return;
                const next = Number(event.target.value) as ScheduleHours;
                setPending(next);
                onChange(next);
              }}
              className="border-petrol-950/12 text-petrol-950 min-h-10 w-full cursor-pointer rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
            >
              {SCHEDULE_OPTIONS.map((option) => (
                <option
                  key={option.hours}
                  value={option.hours}
                  disabled={historyOff && option.hours !== 0 && option.hours !== saved}
                >
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          {busy && (
            <span className="text-petrol-600 inline-flex min-h-10 items-center gap-2 text-xs" role="status">
              <Spinner className="h-3.5 w-3.5" /> Saving
            </span>
          )}
        </div>
        {historyOff && (
          <p id={hintId} className="text-xs leading-5 text-amber-800">
            Turn on Keep history first. Scheduled collections save snapshots, so they need history.
          </p>
        )}
        {loadError ? (
          <Alert
            tone="danger"
            title="The schedule could not be loaded"
            action={
              <Button variant="secondary" size="sm" icon={RotateCw} onClick={onRetry}>
                Retry
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : !schedule ? (
          <p className="text-petrol-600 flex items-center gap-2 text-[13px]" role="status">
            <Spinner className="h-3.5 w-3.5" /> Loading the schedule
          </p>
        ) : (
          <div className="space-y-1.5" aria-live="polite">
            <ScheduleState schedule={schedule} />
            {schedule.lastRunAt && (
              <p className="flex items-start gap-2 text-[13px] leading-5">
                {schedule.lastResult === "failed" ? (
                  <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
                ) : (
                  <CircleCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden="true" />
                )}
                <span
                  className={`min-w-0 break-words ${schedule.lastResult === "failed" ? "text-red-800" : "text-petrol-700"}`}
                >
                  Last run {formatDate(schedule.lastRunAt)}:{" "}
                  {schedule.lastResult === "failed"
                    ? `failed: ${schedule.lastError ?? "unknown error"}`
                    : "collected"}
                </span>
              </p>
            )}
            {schedule.lastSkippedAt && (
              <p className="text-petrol-700 flex items-start gap-2 text-[13px] leading-5">
                <SkipForward className="text-petrol-600 mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="min-w-0 break-words">
                  Last skipped {formatDate(schedule.lastSkippedAt)}
                  {schedule.lastSkippedReason ? `: ${schedule.lastSkippedReason}` : ""}
                </span>
              </p>
            )}
          </div>
        )}
        {error && <Alert tone="danger">{error}</Alert>}
        <ul className="text-petrol-600 list-disc space-y-0.5 pl-4 text-xs leading-5">
          <li>Runs only while the app is open and you are signed in.</li>
          <li>Every run checks the license first.</li>
          <li>If the computer was asleep when a run was due, it runs once after waking.</li>
          <li>Each run saves a snapshot like a manual collection.</li>
        </ul>
      </div>
    </Card>
  );
}

type Confirm = { kind: "one"; entry: HistoryEntry } | { kind: "all" } | null;

// Keyed by the signed in account and tenant, so nothing of the previous
// account, such as its history or a pending request, survives a switch.
export function HistoryScreen() {
  const { state } = useApp();
  return <HistoryBody key={`${state.auth?.account ?? ""}|${state.auth?.tenantId ?? ""}`} />;
}

function HistoryBody() {
  const { state, actions } = useApp();
  const signedIn = Boolean(state.auth?.signedIn);
  const entitled = Boolean(state.license?.entitled);
  const [status, setStatus] = useState<HistoryStatus | null>(null);
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [schedule, setSchedule] = useState<ScheduleStatus | null>(null);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const toggle = useAsyncAction();
  const remove = useAsyncAction();
  const scheduleAction = useAsyncAction();
  const request = useRef(0);
  // Every schedule update bumps this, so a slower read never overwrites a
  // newer status pushed by main.
  const scheduleSeq = useRef(0);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const cancelConfirm = useCallback(() => setConfirm(null), []);
  useEffect(() => ipc.onHistoryChanged(reload), [reload]);

  const showSchedule = useCallback((next: ScheduleStatus) => {
    scheduleSeq.current += 1;
    setSchedule(next);
    setScheduleError(null);
  }, []);
  const loadSchedule = useCallback(async () => {
    const id = ++scheduleSeq.current;
    setScheduleError(null);
    try {
      const next = await ipc.historyScheduleStatus();
      if (id === scheduleSeq.current) setSchedule(next);
    } catch (caught) {
      if (id === scheduleSeq.current) setScheduleError(errorMessage(caught));
    }
  }, []);
  useEffect(() => ipc.onScheduleStatus(showSchedule), [showSchedule]);

  useEffect(() => {
    const id = ++request.current;
    if (!signedIn || !entitled) return;
    setLoadError(null);
    void (async () => {
      try {
        const next = await ipc.historyStatus();
        const list = next.available ? await ipc.historyList() : [];
        if (id !== request.current) return;
        setStatus(next);
        setEntries(list);
        if (next.available) void loadSchedule();
      } catch (caught) {
        if (id !== request.current) return;
        setLoadError(errorMessage(caught));
      }
    })();
  }, [signedIn, entitled, attempt, state.auth?.tenantId, loadSchedule]);

  const onToggle = (enabled: boolean) =>
    void toggle.run("toggle", async () => {
      const next = await ipc.historySetEnabled(enabled);
      setStatus(next);
      // Turning history off pauses the schedule; on resumes it.
      void loadSchedule();
    });

  const onSchedule = (hours: ScheduleHours) =>
    void scheduleAction.run("schedule", async () => showSchedule(await ipc.historySetSchedule(hours)));

  const onConfirm = () => {
    const target = confirm;
    if (!target) return;
    void remove
      .run("delete", async () => {
        if (target.kind === "one") {
          const list = await ipc.historyDelete(target.entry.id);
          setEntries(list);
          setStatus((current) => (current ? { ...current, count: list.length } : current));
        } else {
          setStatus(await ipc.historyDeleteAll());
          setEntries([]);
        }
      })
      .finally(() => setConfirm(null));
  };

  let body: ReactNode;
  if (!signedIn) {
    body = (
      <EmptyState
        icon={LogIn}
        title="Sign in to see history"
        description="History is kept per tenant. Sign in to the tenant whose snapshots you want to see."
      />
    );
  } else if (!entitled) {
    body = (
      <EmptyState
        icon={KeyRound}
        title="History needs an active license"
        description="Snapshots and comparisons are part of the licensed desktop app."
        action={
          <Button variant="secondary" onClick={() => actions.navigate("license")}>
            Open License and account
          </Button>
        }
      />
    );
  } else if (loadError) {
    body = (
      <Alert
        tone="danger"
        title="History could not be loaded"
        action={
          <Button variant="secondary" size="sm" icon={RotateCw} onClick={reload}>
            Retry
          </Button>
        }
      >
        {loadError}
      </Alert>
    );
  } else if (!status || !entries) {
    body = (
      <div className="text-petrol-600 flex items-center gap-2 px-1 py-6 text-[13px]" role="status">
        <Spinner /> Loading history
      </div>
    );
  } else {
    body = (
      <>
        <KeepHistoryCard
          status={status}
          onToggle={onToggle}
          onDeleteAll={() => setConfirm({ kind: "all" })}
          onRetry={reload}
          busy={toggle.busy !== null || remove.busy !== null}
          error={toggle.error}
        />
        {status.available && (
          <ScheduleCard
            history={status}
            schedule={schedule}
            loadError={scheduleError}
            onRetry={() => void loadSchedule()}
            onChange={onSchedule}
            busy={scheduleAction.busy !== null}
            error={scheduleAction.error}
          />
        )}
        {remove.error && <Alert tone="danger">{remove.error}</Alert>}
        {status.available && entries.length === 0 && (
          <EmptyState
            compact
            icon={History}
            title="No snapshots yet"
            description={
              status.enabled
                ? "A snapshot is saved after each collection. Collect now to save the first one."
                : "Turn on history above, then collect to save the first snapshot."
            }
            action={status.enabled && <CollectButton showMeta={false} />}
          />
        )}
        {entries.length >= 2 && <Compare entries={entries} />}
        {entries.length > 0 && (
          <SnapshotList
            entries={entries}
            busy={remove.busy !== null}
            onDelete={(entry) => setConfirm({ kind: "one", entry })}
            onDeleteAll={() => setConfirm({ kind: "all" })}
          />
        )}
        {entries.length === 1 && (
          <Alert tone="info" title="One snapshot so far">
            Collect again later to compare two snapshots and see what changed.
          </Alert>
        )}
      </>
    );
  }

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Change history"
        title="History"
        description="See what changed in this tenant between two collections: policies, settings, assignments and control evidence."
      />
      {body}
      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        title={
          confirm?.kind === "one"
            ? "Delete this snapshot?"
            : status && !status.available
              ? "Delete all history on this computer?"
              : "Delete all snapshots of this tenant?"
        }
        description={
          confirm?.kind === "one"
            ? `The snapshot of ${formatDate(confirm.entry.collectedAt)} is removed from this computer. This cannot be undone.`
            : status && !status.available
              ? "The history cannot be read, so it cannot be deleted per tenant. Every snapshot of every tenant, the history key and the index are removed from this computer. This cannot be undone."
              : "Every snapshot of the signed in tenant is removed from this computer. This cannot be undone."
        }
        confirmLabel={confirm?.kind === "all" ? "Delete all" : "Delete snapshot"}
        busy={remove.busy !== null}
        onConfirm={onConfirm}
        onCancel={cancelConfirm}
      />
    </div>
  );
}
