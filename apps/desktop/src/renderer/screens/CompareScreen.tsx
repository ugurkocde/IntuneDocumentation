import {
  Building2,
  CheckCircle2,
  Database,
  FileDown,
  FileText,
  FileUp,
  FolderOpen,
  GitCompareArrows,
  KeyRound,
  LogIn,
  RotateCw,
  ShieldCheck,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  COMPARISON_ORDER as ORDER,
  type CompareGroup,
  type CompareRow,
  type CompareValue,
  type ComparisonCounts,
  type ComparisonPart,
  type NotComparedSettingsFamily,
  type SettingComparison,
} from "../../../../../src/lib/snapshots/reference-types";
import type {
  CompareSource,
  CompareTenant,
  CompareView,
  ReferenceSummary,
} from "../../shared/ipc-types";
import { CollectButton } from "../components/collection/CollectButton";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Badge, type BadgeVariant } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useAsyncAction } from "../hooks/use-async-action";
import { errorMessage, ipc, isMac } from "../lib/ipc";
import { useApp } from "../state/context";

type SourceKind = CompareSource["kind"];
type Filter = "differences" | SettingComparison;

const DIFFERENCES: readonly SettingComparison[] = ["different", "missing", "extra", "notComparable"];

const STATUS: Record<SettingComparison, { label: string; variant: BadgeVariant }> = {
  different: { label: "Different", variant: "danger" },
  missing: { label: "Missing", variant: "warning" },
  extra: { label: "Extra", variant: "info" },
  notComparable: { label: "Not comparable", variant: "default" },
  matching: { label: "Matching", variant: "success" },
};

// Must match NEEDS_REFERENCE in main: main no longer holds a reference.
const NEEDS_REFERENCE = "Load a reference file first.";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

function sameTime(a: string, b: string): boolean {
  const x = new Date(a).getTime();
  const y = new Date(b).getTime();
  return Number.isNaN(x) || Number.isNaN(y) ? a === b : x === y;
}

function sourceNoun(kind: SourceKind): string {
  return kind === "reference" ? "the reference" : "the other tenant";
}

function statusDescription(status: Filter, kind: SourceKind): string {
  const noun = sourceNoun(kind);
  switch (status) {
    case "differences":
      return "Every setting that is different, missing, extra or not comparable.";
    case "different":
      return `Set in this tenant and in ${noun}, with different values.`;
    case "missing":
      return `Set in ${noun}, not in this tenant.`;
    case "extra":
      return `Set in this tenant, not in ${noun}.`;
    case "notComparable":
      return "A value is secret or not kept, so it cannot be compared.";
    case "matching":
      return "The same values in both, whichever policies set them.";
  }
}

function filterStatuses(filter: Filter): readonly SettingComparison[] {
  return filter === "differences" ? DIFFERENCES : [filter];
}

function countOf(counts: ComparisonCounts, filter: Filter): number {
  return filterStatuses(filter).reduce((sum, status) => sum + counts[status], 0);
}

// Main keeps the loaded reference for the session but cannot report it back,
// so the summary, the chosen source and the last result are kept here per
// signed in account and survive switching screens.
interface Session {
  key: string;
  kind: SourceKind;
  tenantId: string | null;
  reference: ReferenceSummary | null;
  view: CompareView | null;
  ran: CompareSource | null;
}

let session: Session | null = null;
let watching = false;

// Main forgets the reference when the account signs out, also while this
// screen is not shown.
function watchSignOut(): void {
  if (watching) return;
  watching = true;
  ipc.onAuthChanged((status) => {
    if (!status.signedIn) session = null;
  });
}

// Tests only.
export function resetCompareSession(): void {
  session = null;
}

// --- Radio group --------------------------------------------------------------

interface Choice<T extends string> {
  id: T;
  label: string;
  count?: number;
  description?: string;
  icon?: LucideIcon;
  badge?: string;
  disabled?: boolean;
}

// One tab stop; arrow keys, Home and End move between the enabled choices.
function RadioGroup<T extends string>({
  label,
  value,
  choices,
  onChange,
  variant,
}: {
  label: string;
  value: T;
  choices: Choice<T>[];
  onChange: (id: T) => void;
  variant: "cards" | "chips";
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const prefix = useId();
  const onKey = (event: KeyboardEvent, index: number) => {
    const enabled = choices.map((_, i) => i).filter((i) => !choices[i]!.disabled);
    const position = enabled.indexOf(index);
    let next: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = enabled[(position + 1) % enabled.length];
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp")
      next = enabled[(position + enabled.length - 1) % enabled.length];
    else if (event.key === "Home") next = enabled[0];
    else if (event.key === "End") next = enabled[enabled.length - 1];
    if (next === undefined) return;
    event.preventDefault();
    onChange(choices[next]!.id);
    refs.current[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={variant === "cards" ? "grid gap-3 @2xl:grid-cols-2" : "flex flex-wrap gap-1.5"}
    >
      {choices.map((choice, index) => {
        const checked = choice.id === value;
        const Icon = choice.icon;
        return (
          <button
            key={choice.id}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-describedby={choice.description ? `${prefix}-${choice.id}` : undefined}
            tabIndex={checked ? 0 : -1}
            disabled={choice.disabled}
            onClick={() => onChange(choice.id)}
            onKeyDown={(event) => onKey(event, index)}
            className={
              variant === "cards"
                ? `flex min-w-0 cursor-pointer items-start gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed ${
                    checked
                      ? "border-teal-600/40 bg-teal-50"
                      : "border-petrol-950/8 enabled:hover:bg-mint-50 bg-white disabled:bg-surface"
                  }`
                : `inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                    checked
                      ? "border-teal-600 bg-teal-600 text-white"
                      : "border-petrol-950/12 text-petrol-800 hover:bg-mint-50 bg-white"
                  }`
            }
          >
            {variant === "cards" ? (
              <>
                {Icon && (
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      checked ? "bg-white text-teal-700" : choice.disabled ? "text-petrol-600 bg-white" : "bg-teal-50 text-teal-700"
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span
                      className={`text-sm font-semibold ${choice.disabled ? "text-petrol-600" : "text-petrol-950"}`}
                    >
                      {choice.label}
                    </span>
                    {choice.badge && <Badge variant="solid">{choice.badge}</Badge>}
                  </span>
                  {choice.description && (
                    <span id={`${prefix}-${choice.id}`} className="text-petrol-600 mt-0.5 block text-[13px] leading-5">
                      {choice.description}
                    </span>
                  )}
                </span>
              </>
            ) : (
              <>
                {choice.label}
                {choice.count !== undefined && (
                  <span
                    className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                      checked ? "bg-white/20 text-white" : "bg-mint-100 text-petrol-700"
                    }`}
                  >
                    {choice.count.toLocaleString()}
                  </span>
                )}
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// --- Values -------------------------------------------------------------------

// A long value is clamped to four lines and can be shown in full.
function ValueText({ value }: { value: string | null }) {
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
    <>
      <p
        ref={node}
        id={id}
        className={`selectable text-[13px] leading-5 break-words whitespace-pre-line ${
          value === null ? "text-petrol-600 italic" : "text-petrol-900"
        } ${expanded ? "" : "line-clamp-4"}`}
      >
        {value ?? "Not comparable"}
      </p>
      {clamped && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="mt-0.5 cursor-pointer rounded text-xs font-semibold text-teal-700 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          {expanded ? "Show less" : "Show full value"}
        </button>
      )}
    </>
  );
}

function Values({ label, values }: { label: string; values: CompareValue[] }) {
  return (
    <div className="min-w-0">
      <p className="text-petrol-600 text-[10px] font-bold tracking-[0.1em] uppercase">{label}</p>
      {values.length === 0 ? (
        <p className="text-petrol-600 mt-0.5 text-[13px] leading-5 italic">Not set</p>
      ) : (
        <ul className="mt-0.5 space-y-2">
          {values.map((entry, index) => (
            <li key={index} className="min-w-0">
              <ValueText value={entry.value} />
              <p className="text-petrol-600 selectable mt-0.5 text-[11px] leading-4 break-words">
                <span className="sr-only">Policy: </span>
                {entry.policy}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SettingRow({ row, expectedLabel }: { row: CompareRow; expectedLabel: string }) {
  const status = STATUS[row.status];
  return (
    <li className="grid gap-x-6 gap-y-2 px-5 py-3 @3xl:grid-cols-[minmax(0,5fr)_minmax(0,4fr)_minmax(0,4fr)]">
      <div className="min-w-0">
        <Badge variant={status.variant} className="mb-1">
          {status.label}
        </Badge>
        {row.path.length > 0 && (
          <p className="text-petrol-600 selectable mb-0.5 text-[11px] leading-4 break-words">{row.path.join(" › ")}</p>
        )}
        <p className="text-petrol-950 selectable text-sm leading-5 font-semibold break-words">{row.name}</p>
        {row.instanceChanged && (
          <p className="text-petrol-700 mt-0.5 text-[11px] leading-4">
            The same values, in a group where another setting differs.
          </p>
        )}
        {row.setting !== row.name && (
          <p className="text-petrol-600 selectable mt-1 font-mono text-[11px] leading-4 break-all">
            <span className="sr-only">Technical id: </span>
            {row.setting}
          </p>
        )}
      </div>
      <Values label={expectedLabel} values={row.expected} />
      <Values label="This tenant" values={row.actual} />
    </li>
  );
}

function CountBadges({ counts, statuses }: { counts: ComparisonCounts; statuses: readonly SettingComparison[] }) {
  return (
    <>
      {statuses
        .filter((status) => counts[status] > 0)
        .map((status) => (
          <Badge key={status} variant={STATUS[status].variant}>
            {counts[status].toLocaleString()} {STATUS[status].label.toLowerCase()}
          </Badge>
        ))}
    </>
  );
}

function FamilyCard({
  group,
  filter,
  expectedLabel,
}: {
  group: CompareGroup;
  filter: Filter;
  expectedLabel: string;
}) {
  const statuses = filterStatuses(filter);
  const rows = group.rows.filter((row) => statuses.includes(row.status));
  const total = countOf(group.counts, filter);
  return (
    <article
      className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white"
      aria-label={`${group.platform}, ${group.familyLabel}`}
    >
      <div className="border-petrol-950/6 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b px-5 py-3">
        <h3 className="text-petrol-950 min-w-0 flex-1 basis-48 text-[15px] leading-6 font-semibold break-words">
          {group.familyLabel}
        </h3>
        <div className="flex flex-wrap gap-1.5">
          <CountBadges counts={group.counts} statuses={ORDER} />
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="divide-petrol-950/6 divide-y" aria-label="Settings">
          {rows.map((row, index) => (
            <SettingRow key={`${row.setting}-${index}`} row={row} expectedLabel={expectedLabel} />
          ))}
        </ul>
      )}
      {rows.length < total && (
        <p className="text-petrol-600 border-petrol-950/6 border-t px-5 py-2 text-xs">
          Showing {rows.length.toLocaleString()} of {total.toLocaleString()} settings. The others are counted but not
          listed.
        </p>
      )}
    </article>
  );
}

function notComparedText(family: NotComparedSettingsFamily, kind: SourceKind): string {
  if (family.side === "both") return "incomplete on both sides";
  if (family.side === "current") return "incomplete in this tenant's collection";
  return kind === "reference" ? "incomplete in the reference" : "incomplete in the other tenant's snapshot";
}

function identityNotComparedText(family: NotComparedSettingsFamily, kind: SourceKind): string {
  if (family.side === "both") return "not read on either side";
  if (family.side === "current") return "not read in this tenant's collection";
  return kind === "reference" ? "not in the reference" : "not read in the other tenant's snapshot";
}

// Tenant-wide Entra ID settings, counted on their own and not in the
// configuration totals above.
function IdentityResults({
  identity,
  filter,
  kind,
  expectedLabel,
}: {
  identity: ComparisonPart;
  filter: Filter;
  kind: SourceKind;
  expectedLabel: string;
}) {
  const total = ORDER.reduce((sum, status) => sum + identity.totals[status], 0);
  if (total === 0 && identity.notCompared.length === 0) return null;
  const groups = identity.groups.filter((group) => countOf(group.counts, filter) > 0);
  return (
    <section aria-labelledby="compare-identity-title" className="space-y-3">
      <h3 id="compare-identity-title" className="text-petrol-700 px-1 text-xs font-bold tracking-[0.12em] uppercase">
        Entra tenant settings
      </h3>
      <p className="text-petrol-600 px-1 text-xs leading-5">
        Tenant-wide Entra ID settings, counted apart from the settings above. Group and user targets name objects of
        one tenant, so they are not comparable; All users is.
      </p>
      {total > 0 && (
        <div role="group" className="flex flex-wrap gap-2 px-1" aria-label="Entra settings summary">
          <CountBadges counts={identity.totals} statuses={ORDER} />
        </div>
      )}
      {identity.notCompared.length > 0 && (
        <Alert tone="warning" title="Some Entra settings were not compared">
          <ul className="list-disc space-y-0.5 pl-5">
            {identity.notCompared.map((family) => (
              <li key={family.family} className="break-words">
                <span className="font-semibold">{family.label}</span>: {identityNotComparedText(family, kind)}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {total > 0 && groups.length === 0 ? (
        <p className="text-petrol-700 px-1 text-[13px] leading-5">No Entra settings with this result.</p>
      ) : (
        groups.map((group) => (
          <FamilyCard key={group.family} group={group} filter={filter} expectedLabel={expectedLabel} />
        ))
      )}
    </section>
  );
}

function Results({
  view,
  filter,
  onFilter,
  busy,
}: {
  view: CompareView;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  busy: boolean;
}) {
  const { totals, source } = view;
  const kind = source.kind;
  const expectedLabel = kind === "reference" ? "Reference" : "Other tenant";
  const differences = countOf(totals, "differences");
  const compared = ORDER.reduce((sum, status) => sum + totals[status], 0);
  // The filter applies to the configuration rows and the Entra rows, so it
  // is shown when either has rows and counts both; each summary keeps its
  // own totals.
  const identity = view.identity?.totals ?? null;
  const identityCompared = identity ? ORDER.reduce((sum, status) => sum + identity[status], 0) : 0;
  const both = (choice: Filter) => countOf(totals, choice) + (identity ? countOf(identity, choice) : 0);
  const groups = view.groups.filter((group) => countOf(group.counts, filter) > 0);
  const platforms: Array<{ platform: string; groups: CompareGroup[] }> = [];
  for (const group of groups) {
    const last = platforms[platforms.length - 1];
    if (last?.platform === group.platform) last.groups.push(group);
    else platforms.push({ platform: group.platform, groups: [group] });
  }
  const choices: Choice<Filter>[] = [
    { id: "differences", label: "All differences", count: both("differences") },
    ...ORDER.map((status) => ({ id: status, label: STATUS[status].label, count: both(status) })),
  ];

  let body: ReactNode;
  if (compared === 0) {
    body = (
      <EmptyState
        compact
        icon={ShieldCheck}
        title="No configuration settings were compared"
        description="Neither side has configuration settings in the families that could be compared."
      />
    );
  } else if (filter === "differences" && differences === 0) {
    body = (
      <EmptyState
        compact
        icon={CheckCircle2}
        title="No differences"
        description={`All ${plural(totals.matching, "compared setting")} match ${sourceNoun(kind)}.`}
      />
    );
  } else if (groups.length === 0) {
    body = (
      <EmptyState
        compact
        icon={ShieldCheck}
        title={`No ${STATUS[filter as SettingComparison].label.toLowerCase()} settings`}
        description={statusDescription(filter, kind)}
      />
    );
  } else {
    body = platforms.map((entry) => (
      <section key={entry.platform} aria-label={entry.platform} className="space-y-3">
        <h3 className="text-petrol-700 px-1 text-xs font-bold tracking-[0.12em] uppercase">{entry.platform}</h3>
        {entry.groups.map((group) => (
          <FamilyCard key={`${group.platform}-${group.family}`} group={group} filter={filter} expectedLabel={expectedLabel} />
        ))}
      </section>
    ));
  }

  return (
    <div aria-busy={busy} className={`space-y-4 transition-opacity ${busy ? "opacity-60" : ""}`}>
      <div role="group" className="flex flex-wrap gap-2" aria-label="Comparison summary">
        {ORDER.map((status) => (
          <Badge key={status} variant={STATUS[status].variant} title={statusDescription(status, kind)}>
            {totals[status].toLocaleString()} {STATUS[status].label.toLowerCase()}
          </Badge>
        ))}
      </div>
      {view.rulesetChanged && (
        <Alert tone="warning" title="The evidence rules differ">
          {kind === "reference" ? "The reference was saved" : "The other tenant's snapshot was taken"} with ruleset{" "}
          {source.rulesetVersion}, this tenant's collection uses {view.current.rulesetVersion}. Device configuration
          profiles keep only the properties a ruleset reads, so some differences there may come from the rules, not
          from the tenants.
        </Alert>
      )}
      {view.notCompared.length > 0 && (
        <Alert tone="warning" title={`${plural(view.notCompared.length, "family was", "families were")} not compared`}>
          <p>Their collection was incomplete, so a gap there never reads as a missing setting.</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {view.notCompared.map((family) => (
              <li key={family.family} className="break-words">
                <span className="font-semibold">{family.label}</span>: {notComparedText(family, kind)}
              </li>
            ))}
          </ul>
        </Alert>
      )}
      {(compared > 0 || identityCompared > 0) && (
        <div className="space-y-2">
          <RadioGroup label="Show settings" value={filter} choices={choices} onChange={onFilter} variant="chips" />
          <p className="text-petrol-600 px-1 text-xs leading-5">{statusDescription(filter, kind)}</p>
        </div>
      )}
      {body}
      {view.identity && (
        <IdentityResults identity={view.identity} filter={filter} kind={kind} expectedLabel={expectedLabel} />
      )}
    </div>
  );
}

// --- Sources ------------------------------------------------------------------

function ReferencePanel({
  reference,
  onReference,
}: {
  reference: ReferenceSummary | null;
  onReference: (reference: ReferenceSummary | null) => void;
}) {
  const action = useAsyncAction();
  const fileAction = useAsyncAction();
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const busy = action.busy !== null;

  const onExport = () =>
    void action.run("export", async () => {
      setSavedPath(null);
      const saved = await ipc.compareExportReference();
      if (saved) setSavedPath(saved);
      else action.setMessage("Save cancelled. Nothing was saved.");
    });
  const onLoad = () =>
    void action.run("load", async () => {
      setLoadError(null);
      const result = await ipc.compareLoadReference();
      if ("canceled" in result) return;
      if (result.ok) onReference(result.reference);
      else setLoadError(result.message);
    });
  const onClear = () =>
    void action.run("clear", async () => {
      await ipc.compareClearReference();
      setLoadError(null);
      onReference(null);
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-4 @3xl:grid-cols-2">
        <div className="border-petrol-950/6 bg-surface min-w-0 rounded-2xl border p-4">
          <p className="text-petrol-950 text-sm font-semibold">Export a reference from this tenant</p>
          <p className="text-petrol-600 mt-1 text-[13px] leading-5">
            Saves the settings of this tenant's current collection as a file. Load it later, or in another tenant, to
            compare against it.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="secondary"
            icon={FileDown}
            loading={action.busy === "export"}
            disabled={busy}
            onClick={onExport}
          >
            {action.busy === "export" ? "Saving reference" : "Export reference"}
          </Button>
        </div>
        <div className="border-petrol-950/6 bg-surface min-w-0 rounded-2xl border p-4">
          <p className="text-petrol-950 text-sm font-semibold">Reference to compare with</p>
          {reference ? (
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-[13px] leading-5">
              <dt className="text-petrol-600">Source tenant</dt>
              <dd className="text-petrol-950 selectable font-semibold break-words">{reference.label}</dd>
              <dt className="text-petrol-600">Created</dt>
              <dd className="text-petrol-900">{formatDate(reference.createdAt)}</dd>
              <dt className="text-petrol-600">Ruleset</dt>
              <dd className="text-petrol-900 tabular-nums">{reference.rulesetVersion}</dd>
              <dt className="text-petrol-600">Settings</dt>
              <dd className="text-petrol-900 tabular-nums">{reference.settings.toLocaleString()}</dd>
              <dt className="text-petrol-600">Not covered</dt>
              <dd className={reference.notCompared ? "text-amber-800" : "text-petrol-900"}>
                {reference.notCompared
                  ? `${plural(reference.notCompared, "family", "families")}, incomplete when the file was saved`
                  : "None, every family was complete"}
              </dd>
            </dl>
          ) : (
            <p className="text-petrol-600 mt-1 text-[13px] leading-5">
              No reference loaded. Load a reference file saved from this or another tenant.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={reference ? "secondary" : "primary"}
              icon={FileUp}
              loading={action.busy === "load"}
              disabled={busy}
              onClick={onLoad}
            >
              {reference ? "Load another reference" : "Load reference"}
            </Button>
            {reference && (
              <Button
                size="sm"
                variant="ghost"
                icon={X}
                loading={action.busy === "clear"}
                disabled={busy}
                onClick={onClear}
              >
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
      {savedPath && (
        <div
          className="animate-fade-in flex flex-wrap items-center gap-3 rounded-xl border border-teal-600/20 bg-teal-50 p-3"
          role="status"
          aria-live="polite"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-petrol-950 text-xs font-semibold break-words">Reference saved: {fileName(savedPath)}</p>
            <p className="text-petrol-600 selectable truncate text-[11px]" title={savedPath}>
              {savedPath}
            </p>
          </div>
          <Button
            size="sm"
            icon={FileText}
            loading={fileAction.busy === "open"}
            onClick={() => void fileAction.run("open", () => ipc.openLastFile(savedPath))}
          >
            Open file
          </Button>
          <Button
            size="sm"
            variant="secondary"
            icon={FolderOpen}
            onClick={() => void fileAction.run("show", () => ipc.showLastFileInFolder(savedPath))}
          >
            {isMac ? "Show in Finder" : "Show in folder"}
          </Button>
        </div>
      )}
      {loadError && (
        <Alert tone="danger" title="The reference could not be loaded">
          {loadError}
        </Alert>
      )}
      {(action.error || fileAction.error) && (
        <Alert tone="danger">{[action.error, fileAction.error].filter(Boolean).join(" ")}</Alert>
      )}
      {action.message && (
        <p className="text-petrol-600 text-xs" role="status">
          {action.message}
        </p>
      )}
      <ul className="text-petrol-700 max-w-3xl list-disc space-y-1 pl-5 text-[13px] leading-5">
        <li>The checksum in the file detects damage to it, not who made it. Anyone can create a file that loads.</li>
        <li>Assignments are not compared, only the configured settings.</li>
        <li>Secret values such as passwords and keys are never stored in a reference; they show as not comparable.</li>
        <li>
          Device configuration profiles only keep the properties the evidence engine reads, so their other properties
          are not compared.
        </li>
      </ul>
    </div>
  );
}

function TenantPanel({
  tenantId,
  onTenant,
}: {
  tenantId: string | null;
  onTenant: (tenantId: string | null) => void;
}) {
  const [tenants, setTenants] = useState<CompareTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const request = useRef(0);
  const selectId = useId();

  useEffect(() => {
    const id = ++request.current;
    setError(null);
    ipc
      .compareTenants()
      .then((list) => {
        if (id === request.current) setTenants(list);
      })
      .catch((caught: unknown) => {
        if (id === request.current) setError(errorMessage(caught));
      });
  }, [attempt]);

  // Keeps the selection on a listed tenant.
  useEffect(() => {
    if (!tenants) return;
    if (!tenants.some((tenant) => tenant.tenantId === tenantId)) onTenant(tenants[0]?.tenantId ?? null);
  }, [tenants, tenantId, onTenant]);

  if (error) {
    return (
      <Alert
        tone="danger"
        title="The tenants could not be listed"
        action={
          <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => setAttempt((count) => count + 1)}>
            Retry
          </Button>
        }
      >
        {error}
      </Alert>
    );
  }
  if (!tenants) {
    return (
      <div className="text-petrol-600 flex items-center gap-2 px-1 py-3 text-[13px]" role="status">
        <Spinner /> Loading tenants
      </div>
    );
  }
  if (tenants.length === 0) {
    return (
      <EmptyState
        compact
        icon={Building2}
        title="No other tenant has history on this computer"
        description="Sign in to another tenant, turn on history and collect there. Its latest snapshot can then be compared with this tenant."
      />
    );
  }
  const selected = tenants.find((tenant) => tenant.tenantId === tenantId);
  return (
    <div className="space-y-3">
      <div className="max-w-xl">
        <label htmlFor={selectId} className="text-petrol-700 mb-1 block text-xs font-semibold">
          Tenant to compare with
        </label>
        <select
          id={selectId}
          value={tenantId ?? ""}
          onChange={(event) => onTenant(event.target.value)}
          className="border-petrol-950/12 text-petrol-950 min-h-10 w-full min-w-0 cursor-pointer truncate rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          {tenants.map((tenant) => (
            <option key={tenant.tenantId} value={tenant.tenantId}>
              {tenant.label}, {formatDate(tenant.collectedAt)}
              {tenant.partial ? " (partial)" : ""}
            </option>
          ))}
        </select>
      </div>
      {selected?.partial && (
        <Alert tone="warning">
          The latest snapshot of this tenant is partial. Families whose collection failed are not compared.
        </Alert>
      )}
      <p className="text-petrol-700 max-w-3xl text-[13px] leading-5">
        Compares with the latest snapshot of that tenant on this computer. Assignments are not compared, and secret
        values are never kept, so they show as not comparable.
      </p>
    </div>
  );
}

// --- Screen -------------------------------------------------------------------

function Workspace({ sessionKey, msp, collectedAt }: { sessionKey: string; msp: boolean; collectedAt: string }) {
  const initial = session?.key === sessionKey ? session : null;
  const [chosen, setKind] = useState<SourceKind>(initial?.kind ?? "reference");
  // Another tenant needs the MSP plan; the choice falls back without it.
  const kind: SourceKind = msp ? chosen : "reference";
  const [tenantId, setTenantId] = useState<string | null>(initial?.tenantId ?? null);
  const [reference, setReference] = useState<ReferenceSummary | null>(initial?.reference ?? null);
  const [view, setView] = useState<CompareView | null>(initial?.view ?? null);
  const [ran, setRan] = useState<CompareSource | null>(initial?.ran ?? null);
  const [filter, setFilter] = useState<Filter>("differences");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const request = useRef(0);
  const resultsRef = useRef<HTMLElement>(null);
  const [runs, setRuns] = useState(0);

  // The source card is tall; a finished run brings its results into view.
  useEffect(() => {
    if (!runs) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    resultsRef.current?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
  }, [runs]);

  useEffect(watchSignOut, []);

  // Main keeps the loaded reference; it may have dropped it, for example
  // after a sign-out, or kept one this screen does not know yet.
  const referenceTouched = useRef(false);
  useEffect(() => {
    let current = true;
    void ipc
      .compareReferenceStatus?.()
      .then((summary) => {
        if (current && !referenceTouched.current) setReference(summary);
      })
      .catch(() => undefined);
    return () => {
      current = false;
    };
  }, []);

  useEffect(() => {
    session = { key: sessionKey, kind: chosen, tenantId, reference, view, ran };
  }, [sessionKey, chosen, tenantId, reference, view, ran]);

  const run = (source: CompareSource) => {
    const id = ++request.current;
    setRan(source);
    setRunning(true);
    setRunError(null);
    ipc
      .compareRun(source)
      .then((next) => {
        if (id !== request.current) return;
        setView(next);
        setFilter("differences");
      })
      .catch((caught: unknown) => {
        if (id !== request.current) return;
        const message = errorMessage(caught);
        setRunError(message);
        if (message === NEEDS_REFERENCE) setReference(null);
      })
      .finally(() => {
        if (id !== request.current) return;
        setRunning(false);
        setRuns((count) => count + 1);
      });
  };

  // A run, error or result of the previous reference no longer applies.
  const onReference = (next: ReferenceSummary | null) => {
    referenceTouched.current = true;
    ++request.current;
    setReference(next);
    setRunning(false);
    setRunError(null);
    if (view?.source.kind === "reference") setView(null);
  };

  const onKind = (next: SourceKind) => {
    setKind(next);
    setRunError(null);
  };

  const source: CompareSource | null =
    kind === "reference" ? (reference ? { kind } : null) : tenantId ? { kind, tenantId } : null;
  const runBlocker =
    kind === "reference"
      ? reference
        ? null
        : NEEDS_REFERENCE
      : tenantId
        ? null
        : "Choose a tenant to compare with.";
  const stale = view !== null && !running && !sameTime(view.current.collectedAt, collectedAt);

  const choices: Choice<SourceKind>[] = [
    {
      id: "reference",
      label: "Reference file",
      icon: FileText,
      description: "A golden baseline saved as a file from this or another tenant.",
    },
    {
      id: "tenant",
      label: "Another tenant",
      icon: Building2,
      badge: msp ? undefined : "MSP",
      disabled: !msp,
      description: msp
        ? "The latest snapshot of another tenant with history on this computer."
        : "Comparing tenants is part of the MSP plan.",
    },
  ];

  let results: ReactNode = null;
  if (runError) {
    results = (
      <Alert
        tone="danger"
        title="The comparison could not be run"
        action={
          ran &&
          runError !== NEEDS_REFERENCE && (
            <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => run(ran)}>
              Retry
            </Button>
          )
        }
      >
        {runError}
      </Alert>
    );
  } else if (running && !view) {
    results = (
      <div className="text-petrol-600 flex items-center gap-2 px-1 py-6 text-[13px]" role="status">
        <Spinner /> Comparing settings
      </div>
    );
  } else if (view) {
    results = <Results view={view} filter={filter} onFilter={setFilter} busy={running} />;
  }

  return (
    <>
      <Card>
        <CardHeader
          icon={GitCompareArrows}
          eyebrow="Source"
          title="Compare this tenant with"
          description="The comparison reads the settings of this tenant's current collection. Nothing is changed in the tenant."
        />
        <div className="mt-5 space-y-5">
          <RadioGroup label="Compare with" value={kind} choices={choices} onChange={onKind} variant="cards" />
          {kind === "reference" ? (
            <ReferencePanel reference={reference} onReference={onReference} />
          ) : (
            <TenantPanel tenantId={tenantId} onTenant={setTenantId} />
          )}
          <div className="border-petrol-950/6 flex flex-wrap items-center gap-3 border-t pt-4">
            <Button
              icon={GitCompareArrows}
              loading={running}
              disabled={!source}
              disabledReason={runBlocker}
              onClick={() => source && run(source)}
            >
              {running ? "Comparing" : "Run comparison"}
            </Button>
            {runBlocker && <p className="text-petrol-600 text-xs">{runBlocker}</p>}
          </div>
        </div>
      </Card>

      {(view || running || runError) && (
        <section ref={resultsRef} aria-labelledby="compare-results" className="scroll-mt-6 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0 flex-1 basis-80">
              <h2 id="compare-results" className="text-petrol-950 text-lg font-semibold tracking-[-0.02em]">
                Results
              </h2>
              {view && (
                <p className="text-petrol-600 mt-0.5 text-[13px] leading-5 break-words">
                  Compared{" "}
                  <span className="text-petrol-900 font-semibold">
                    {view.source.kind === "reference" ? `the reference of ${view.source.label}` : view.source.label}
                  </span>{" "}
                  ({formatDate(view.source.collectedAt)}) with this tenant's collection of{" "}
                  {formatDate(view.current.collectedAt)}.
                </p>
              )}
            </div>
            {running && view && (
              <span className="text-petrol-600 inline-flex items-center gap-2 text-xs" role="status">
                <Spinner className="h-3.5 w-3.5" /> Comparing
              </span>
            )}
          </div>
          {stale && !runError && (
            <Alert
              tone="info"
              title="The collection changed after this comparison"
              action={
                ran && (
                  <Button variant="secondary" size="sm" icon={RotateCw} onClick={() => run(ran)}>
                    Run again
                  </Button>
                )
              }
            >
              This tenant was collected again on {formatDate(collectedAt)}. Run the comparison again to include the
              new data.
            </Alert>
          )}
          {results}
        </section>
      )}
    </>
  );
}

export function CompareScreen() {
  const { state, actions } = useApp();
  const signedIn = Boolean(state.auth?.signedIn);
  const entitled = Boolean(state.license?.entitled);
  const msp = state.license?.plan === "msp";
  const summary = state.collection.summary;
  const sessionKey = `${state.auth?.account ?? ""}|${state.auth?.tenantId ?? ""}`;

  let body: ReactNode;
  if (!signedIn) {
    body = (
      <EmptyState
        icon={LogIn}
        title="Sign in to compare"
        description="A comparison reads the current collection of the signed in tenant."
      />
    );
  } else if (!entitled) {
    body = (
      <EmptyState
        icon={KeyRound}
        title="Compare needs an active license"
        description="Reference files and comparisons are part of the licensed desktop app."
        action={
          <Button variant="secondary" onClick={() => actions.navigate("license")}>
            Open License and account
          </Button>
        }
      />
    );
  } else if (!summary) {
    body = (
      <EmptyState
        icon={Database}
        title="Collect tenant data first"
        description="A comparison reads the settings of this tenant's current collection. Collect to start."
        action={<CollectButton showMeta={false} />}
      />
    );
  } else {
    body = <Workspace key={sessionKey} sessionKey={sessionKey} msp={msp} collectedAt={summary.collectedAt} />;
  }

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Golden baseline"
        title="Compare"
        description="Compare the settings of this tenant with a reference file or with another tenant, setting by setting, whichever policies carry them."
      />
      {body}
    </div>
  );
}
