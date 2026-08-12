import type { Metadata } from "next";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { BackToTopButton } from "~/components/back-to-top-button";

export const metadata: Metadata = {
  title: "Legal Notice (Impressum)",
  description:
    "Legal notice (Impressum) for Intune Documentation Generator, operated by Ugurlabs UG (haftungsbeschränkt), Düsseldorf, Germany.",
};

export default function ImpressumPage() {
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main>
        <div className="container mx-auto max-w-3xl px-4 py-16">
          <h1 className="mb-10 text-3xl font-bold text-slate-900">
            Legal Notice (Impressum)
          </h1>

          <section className="space-y-6 leading-relaxed text-slate-700">
            <h2 className="text-xl font-semibold text-slate-900">
              Information in accordance with Section 5 DDG
            </h2>
            <p>
              Ugurlabs UG (haftungsbeschränkt)
              <br />
              Fährstraße 217
              <br />
              40221 Düsseldorf
              <br />
              Germany
            </p>
            <p>Represented by: Managing Director Ugur Koc</p>

            <h2 className="text-xl font-semibold text-slate-900">Contact</h2>
            <p>
              Email:{" "}
              <a
                href="mailto:support@ugurlabs.com"
                className="text-blue-700 underline"
              >
                support@ugurlabs.com
              </a>
            </p>

            <h2 className="text-xl font-semibold text-slate-900">
              Responsible for content in accordance with Section 18 (2) MStV
            </h2>
            <p>
              Ugur Koc
              <br />
              Fährstraße 217
              <br />
              40221 Düsseldorf
              <br />
              Germany
            </p>

            <h2 className="text-xl font-semibold text-slate-900">
              Consumer dispute resolution
            </h2>
            <p>
              We are neither willing nor obliged to participate in dispute
              resolution proceedings before a consumer arbitration board.
            </p>

            <hr className="border-slate-200" />

            <h2 className="text-xl font-semibold text-slate-900" lang="de">
              Impressum (Deutsch)
            </h2>

            <div lang="de" className="space-y-6">
              <h3 className="text-lg font-semibold text-slate-900">
                Angaben gemäß § 5 DDG
              </h3>
              <p>
                Ugurlabs UG (haftungsbeschränkt)
                <br />
                Fährstraße 217
                <br />
                40221 Düsseldorf
                <br />
                Deutschland
              </p>
              <p>Vertreten durch: Geschäftsführer Ugur Koc</p>

              <h3 className="text-lg font-semibold text-slate-900">Kontakt</h3>
              <p>
                E-Mail:{" "}
                <a
                  href="mailto:support@ugurlabs.com"
                  className="text-blue-700 underline"
                >
                  support@ugurlabs.com
                </a>
              </p>

              <h3 className="text-lg font-semibold text-slate-900">
                Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV
              </h3>
              <p>
                Ugur Koc
                <br />
                Fährstraße 217
                <br />
                40221 Düsseldorf
                <br />
                Deutschland
              </p>

              <h3 className="text-lg font-semibold text-slate-900">
                Verbraucherstreitbeilegung
              </h3>
              <p>
                Wir sind nicht bereit und nicht verpflichtet, an
                Streitbeilegungsverfahren vor einer
                Verbraucherschlichtungsstelle teilzunehmen.
              </p>
            </div>
          </section>
        </div>
      </main>

      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
