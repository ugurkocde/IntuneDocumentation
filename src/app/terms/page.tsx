import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { SectionNavigation } from "~/components/section-navigation";
import { BackToTopButton } from "~/components/back-to-top-button";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Terms of Use for Intune Documentation Generator covering acceptable use, access, disclaimers, and limitations of liability.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: "Terms of Use | Intune Documentation",
    description:
      "Terms of Use for Intune Documentation Generator covering acceptable use, access, disclaimers, and limitations of liability.",
    url: "/terms",
    type: "website",
  },
};

const sections = [
  { id: "provider", label: "Service Provider" },
  { id: "access-and-eligibility", label: "Access and Eligibility" },
  { id: "use-of-the-service", label: "Use of the Service" },
  { id: "paid-plans", label: "Paid Plans & Trials" },
  { id: "privacy", label: "Privacy" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "limitation-of-liability", label: "Limitation of Liability" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main>
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h1 className="mb-6 text-3xl font-bold text-slate-900">
            Terms of Use
          </h1>
          <p className="mb-10 text-slate-600">Effective: September 9, 2026</p>

          <SectionNavigation sections={sections} />

          <section className="space-y-6 leading-relaxed text-slate-700">
            <p>
              These Terms of Use (&quot;Terms&quot;) govern your access to and
              use of the Intune Documentation Generator (the
              &quot;Service&quot;). By using the Service, you agree to these
              Terms.
            </p>

            <h2
              id="provider"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Service Provider
            </h2>
            <p>The Service is operated by:</p>
            <p>
              Ugurlabs UG (haftungsbeschränkt)
              <br />
              Fährstraße 217
              <br />
              40221 Düsseldorf, Germany
              <br />
              Managing Director: Ugur Koc
              <br />
              Email:{" "}
              <a
                href="mailto:support@ugurlabs.com"
                className="text-blue-700 underline"
              >
                support@ugurlabs.com
              </a>
            </p>
            <p>
              References to &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;
              in these Terms refer to Ugurlabs UG (haftungsbeschränkt).
            </p>

            <h2
              id="access-and-eligibility"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Access and Eligibility
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                You must have authority to access your Microsoft tenant and
                Intune data.
              </li>
              <li>
                You are responsible for complying with your organization&apos;s
                policies and applicable laws.
              </li>
            </ul>

            <h2
              id="use-of-the-service"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Use of the Service
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                The Service requests read-only Microsoft Graph permissions to
                retrieve Intune configurations.
              </li>
              <li>
                Generated documents are provided for informational purposes and
                auditing support.
              </li>
              <li>
                Do not misuse the Service (e.g., attempt to bypass security,
                reverse engineer, or overload it).
              </li>
            </ul>

            <h2
              id="paid-plans"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Paid plans, trials, and cancellation
            </h2>
            <p>
              Hobby remains free with its existing documentation features.
              Enterprise is $149 per month including one production and one test
              tenant, plus $99 per additional production tenant. MSP is $249 per
              month including ten customers and one internal tenant, plus $20
              per additional customer. Human workspace members are not billed as
              seats. Regular annual billing is fifteen percent below twelve
              monthly list charges. Prices are in USD before applicable tax.
            </p>
            <p>
              A thirty-day trial can be selected at checkout. Unless canceled,
              it converts automatically to the chosen paid subscription. Trial
              eligibility is limited across recreated workspaces and previously
              trialed customer tenants. A checkout without a trial starts a paid
              subscription immediately. Billing details and applicable taxes are
              confirmed at Polar checkout. Polar acts as merchant of record for
              the purchase.
            </p>
            <p>
              The founders offer applies a fifty-percent discount to monthly
              list rates, including additional tenants, for twelve paid months.
              It cannot be combined with the annual discount. Qualifying
              checkout completion must occur before 1 November 2026, 00:00
              Europe/Berlin. The regular price applies after the discount
              period. A terminated founders offer does not restart with a new
              subscription.
            </p>
            <p>
              Workspace owners manage invoices and cancellation through the
              billing portal. Capacity changes require confirmation and may be
              prorated. Disconnect tenants before reducing capacity below
              current usage. Cancellation at the end of a paid period preserves
              access through that period. After access expires, collection stops
              and retained exports are available for a thirty-day recovery
              period before scheduled deletion. A refund or payment reversal may
              change subscription access according to the applicable checkout
              terms. These descriptions do not limit any mandatory statutory
              rights.
            </p>
            <p>
              Customer tenant monitoring requires authorization from an
              administrator in that tenant. Inviting a teammate does not grant
              Microsoft permissions or automatically authorize a customer
              connection. Reports document configured policies and review
              evidence; they do not certify compliance or prove effective device
              enforcement. Support and onboarding assistance are available at
              support@ugurlabs.com.
            </p>
            <h2
              id="privacy"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Privacy
            </h2>
            <p>
              Your use of the Service is also governed by our{" "}
              <a href="/privacy-policy" className="text-blue-700 underline">
                Privacy Policy
              </a>
              , which explains what we access and how we handle data.
            </p>

            <h2
              id="disclaimer"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Disclaimer
            </h2>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as
              available&quot; basis without warranties of any kind. We do not
              warrant that reports are error-free, complete, or suitable for any
              particular purpose. Validate outputs against your tenant as
              needed.
            </p>

            <h2
              id="limitation-of-liability"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Limitation of Liability
            </h2>
            <p>
              To the maximum extent permitted by law, we shall not be liable for
              any indirect, incidental, special, consequential, or punitive
              damages, or any loss of data, profits, or revenues resulting from
              your use of the Service.
            </p>

            <h2
              id="changes"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Changes
            </h2>
            <p>
              We may modify these Terms to reflect improvements or changes to
              the Service. Continued use constitutes acceptance of the updated
              Terms.
            </p>

            <h2
              id="contact"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Contact
            </h2>
            <p>
              Questions about these Terms? Contact us at{" "}
              <a
                href="mailto:support@ugurlabs.com"
                className="text-blue-700 underline"
              >
                support@ugurlabs.com
              </a>{" "}
              or via LinkedIn:{" "}
              <a
                href="https://www.linkedin.com/in/ugurkocde/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-700 underline"
              >
                @ugurkocde
              </a>
              .
            </p>
            <p>
              You can also reach us by post: Ugurlabs UG (haftungsbeschränkt),
              Fährstraße 217, 40221 Düsseldorf, Germany.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
