import { ArrowLeft, Check } from "lucide-react";
import { useApp } from "../../../state/context";
import { LicensePanel } from "../../license/LicensePanel";
import { Button } from "../../ui/Button";
import { StepLayout, type StepProps } from "../StepLayout";

export function Step7License({ step, goBack, onFinish }: StepProps & { onFinish: () => void }) {
  const { state } = useApp();
  const entitled = Boolean(state.license?.entitled);
  return (
    <StepLayout
      step={step}
      title="Activate your license"
      description={
        entitled
          ? "Your license is active for the signed in tenant. Finish setup to start documenting."
          : "Paste the license key from your purchase email. You can skip this and add it later."
      }
      footer={
        <>
          <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>
            Back
          </Button>
          {entitled ? (
            <Button icon={Check} onClick={onFinish}>
              Finish setup
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="text-petrol-600 text-xs">
                {state.license?.hasKey ? "Not active for this tenant yet, you can skip." : "No license yet, you can skip."}
              </span>
              <Button variant="secondary" onClick={onFinish}>
                Skip for now
              </Button>
            </div>
          )}
        </>
      }
    >
      <LicensePanel mode="activation" />
    </StepLayout>
  );
}
