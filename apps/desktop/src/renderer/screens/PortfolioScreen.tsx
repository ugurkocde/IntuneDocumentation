import { Building2, KeyRound, LogIn, Pencil, RotateCw, Trash2 } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { PortfolioFramework, PortfolioTenant, PortfolioView } from "../../shared/ipc-types";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button, IconButton } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useAsyncAction } from "../hooks/use-async-action";
import { errorMessage, ipc } from "../lib/ipc";
import { useApp } from "../state/context";

// Main accepts at most this many characters for a tenant name.
const MAX_LABEL = 60;
const PREFERRED_FRAMEWORK = "nis2-2022-2555";

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export function formatAge(iso: string, now: number): string {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return iso;
  const minutes = Math.max(0, Math.floor((now - time) / 60_000));
  const unit = (count: number, name: string) => `${count} ${name}${count === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 30) return unit(days, "day");
  const months = Math.floor(days / 30);
  if (months < 12) return unit(months, "month");
  return unit(Math.floor(days / 365), "year");
}

function name(tenant: PortfolioTenant): string {
  return tenant.label ?? tenant.shortLabel;
}

// Every framework of any tenant, in first seen order.
function frameworkOptions(tenants: PortfolioTenant[]): Array<{ id: string; name: string }> {
  const seen = new Map<string, string>();
  for (const tenant of tenants)
    for (const framework of tenant.frameworks) if (!seen.has(framework.id)) seen.set(framework.id, framework.name);
  return [...seen].map(([id, label]) => ({ id, name: label }));
}

// NIS2 when assessed, otherwise the first framework every assessed tenant has.
function defaultFramework(tenants: PortfolioTenant[], options: Array<{ id: string }>): string | null {
  if (options.some((option) => option.id === PREFERRED_FRAMEWORK)) return PREFERRED_FRAMEWORK;
  const assessed = tenants.filter((tenant) => tenant.frameworks.length > 0);
  const common = options.find((option) =>
    assessed.every((tenant) => tenant.frameworks.some((framework) => framework.id === option.id)),
  );
  return (common ?? options[0])?.id ?? null;
}

function Coverage({ framework }: { framework: PortfolioFramework | undefined }) {
  if (!framework || framework.applicableControls === 0) {
    return <p className="text-petrol-600 text-[13px] italic">Not assessed</p>;
  }
  const covered = framework.withEvidence + framework.partial;
  const percent = Math.floor((covered * 100) / framework.applicableControls);
  return (
    <div
      className="min-w-0"
      title={`${framework.withEvidence} with configuration evidence, ${framework.partial} with partial evidence, of ${framework.applicableControls} applicable controls`}
    >
      <p className="text-petrol-950 flex items-baseline gap-2 text-[13px] tabular-nums">
        <span className="font-semibold">{percent}%</span>
        <span className="text-petrol-600 text-xs">
          {covered.toLocaleString()} of {framework.applicableControls.toLocaleString()} controls
        </span>
      </p>
      <div
        className="bg-mint-100 mt-1 h-1.5 w-full max-w-48 overflow-hidden rounded-full"
        role="meter"
        aria-label="Controls with evidence"
        aria-valuemin={0}
        aria-valuemax={framework.applicableControls}
        aria-valuenow={covered}
      >
        <div className="h-full rounded-full bg-teal-600" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-petrol-600 mt-1 text-[11px] tabular-nums">
        {framework.withEvidence.toLocaleString()} with evidence, {framework.partial.toLocaleString()} partial
      </p>
    </div>
  );
}

function RenameForm({
  tenant,
  onSave,
  onCancel,
}: {
  tenant: PortfolioTenant;
  onSave: (label: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(tenant.label ?? "");
  const save = useAsyncAction();
  const inputId = useId();
  const hintId = useId();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void save.run("save", () => onSave(value));
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    if (!save.busy) onCancel();
  };
  return (
    <form onSubmit={submit} onKeyDown={onKey} className="min-w-0 space-y-2">
      <label htmlFor={inputId} className="sr-only">
        Name of tenant {tenant.shortLabel}
      </label>
      <input
        id={inputId}
        value={value}
        maxLength={MAX_LABEL}
        autoFocus
        disabled={save.busy !== null}
        aria-describedby={hintId}
        aria-invalid={save.error ? true : undefined}
        onChange={(event) => setValue(event.target.value)}
        className="border-petrol-950/12 text-petrol-950 min-h-9 w-full min-w-0 rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-60"
      />
      <p id={hintId} className="text-petrol-600 text-[11px] leading-4">
        Up to {MAX_LABEL} characters. Leave empty to show the short id.
      </p>
      {save.error && (
        <p className="text-xs leading-5 text-red-700" role="alert">
          {save.error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={save.busy !== null}>
          Save
        </Button>
        <Button size="sm" variant="secondary" disabled={save.busy !== null} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

const COLUMNS =
  "@4xl:grid-cols-[minmax(11rem,1fr)_5.5rem_minmax(8rem,10rem)_6.5rem_minmax(10rem,13rem)_2.25rem] @4xl:items-start";

function CellLabel({ children }: { children: string }) {
  return (
    <span className="text-petrol-600 mb-0.5 block text-[10px] font-bold tracking-[0.1em] uppercase @4xl:sr-only">
      {children}
    </span>
  );
}

function TenantRow({
  tenant,
  frameworkId,
  now,
  editing,
  busy,
  onEdit,
  onCancelEdit,
  onSave,
  onDelete,
}: {
  tenant: PortfolioTenant;
  frameworkId: string | null;
  now: number;
  editing: boolean;
  busy: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSave: (label: string) => Promise<void>;
  onDelete: () => void;
}) {
  const renameRef = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(editing);
  // Focus returns to Rename after saving or cancelling.
  useEffect(() => {
    if (wasEditing.current && !editing) renameRef.current?.focus();
    wasEditing.current = editing;
  }, [editing]);
  const framework = tenant.frameworks.find((entry) => entry.id === frameworkId);
  const latest = tenant.latest;
  return (
    <li
      className={`relative grid gap-x-5 gap-y-3 px-5 py-4 sm:px-6 @4xl:py-3 ${COLUMNS}`}
      aria-label={name(tenant)}
    >
      <div className="min-w-0 pr-10 @4xl:pr-0">
        <CellLabel>Tenant</CellLabel>
        {editing ? (
          <RenameForm tenant={tenant} onSave={onSave} onCancel={onCancelEdit} />
        ) : (
          <>
            <p className="text-petrol-950 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold">
              <span className="selectable min-w-0 break-words">{name(tenant)}</span>
              {tenant.current && <Badge variant="info">Signed in</Badge>}
            </p>
            {tenant.label !== null && (
              <p className="text-petrol-600 selectable mt-0.5 font-mono text-[11px] break-all">{tenant.shortLabel}</p>
            )}
            <button
              ref={renameRef}
              type="button"
              onClick={onEdit}
              disabled={busy}
              aria-label={`Rename ${name(tenant)}`}
              className="mt-1 inline-flex cursor-pointer items-center gap-1 rounded text-xs font-semibold text-teal-700 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45"
            >
              <Pencil className="h-3 w-3" aria-hidden="true" />
              Rename
            </button>
          </>
        )}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 @2xl:grid-cols-4 @4xl:contents">
        <div className="min-w-0">
          <CellLabel>Snapshots</CellLabel>
          <p className="text-petrol-900 text-[13px] tabular-nums">{tenant.snapshots.toLocaleString()}</p>
        </div>
        <div className="min-w-0">
          <CellLabel>Latest snapshot</CellLabel>
          {latest ? (
            <>
              <p className="text-petrol-900 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                <span title={formatDate(latest.collectedAt)}>{formatAge(latest.collectedAt, now)}</span>
                {latest.partial && (
                  <Badge variant="warning" title="Some data could not be collected for this snapshot.">
                    Partial
                  </Badge>
                )}
              </p>
              <p className="text-petrol-600 mt-0.5 text-[11px] @4xl:sr-only">{formatDate(latest.collectedAt)}</p>
            </>
          ) : (
            <p className="text-petrol-600 text-[13px] italic">No snapshot</p>
          )}
        </div>
        <div className="min-w-0">
          <CellLabel>Ruleset</CellLabel>
          <p className="text-petrol-900 text-[13px] break-words tabular-nums">{latest?.rulesetVersion ?? "None"}</p>
        </div>
        <div className="min-w-0">
          <CellLabel>Coverage</CellLabel>
          <Coverage framework={framework} />
        </div>
      </div>
      {/* Top right of the card at narrow widths, the last column otherwise. */}
      <div className="absolute top-3 right-3 sm:right-4 @4xl:static @4xl:flex @4xl:justify-end">
        <IconButton
          icon={Trash2}
          label={`Delete history of ${name(tenant)}`}
          disabled={busy || editing}
          onClick={onDelete}
          className="hover:bg-red-50 hover:text-red-700"
        />
      </div>
    </li>
  );
}

function TenantList({
  view,
  onView,
  onDelete,
  busy,
}: {
  view: PortfolioView;
  onView: (view: PortfolioView) => void;
  onDelete: (tenant: PortfolioTenant) => void;
  busy: boolean;
}) {
  const { tenants } = view;
  const selectId = useId();
  const options = frameworkOptions(tenants);
  const [chosen, setChosen] = useState<string | null>(null);
  const frameworkId =
    chosen && options.some((option) => option.id === chosen) ? chosen : defaultFramework(tenants, options);
  const [editing, setEditing] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const rulesets = [...new Set(tenants.flatMap((tenant) => (tenant.latest ? [tenant.latest.rulesetVersion] : [])))];

  return (
    <>
      <Card padded={false}>
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1 basis-56">
            <h2 className="text-petrol-950 text-base font-semibold">Tenants on this computer</h2>
            <p className="text-petrol-600 mt-0.5 text-[13px]">
              {tenants.length.toLocaleString()} {tenants.length === 1 ? "tenant" : "tenants"} with history
            </p>
          </div>
          {options.length > 0 && (
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <label htmlFor={selectId} className="text-petrol-700 text-xs font-semibold">
                Coverage for
              </label>
              <select
                id={selectId}
                value={frameworkId ?? ""}
                onChange={(event) => setChosen(event.target.value)}
                className="border-petrol-950/12 text-petrol-950 min-h-9 max-w-full min-w-0 cursor-pointer rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        {rulesets.length > 1 && (
          <div className="px-5 pb-4 sm:px-6">
            <Alert tone="info">
              The latest snapshots use different rulesets ({rulesets.join(", ")}). Coverage from different rulesets
              is not fully comparable; collect again in a tenant to assess it with the current rules.
            </Alert>
          </div>
        )}
        <div
          className={`border-petrol-950/6 bg-surface text-petrol-600 hidden gap-x-5 border-t px-5 py-2 text-[10px] font-bold tracking-[0.1em] uppercase sm:px-6 @4xl:grid ${COLUMNS}`}
          aria-hidden="true"
        >
          <span>Tenant</span>
          <span>Snapshots</span>
          <span>Latest snapshot</span>
          <span>Ruleset</span>
          <span>Coverage</span>
          <span />
        </div>
        <ul className="divide-petrol-950/6 border-petrol-950/6 divide-y border-t" aria-label="Tenants">
          {tenants.map((tenant) => (
            <TenantRow
              key={tenant.tenantId}
              tenant={tenant}
              frameworkId={frameworkId}
              now={now}
              editing={editing === tenant.tenantId}
              busy={busy || (editing !== null && editing !== tenant.tenantId)}
              onEdit={() => setEditing(tenant.tenantId)}
              onCancelEdit={() => setEditing(null)}
              onSave={async (label) => {
                onView(await ipc.portfolioSetLabel(tenant.tenantId, label));
                setEditing(null);
              }}
              onDelete={() => onDelete(tenant)}
            />
          ))}
        </ul>
      </Card>
      <p className="text-petrol-600 max-w-3xl px-1 text-xs leading-5">
        The figures come from the encrypted index on this computer; no snapshot is opened to show them. Coverage counts
        the controls with configuration evidence or partial evidence in the assessment stored at collection time. This
        is evidence of configuration, not an audit result.
      </p>
    </>
  );
}

export function PortfolioScreen() {
  const { state, actions } = useApp();
  const signedIn = Boolean(state.auth?.signedIn);
  const entitled = Boolean(state.license?.entitled);
  const plan = state.license?.plan ?? null;
  const msp = plan === "msp";
  const [view, setView] = useState<PortfolioView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [confirm, setConfirm] = useState<PortfolioTenant | null>(null);
  const remove = useAsyncAction();
  const request = useRef(0);

  const reload = useCallback(() => setAttempt((count) => count + 1), []);
  const cancelConfirm = useCallback(() => setConfirm(null), []);
  useEffect(() => ipc.onHistoryChanged(reload), [reload]);

  useEffect(() => {
    const id = ++request.current;
    if (!signedIn || !entitled || !msp) return;
    setLoadError(null);
    ipc
      .portfolioList()
      .then((next) => {
        if (id === request.current) setView(next);
      })
      .catch((caught: unknown) => {
        if (id === request.current) setLoadError(errorMessage(caught));
      });
  }, [signedIn, entitled, msp, attempt, state.auth?.tenantId]);

  // A list from a later request wins over an earlier rename or delete.
  const applyView = (next: PortfolioView) => {
    ++request.current;
    setView(next);
  };

  const onConfirm = () => {
    const target = confirm;
    if (!target) return;
    void remove
      .run("delete", async () => applyView(await ipc.portfolioDeleteTenant(target.tenantId)))
      .finally(() => setConfirm(null));
  };

  let body: ReactNode;
  if (!signedIn) {
    body = (
      <EmptyState
        icon={LogIn}
        title="Sign in to see the portfolio"
        description="Sign in to any tenant with an MSP license. Portfolio lists every tenant with history on this computer."
      />
    );
  } else if (!entitled) {
    body = (
      <EmptyState
        icon={KeyRound}
        title="Portfolio needs an active license"
        description="Portfolio is part of the MSP plan of the licensed desktop app."
        action={
          <Button variant="secondary" onClick={() => actions.navigate("license")}>
            Open License and account
          </Button>
        }
      />
    );
  } else if (!msp) {
    body = (
      <EmptyState
        icon={Building2}
        title="Portfolio is part of the MSP plan"
        description={`${
          plan === "pro" ? "The license of the signed in tenant is a Pro license. " : ""
        }With the MSP plan, Portfolio shows every tenant with history on this computer side by side, with its latest snapshot and evidence coverage.`}
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
        title="The portfolio could not be loaded"
        action={
          <Button variant="secondary" size="sm" icon={RotateCw} onClick={reload}>
            Retry
          </Button>
        }
      >
        {loadError}
      </Alert>
    );
  } else if (!view) {
    body = (
      <div className="text-petrol-600 flex items-center gap-2 px-1 py-6 text-[13px]" role="status">
        <Spinner /> Loading tenants
      </div>
    );
  } else if (!view.available) {
    body = (
      <Alert tone="warning" title="History is not available on this computer">
        {view.reason}
      </Alert>
    );
  } else if (view.tenants.length === 0) {
    body = (
      <EmptyState
        icon={Building2}
        title="No tenant history on this computer yet"
        description="Sign in to each tenant you manage, turn on history and collect. Every tenant with snapshots appears here."
        action={
          <Button variant="secondary" onClick={() => actions.navigate("history")}>
            Open History
          </Button>
        }
      />
    );
  } else {
    body = (
      <>
        {remove.error && <Alert tone="danger">{remove.error}</Alert>}
        <TenantList view={view} onView={applyView} onDelete={setConfirm} busy={remove.busy !== null} />
      </>
    );
  }

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Workspace"
        title="Portfolio"
        description="Every tenant with history on this computer: its latest snapshot and the evidence coverage stored with it."
      />
      {body}
      <ConfirmDialog
        open={confirm !== null}
        tone="danger"
        title={`Delete all history of ${confirm ? name(confirm) : ""}?`}
        description={`Every snapshot of this tenant on this computer is removed.${
          confirm?.current ? " This is the signed in tenant." : ""
        } This cannot be undone.`}
        confirmLabel="Delete history"
        busy={remove.busy !== null}
        onConfirm={onConfirm}
        onCancel={cancelConfirm}
      />
    </div>
  );
}
