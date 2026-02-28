import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Learn how Intune Documentation Generator handles authentication data, analytics, and privacy. We request read-only permissions and generate all documents entirely in your browser. Your policy data never leaves your device.",
};

export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-screen bg-white">
      <NavigationHeader />
      <main className="">
      <div className="container mx-auto px-4 py-16 max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900 mb-6">Privacy Policy</h1>
        <p className="text-slate-600 mb-10">
          Effective: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
        </p>

        <section className="space-y-6 text-slate-700 leading-relaxed">
          <p>
            This Privacy Policy explains how Intune Documentation Generator (&quot;we&quot;, &quot;our&quot;, or &quot;the Service&quot;)
            handles information when you use the app to generate documentation from Microsoft Intune. We
            designed the Service to minimize data collection and focus on privacy by default.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">What We Access</h2>
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

          <h2 className="text-xl font-semibold text-slate-900">How We Process Data</h2>
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

          <h2 className="text-xl font-semibold text-slate-900">Analytics & Cookies</h2>
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

          <h2 className="text-xl font-semibold text-slate-900">Data Sharing</h2>
          <p>
            We do not sell or share your configuration data with third parties. Data accessed from Microsoft
            Graph is used solely to generate your documentation.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Security</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>Authentication is handled via Microsoft OAuth 2.0 (Azure AD).</li>
            <li>Only read-only Graph permissions are requested for Intune data.</li>
            <li>We avoid storing tenant data; PDFs are generated on demand and not persisted.</li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900">Data Retention</h2>
          <p>
            We do not retain your Intune configuration data or generated documents. Operational logs described
            above may exist temporarily within hosting provider systems as part of standard logging.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Your Choices</h2>
          <ul className="list-disc pl-6 space-y-2">
            <li>You can disconnect at any time by signing out of the app.</li>
            <li>
              You can revoke the app’s permissions from your Microsoft account/tenant to prevent future access.
            </li>
          </ul>

          <h2 className="text-xl font-semibold text-slate-900">Your Rights (GDPR & CCPA)</h2>
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

          <h2 className="text-xl font-semibold text-slate-900">Children’s Privacy</h2>
          <p>
            The Service is intended for professional/enterprise use and is not directed to children.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Changes</h2>
          <p>
            We may update this policy to reflect improvements or operational changes. If we make material
            changes, we will update the effective date above.
          </p>

          <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
          <p>
            Questions about this policy? Contact us at <a href="mailto:support@ugurlabs.com" className="text-blue-700 underline">support@ugurlabs.com</a> or via LinkedIn: <a href="https://www.linkedin.com/in/ugurkocde/" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">@ugurkocde</a>.
          </p>
        </section>
      </div>
      </main>

      <SiteFooter />
    </div>
  );
}
