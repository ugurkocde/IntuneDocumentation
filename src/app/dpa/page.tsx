import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { SectionNavigation } from "~/components/section-navigation";
import { BackToTopButton } from "~/components/back-to-top-button";
import {
  LegalSections,
  LegalTable,
  SubprocessorTable,
} from "~/components/legal-blocks";
import {
  DPA_DE,
  DPA_EFFECTIVE_LABEL,
  DPA_EN,
  DPA_VERSION,
  SUBPROCESSORS,
  TOMS,
} from "~/lib/legal/dpa";

const description =
  "Data Processing Agreement (Art. 28 GDPR) for the hosted Intune Documentation web app, with subprocessors and technical and organizational measures.";

export const metadata: Metadata = {
  title: "Data Processing Agreement",
  description,
  alternates: { canonical: "/dpa" },
  openGraph: {
    title: "Data Processing Agreement | Intune Documentation",
    description,
    url: "/dpa",
    type: "website",
  },
};

const sections = [
  { id: "overview", label: "Overview" },
  { id: "deutsch", label: "AVV (Deutsch)" },
  { id: "english", label: "DPA (English)" },
  { id: "annex-1", label: "Annex 1: Subprocessors" },
  { id: "annex-2", label: "Annex 2: TOMs" },
];

export default function DpaPage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main>
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h1 className="mb-6 text-3xl font-bold text-slate-900">
            Data Processing Agreement
          </h1>
          <p className="mb-10 text-slate-600">
            Version {DPA_VERSION}, effective {DPA_EFFECTIVE_LABEL}
          </p>

          <SectionNavigation sections={sections} />

          <section className="space-y-6 leading-relaxed text-slate-700">
            <h2
              id="overview"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Overview
            </h2>
            <p>
              This Data Processing Agreement (DPA) under Art. 28 GDPR applies to
              the hosted web app only. It is part of the{" "}
              <a href="/terms" className="text-blue-700 underline">
                Terms of Use
              </a>{" "}
              and is accepted electronically when your organization accepts
              them. No signature is needed. Use your browser&apos;s print
              function to save it as a PDF.
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Desktop app:</strong> no DPA is needed. Your tenant data
                stays on your computer and never reaches us. See the{" "}
                <a href="/desktop" className="text-blue-700 underline">
                  desktop app
                </a>
                .
              </li>
              <li>
                <strong>Self-hosted web app:</strong> no DPA is needed. You
                operate it in your own infrastructure.
              </li>
            </ul>
            <p>
              The German version is binding. The English version is a
              translation for convenience.
            </p>

            <h2
              id="deutsch"
              className="scroll-mt-24 pt-4 text-xl font-semibold text-slate-900"
            >
              Vertrag zur Auftragsverarbeitung (Deutsch)
            </h2>
            <div lang="de" className="space-y-6">
              <LegalSections sections={DPA_DE} />
            </div>

            <h2
              id="english"
              className="scroll-mt-24 pt-4 text-xl font-semibold text-slate-900"
            >
              Data Processing Agreement (English)
            </h2>
            <LegalSections sections={DPA_EN} />

            <h2
              id="annex-1"
              className="scroll-mt-24 pt-4 text-xl font-semibold text-slate-900"
            >
              Annex 1 (Anlage 1): Subprocessors
            </h2>
            <p>
              The current list is also published on{" "}
              <a href="/subprocessors" className="text-blue-700 underline">
                Subprocessors
              </a>
              , where changes are announced 30 days in advance.
            </p>
            <SubprocessorTable subprocessors={SUBPROCESSORS} />

            <h2
              id="annex-2"
              className="scroll-mt-24 pt-4 text-xl font-semibold text-slate-900"
            >
              Annex 2 (Anlage 2): Technical and organizational measures
            </h2>
            <p>
              The most important measure is data minimization: Intune
              configurations and tokens are never stored, and documents are
              generated only in the browser.
            </p>
            <LegalTable
              head={["Area", "Measures"]}
              rows={TOMS.map((t) => [t.area, t.measures])}
            />
          </section>
        </div>
      </main>

      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
