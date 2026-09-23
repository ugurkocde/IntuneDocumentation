import { ExternalLink, KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useAsyncAction } from "../../hooks/use-async-action";
import { ipc } from "../../lib/ipc";
import { useApp } from "../../state/context";
import { licenseLabel } from "../../state/selectors";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
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

export function LicensePanel({ mode = "full" }: { mode?: "full" | "activation" }) {
  const { state, actions } = useApp();
  const { license } = state;
  const [key, setKey] = useState("");
  const action = useAsyncAction();
  const status = licenseLabel(state);
  const entitled = Boolean(license?.entitled);
  const busy = action.busy !== null;

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
  const deactivate = () =>
    void action.run(
      "deactivate",
      async () => {
        await ipc.licenseDeactivate();
        await actions.refreshLicense();
      },
      "This machine was deactivated. You can use the key on another machine.",
    );

  const serverMessage = !action.message && !action.error ? license?.message : null;

  return (
    <Card>
      <CardHeader
        icon={entitled ? ShieldCheck : KeyRound}
        eyebrow="License"
        title={
          <span className="flex flex-wrap items-center gap-2">
            {entitled ? "Your license is active" : license?.hasKey ? "License saved" : "Add your license"}
            <Badge variant={entitled ? "info" : license?.hasKey ? "warning" : "default"}>{status}</Badge>
          </span>
        }
        description={
          mode === "activation"
            ? "Collecting and exporting need a license for the signed in tenant. You can also add it later from License and account."
            : "Collecting and exporting need a license for the signed in tenant. Activation sends the license key, a random installation ID, the tenant ID and the app version to our licensing service. Tenant configuration is never sent."
        }
      />

      {entitled && license && (
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

      <div className="mt-5">
        {license?.hasKey ? (
          <div className="border-petrol-950/8 bg-surface flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0">
              <p className="text-petrol-600 text-xs font-medium">License key</p>
              <p className="text-petrol-950 mt-0.5 font-mono text-sm font-semibold">{license.keyHint}</p>
            </div>
            <Button
              variant="dangerOutline"
              size="sm"
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
        {!license?.hasKey && (
          <Button variant="secondary" size="sm" icon={ExternalLink} onClick={() => void ipc.licenseOpen("buy")}>
            Buy a license
          </Button>
        )}
        <Button variant="ghost" size="sm" icon={ExternalLink} onClick={() => void ipc.licenseOpen("portal")}>
          Manage subscription
        </Button>
      </div>

      <div aria-live="polite" className="empty:hidden mt-4">
        {action.error && <Alert tone="danger">{action.error}</Alert>}
        {action.message && <Alert tone="success">{action.message}</Alert>}
        {serverMessage && <Alert tone="warning">{serverMessage}</Alert>}
      </div>

      {license && !license.persisted && (
        <p className="text-petrol-600 mt-3 text-xs leading-5">
          Secure storage is not available on this system, so the license is kept in memory only and must be entered again after a restart.
        </p>
      )}
    </Card>
  );
}
