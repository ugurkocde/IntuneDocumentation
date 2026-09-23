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
  { id: "desktop-app", label: "Desktop App" },
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
          <p className="mb-10 text-slate-600">Effective: September 23, 2026</p>

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
              id="desktop-app"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Desktop App
            </h2>
            <p>
              The Intune Documentation desktop app for macOS and Windows (the
              &quot;Desktop App&quot;) is a paid part of the Service. These
              Terms apply to it together with the following conditions.
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>License grant:</strong> while your subscription or trial
                is active, we grant you a non-exclusive, non-transferable,
                non-sublicensable right to install and use the Desktop App to
                document Microsoft Intune tenants within the limits of your
                plan. MSP plans may be used to document the tenants of your
                customers as part of services you provide to them.
              </li>
              <li>
                <strong>Pro plan:</strong> covers one Microsoft Entra tenant and
                up to 5 installations for that tenant.
              </li>
              <li>
                <strong>MSP plan:</strong> covers the number of tenants you
                purchase (10 included, with additional tenants billed per
                tenant) and up to 5 installations per tenant.
              </li>
              <li>
                <strong>Limits:</strong> the Desktop App enforces tenant and
                installation limits through our licensing service. You may not
                share license keys outside your organization or attempt to
                bypass these limits. You can free an installation by
                deactivating it in the app or in the Polar customer portal.
              </li>
              <li>
                <strong>Trial:</strong> new subscriptions start with a 30 day
                free trial. A payment method is required. If you do not cancel
                before the trial ends, the subscription starts and is billed
                automatically.
              </li>
              <li>
                <strong>Payment:</strong> Polar Software Inc. is the merchant of
                record and processes payments, invoices, and taxes. Your
                purchase is also subject to Polar&apos;s terms. Prices are shown
                in EUR and may be subject to applicable taxes.
              </li>
              <li>
                <strong>Cancellation:</strong> you can cancel or change your
                subscription at any time in the Polar customer portal.
                Cancellation takes effect at the end of the current billing
                period, and the Desktop App stays licensed until then.
              </li>
              <li>
                <strong>License checks and updates:</strong> the Desktop App
                checks your license with our licensing service periodically and
                keeps working for up to 14 days without reaching it. It tells
                you when an update is available and installs it when you choose,
                or automatically if you turn that on in Settings. We may add,
                change, or remove features to improve the Desktop App.
              </li>
              <li>
                <strong>Your responsibilities:</strong> you create and control
                the Entra app registration the Desktop App signs in with, and
                you are responsible for the permissions and consent you grant to
                it.
              </li>
              <li>
                <strong>No warranty:</strong> the Disclaimer and Limitation of
                Liability sections below apply to the Desktop App. It is
                provided &quot;as is&quot; and &quot;as available&quot;, and its
                reports and compliance evidence do not replace your own review
                or an audit.
              </li>
            </ul>

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
