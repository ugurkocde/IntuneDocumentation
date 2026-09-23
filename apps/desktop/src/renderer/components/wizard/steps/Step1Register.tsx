import { ArrowRight, ExternalLink } from "lucide-react";
import { ipc } from "../../../lib/ipc";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { CopyField } from "../../ui/CopyButton";
import { Instruction, Instructions, StepLayout, Ui, type StepProps } from "../StepLayout";

export const SUGGESTED_APP_NAME = "Intune Documentation Desktop";

export function Step1Register({ step, goNext }: StepProps) {
  return (
    <StepLayout
      step={step}
      title="Register the app in Microsoft Entra"
      description="The app signs in with an app registration that lives in your own tenant. It takes about five minutes to set up, once."
      footer={
        <>
          <span />
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
          Open the Microsoft Entra admin center and go to <Ui>App registrations</Ui>.
        </Instruction>
        <Instruction n={2}>
          Select <Ui>New registration</Ui>.
        </Instruction>
        <Instruction n={3} extra={<CopyField value={SUGGESTED_APP_NAME} label="Copy name" />}>
          Enter a name. We suggest:
        </Instruction>
        <Instruction n={4}>
          Under <Ui>Supported account types</Ui>, choose <Ui>Accounts in this organizational directory only</Ui>.
        </Instruction>
        <Instruction n={5}>
          Leave <Ui>Redirect URI</Ui> empty for now and select <Ui>Register</Ui>.
        </Instruction>
      </Instructions>
      <Alert tone="info">
        You need permission to register applications in your tenant. Granting consent later needs an administrator.
      </Alert>
    </StepLayout>
  );
}
