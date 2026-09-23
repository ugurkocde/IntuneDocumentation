import { headers } from "next/headers";
import type { Metadata } from "next";
import { BackToTopButton } from "~/components/back-to-top-button";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { getSiteStats } from "~/lib/site-stats";
import { Compliance } from "./_landing/compliance";
import { faqs } from "./_landing/content";
import { Editions } from "./_landing/editions";
import { Faq } from "./_landing/faq";
import { FinalCta } from "./_landing/final-cta";
import { Hero } from "./_landing/hero";
import { HowItWorks } from "./_landing/how-it-works";
import { ReportShowcase } from "./_landing/report-showcase";
import { Security } from "./_landing/security";
import { PermissionsDialog, SecurityDialog } from "./_landing/trust-dialogs";

const title = "Free Microsoft Intune Documentation Generator";
const description =
  "Generate audit-ready PDF and Word documentation for Microsoft Intune policies, settings, assignments, and security baselines with a free read-only tool.";

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { title, description, url: "/", type: "website" },
};

const webApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": "https://intunedocumentation.com/#application",
  name: "Intune Documentation Generator",
  alternateName: "Free Microsoft Intune PDF Export Tool",
  description,
  url: "https://intunedocumentation.com/",
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "IT Management Software",
  operatingSystem: "Web Browser",
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
    availability: "https://schema.org/InStock",
  },
  author: {
    "@type": "Organization",
    "@id": "https://ugurlabs.com/#organization",
    name: "Ugurlabs",
    url: "https://ugurlabs.com",
    sameAs: [
      "https://github.com/ugurkocde",
      "https://www.linkedin.com/company/ugurlabs",
    ],
  },
  dateCreated: "2024-01-01",
  dateModified: "2026-08-17",
  featureList: [
    "Export Microsoft Intune configurations to PDF or Word",
    "Document policies, settings, assignments, and security baselines",
    "Redact sensitive values before display or export",
    "Self-host with your own Microsoft Entra app registration",
  ],
  screenshot: "https://intunedocumentation.com/og-image.png",
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((faq) => ({
    "@type": "Question",
    name: faq.question,
    acceptedAnswer: { "@type": "Answer", text: faq.answer },
  })),
};

// Re-render the page at most every 5 minutes so the trust stats stay fresh
// without a client-side fetch.
export const revalidate = 300;

export default async function Page() {
  const stats = await getSiteStats();
  const nonce = (await headers()).get("x-nonce") ?? "";
  return (
    <>
      <script
        nonce={nonce}
        // Browsers hide the nonce attribute after load, so hydration sees ""
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationSchema),
        }}
      />
      <script
        nonce={nonce}
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
      <a
        href="#main-content"
        className="text-petrol-950 pointer-events-none sr-only fixed top-2 left-2 z-[60] rounded-lg bg-white px-3 py-2 shadow focus:pointer-events-auto focus:not-sr-only focus:ring-2 focus:ring-teal-600 focus:outline-none"
      >
        Skip to main content
      </a>
      <NavigationHeader />
      <main id="main-content" className="overflow-hidden">
        <Hero stats={stats} />
        <HowItWorks />
        <ReportShowcase />
        <Compliance />
        <Security />
        <Editions />
        <Faq />
        <FinalCta />
      </main>
      <SiteFooter />
      <BackToTopButton />
      <SecurityDialog />
      <PermissionsDialog />
    </>
  );
}
