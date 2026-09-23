import { Download, KeyRound, ListChecks } from "lucide-react";
import { Section, SectionHeading } from "./primitives";

const steps = [
  {
    icon: KeyRound,
    title: "Sign in with Microsoft",
    desc: "Use your work account. An admin approves the read-only permissions once per tenant; after that, anyone with Intune read access can sign in.",
  },
  {
    icon: ListChecks,
    title: "Collect and select",
    desc: "Sections stream in with live progress. Pick configurations by type, search, or select everything; assignments and filters come along.",
  },
  {
    icon: Download,
    title: "Export or map to a framework",
    desc: "Download a branded PDF or Word document, or generate a compliance evidence report. Sensitive values stay redacted.",
  },
];

export function HowItWorks() {
  return (
    <Section id="how-it-works" tone="white">
      <SectionHeading
        eyebrow="How it works"
        title="From tenant to finished report in three steps."
      />
      <ol className="mt-12 grid gap-4 md:grid-cols-3">
        {steps.map(({ icon: Icon, title, desc }, index) => (
          <li
            key={title}
            className="border-petrol-950/6 bg-surface rounded-2xl border p-6 sm:p-7"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="text-petrol-600 text-xs font-semibold tracking-[0.14em] uppercase">
                Step {index + 1}
              </span>
            </div>
            <h3 className="text-petrol-950 mt-6 text-lg font-semibold">
              {title}
            </h3>
            <p className="text-petrol-600 mt-2 text-sm leading-6">{desc}</p>
          </li>
        ))}
      </ol>
    </Section>
  );
}
