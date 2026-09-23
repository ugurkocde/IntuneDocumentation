import { BookOpen, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ipc, isMac } from "../../lib/ipc";
import { useApp } from "../../state/context";
import {
  WIZARD_STEP_COUNT,
  clearWizardState,
  loadWizardState,
  saveWizardState,
  type WizardState,
} from "../../state/wizard-persistence";
import { StepNav } from "./StepNav";
import { Step1Register } from "./steps/Step1Register";
import { Step2Authentication } from "./steps/Step2Authentication";
import { Step3Permissions } from "./steps/Step3Permissions";
import { Step4Consent } from "./steps/Step4Consent";
import { Step5Connect } from "./steps/Step5Connect";
import { Step6SignIn } from "./steps/Step6SignIn";
import { Step7License } from "./steps/Step7License";

export function WizardShell() {
  const { state, actions } = useApp();
  const settings = state.settings;
  // Saved settings fill any value the wizard progress does not have yet, so
  // "Redo setup" and a resumed run show the current app registration.
  const [wizard, setWizard] = useState<WizardState>(() => {
    const stored = loadWizardState();
    return {
      step: stored?.step ?? 1,
      clientId: stored?.clientId || settings?.clientId || "",
      tenantId:
        stored?.tenantId ||
        (settings?.tenantId && settings.tenantId !== "organizations" ? settings.tenantId : ""),
    };
  });
  const scroller = useRef<HTMLDivElement>(null);

  const update = useCallback((next: Partial<WizardState>) => {
    setWizard((current) => {
      const value = { ...current, ...next };
      saveWizardState(value);
      return value;
    });
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [wizard.step]);

  const goTo = (step: number) => update({ step: Math.max(1, Math.min(WIZARD_STEP_COUNT, step)) });
  const goNext = () => goTo(wizard.step + 1);
  const goBack = () => goTo(wizard.step - 1);
  const finish = () => {
    clearWizardState();
    actions.closeWizard();
  };
  const canExit = Boolean(settings?.clientId);
  const props = { step: wizard.step, goNext, goBack };

  return (
    <div className="flex h-full">
      <aside className="border-petrol-950/6 flex w-72 shrink-0 xl:w-80 flex-col border-r bg-white">
        {isMac && <div className="drag-region h-10 shrink-0" aria-hidden="true" />}
        <div className={`short:pb-4 flex items-center gap-2.5 px-6 pb-6 ${isMac ? "" : "short:pt-4 pt-6"}`}>
          <img src="./logo.svg" alt="" className="h-9 w-9 rounded-[10px]" draggable={false} />
          <div className="leading-tight">
            <p className="text-petrol-950 text-sm font-bold">Intune Documentation</p>
            <p className="text-petrol-600 text-[11px]">Setup</p>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          <p className="text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase">Connect your tenant</p>
          <StepNav current={wizard.step} onSelect={goTo} />
        </div>
        <div className="border-petrol-950/6 short:p-3 short:space-y-0.5 space-y-1 border-t p-4">
          <button
            type="button"
            onClick={() => void ipc.openHelp("gettingStarted")}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 short:min-h-9 flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors"
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" />
            Getting started guide
          </button>
          {canExit && (
            <button
              type="button"
              onClick={finish}
              className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 short:min-h-9 flex min-h-10 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition-colors"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              Exit setup
            </button>
          )}
        </div>
      </aside>
      <main ref={scroller} className="relative min-w-0 flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        {isMac && <div className="drag-region absolute inset-x-0 top-0 h-8" aria-hidden="true" />}
        <div key={wizard.step} className="animate-fade-in-up h-full">
          {wizard.step === 1 && <Step1Register {...props} />}
          {wizard.step === 2 && <Step2Authentication {...props} />}
          {wizard.step === 3 && <Step3Permissions {...props} />}
          {wizard.step === 4 && <Step4Consent {...props} />}
          {wizard.step === 5 && (
            <Step5Connect
              {...props}
              clientId={wizard.clientId}
              tenantId={wizard.tenantId}
              onChange={(values) => update(values)}
            />
          )}
          {wizard.step === 6 && <Step6SignIn {...props} />}
          {wizard.step === 7 && <Step7License {...props} onFinish={finish} />}
        </div>
      </main>
    </div>
  );
}
