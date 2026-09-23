import { ArrowLeft, ArrowRight } from "lucide-react";
import { useState } from "react";
import { useAsyncAction } from "../../../hooks/use-async-action";
import { useApp } from "../../../state/context";
import { validateClientId, validateTenantId } from "../../settings/SettingsForm";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Field } from "../../ui/Field";
import { StepLayout, Ui, type StepProps } from "../StepLayout";

export function Step5Connect({
  step,
  goNext,
  goBack,
  clientId,
  tenantId,
  onChange,
}: StepProps & {
  clientId: string;
  tenantId: string;
  onChange: (values: { clientId: string; tenantId: string }) => void;
}) {
  const { state, actions } = useApp();
  const [touched, setTouched] = useState(false);
  const save = useAsyncAction();
  const clientError = touched ? validateClientId(clientId) : null;
  const tenantError = touched ? validateTenantId(tenantId) : null;
  const unchanged =
    clientId.trim() === state.settings?.clientId && tenantId.trim() === state.settings?.tenantId;

  const submit = async () => {
    setTouched(true);
    if (validateClientId(clientId) || validateTenantId(tenantId)) return;
    if (unchanged) {
      goNext();
      return;
    }
    const saved = await save.run("save", () =>
      actions.saveSettings({ clientId: clientId.trim(), tenantId: tenantId.trim() }),
    );
    if (saved) goNext();
  };

  return (
    <StepLayout
      step={step}
      title="Connect the app registration"
      description={
        <>
          Copy both values from the <Ui>Overview</Ui> page of your app registration.
        </>
      }
      footer={
        <>
          <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>
            Back
          </Button>
          <Button type="submit" form="wizard-connect" trailingIcon={ArrowRight} loading={save.busy !== null}>
            Save and continue
          </Button>
        </>
      }
    >
      <form
        id="wizard-connect"
        className="border-petrol-950/6 shadow-card space-y-5 rounded-2xl border bg-white p-6"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <Field
          label="Application (client) ID"
          value={clientId}
          autoFocus
          onChange={(event) => onChange({ clientId: event.target.value, tenantId })}
          placeholder="00000000-0000-0000-0000-000000000000"
          error={clientError}
          hint="A GUID such as 1a2b3c4d-0000-0000-0000-000000000000."
        />
        <Field
          label="Directory (tenant) ID"
          value={tenantId}
          onChange={(event) => onChange({ clientId, tenantId: event.target.value })}
          placeholder="00000000-0000-0000-0000-000000000000"
          error={tenantError}
          hint="The GUID of your tenant. A verified domain such as contoso.onmicrosoft.com also works."
        />
      </form>
      {save.error && <Alert tone="danger">{save.error}</Alert>}
    </StepLayout>
  );
}
