import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { SectionNavigation } from "~/components/section-navigation";
import { BackToTopButton } from "~/components/back-to-top-button";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Intune Documentation Generator handles authentication data, analytics, and privacy. We request read-only permissions and generate all documents entirely in your browser. Your policy data never leaves your device.",
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
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
        <p className="text-slate-600 mb-10">
          Effective: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <SectionNavigation sections={sections} />

        <section className="space-y-6 text-slate-700 leading-relaxed">
          <p>
            This Privacy Policy explains how Intune Documentation Generator (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;)
            handles information when you use the app to generate documentation from Microsoft Intune. We
            designed the Service to minimize data collection and focus on privacy by default.
          </p>

          <h2 id="controller" className="text-xl font-semibold text-slate-900 scroll-mt-24">Data Controller</h2>
          <p>
            The controller responsible for data processing in connection with the Service is:
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
            Email: <a href="mailto:support@ugurlabs.com" className="text-blue-700 underline">support@ugurlabs.com</a>
          </p>

          <h2 id="what-we-access" className="text-xl font-semibold text-slate-900 scroll-mt-24">What We Access</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              Authentication via Microsoft OAuth 2.0 (Azure AD). We request read-only Microsoft Graph
              permissions necessary to list Intune configurations and related assignments.
            </li>
            <li>
              Intune configuration metadata and settings required to render your documentation (policies,
              profiles, scripts, assignments, and related details), read-only.
            </li>
          </ul>

          <h2 id="how-we-process-data" className="text-xl font-semibold text-slate-900 scroll-mt-24">How We Process Data</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>
              All document generation (PDF and DOCX) happens entirely in your browser. Your Intune
              configuration data never leaves your device during the export process.
            </li>
            <li>
              We do not persist your Intune configuration data or generated documents. Data is retrieved
              during your session and used solely to build your report on your device.
            </li>
            <li>
              Access tokens are managed by your browser session to call Microsoft Graph; we do not persist
              them server-side.
            </li>
          </ul>

          <h2 id="analytics-cookies" className="text-xl font-semibold text-slate-900 scroll-mt-24">Analytics & Cookies</h2>
          <p>
            We use privacy-friendly analytics (Plausible) to understand aggregate usage without cookies or
            personal identifiers. Analytics are used to improve stability and usability, not to track individuals.
          </p>
          <ul className="list-disc pl-6 space-y-2 mt-3">
            <li>Plausible Analytics is 100% cookieless and does not track personal data or use browser fingerprinting.</li>
            <li>We collect only aggregated, anonymous metrics such as page views, referrers, and device types.</li>
            <li>Your consent preference for analytics is stored in localStorage (not a cookie) and remains on your device only.</li>
            <li>You can change your analytics preference at any time by clearing your browser&apos;s local storage or declining via the consent banner.</li>
          </ul>

          <h2 id="data-sharing" className="text-xl font-semibold text-slate-900 scroll-mt-24">Data Sharing</h2>
          <p>
            We do not sell or share your configuration data with third parties. Data accessed from Microsoft
            Graph is used solely to generate your documentation.
          </p>

          <h2 id="security" className="text-xl font-semibold text-slate-900 scroll-mt-24">Security</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Authentication is handled via Microsoft OAuth 2.0 (Azure AD).</li>
            <li>Only read-only Graph permissions are requested for Intune data.</li>
            <li>We avoid storing tenant data; PDFs are generated on demand and not persisted.</li>
          </ul>

          <h2 id="data-retention" className="text-xl font-semibold text-slate-900 scroll-mt-24">Data Retention</h2>
          <p>
            We do not retain your Intune configuration data or generated documents. Operational logs described
            above may exist temporarily within hosting provider systems as part of standard logging.
          </p>

          <h2 id="your-choices" className="text-xl font-semibold text-slate-900 scroll-mt-24">Your Choices</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You can disconnect at any time by signing out of the app.</li>
            <li>
              You can revoke the app&apos;s permissions from your Microsoft account/tenant to prevent future access.
            </li>
          </ul>

          <h2 id="your-rights" className="text-xl font-semibold text-slate-900 scroll-mt-24">Your Rights (GDPR & CCPA)</h2>
          <p>
            If you are located in the European Economic Area (EEA), United Kingdom, or California, you may have additional rights under the GDPR or CCPA, including:
          </p>
          <ul className="list-disc pl-6 space-y-2">
            <li><strong>Right to access:</strong> Request a copy of any personal data we process about you.</li>
            <li><strong>Right to deletion:</strong> Request that we delete your personal data.</li>
            <li><strong>Right to opt-out:</strong> Opt out of any data processing that constitutes a sale or sharing of personal information (we do not sell or share personal data).</li>
            <li><strong>Right to rectification:</strong> Request correction of inaccurate personal data.</li>
          </ul>
          <p>
            Because we do not persist your Intune configuration data or personal information beyond your browser session, there is typically no stored data to access, correct, or delete. To exercise any of these rights, contact us at the email below.
          </p>

          <h2 id="childrens-privacy" className="text-xl font-semibold text-slate-900 scroll-mt-24">Children&apos;s Privacy</h2>
          <p>
            The Service is intended for professional/enterprise use and is not directed to children.
          </p>

          <h2 id="changes" className="text-xl font-semibold text-slate-900 scroll-mt-24">Changes</h2>
          <p>
            We may update this policy to reflect improvements or operational changes. If we make material
            changes, we will update the effective date above.
          </p>

          <h2 id="contact" className="text-xl font-semibold text-slate-900 scroll-mt-24">Contact</h2>
          <p>
            Questions about this policy? Contact us at <a href="mailto:support@ugurlabs.com" className="text-blue-700 underline">support@ugurlabs.com</a> or via LinkedIn: <a href="https://www.linkedin.com/in/ugurkocde/" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">@ugurkocde</a>.
          </p>
          <p>
            You can also reach us by post: Ugurlabs UG (haftungsbeschränkt), Fährstraße 217, 40221 Düsseldorf, Germany.
          </p>
        </section>
      </div>
      </main>

      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
