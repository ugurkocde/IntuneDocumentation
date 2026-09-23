import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { complianceFrameworks } from "./content";
import { buttonStyles, Section, SectionHeading } from "./primitives";

const principles = [
  "Each mapped requirement cites the policy, setting, value, and assignment used as evidence.",
  "Counter-evidence is surfaced, not hidden.",
  "Requirements Intune cannot prove stay explicitly unassessed.",
];

export function Compliance() {
  return (
    <Section id="compliance" tone="mint">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            eyebrow="Compliance evidence"
            title="Turn your configuration into audit evidence."
            lead="When an auditor, insurer, or customer questionnaire asks you to prove encryption, screen lock, and patching, map your tenant to the framework they reference instead of collecting screenshots."
          />
          <ul className="mt-8 space-y-3">
            {principles.map((text) => (
              <li key={text} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-teal-700">
                  <Check
                    className="h-3.5 w-3.5"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                </span>
                <span className="text-petrol-700 text-sm leading-6">
                  {text}
                </span>
              </li>
            ))}
          </ul>
          <Link href="/compliance" className={`${buttonStyles.secondary} mt-8`}>
            How compliance mapping works
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>

        <div className="border-petrol-950/6 shadow-card rounded-3xl border bg-white p-6 sm:p-8">
          <p className="text-petrol-600 text-[10px] font-semibold tracking-[0.14em] uppercase">
            Supported frameworks
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {complianceFrameworks.map((name) => (
              <li
                key={name}
                className="border-petrol-950/8 bg-surface text-petrol-800 rounded-full border px-3.5 py-2 text-sm font-medium"
              >
                {name}
              </li>
            ))}
          </ul>
          <p className="text-petrol-600 border-petrol-950/8 mt-6 border-t pt-5 text-xs leading-5">
            Reports are supporting evidence for an assessment, not a
            certification or a calculated maturity level.
          </p>
        </div>
      </div>
    </Section>
  );
}
