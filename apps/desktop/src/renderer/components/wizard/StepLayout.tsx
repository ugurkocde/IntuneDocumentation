import type { ReactNode } from "react";
import { WIZARD_STEP_COUNT } from "../../state/wizard-persistence";

export interface StepProps {
  step: number;
  goNext(): void;
  goBack(): void;
}

export function StepLayout({
  step,
  title,
  description,
  children,
  footer,
}: {
  step: number;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="mx-auto w-full max-w-2xl flex-1 px-8 pt-10 pb-8">
        <p className="text-[10px] font-bold tracking-[0.14em] text-teal-700 uppercase">
          Step {step} of {WIZARD_STEP_COUNT}
        </p>
        <h1 className="text-petrol-950 mt-2 text-[28px] leading-tight font-semibold tracking-[-0.035em]">
          {title}
        </h1>
        {description && <p className="text-petrol-600 mt-2 text-[15px] leading-6">{description}</p>}
        <div className="mt-8 space-y-5">{children}</div>
      </div>
      <div className="border-petrol-950/6 sticky bottom-0 border-t bg-white/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 px-8 py-4">
          {footer}
        </div>
      </div>
    </div>
  );
}

export function Instructions({ children }: { children: ReactNode }) {
  return (
    <ol className="border-petrol-950/6 shadow-card divide-petrol-950/6 divide-y rounded-2xl border bg-white">
      {children}
    </ol>
  );
}

export function Instruction({
  n,
  children,
  extra,
}: {
  n: number;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <li className="flex gap-4 px-5 py-4">
      <span
        className="bg-mint-100 text-petrol-700 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold"
        aria-hidden="true"
      >
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-petrol-800 text-sm leading-6">{children}</div>
        {extra && <div className="mt-3">{extra}</div>}
      </div>
    </li>
  );
}

export function Ui({ children }: { children: ReactNode }) {
  return <strong className="text-petrol-950 font-semibold">{children}</strong>;
}
