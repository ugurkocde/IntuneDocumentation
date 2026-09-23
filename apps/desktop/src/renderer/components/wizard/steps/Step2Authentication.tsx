import { ArrowLeft, ArrowRight } from "lucide-react";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { CopyField } from "../../ui/CopyButton";
import { Instruction, Instructions, StepLayout, Ui, type StepProps } from "../StepLayout";

export function Step2Authentication({ step, goNext, goBack }: StepProps) {
  return (
    <StepLayout
      step={step}
      title="Add the redirect URI"
      description="Sign in happens in your browser and returns to the app through a local address."
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
        <Instruction n={1}>
          In your new app registration, open <Ui>Authentication</Ui>.
        </Instruction>
        <Instruction n={2}>
          Select <Ui>Add a platform</Ui>, then <Ui>Mobile and desktop applications</Ui>.
        </Instruction>
        <Instruction n={3} extra={<CopyField value="http://localhost" label="Copy URI" />}>
          Under <Ui>Custom redirect URIs</Ui>, enter exactly this address and select <Ui>Configure</Ui>:
        </Instruction>
      </Instructions>
      <Alert tone="info" title="No port needed">
        Microsoft ignores the port for localhost addresses, so the app can use any free port while you sign in.
      </Alert>
      <Alert tone="info" title="Leave public client flows off">
        Keep <Ui>Allow public client flows</Ui> set to <Ui>No</Ui>. The app uses the authorization code flow with PKCE, which does not need it.
      </Alert>
    </StepLayout>
  );
}
