import { AlertTriangle, ExternalLink, KeyRound, RefreshCw, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAsyncAction } from "../../hooks/use-async-action";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../state/context";
import { licenseView } from "../../state/selectors";
import type { LicenseKind } from "../../state/selectors";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { Checkbox } from "../ui/Checkbox";
import { Field } from "../ui/Field";

function Detail({
  label,
  value,
  mono = false,
  className = "",
}: {
  label: string;
  value: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={`border-petrol-950/6 bg-surface min-w-0 rounded-xl border px-3.5 py-3 ${className}`}>
      <dt className="text-petrol-600 text-[10px] font-bold tracking-[0.12em] uppercase">{label}</dt>
      <dd
        className={`text-petrol-950 selectable mt-1 truncate text-sm font-semibold ${mono ? "font-mono text-[12px]" : ""}`}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}

const HEADLINES: Record<LicenseKind, string> = {
  none: "Add your license",
  signedOut: "License key saved",
  cached: "License active",
  offline: "Licensing service offline",
  saved: "License key saved",
  active: "Your license is active",
};

export function LicensePanel({ mode = "full" }: { mode?: "full" | "activation" }) {
  const { state, actions } = useApp();
  const { license } = state;
  const [key, setKey] = useState("");
  const action = useAsyncAction();
  const view = licenseView(state);
  const busy = action.busy !== null;
  const canRetry = view.kind === "offline" || view.kind === "saved";
  // Licensed through the tenant's organization license, without a key here.
  const organization = view.kind === "active" && license?.source === "tenant";
  const keyHolder = view.kind === "active" && license?.source === "key";

  const activate = () =>
    void action.run(
      "activate",
      async () => {
        const result = await ipc.licenseSetKey(key.trim());
        setKey("");
        await actions.refreshLicense();
        return result;
      },
      (result) =>
        result.entitled
          ? "License activated for this tenant."
          : "License saved. It activates for your tenant after you sign in.",
    );
  const retry = () =>
    void action.run(
      "retry",
      async () => {
        const result = await ipc.licenseRetry();
        await actions.refreshLicense();
        return result;
      },
      (result) => (result.entitled ? "License activated for this tenant." : null),
    );
  const deactivate = () =>
    void action.run(
      "deactivate",
      async () => {
        await ipc.licenseDeactivate();
        await actions.refreshLicense();
      },
      license?.hasKey
        ? "This machine was deactivated. You can use the key on another machine."
        : "This machine was deactivated.",
    );
  const share = (shared: boolean) =>
    void action.run(
      "share",
      async () => {
        await ipc.licenseSetShared(shared);
        await actions.refreshLicense();
      },
      shared
        ? "Other admins in this tenant can now use this license after signing in."
        : "Other admins in this tenant can no longer use this license.",
    );

  return (
    <Card>
      <CardHeader
        icon={view.tone === "active" ? ShieldCheck : view.tone === "warning" ? AlertTriangle : KeyRound}
        tone={view.tone === "warning" ? "amber" : "teal"}
        eyebrow="License"
        title={HEADLINES[view.kind]}
        description={<span className="selectable">{view.detail}</span>}
      />

      {view.kind === "active" && license && (
        <dl className="mt-5 grid grid-cols-2 gap-3 @3xl:grid-cols-[minmax(0,0.7fr)_minmax(0,0.8fr)_minmax(0,1.2fr)_minmax(0,1.7fr)]">
          <Detail label="Plan" value={license.plan === "msp" ? "MSP" : "Pro"} />
          <Detail label="Tenants allowed" value={String(license.tenants ?? "")} />
          <Detail
            className="col-span-2 @3xl:col-span-1"
            label="Verified until"
            value={license.expiresAt ? new Date(license.expiresAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : ""}
          />
          <Detail label="Tenant" value={license.tenantId ?? ""} mono className="col-span-2 @3xl:col-span-1" />
        </dl>
      )}

      {!license?.hasKey && !organization && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-teal-600/20 bg-teal-50 p-4">
          <div className="min-w-0 flex-1">
            <p className="text-petrol-950 text-sm font-semibold">No license yet? Start a 30 day free trial.</p>
            <p className="text-petrol-600 mt-1 text-xs leading-5">
              Pro covers one tenant from EUR 49 per month; MSP covers 10 or more client tenants. Your license key
              arrives by email right after checkout, and you are not charged until the trial ends.
            </p>
          </div>
          <Button icon={ExternalLink} onClick={() => void ipc.licenseOpen("buy")}>
            Start free trial
          </Button>
        </div>
      )}

      <div className="mt-5">
        {license?.hasKey ? (
          <div className="border-petrol-950/8 bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0">
              <p className="text-petrol-600 text-xs font-medium">License key</p>
              <p className="text-petrol-950 mt-0.5 font-mono text-sm font-semibold">{license.keyHint}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canRetry && (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={RefreshCw}
                  loading={action.busy === "retry"}
                  disabled={busy}
                  onClick={retry}
                >
                  Retry activation
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-petrol-600"
                loading={action.busy === "deactivate"}
                disabled={busy}
                onClick={deactivate}
              >
                Deactivate this machine
              </Button>
            </div>
            {keyHolder && (
              <div className="border-petrol-950/8 w-full border-t pt-2">
                <Checkbox checked={license.shared === true} onChange={(checked) => !busy && share(checked)}>
                  <span className="text-petrol-950 text-sm">Let other admins in this tenant use this license</span>
                </Checkbox>
                <p className="text-petrol-600 text-xs leading-5">
                  Anyone who signs in to this tenant&apos;s Intune Documentation app registration is licensed automatically.
                  The key stays on this machine.
                </p>
                {license.shareNeedsSignIn && (
                  <p className="mt-1 text-xs leading-5 text-amber-800">
                    Sign in again to share the license with this tenant.
                  </p>
                )}
              </div>
            )}
          </div>
        ) : organization ? (
          <div className="border-petrol-950/8 bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0">
              <p className="text-petrol-600 text-xs font-medium">Organization license</p>
              <p className="text-petrol-950 mt-0.5 font-mono text-sm font-semibold">{license?.displayKey ?? ""}</p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-petrol-600"
              loading={action.busy === "deactivate"}
              disabled={busy}
              onClick={deactivate}
            >
              Deactivate this machine
            </Button>
          </div>
        ) : (
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (key.trim()) activate();
            }}
          >
            <Field
              label="License key"
              mono={false}
              className="min-w-64 flex-1"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              placeholder="Paste the key from your purchase email"
              disabled={busy}
            />
            <Button
              type="submit"
              loading={action.busy === "activate"}
              disabled={!key.trim() || busy}
              disabledReason={!key.trim() ? "Paste a license key first." : null}
            >
              Activate
            </Button>
          </form>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => void ipc.licenseOpen("portal")}>
          Manage subscription
        </Button>
      </div>

      <div aria-live="polite" className="empty:hidden mt-4">
        {action.error && <Alert tone="danger">{action.error}</Alert>}
        {action.message && <Alert tone="success">{action.message}</Alert>}
      </div>

      <p className="text-petrol-600 mt-4 text-xs leading-5">
        {mode === "activation"
          ? "Collecting and exporting need a license for the signed in tenant. You can also add it later from License and account."
          : "License checks send the license key or, for an organization license, your Microsoft sign-in token, which is verified and only its tenant ID used, never stored. They also send a random installation ID, the tenant ID, the app registration client ID and the app version. Tenant configuration is never sent."}
        {license && !license.persisted &&
          " Secure storage is not available on this system, so the license is kept in memory only and must be entered again after a restart."}
      </p>
    </Card>
  );
}
