import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { BackToTopButton } from "~/components/back-to-top-button";
import { SubprocessorTable } from "~/components/legal-blocks";
import {
  DPA_EFFECTIVE_LABEL,
  SUBPROCESSOR_NOTES,
  SUBPROCESSORS,
} from "~/lib/legal/dpa";

const description =
  "Subprocessors used by the hosted Intune Documentation web app, with services, data, processing locations and safeguards.";

export const metadata: Metadata = {
  title: "Subprocessors",
  description,
  alternates: { canonical: "/subprocessors" },
  openGraph: {
    title: "Subprocessors | Intune Documentation",
    description,
    url: "/subprocessors",
    type: "website",
  },
};

export default function SubprocessorsPage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main>
        <div className="container mx-auto max-w-4xl px-4 py-16">
          <h1 className="mb-6 text-3xl font-bold text-slate-900">
            Subprocessors
          </h1>
          <p className="mb-10 text-slate-600">
            Last updated: {DPA_EFFECTIVE_LABEL}
          </p>

          <section className="space-y-6 leading-relaxed text-slate-700">
            <p>
              These providers process personal data for the hosted web app under
              our{" "}
              <a href="/dpa" className="text-blue-700 underline">
                Data Processing Agreement
              </a>
              . Vercel and Supabase are involved in every use of the web app.
              Resend and Cloudflare are involved only when you use the support
              form.
            </p>

            <SubprocessorTable subprocessors={SUBPROCESSORS} />

            <ul className="list-disc space-y-2 pl-6">
              {SUBPROCESSOR_NOTES.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>

            <h2 className="pt-4 text-xl font-semibold text-slate-900">
              Change notifications
            </h2>
            <p>
              We announce new or replaced subprocessors on this page at least 30
              days before they start processing data. To get these notices by
              email, write to{" "}
              <a
                href="mailto:support@ugurlabs.com?subject=Subprocessor%20notifications"
                className="text-blue-700 underline"
              >
                support@ugurlabs.com
              </a>{" "}
              with the subject &quot;Subprocessor notifications&quot;.
            </p>
          </section>
        </div>
      </main>

      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
