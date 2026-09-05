import type { Metadata } from "next";
import Link from "next/link";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { BackToTopButton } from "~/components/back-to-top-button";

export const metadata: Metadata = {
  title: "Compliance Evidence for Intune",
  description:
    "Map your Microsoft Intune configuration to ISO/IEC 27001, SOC 2, NIST SP 800-53, NIST SP 800-171, NIST CSF 2.0, BSI IT-Grundschutz, UK MOD Def Stan 05-138, and Cyber Essentials. Audit-ready evidence reports, generated from your tenant documentation.",
  alternates: { canonical: "/compliance" },
  openGraph: {
    title: "Compliance Evidence for Intune | Intune Documentation",
    description:
      "Turn your Intune tenant documentation into audit evidence for ISO/IEC 27001, SOC 2, NIST SP 800-53, NIST SP 800-171, NIST CSF 2.0, BSI IT-Grundschutz, UK MOD Def Stan 05-138, and Cyber Essentials.",
    url: "/compliance",
    type: "website",
  },
};

const frameworks = [
  {
    name: "ISO/IEC 27001:2022",
    detail:
      "Selected Annex A technology controls are mapped to managed-device configuration evidence by control number.",
  },
  {
    name: "SOC 2",
    detail:
      "Selected Trust Services Criteria are mapped to managed-device configuration evidence by criterion ID.",
  },
  {
    name: "NIST SP 800-53 (Rev. 5)",
    detail:
      "Technical evidence for controls such as SC-28 (protection of information at rest), SI-3 (malicious code protection), and IA-5 (authenticator management).",
  },
  {
    name: "NIST Cybersecurity Framework 2.0",
    detail:
      "Evidence for Protect and Detect subcategories, from PR.DS-01 (data-at-rest protection) to DE.CM-09 (endpoint monitoring).",
  },
  {
    name: "UK MOD Def Stan 05-138 (Issue 4)",
    detail:
      "Selected Objective B controls for defence suppliers under DEFCON 658, referenced by control identifier with the Cyber Risk Profile levels at which each applies.",
  },
  {
    name: "NCSC Cyber Essentials",
    detail:
      "The five control themes (firewalls, secure configuration, security update management, user access control, malware protection) mapped to managed-device configuration evidence.",
  },
  {
    name: "NIST SP 800-171 (Rev. 2)",
    detail:
      "Supporting Intune evidence for 11 of 110 published requirements in the revision used by CMMC Level 2. Covers selected encryption, authentication, hardening and malware protections. This is not a complete CMMC assessment or an SPRS score.",
  },
  {
    name: "NIST SP 800-171 (Rev. 3)",
    detail:
      "Supporting Intune evidence for 11 of 97 published requirements in the May 2024 revision, including MFA, application control, storage encryption and malicious code protection. Organization-defined parameters and remaining requirements need separate assessment. Revision 2 remains separately available for CMMC Level 2.",
  },
  {
    name: "BSI IT-Grundschutz",
    detail:
      "Requirement-level mapping (A-Anforderungen) for the client Bausteine SYS.2.2.3, SYS.2.4, SYS.3.2.1, and SYS.3.2.2, verified against the Kompendium Edition 2023, with Basis, Standard, and erhöhter Schutzbedarf tiers. Only technically assessable requirements are mapped; organizational requirements remain a manual assessment.",
  },
];

const reportFeatures = [
  {
    title: "Document control and provenance",
    detail:
      "Report ID, revision, ruleset version, classification, and a data-basis section stating exactly which policy families and how many policies were assessed, so the report can stand in an audit trail.",
  },
  {
    title: "Evidence register with citations",
    detail:
      "Every unique piece of evidence appears once in an appendix with the policy, setting, value, and assignment; controls cite it by reference (E-001 style) the way an auditor expects to verify it.",
  },
  {
    title: "Results overview and key findings",
    detail:
      "Outcomes grouped by BSI requirement tier or framework control family, with assigned deviations and unassigned configurations flagged up front.",
  },
  {
    title: "Grundschutz-Check ready",
    detail:
      "The BSI report is fully German and includes manual assessment fields (Umsetzungsstatus, Verantwortlich, Zieltermin, Bemerkung) for each requirement, so consultants can complete their review directly on the document.",
  },
  {
    title: "Gap guidance",
    detail:
      "Every requirement without evidence lists the exact Intune settings that could provide it, turning the report into a remediation worklist.",
  },
];

const principles = [
  {
    title: "Real evidence, not keyword matching",
    detail:
      "A control only counts as covered when a recognized Intune setting is configured with the value that actually enforces it, on a policy that is assigned. Policies that merely mention a topic are ignored.",
  },
  {
    title: "Counter-evidence is surfaced",
    detail:
      "A policy that explicitly disables BitLocker is reported as a risk, never as coverage. Unassigned policies are flagged instead of counted.",
  },
  {
    title: "Honest by design",
    detail:
      "The report states evidence, partial evidence, or no evidence. It never claims you are compliant, because only your auditor can. Organizational requirements are listed for manual assessment.",
  },
  {
    title: "Your data stays yours",
    detail:
      "Assessment runs on the same tenant export as your documentation. Your configuration is processed in your browser session and is not stored on our servers.",
  },
];

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main>
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <p className="mb-4 text-xs font-bold tracking-[0.16em] text-teal-700 uppercase">
            Now in the dashboard
          </p>
          <h1 className="mb-6 text-3xl font-bold text-slate-900">
            Turn your Intune documentation into audit evidence
          </h1>
          <p className="mb-10 leading-relaxed text-slate-700">
            When an auditor, a cyber insurer, or a customer questionnaire asks
            you to prove that your devices enforce encryption, screen lock, and
            patching, the answer is usually days of screenshots. Intune
            Documentation already knows your tenant configuration. Compliance
            reports map it to the frameworks your auditor actually references,
            with the policy names, settings, values, and assignments as
            evidence.
          </p>

          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            Supported frameworks
          </h2>
          <ul className="mb-10 space-y-4">
            {frameworks.map((framework) => (
              <li
                key={framework.name}
                className="rounded-lg border border-slate-200 p-4"
              >
                <h3 className="font-semibold text-slate-900">
                  {framework.name}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {framework.detail}
                </p>
              </li>
            ))}
          </ul>

          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            Inside every report
          </h2>
          <p className="mb-4 text-sm leading-relaxed text-slate-600">
            The downloadable reports are built as audit deliverables, not data
            dumps: table of contents with page numbers, grayscale-safe status
            markers, and the structure an assessor expects.
          </p>
          <ul className="mb-10 space-y-4">
            {reportFeatures.map((feature) => (
              <li
                key={feature.title}
                className="rounded-lg border border-slate-200 p-4"
              >
                <h3 className="font-semibold text-slate-900">
                  {feature.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {feature.detail}
                </p>
              </li>
            ))}
          </ul>

          <h2 className="mb-4 text-xl font-semibold text-slate-900">
            Built for people who face auditors
          </h2>
          <ul className="mb-10 space-y-4">
            {principles.map((principle) => (
              <li key={principle.title}>
                <h3 className="font-semibold text-slate-900">
                  {principle.title}
                </h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  {principle.detail}
                </p>
              </li>
            ))}
          </ul>

          <div className="bg-mint-50 rounded-xl p-6">
            <h2 className="mb-2 text-xl font-semibold text-slate-900">
              See your compliance evidence now
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-slate-600">
              The compliance evidence view is available in the dashboard for
              every signed-in user. Review framework controls and download full
              requirement-level reports as PDF.
            </p>
            <Link
              href="/dashboard"
              className="inline-flex min-h-11 items-center justify-center rounded-lg bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-800 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
            >
              Open the dashboard
            </Link>
          </div>

          <p className="mt-10 text-xs leading-relaxed text-slate-400">
            Compliance reports state technical evidence found in your Intune
            tenant. They are not a certification and do not replace an audit.
            ISO/IEC 27001 and SOC 2 criteria are referenced by identifier with
            original summaries. NIST publications are used with their
            public-domain status; BSI IT-Grundschutz is referenced from the
            freely published Kompendium. Def Stan 05-138 is referenced by
            control identifier with original summaries. Cyber Essentials content
            is used under the Open Government Licence v3.0, and evidence never
            indicates certification.
          </p>
        </div>
      </main>
      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
