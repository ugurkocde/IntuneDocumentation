import { Check } from "lucide-react";

export const WIZARD_STEPS = [
  { title: "Register the app", hint: "Entra admin center" },
  { title: "Authentication", hint: "Redirect URI" },
  { title: "API permissions", hint: "Nine read permissions" },
  { title: "Admin consent", hint: "Once per tenant" },
  { title: "Connect the app", hint: "Client and tenant ID" },
  { title: "Sign in and verify", hint: "Check permissions" },
  { title: "License", hint: "Activate or skip" },
];

export function StepNav({
  current,
  onSelect,
}: {
  current: number;
  onSelect: (step: number) => void;
}) {
  return (
    <ol className="short:space-y-0.5 space-y-1" aria-label="Setup steps">
      {WIZARD_STEPS.map((step, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li key={step.title}>
            <button
              type="button"
              onClick={() => onSelect(number)}
              disabled={number > current}
              aria-current={active ? "step" : undefined}
              className={`flex w-full items-center gap-3 short:py-1.5 rounded-xl px-3 py-2.5 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                active ? "bg-teal-50" : done ? "hover:bg-mint-50 cursor-pointer" : "cursor-default"
              }`}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${
                  done
                    ? "bg-teal-600 text-white"
                    : active
                      ? "bg-petrol-950 text-white"
                      : "border-petrol-950/12 text-petrol-600 border bg-white"
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" /> : number}
              </span>
              <span className="min-w-0">
                <span
                  className={`block truncate text-[13px] font-semibold ${
                    active ? "text-teal-800" : done ? "text-petrol-800" : "text-petrol-600"
                  }`}
                >
                  {step.title}
                </span>
                <span className="text-petrol-600/80 short:hidden block truncate text-[11px]">{step.hint}</span>
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}
