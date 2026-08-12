import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { SectionNavigation } from "~/components/section-navigation";
import { BackToTopButton } from "~/components/back-to-top-button";

export const metadata: Metadata = {
  title: "Terms of Use",
  description:
    "Terms of Use for Intune Documentation Generator covering acceptable use, access, disclaimers, and limitations of liability.",
};

const sections = [
  { id: "provider", label: "Service Provider" },
  { id: "access-and-eligibility", label: "Access and Eligibility" },
  { id: "use-of-the-service", label: "Use of the Service" },
  { id: "privacy", label: "Privacy" },
  { id: "disclaimer", label: "Disclaimer" },
  { id: "limitation-of-liability", label: "Limitation of Liability" },
  { id: "changes", label: "Changes" },
  { id: "contact", label: "Contact" },
];

export default function TermsOfUsePage() {
  return (
    <div className="min-h-screen bg-white">
      <NavigationHeader />
      <main>
        <div className="container mx-auto px-4 py-16 max-w-3xl">
          <h1 className="text-3xl font-bold text-slate-900 mb-6">Terms of Use</h1>
          <p className="text-slate-600 mb-10">
            Effective: {new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
          </p>

          <SectionNavigation sections={sections} />

          <section className="space-y-6 text-slate-700 leading-relaxed">
            <p>
              These Terms of Use (&quot;Terms&quot;) govern your access to and use of the Intune Documentation Generator
              (the &quot;Service&quot;). By using the Service, you agree to these Terms.
            </p>

            <h2 id="provider" className="text-xl font-semibold text-slate-900 scroll-mt-24">Service Provider</h2>
            <p>
              The Service is operated by:
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
            <p>
              References to &quot;we&quot;, &quot;us&quot;, or &quot;our&quot; in these Terms refer to Ugurlabs UG (haftungsbeschränkt).
            </p>

            <h2 id="access-and-eligibility" className="text-xl font-semibold text-slate-900 scroll-mt-24">Access and Eligibility</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must have authority to access your Microsoft tenant and Intune data.</li>
              <li>You are responsible for complying with your organization&apos;s policies and applicable laws.</li>
            </ul>

            <h2 id="use-of-the-service" className="text-xl font-semibold text-slate-900 scroll-mt-24">Use of the Service</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>The Service requests read-only Microsoft Graph permissions to retrieve Intune configurations.</li>
              <li>Generated documents are provided for informational purposes and auditing support.</li>
              <li>Do not misuse the Service (e.g., attempt to bypass security, reverse engineer, or overload it).</li>
            </ul>

            <h2 id="privacy" className="text-xl font-semibold text-slate-900 scroll-mt-24">Privacy</h2>
            <p>
              Your use of the Service is also governed by our <a href="/privacy-policy" className="text-blue-700 underline">Privacy Policy</a>,
              which explains what we access and how we handle data.
            </p>

            <h2 id="disclaimer" className="text-xl font-semibold text-slate-900 scroll-mt-24">Disclaimer</h2>
            <p>
              The Service is provided on an &quot;as is&quot; and &quot;as available&quot; basis without warranties of any kind.
              We do not warrant that reports are error-free, complete, or suitable for any particular purpose.
              Validate outputs against your tenant as needed.
            </p>

            <h2 id="limitation-of-liability" className="text-xl font-semibold text-slate-900 scroll-mt-24">Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, we shall not be liable for any indirect, incidental,
              special, consequential, or punitive damages, or any loss of data, profits, or revenues resulting
              from your use of the Service.
            </p>

            <h2 id="changes" className="text-xl font-semibold text-slate-900 scroll-mt-24">Changes</h2>
            <p>
              We may modify these Terms to reflect improvements or changes to the Service. Continued use
              constitutes acceptance of the updated Terms.
            </p>

            <h2 id="contact" className="text-xl font-semibold text-slate-900 scroll-mt-24">Contact</h2>
            <p>
              Questions about these Terms? Contact us at <a href="mailto:support@ugurlabs.com" className="text-blue-700 underline">support@ugurlabs.com</a> or via LinkedIn: <a href="https://www.linkedin.com/in/ugurkocde/" target="_blank" rel="noopener noreferrer" className="text-blue-700 underline">@ugurkocde</a>.
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
