import type { Metadata } from "next";
import { getSiteStats } from "~/lib/site-stats";
import { HomePage } from "./home-page";

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

// Re-render the page at most every 5 minutes so the trust stats stay fresh
// without a client-side fetch.
export const revalidate = 300;

export default async function Page() {
  const stats = await getSiteStats();
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(webApplicationSchema),
        }}
      />
      <HomePage stats={stats} />
    </>
  );
}
