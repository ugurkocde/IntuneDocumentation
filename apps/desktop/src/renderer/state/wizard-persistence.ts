const WIZARD_KEY = "intunedoc.wizard.v1";

export const WIZARD_STEP_COUNT = 7;

export interface WizardState {
  step: number;
  clientId: string;
  tenantId: string;
}

export function loadWizardState(): WizardState | null {
  try {
    const raw = window.localStorage.getItem(WIZARD_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<WizardState>;
    const step = Number(parsed.step);
    return {
      step:
        Number.isInteger(step) && step >= 1 && step <= WIZARD_STEP_COUNT
          ? step
          : 1,
      clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
      tenantId: typeof parsed.tenantId === "string" ? parsed.tenantId : "",
    };
  } catch {
    return null;
  }
}

export function saveWizardState(state: WizardState): void {
  try {
    window.localStorage.setItem(WIZARD_KEY, JSON.stringify(state));
  } catch {
    // Resume is a convenience; ignore storage failures.
  }
}

export function clearWizardState(): void {
  try {
    window.localStorage.removeItem(WIZARD_KEY);
  } catch {
    // Ignore.
  }
}
