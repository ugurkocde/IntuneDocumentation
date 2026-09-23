import { Building2 } from "lucide-react";
import { useEffect, useState } from "react";
import { isGuid, isTenantIdentifier } from "../../../shared/validators";
import { useAsyncAction } from "../../hooks/use-async-action";
import { useApp } from "../../state/context";
import { busyBlocker } from "../../state/selectors";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Card, CardHeader } from "../ui/Card";
import { ConfirmDialog } from "../ui/ConfirmDialog";
import { Field } from "../ui/Field";

export function validateClientId(value: string): string | null {
  if (!value.trim()) return "Enter the Application (client) ID.";
  return isGuid(value) ? null : "Use the GUID shown as Application (client) ID.";
}

export function validateTenantId(value: string): string | null {
  if (!value.trim()) return "Enter the Directory (tenant) ID.";
  return isTenantIdentifier(value)
    ? null
    : "Use the Directory (tenant) ID GUID or a verified domain.";
}

export function SettingsForm() {
  const { state, actions } = useApp();
  const saved = state.settings;
  const [clientId, setClientId] = useState(saved?.clientId ?? "");
  const [tenantId, setTenantId] = useState(saved?.tenantId ?? "");
  const [touched, setTouched] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const save = useAsyncAction();

  useEffect(() => {
    setClientId(saved?.clientId ?? "");
    setTenantId(saved?.tenantId ?? "");
  }, [saved?.clientId, saved?.tenantId]);

  const clientError = touched ? validateClientId(clientId) : null;
  const tenantError = touched ? validateTenantId(tenantId) : null;
  const changed =
    clientId.trim() !== (saved?.clientId ?? "") || tenantId.trim() !== (saved?.tenantId ?? "");
  const disruptive = Boolean(state.auth?.signedIn || state.collection.summary);

  const doSave = () => {
    setConfirming(false);
    void save.run(
      "save",
      () => actions.saveSettings({ clientId: clientId.trim(), tenantId: tenantId.trim() }),
      "Settings saved. Sign in again to continue.",
    );
  };
  const submit = () => {
    setTouched(true);
    if (validateClientId(clientId) || validateTenantId(tenantId)) return;
    if (disruptive) setConfirming(true);
    else doSave();
  };

  return (
    <Card>
      <CardHeader
        icon={Building2}
        eyebrow="Microsoft Entra"
        title="App registration"
        description="The app signs in with your own Entra app registration. Changing these values signs you out."
      />
      <form
        className="mt-5 grid gap-4 @2xl:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Application (client) ID"
          value={clientId}
          onChange={(event) => setClientId(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          error={clientError}
        />
        <Field
          label="Directory (tenant) ID"
          value={tenantId}
          onChange={(event) => setTenantId(event.target.value)}
          placeholder="00000000-0000-0000-0000-000000000000"
          error={tenantError}
        />
        <div className="flex flex-wrap items-center gap-3 @2xl:col-span-2">
          <Button
            type="submit"
            loading={save.busy === "save"}
            disabled={!changed || Boolean(busyBlocker(state))}
            disabledReason={
              busyBlocker(state)
                ? busyBlocker(state)
                : !changed
                  ? "Change a value to save."
                  : null
            }
          >
            Save changes
          </Button>
          {!changed && !busyBlocker(state) && (
            <span className="text-petrol-600 text-xs">These values match the saved settings.</span>
          )}
          {changed && (
            <Button
              variant="ghost"
              onClick={() => {
                setClientId(saved?.clientId ?? "");
                setTenantId(saved?.tenantId ?? "");
                setTouched(false);
              }}
            >
              Discard
            </Button>
          )}
        </div>
      </form>
      <div aria-live="polite" className="empty:hidden mt-4">
        {save.error && <Alert tone="danger">{save.error}</Alert>}
        {save.message && <Alert tone="success">{save.message}</Alert>}
      </div>
      <ConfirmDialog
        open={confirming}
        title="Save and sign out?"
        description={
          <>
            Saving a different app registration signs you out
            {state.collection.summary ? " and discards the collected data" : ""}. You can
            sign in and collect again afterwards.
          </>
        }
        confirmLabel="Save and sign out"
        onConfirm={doSave}
        onCancel={() => setConfirming(false)}
      />
    </Card>
  );
}
