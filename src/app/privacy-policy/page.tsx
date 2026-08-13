import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { SectionNavigation } from "~/components/section-navigation";
import { BackToTopButton } from "~/components/back-to-top-button";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Intune Documentation Generator uses delegated read-only access, transient processing, sensitive-value redaction, and in-browser document generation.",
};

const sections = [
  { id: "controller", label: "Data Controller" },
  { id: "what-we-access", label: "What We Access" },
  { id: "how-we-process-data", label: "How We Process Data" },
  { id: "analytics-cookies", label: "Analytics & Cookies" },
  { id: "data-sharing", label: "Data Sharing" },
  { id: "security", label: "Security" },
  { id: "data-retention", label: "Data Retention" },
  { id: "your-choices", label: "Your Choices" },
  { id: "your-rights", label: "Your Rights (GDPR & CCPA)" },
  { id: "childrens-privacy", label: "Children's Privacy" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main>
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h1 className="mb-6 text-3xl font-bold text-slate-900">
            Privacy Policy
          </h1>
          <p className="mb-10 text-slate-600">
            Effective:{" "}
            {new Date().toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>

          <SectionNavigation sections={sections} />

          <section className="space-y-6 leading-relaxed text-slate-700">
            <p>
              This Privacy Policy explains how Intune Documentation Generator
              (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;)
              handles information when you use the app to generate documentation
              from Microsoft Intune. We designed the Service to minimize data
              collection and focus on privacy by default.
            </p>

            <h2
              id="controller"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Data Controller
            </h2>
            <p>
              The controller responsible for data processing in connection with
              the Service is:
            </p>
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

            <h2
              id="what-we-access"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              What We Access
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Authentication via Microsoft OAuth 2.0 (Azure AD). We request
                read-only Microsoft Graph permissions necessary to list Intune
                configurations and related assignments.
              </li>
              <li>
                Intune configuration metadata and settings required to render
                your documentation (policies, profiles, script and remediation
                resources, assignments, and related details), read-only.
              </li>
              <li>
                For service-usage measurement, we process your tenant ID and
                user principal name. The monthly-active-user tracker stores
                SHA-256 hashes of those identifiers, not their raw values.
              </li>
            </ul>

            <h2
              id="how-we-process-data"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              How We Process Data
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Our application server uses your delegated access token to
                retrieve Microsoft Graph responses during the active request. It
                processes those responses transiently to collect, normalize, and
                redact them; it does not persist your token or Intune
                configuration data.
              </li>
              <li>
                Sensitive values, including script bodies, passwords, tokens,
                pre-shared keys, QR-code payloads, and encoded
                configuration-file contents, are replaced with [Redacted] before
                data is displayed in the dashboard or included in an export.
              </li>
              <li>
                PDF and DOCX generation happens in your browser. We do not
                upload or persist your generated documents.
              </li>
              <li>
                Access tokens are managed in your browser session by MSAL and
                presented to our application server only for the active Graph
                collection request; we do not persist them server-side.
              </li>
            </ul>

            <h2
              id="analytics-cookies"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Analytics & Cookies
            </h2>
            <p>
              We use privacy-friendly analytics (Plausible) to understand
              aggregate website usage without cookies or personal identifiers.
              We also maintain service-level usage counters to understand active
              organizations and document exports.
            </p>
            <ul className="mt-3 list-disc space-y-2 pl-6">
              <li>
                Plausible Analytics is 100% cookieless and does not track
                personal data or use browser fingerprinting.
              </li>
              <li>
                Plausible collects aggregated metrics such as page views,
                referrers, and device types.
              </li>
              <li>
                When the dashboard is opened, our monthly-active-user tracker
                stores pseudonymous SHA-256 hashes of the user principal name
                and tenant ID. Operational logs may also contain the tenant ID,
                a hashed user identifier, the request context, and timestamp.
              </li>
              <li>
                We increment an aggregate export counter when a document is
                generated. That counter does not contain Intune configuration
                data or a user identifier.
              </li>
              <li>
                Your consent preference for analytics is stored in localStorage
                (not a cookie) and remains on your device only.
              </li>
              <li>
                You can change your analytics preference at any time by clearing
                your browser&apos;s local storage or declining via the consent
                banner.
              </li>
            </ul>

            <h2
              id="data-sharing"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Data Sharing
            </h2>
            <p>
              We do not sell or share your configuration data with third
              parties. Data accessed from Microsoft Graph is used solely to
              generate your documentation.
            </p>

            <h2
              id="security"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Security
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                Authentication is handled via Microsoft OAuth 2.0 (Azure AD).
              </li>
              <li>
                Only read-only Graph permissions are requested for Intune data.
              </li>
              <li>
                Sensitive configuration values are redacted before dashboard
                display or export.
              </li>
              <li>
                We do not persist tenant configuration data; documents are
                generated on demand in your browser.
              </li>
            </ul>

            <h2
              id="data-retention"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Data Retention
            </h2>
            <p>
              We do not retain your Intune configuration data or generated
              documents. Pseudonymous monthly-active-user records and aggregate
              export counts are retained for service measurement and
              administration. Operational logs may exist within hosting-provider
              systems, but the Service does not intentionally write Microsoft
              Graph response bodies or access tokens to those logs.
            </p>

            <h2
              id="your-choices"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Your Choices
            </h2>
            <ul className="list-disc space-y-2 pl-6">
              <li>You can disconnect at any time by signing out of the app.</li>
              <li>
                You can revoke the app&apos;s permissions from your Microsoft
                account/tenant to prevent future access.
              </li>
            </ul>

            <h2
              id="your-rights"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Your Rights (GDPR & CCPA)
            </h2>
            <p>
              If you are located in the European Economic Area (EEA), United
              Kingdom, or California, you may have additional rights under the
              GDPR or CCPA, including:
            </p>
            <ul className="list-disc space-y-2 pl-6">
              <li>
                <strong>Right to access:</strong> Request a copy of any personal
                data we process about you.
              </li>
              <li>
                <strong>Right to deletion:</strong> Request that we delete your
                personal data.
              </li>
              <li>
                <strong>Right to opt-out:</strong> Opt out of any data
                processing that constitutes a sale or sharing of personal
                information (we do not sell or share personal data).
              </li>
              <li>
                <strong>Right to rectification:</strong> Request correction of
                inaccurate personal data.
              </li>
            </ul>
            <p>
              We do not persist your Intune configuration data, but the
              pseudonymous usage records described above may be stored. To ask
              about, access, or delete applicable personal data, contact us at
              the email below.
            </p>

            <h2
              id="childrens-privacy"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Children&apos;s Privacy
            </h2>
            <p>
              The Service is intended for professional/enterprise use and is not
              directed to children.
            </p>

            <h2
              id="changes"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Changes
            </h2>
            <p>
              We may update this policy to reflect improvements or operational
              changes. If we make material changes, we will update the effective
              date above.
            </p>

            <h2
              id="contact"
              className="scroll-mt-24 text-xl font-semibold text-slate-900"
            >
              Contact
            </h2>
            <p>
              Questions about this policy? Contact us at{" "}
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
