import { ArrowLeft, ArrowRight, ExternalLink } from "lucide-react";
import { ipc } from "../../../lib/ipc";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Instruction, Instructions, StepLayout, Ui, type StepProps } from "../StepLayout";

export function Step4Consent({ step, goNext, goBack }: StepProps) {
  return (
    <StepLayout
      step={step}
      title="Grant admin consent"
      description="Consent lets everyone who uses this app registration sign in without a consent prompt for each permission."
      footer={
        <>
          <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>
            Back
          </Button>
          <Button trailingIcon={ArrowRight} onClick={goNext}>
            Continue
          </Button>
        </>
      }
    >
      <Instructions>
        <Instruction
          n={1}
          extra={
            <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => void ipc.openHelp("entraAppRegistrations")}>
              Open App registrations
            </Button>
          }
        >
          On the <Ui>API permissions</Ui> page of your app registration, select <Ui>Grant admin consent for</Ui> your tenant name.
        </Instruction>
        <Instruction n={2}>
          Confirm with <Ui>Yes</Ui>. Each permission now shows the status <Ui>Granted</Ui>.
        </Instruction>
      </Instructions>
      <Alert tone="info" title="Who can grant consent">
        A Global Administrator, Privileged Role Administrator or Cloud Application Administrator can grant consent for these delegated permissions.
      </Alert>
      <Alert tone="info" title="No access to the admin center right now?">
        Continue anyway. In step 6 a Global Administrator can sign in and consent for the whole organization from inside the app.
      </Alert>
    </StepLayout>
  );
}
