import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronRight,
  Download,
  ExternalLink,
  KeyRound,
  ListChecks,
  LogIn,
  RefreshCw,
  Shield,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { CollectButton } from "../components/collection/CollectButton";
import { KpiCards } from "../components/kpi/KpiCards";
import { Header } from "../components/layout/Header";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import { useAsyncAction } from "../hooks/use-async-action";
import { FAMILIES, familyCounts } from "../lib/section-catalog";
import { useApp } from "../state/context";
import { DisclosureSummary } from "../components/ui/DisclosureSummary";
import { ipc } from "../lib/ipc";
import { busyBlocker, collectBlocker, exportBlocker, licenseView } from "../state/selectors";

function ReadinessStep({
  index,
  done,
  title,
  description,
  action,
}: {
  index: number;
  done: boolean;
  title: string;
  description: ReactNode;
  action?: ReactNode;
}) {
  return (
    <li className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold ${
          done ? "bg-teal-600 text-white" : "bg-mint-100 text-petrol-700"
        }`}
        aria-hidden="true"
      >
        {done ? <Check className="h-4 w-4" strokeWidth={2.5} /> : index}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className="text-petrol-950 text-sm font-semibold">
          {title}
          <span className="sr-only">{done ? " (done)" : ""}</span>
        </p>
        <div className="text-petrol-600 mt-0.5 text-[13px] leading-5">{description}</div>
      </div>
      {action && <div className="shrink-0 pt-0.5">{action}</div>}
    </li>
  );
}

function GetStarted() {
  const { state, actions } = useApp();
  const sign = useAsyncAction();
  const retry = useAsyncAction();
  const { auth } = state;
  const blocker = collectBlocker(state);
  const license = licenseView(state);
  const licenseWarning = license.tone === "warning";
  return (
    <Card>
      <div className="flex items-start gap-4">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <ListChecks className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Get started</p>
          <h2 className="text-petrol-950 mt-1 text-lg font-semibold tracking-[-0.02em]">
            Document your tenant in three steps
          </h2>
          <p className="text-petrol-600 mt-1 text-sm leading-6">
            Everything runs on this computer with read only Microsoft Graph access.
          </p>
        </div>
      </div>
      <ol className="divide-petrol-950/6 mt-6 divide-y">
        <ReadinessStep
          index={1}
          done={Boolean(auth?.signedIn)}
          title="Sign in to your tenant"
          description={
            auth?.signedIn
              ? `Signed in as ${auth.account}`
              : sign.error ?? "Your browser opens for the Microsoft sign in."
          }
          action={
            !auth?.signedIn && (
              <Button
                size="sm"
                icon={LogIn}
                loading={sign.busy !== null}
                disabled={Boolean(busyBlocker(state))}
                disabledReason={busyBlocker(state)}
                onClick={() => void sign.run("in", () => actions.signIn())}
              >
                Sign in
              </Button>
            )
          }
        />
        <ReadinessStep
          index={2}
          done={license.kind === "active"}
          title="Activate your license"
          description={
            licenseWarning ? (
              <span className="flex items-start gap-1.5 text-amber-800" role="status">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{retry.error ?? license.detail}</span>
              </span>
            ) : (
              license.detail
            )
          }
          action={
            licenseWarning ? (
              <Button
                size="sm"
                variant="secondary"
                icon={RefreshCw}
                loading={retry.busy !== null}
                onClick={() =>
                  void retry.run("retry", async () => {
                    await ipc.licenseRetry();
                    await actions.refreshLicense();
                  })
                }
              >
                Retry
              </Button>
            ) : (
              license.kind === "none" && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" icon={ExternalLink} onClick={() => void ipc.licenseOpen("buy")}>
                    Start free trial
                  </Button>
                  <Button size="sm" variant="secondary" icon={KeyRound} onClick={() => actions.navigate("license")}>
                    Add license key
                  </Button>
                </div>
              )
            )
          }
        />
        <ReadinessStep
          index={3}
          done={false}
          title="Collect tenant data"
          description={
            state.collection.running
              ? "Collecting now. Progress is shown at the bottom right."
              : blocker
                ? "Available once you are signed in and your license is active."
                : "Reads about a thousand items in a typical tenant, usually within two minutes."
          }
          action={
            (!blocker || state.collection.running) && (
              <Button
                size="sm"
                icon={RefreshCw}
                loading={state.collection.running}
                onClick={() => void actions.collect()}
              >
                Collect
              </Button>
            )
          }
        />
      </ol>
    </Card>
  );
}

function FamilyBreakdown() {
  const { state, actions } = useApp();
  const summary = state.collection.summary;
  if (!summary) return null;
  const counts = familyCounts(summary.sectionCounts);
  const rows = FAMILIES.filter((family) => (counts[family.key] ?? 0) > 0).sort(
    (a, b) => (counts[b.key] ?? 0) - (counts[a.key] ?? 0),
  );
  const max = Math.max(1, ...rows.map((family) => counts[family.key] ?? 0));
  return (
    <Card>
      <div className="flex items-center gap-2">
        <ListChecks className="h-[18px] w-[18px] text-teal-700" aria-hidden="true" />
        <h2 className="text-petrol-950 text-sm font-semibold">By configuration family</h2>
      </div>
      <p className="text-petrol-600 mt-1.5 text-xs">Select a family to browse its items.</p>
      <div className="mt-4 grid gap-x-6 gap-y-1 @3xl:grid-cols-2">
        {rows.map((family) => {
          const count = counts[family.key] ?? 0;
          return (
            <button
              type="button"
              key={family.key}
              onClick={() => actions.navigate("section", family.key)}
              className="group hover:bg-mint-50 flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              <family.icon className="text-petrol-600 h-4 w-4 shrink-0 group-hover:text-teal-700" strokeWidth={1.8} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="mb-1.5 flex items-center justify-between gap-3">
                  <span className="text-petrol-700 truncate text-xs font-medium group-hover:text-teal-700">{family.label}</span>
                  <span className="text-petrol-600 shrink-0 text-[11px] font-semibold tabular-nums">{count.toLocaleString()}</span>
                </span>
                <span className="bg-mint-100 block h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                  <span
                    className="block h-full w-full origin-left rounded-full bg-teal-600"
                    style={{ transform: `scaleX(${count / max})` }}
                  />
                </span>
              </span>
              <ChevronRight className="text-petrol-600/50 h-4 w-4 shrink-0 group-hover:text-teal-700" aria-hidden="true" />
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function NextAction({
  icon: Icon,
  title,
  description,
  disabledReason,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  disabledReason?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={Boolean(disabledReason)}
      title={disabledReason ?? undefined}
      className="group border-petrol-950/8 hover:border-petrol-950/12 hover:bg-mint-50 flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border bg-white p-4 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="text-petrol-950 block text-sm font-semibold">{title}</span>
        <span className="text-petrol-600 mt-0.5 block text-xs leading-5">{disabledReason ?? description}</span>
      </span>
      <ArrowRight className="text-petrol-600 h-4 w-4 shrink-0 transition-transform group-enabled:group-hover:translate-x-0.5" aria-hidden="true" />
    </button>
  );
}

function NextActions() {
  const { state, actions } = useApp();
  return (
    <Card>
      <h2 className="text-petrol-950 text-sm font-semibold">Next steps</h2>
      <p className="text-petrol-600 mt-1.5 text-xs">Turn the collection into documentation.</p>
      <div className="mt-4 space-y-3">
        <NextAction
          icon={Download}
          title="Export documentation"
          description="Save a PDF report or an editable Word document."
          disabledReason={exportBlocker(state)}
          onClick={() => actions.navigate("export")}
        />
        <NextAction
          icon={ShieldCheck}
          title="Compliance evidence"
          description="Map your configuration to framework controls."
          onClick={() => actions.navigate("compliance")}
        />
      </div>
    </Card>
  );
}

function Warnings() {
  const { state } = useApp();
  const summary = state.collection.summary;
  if (!summary) return null;
  const { permissionErrors, fetchErrors } = summary;
  if (permissionErrors.length === 0 && fetchErrors.length === 0) return null;
  return (
    <div id="collection-warnings" className="space-y-3 scroll-mt-6">
      {permissionErrors.length > 0 && (
        <aside className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700">
              <Shield className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950">Limited permissions detected</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                Some configuration types could not be read. Ask a tenant administrator to grant these delegated permissions to your app registration.
              </p>
              <ul className="mt-3 space-y-1.5 text-xs text-amber-950/85">
                {permissionErrors.map((error) => (
                  <li key={`${error.resource}-${error.requiredPermission}`} className="flex items-start gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-700" aria-hidden="true" />
                    <span>
                      <strong>{error.resource}:</strong> requires <code className="font-mono">{error.requiredPermission}</code>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      )}
      {fetchErrors.length > 0 && (
        <aside className="rounded-2xl border border-amber-200/80 bg-amber-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-amber-700">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-950">
                {fetchErrors.length} {fetchErrors.length === 1 ? "resource" : "resources"} could not be fully loaded
              </p>
              <p className="mt-1 text-xs leading-5 text-amber-900/80">
                Microsoft Graph did not return complete data for these resources. Everything else was loaded, and the export marks what is missing.
              </p>
              <details className="mt-3">
                <DisclosureSummary className="text-xs font-semibold text-amber-950 hover:text-amber-800">
                  View affected resources
                </DisclosureSummary>
                <ul className="mt-2 space-y-2">
                  {fetchErrors.map((error, index) => (
                    <li
                      key={`${error.policyType}-${error.policyName}-${index}`}
                      className="selectable rounded-xl border border-amber-600/15 bg-white p-3 text-xs text-amber-950/85"
                    >
                      <strong>{error.policyType}:</strong> {error.policyName}
                      <span className="mt-1 block text-[11px] text-amber-800">{error.error}</span>
                      {error.permissionHint && (
                        <span className="mt-1 block text-[11px] text-amber-800/80">
                          Permission used by this endpoint: <code className="font-mono">{error.permissionHint}</code>. This hint does not confirm a permission problem.
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          </div>
        </aside>
      )}
    </div>
  );
}

export function OverviewScreen() {
  const { state } = useApp();
  const { collection } = state;
  const summary = collection.summary;
  const counts = familyCounts(summary?.sectionCounts);
  // Before sign in and activation the Get started steps are the only call to
  // action; the header control appears once collecting is possible.
  const canCollect = collection.running || Boolean(state.auth?.signedIn && state.license?.entitled);
  return (
    <div className="space-y-5">
      <Header
        title="Overview"
        description={
          summary
            ? "Your tenant at a glance. Browse a family on the left or export the documentation."
            : "Collect your Intune configuration to browse it here and export documentation."
        }
        actions={canCollect ? <CollectButton /> : undefined}
      />
      {summary ? (
        <>
          <KpiCards
            configurations={summary.totalConfigurations}
            sections={summary.sectionCounts.filter((section) => section.count > 0).length}
            families={Object.values(counts).filter((count) => count > 0).length}
            warnings={summary.fetchErrors.length}
            permissionGaps={summary.permissionErrors.length}
            loading={collection.running}
          />
          <Warnings />
          <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
            <FamilyBreakdown />
            <NextActions />
          </div>
        </>
      ) : (
        <div className="grid items-start gap-4 @4xl:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
          <GetStarted />
          <Card>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-[18px] w-[18px] text-teal-700" aria-hidden="true" />
              <h2 className="text-petrol-950 text-sm font-semibold">Private by design</h2>
            </div>
            <ul className="text-petrol-600 mt-4 space-y-3 text-[13px] leading-5">
              {[
                "Tenant data is read with your own sign in and stays on this computer.",
                "Only read permissions are used. Nothing in your tenant is changed.",
                "License checks send the license key or, for an organization license, a Microsoft sign-in token that is verified and only its tenant ID used, never stored. Plus an installation ID and the tenant ID. Never configuration.",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
