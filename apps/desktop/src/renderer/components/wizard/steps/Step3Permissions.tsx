import { ArrowLeft, ArrowRight } from "lucide-react";
import { DEFAULT_SCOPES, SCOPE_REASONS } from "../../../../shared/scopes";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { CopyButton } from "../../ui/CopyButton";
import { Instruction, Instructions, StepLayout, Ui, type StepProps } from "../StepLayout";

export function Step3Permissions({ step, goNext, goBack }: StepProps) {
  return (
    <StepLayout
      step={step}
      title="Add the API permissions"
      description="The app only reads your configuration. Every permission below is read only."
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
          Open <Ui>API permissions</Ui> and select <Ui>Add a permission</Ui>.
        </Instruction>
        <Instruction n={2}>
          Choose <Ui>Microsoft Graph</Ui>, then <Ui>Delegated permissions</Ui>.
        </Instruction>
        <Instruction n={3}>Search for and select each of these nine permissions, then select <Ui>Add permissions</Ui>.</Instruction>
      </Instructions>
      <div className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
        <div className="border-petrol-950/6 flex items-center justify-between gap-3 border-b px-5 py-3">
          <p className="text-petrol-950 text-sm font-semibold">Microsoft Graph, delegated</p>
          <CopyButton value={DEFAULT_SCOPES.join("\n")} label="Copy all" showLabel />
        </div>
        <ul className="divide-petrol-950/6 divide-y">
          {DEFAULT_SCOPES.map((scope) => (
            <li key={scope} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <code className="text-petrol-950 selectable block truncate font-mono text-[13px] font-semibold">{scope}</code>
                <p className="text-petrol-600 mt-0.5 text-xs leading-5">{SCOPE_REASONS[scope]}</p>
              </div>
              <CopyButton value={scope} label={`Copy ${scope}`} />
            </li>
          ))}
        </ul>
      </div>
      <Alert tone="info">
        The app never writes to your tenant. It reads with your own sign in and only when you collect or export.
      </Alert>
    </StepLayout>
  );
}
