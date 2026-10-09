import { ArrowRight, Check, FileText } from "lucide-react";
import Link from "next/link";
import { SAMPLE_REPORTS, sampleReportUrl } from "~/lib/compliance/samples";
import {
  desktopOnlyFrameworksNote,
  FEATURED_SAMPLE_REPORT,
  sampleReportLabel,
  trackSampleReport,
} from "./content";
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
          <div className="mt-8 flex flex-wrap gap-3">
            {FEATURED_SAMPLE_REPORT && (
              <a
                href={sampleReportUrl(FEATURED_SAMPLE_REPORT)}
                target="_blank"
                rel="noopener"
                className={`${buttonStyles.primary} ${trackSampleReport(FEATURED_SAMPLE_REPORT.frameworkId)}`}
              >
                <FileText className="h-4 w-4" aria-hidden="true" />
                View a sample ISO 27001 evidence report
              </a>
            )}
            <Link href="/compliance" className={buttonStyles.secondary}>
              How compliance mapping works
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </div>

        <div className="border-petrol-950/6 shadow-card rounded-3xl border bg-white p-6 sm:p-8">
          <p className="text-petrol-600 text-[10px] font-semibold tracking-[0.14em] uppercase">
            Supported frameworks
          </p>
          <p className="text-petrol-600 mt-2 text-sm leading-6">
            Open any framework to see its sample evidence report for the
            fictional tenant Contoso Ltd.
          </p>
          <ul className="mt-5 flex flex-wrap gap-2">
            {SAMPLE_REPORTS.map((sample) => (
              <li key={sample.frameworkId}>
                <a
                  href={sampleReportUrl(sample)}
                  target="_blank"
                  rel="noopener"
                  aria-label={sampleReportLabel(sample)}
                  className={`border-petrol-950/8 bg-surface text-petrol-800 inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-colors hover:border-teal-600/30 hover:bg-white hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${trackSampleReport(sample.frameworkId)}`}
                >
                  <FileText
                    className="h-3.5 w-3.5 shrink-0 text-teal-700"
                    aria-hidden="true"
                  />
                  {sample.label}
                  {sample.locale === "de" && (
                    <span className="text-petrol-600 text-[10px] font-semibold tracking-[0.1em] uppercase">
                      DE
                    </span>
                  )}
                  {sample.desktopOnly && (
                    <span className="text-petrol-600 text-[10px] font-semibold tracking-[0.1em] uppercase">
                      Desktop
                    </span>
                  )}
                </a>
              </li>
            ))}
          </ul>
          <p className="text-petrol-600 border-petrol-950/8 mt-6 border-t pt-5 text-xs leading-5">
            Reports are supporting evidence for an assessment, not a
            certification or a calculated maturity level.{" "}
            {desktopOnlyFrameworksNote}
          </p>
        </div>
      </div>
    </Section>
  );
}
