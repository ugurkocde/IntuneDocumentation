import type { Metadata } from "next";
import { headers } from "next/headers";
import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  ChevronDown,
  Download,
  FileText,
  KeyRound,
  Laptop,
  Lock,
  Monitor,
  RefreshCw,
  Settings2,
  ShieldCheck,
  WifiOff,
} from "lucide-react";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { BackToTopButton } from "~/components/back-to-top-button";
import {
  DESKTOP_DOWNLOAD_URL,
  DESKTOP_DOWNLOADS,
  DESKTOP_GETTING_STARTED_PATH,
  DESKTOP_INSTALLS_PER_TENANT,
  DESKTOP_OFFLINE_GRACE_DAYS,
  DESKTOP_PLANS,
  DESKTOP_PORTAL_URL,
  DESKTOP_SUPPORT_EMAIL,
  DESKTOP_SYSTEM_REQUIREMENTS,
  DESKTOP_TRIAL_DAYS,
  formatDesktopPrice,
} from "~/lib/desktop-app";
import { getSiteStats } from "~/lib/site-stats";
import { detectPlatform } from "../_landing/desktop-download";
import { trackDownload } from "../_landing/desktop-shared";
import { GITHUB_URL } from "../_landing/content";
import { buttonStyles, Section, SectionHeading } from "../_landing/primitives";
import { PricingPlans } from "./pricing-plans";
import reportCover from "../../../public/landing/report-cover.png";
import reportSummary from "../../../public/landing/report-summary.png";

const SITE_URL = "https://intunedocumentation.com";
const title = "Intune Documentation Desktop App";
const description = `Document Microsoft Intune from your own machine with your own Entra app registration. Word and PDF exports, compliance evidence for 10 frameworks, and multi-tenant support for MSPs. ${DESKTOP_TRIAL_DAYS}-day free trial.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/desktop" },
  // Page-level openGraph replaces the layout's, so the image is set again
  openGraph: {
    title: `${title} | Intune Documentation`,
    description,
    url: "/desktop",
    type: "website",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Intune Documentation report pages",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${title} | Intune Documentation`,
    description,
    images: { url: "/og-image.png", alt: "Intune Documentation report pages" },
  },
};

// Re-render at most every 5 minutes so the export count stays fresh
export const revalidate = 300;

const pro = DESKTOP_PLANS.pro;
const msp = DESKTOP_PLANS.msp;

const staysLocal = [
  {
    icon: Settings2,
    text: "Intune configuration collected from Microsoft Graph",
  },
  { icon: Lock, text: "Microsoft access and refresh tokens" },
  { icon: FileText, text: "Exported Word and PDF documents" },
  { icon: ShieldCheck, text: "Compliance evidence reports" },
];

const sentToLicensing = [
  "License key",
  "Sign-in token, verified and not stored (organization licenses)",
  "App registration client ID",
  "Random installation ID",
  "Entra tenant ID",
  "Operating system",
  "App version",
];

const localPrinciples = [
  {
    icon: ShieldCheck,
    title: "Your own app registration",
    detail:
      "Sign in with an Entra app registration in your tenant. You control consent, the nine read-only permissions, and Conditional Access.",
  },
  {
    icon: Laptop,
    title: "Straight to Microsoft Graph",
    detail:
      "Collection runs on your machine and talks to Microsoft directly. Configuration, tokens, and exports are never uploaded to us.",
  },
  {
    icon: Lock,
    title: "Encrypted on disk",
    detail:
      "Your license key and token are encrypted with the operating system keychain. Documents are saved only where you choose.",
  },
];

const comparison: Array<{ label: string; web: string; desktop: string }> = [
  {
    label: "Where Graph responses are processed",
    web: "On our server, in memory only, never stored",
    desktop: "Only on your machine",
  },
  {
    label: "App registration you sign in with",
    web: "Ours, consented in your tenant",
    desktop: "Your own, with the permissions you choose",
  },
  {
    label: "Word, PDF, and compliance evidence",
    web: "Included",
    desktop: "Included",
  },
  {
    label: "Many tenants",
    web: "Sign in to each tenant separately",
    desktop: "Switch tenants in the app (MSP plan)",
  },
  {
    label: "Updates",
    web: "Always the latest version",
    desktop: "Installed when you choose",
  },
  {
    label: "Price",
    web: "Free",
    desktop: `From ${formatDesktopPrice(pro.price.monthly)} per month`,
  },
];

const features = [
  {
    icon: FileText,
    title: "Word and PDF export",
    detail:
      "Policies, settings, assignments, scripts, and baselines in the same audit-ready documents as the web version, generated on your machine.",
  },
  {
    icon: ShieldCheck,
    title: "Compliance evidence for 10 frameworks",
    detail:
      "Map your configuration to ISO/IEC 27001, SOC 2, NIST, BSI IT-Grundschutz, Cyber Essentials, Essential Eight, and more.",
    href: "/compliance",
  },
  {
    icon: Building2,
    title: "Multi-tenant for MSPs",
    detail:
      "One MSP license covers every customer tenant you activate. Switch tenants in the app without juggling keys.",
  },
  {
    icon: WifiOff,
    title: `Works offline for ${DESKTOP_OFFLINE_GRACE_DAYS} days`,
    detail: `After a successful license check, the app keeps working for ${DESKTOP_OFFLINE_GRACE_DAYS} days without reaching our licensing service. Collection only needs Microsoft Graph.`,
  },
];

const steps = [
  {
    title: "Start the trial",
    detail: "Pick a plan and add a payment card at checkout.",
  },
  {
    title: "Get your license key",
    detail: "The key arrives by email after checkout.",
  },
  {
    title: "Set up in about 10 minutes",
    detail: "Create the app registration, sign in, and paste the key.",
  },
];

const platforms = {
  mac: {
    name: "macOS",
    requirements: DESKTOP_SYSTEM_REQUIREMENTS.mac,
    detail:
      "Disk image signed and notarized by Apple. Open it and drag the app to Applications.",
    downloads: [
      {
        href: DESKTOP_DOWNLOADS.macArm64,
        label: "Apple Silicon",
        id: "mac-arm64",
      },
      { href: DESKTOP_DOWNLOADS.macX64, label: "Intel", id: "mac-x64" },
    ],
  },
  windows: {
    name: "Windows",
    requirements: DESKTOP_SYSTEM_REQUIREMENTS.windows,
    detail:
      "Installer signed with Microsoft Trusted Signing. Run it and follow the prompts.",
    downloads: [
      {
        href: DESKTOP_DOWNLOADS.windows,
        label: "Windows installer",
        id: "windows",
      },
    ],
  },
};

const faqs = [
  {
    id: "licensing",
    question: "How does licensing work?",
    answer: `You buy a Pro or MSP subscription and receive a license key by email. Paste the key into the app after signing in. The app activates the key for the tenant you signed in to and stores a signed license token on your machine. Colleagues can share an organization license: once a key holder shares it with a tenant, anyone who signs in to that tenant's Intune Documentation app registration is licensed without a key. A Pro license is shared with its tenant by default; an MSP key holder turns sharing on per customer tenant. Every plan starts with a ${DESKTOP_TRIAL_DAYS}-day free trial. A payment card is required, and you are not charged if you cancel before the trial ends.`,
  },
  {
    id: "offline",
    question: "Can I use the app offline?",
    answer: `Yes. Collection and export only need to reach Microsoft Graph. The app checks your license with our service regularly while online, and if the service is unreachable it keeps working for ${DESKTOP_OFFLINE_GRACE_DAYS} days after the last successful check.`,
  },
  {
    id: "data",
    question: "What data is sent to your servers?",
    answer:
      "Only what the licensing service needs: the license key or, for an organization license, a Microsoft sign-in token. We verify the token, read only its tenant ID, and never store it. License checks also send a random installation ID, your Entra tenant ID, the operating system, the app version, and, when you use a key, the client ID of your app registration. Tenant configuration, Microsoft access tokens, and exported documents never leave your machine, and Graph calls go directly from the app to Microsoft.",
  },
  {
    id: "limits",
    question: "How many tenants and installations are included?",
    answer: `Pro covers ${pro.tenantsIncluded} tenant and up to ${DESKTOP_INSTALLS_PER_TENANT} installations for that tenant. MSP covers ${msp.tenantsIncluded} tenants by default, or the tenant count you purchase, with up to ${DESKTOP_INSTALLS_PER_TENANT} installations per tenant. You can free an installation from the app or the customer portal.`,
  },
  {
    id: "app-registration",
    question: "Why do I need my own app registration?",
    answer:
      "The desktop app signs in with an Entra app registration in your tenant, so you control consent, permissions, and Conditional Access. In Entra it uses the platform type called Mobile and desktop applications, which is a different registration from the one the web version uses. The getting started guide walks through every step.",
  },
  {
    id: "requirements",
    question: "What are the system requirements?",
    answer: `macOS: ${DESKTOP_SYSTEM_REQUIREMENTS.mac}. Windows: ${DESKTOP_SYSTEM_REQUIREMENTS.windows}. The machine needs internet access to Microsoft Graph for collection.`,
  },
  {
    id: "signing",
    question: "Are the installers signed?",
    answer:
      "Yes. The macOS app is signed with an Apple Developer ID and notarized by Apple. The Windows installer is signed with Microsoft Trusted Signing under Ugurlabs UG (haftungsbeschränkt). The app verifies the same signature before it installs an update.",
  },
  {
    id: "cancel",
    question: "How do I cancel or change my plan?",
    answer:
      "Manage your subscription, invoices, and tenant count in the Polar customer portal. Cancellation takes effect at the end of the current billing period, and the app stays licensed until then. Polar is our merchant of record and handles payments, taxes, and invoices.",
  },
  {
    id: "support",
    question: "How do I get support, and who builds the app?",
    answer: `Email ${DESKTOP_SUPPORT_EMAIL} or use the support page. The app is built by Ugurlabs UG (haftungsbeschränkt), the company behind the free Intune Documentation web version, which is open source on GitHub.`,
  },
];

const softwareSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "@id": `${SITE_URL}/desktop#application`,
  name: "Intune Documentation Desktop",
  description,
  url: `${SITE_URL}/desktop`,
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "IT Management Software",
  operatingSystem: "macOS 13 or later, Windows 10, Windows 11",
  offers: Object.values(DESKTOP_PLANS).map((plan) => ({
    "@type": "Offer",
    name: `${plan.name} monthly subscription`,
    price: String(plan.price.monthly),
    priceCurrency: "EUR",
    url: `${SITE_URL}/desktop#pricing`,
    availability: "https://schema.org/InStock",
  })),
  author: {
    "@type": "Organization",
    "@id": "https://ugurlabs.com/#organization",
    name: "Ugurlabs",
    url: "https://ugurlabs.com",
  },
  screenshot: `${SITE_URL}/og-image.png`,
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

const textLink =
  "font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2 hover:text-petrol-950";

// Turns the support email and "support page" into links inside FAQ answers
function linkifyAnswer(answer: string): ReactNode {
  return answer.split(/(\S+@\S+\.com|support page)/g).map((part, i) => {
    if (part === DESKTOP_SUPPORT_EMAIL) {
      return (
        <a key={i} href={`mailto:${part}`} className={textLink}>
          {part}
        </a>
      );
    }
    if (part === "support page") {
      return (
        <Link key={i} href="/support" className={textLink}>
          {part}
        </Link>
      );
    }
    return part;
  });
}

function Eyebrow({
  children,
  inverted = false,
}: {
  children: ReactNode;
  inverted?: boolean;
}) {
  return (
    <p
      className={`mb-4 text-[11px] font-bold tracking-[0.2em] uppercase ${inverted ? "text-teal-500" : "text-teal-700"}`}
    >
      {children}
    </p>
  );
}

function ReportPreview() {
  return (
    <div className="relative mx-auto aspect-[5/4.4] w-full max-w-[520px]">
      <div
        className="absolute inset-8 rounded-[2.5rem] bg-teal-100/80 blur-2xl"
        aria-hidden="true"
      />
      <Image
        src={reportCover}
        alt="Cover page of a sample Intune documentation report"
        sizes="(min-width: 1024px) 300px, 55vw"
        className="ring-petrol-950/8 shadow-soft absolute top-[8%] left-0 w-[56%] -rotate-3 rounded-lg ring-1"
        priority
      />
      <Image
        src={reportSummary}
        alt="Executive summary page with key metrics, assignment coverage, and potential gaps"
        sizes="(min-width: 1024px) 320px, 60vw"
        className="ring-petrol-950/8 shadow-soft absolute top-0 right-0 w-[60%] rotate-2 rounded-lg ring-1"
        priority
      />
      <p className="text-petrol-700 border-petrol-950/8 shadow-card absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border bg-white px-4 py-2 text-xs font-semibold whitespace-nowrap">
        Real export from a sample tenant
      </p>
    </div>
  );
}

function DataFlowCard() {
  return (
    <div className="border-petrol-950/8 shadow-soft rounded-3xl border bg-white p-6 sm:p-8">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Laptop className="h-5 w-5" aria-hidden="true" />
        </span>
        <div>
          <p className="text-petrol-950 text-sm font-semibold">Your machine</p>
          <p className="text-petrol-600 text-xs">
            Talks to Microsoft Graph directly
          </p>
        </div>
      </div>
      <ul className="mt-5 space-y-2.5">
        {staysLocal.map(({ icon: Icon, text }) => (
          <li
            key={text}
            className="text-petrol-700 bg-mint-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
          >
            <Icon
              className="h-4 w-4 shrink-0 text-teal-700"
              aria-hidden="true"
            />
            {text}
          </li>
        ))}
      </ul>
      <div className="border-petrol-950/10 mt-6 border-t border-dashed pt-5">
        <div className="flex items-center gap-3">
          <span className="bg-mint-100 text-petrol-700 flex h-10 w-10 items-center justify-center rounded-xl">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div>
            <p className="text-petrol-950 text-sm font-semibold">
              Licensing service
            </p>
            <p className="text-petrol-600 text-xs">
              What a license check sends
            </p>
          </div>
        </div>
        <ul className="mt-4 flex flex-wrap gap-2">
          {sentToLicensing.map((item) => (
            <li
              key={item}
              className="border-petrol-950/10 text-petrol-700 rounded-full border px-3 py-1 text-xs"
            >
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export default async function DesktopPage() {
  const requestHeaders = await headers();
  const nonce = requestHeaders.get("x-nonce") ?? "";
  const platform = detectPlatform(requestHeaders.get("user-agent") ?? "");
  const stats = await getSiteStats();
  // Visitors see their own operating system first
  const platformOrder =
    platform === "windows"
      ? [platforms.windows, platforms.mac]
      : [platforms.mac, platforms.windows];

  return (
    <div className="bg-mint-50 min-h-screen">
      <script
        nonce={nonce}
        // Browsers hide the nonce attribute after load, so hydration sees ""
        suppressHydrationWarning
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareSchema) }}
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
        <section className="hero-stripes bg-mint-50 relative pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-10">
            <div>
              <Eyebrow>Desktop app for macOS and Windows</Eyebrow>
              <h1 className="text-petrol-950 max-w-3xl text-[2.5rem] leading-[1] font-semibold tracking-[-0.05em] text-balance sm:text-6xl lg:text-[3.9rem]">
                Intune documentation that never leaves your machine.
              </h1>
              <p className="text-petrol-600 mt-6 max-w-xl text-base leading-7 sm:text-lg">
                Collect your Intune configuration with your own Entra app
                registration, then export Word, PDF, and compliance evidence on
                your own machine. Built for admins and MSPs whose policies rule
                out third-party processing of tenant data.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <a href="#pricing" className={buttonStyles.primary}>
                  Start {DESKTOP_TRIAL_DAYS}-day free trial
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </a>
                <a href="#compare" className={buttonStyles.secondary}>
                  Compare with the web version
                </a>
              </div>
              <p className="text-petrol-600 mt-5 text-sm leading-6">
                From {formatDesktopPrice(pro.price.monthly)} per month. Card
                required, cancel before day {DESKTOP_TRIAL_DAYS} and you pay
                nothing.{" "}
                <Link href={DESKTOP_GETTING_STARTED_PATH} className={textLink}>
                  Getting started guide
                </Link>
              </p>
              {stats.exportCount > 0 && (
                <p className="text-petrol-600 mt-3 text-sm leading-6">
                  Same report engine as the free web version, used for{" "}
                  <span className="text-petrol-950 font-semibold tabular-nums">
                    {stats.exportCount.toLocaleString("en-US")}
                  </span>{" "}
                  exported reports.
                </p>
              )}
            </div>
            <ReportPreview />
          </div>
        </section>

        <Section id="compare" tone="white">
          <SectionHeading
            eyebrow="Web or desktop"
            title="The same reports, without our server in the path."
            lead="The free web version collects through our server, which processes Graph responses in memory and stores nothing. The desktop app removes that hop: your machine talks to Microsoft directly."
          />
          {/* Stacked rows on phones, where three columns would not fit */}
          <dl className="mt-10 space-y-3 sm:hidden">
            {comparison.map((row) => (
              <div
                key={row.label}
                className="border-petrol-950/8 rounded-2xl border p-4"
              >
                <dt className="text-petrol-950 text-sm font-semibold">
                  {row.label}
                </dt>
                <dd className="mt-2 grid grid-cols-2 gap-3 text-sm">
                  <span className="text-petrol-600">
                    <span className="text-petrol-600 block text-xs">
                      Web (free)
                    </span>
                    {row.web}
                  </span>
                  <span className="text-petrol-800 font-medium">
                    <span className="block text-xs text-teal-700">
                      Desktop app
                    </span>
                    {row.desktop}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
          <div className="border-petrol-950/8 mt-12 hidden overflow-hidden rounded-2xl border sm:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">
                Web version compared with the desktop app
              </caption>
              <thead className="bg-mint-50 text-petrol-950">
                <tr>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    <span className="sr-only">Feature</span>
                  </th>
                  <th scope="col" className="px-5 py-4 font-semibold">
                    Web (free)
                  </th>
                  <th
                    scope="col"
                    className="px-5 py-4 font-semibold text-teal-700"
                  >
                    Desktop app
                  </th>
                </tr>
              </thead>
              <tbody className="divide-petrol-950/8 divide-y">
                {comparison.map((row) => (
                  <tr key={row.label}>
                    <th
                      scope="row"
                      className="text-petrol-950 px-5 py-4 font-semibold"
                    >
                      {row.label}
                    </th>
                    <td className="text-petrol-600 px-5 py-4">{row.web}</td>
                    <td className="text-petrol-800 px-5 py-4 font-medium">
                      {row.desktop}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-petrol-600 mt-6 text-sm leading-6">
            Prefer to run the web version on your own infrastructure? It is open
            source and{" "}
            <a
              href={`${GITHUB_URL}#self-host-with-docker`}
              target="_blank"
              rel="noopener noreferrer"
              className={textLink}
            >
              free to self-host
            </a>
            .
          </p>
        </Section>

        <Section id="privacy" tone="mint">
          <div className="grid gap-12 lg:grid-cols-[1fr_0.95fr] lg:items-start">
            <div>
              <SectionHeading
                eyebrow="What stays local"
                title="Your tenant data stays on your device."
                lead="The app signs in with your own app registration and calls Microsoft Graph directly. There is no Intune Documentation server in the middle."
              />
              <ul className="mt-10 space-y-6">
                {localPrinciples.map(
                  ({ icon: Icon, title: principle, detail }) => (
                    <li key={principle} className="flex gap-4">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
                        <Icon className="h-5 w-5" aria-hidden="true" />
                      </span>
                      <div>
                        <h3 className="text-petrol-950 font-semibold">
                          {principle}
                        </h3>
                        <p className="text-petrol-600 mt-1 text-sm leading-6">
                          {detail}
                        </p>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            </div>
            <DataFlowCard />
          </div>
          <p className="text-petrol-600 mt-10 max-w-3xl text-sm leading-6">
            For an organization license, the app sends a Microsoft sign-in token
            instead of the key. We verify it, read only its tenant ID, and never
            store it. The licensing service uses this data only to validate your
            subscription and enforce tenant and installation limits. Details are
            in the{" "}
            <Link href="/privacy-policy#desktop-app" className={textLink}>
              privacy policy
            </Link>
            .
          </p>
        </Section>

        <Section id="features" tone="dark">
          <SectionHeading
            inverted
            eyebrow="Features"
            title="Everything the web version does, on your own terms."
          />
          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {features.map(
              ({ icon: Icon, title: featureTitle, detail, href }) => (
                <article
                  key={featureTitle}
                  className="rounded-2xl border border-white/6 bg-white/[0.045] p-6 sm:p-7"
                >
                  <Icon className="h-6 w-6 text-teal-500" aria-hidden="true" />
                  <h3 className="mt-6 text-lg font-semibold text-white">
                    {featureTitle}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/70">
                    {detail}
                  </p>
                  {href && (
                    <Link
                      href={href}
                      className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-teal-500 hover:text-teal-100 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
                    >
                      See the frameworks
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  )}
                </article>
              ),
            )}
          </div>
        </Section>

        <Section id="pricing" tone="mint">
          <SectionHeading
            centered
            eyebrow="Pricing"
            title="One plan per organization, one for partners."
            lead="Both plans include every feature and differ in how many tenants they cover. Prices in EUR, taxes calculated at checkout."
          />
          <ol className="mx-auto mt-10 grid max-w-4xl gap-3 sm:grid-cols-3">
            {steps.map((step, index) => (
              <li
                key={step.title}
                className="border-petrol-950/8 flex gap-3 rounded-2xl border bg-white/70 p-4"
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-teal-50 text-xs font-bold text-teal-700 tabular-nums">
                  {index + 1}
                </span>
                <div>
                  <p className="text-petrol-950 text-sm font-semibold">
                    {step.title}
                  </p>
                  <p className="text-petrol-600 mt-0.5 text-xs leading-5">
                    {step.detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-10">
            <PricingPlans />
          </div>
          <p className="text-petrol-600 mx-auto mt-8 max-w-2xl text-center text-sm leading-6">
            Cancel any time. Cancellation takes effect at the end of the billing
            period, and the app stays licensed until then. Already a customer?{" "}
            <a href={DESKTOP_PORTAL_URL} className={textLink}>
              Open the customer portal
            </a>
            .
          </p>
        </Section>

        <Section id="download" tone="white">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
            <div>
              <SectionHeading
                eyebrow="Download"
                title="Install once, update when you choose."
                lead={
                  <>
                    The app needs a license key to collect and export. Start the
                    free trial first; the key arrives by email.
                  </>
                }
              />
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <a href="#pricing" className={buttonStyles.primary}>
                  Start {DESKTOP_TRIAL_DAYS}-day free trial
                </a>
                <Link
                  href={DESKTOP_GETTING_STARTED_PATH}
                  className={buttonStyles.secondary}
                >
                  Getting started guide
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {platformOrder.map((os) => (
                <div
                  key={os.name}
                  className="border-petrol-950/8 bg-mint-50 flex flex-col rounded-2xl border p-6"
                >
                  <Monitor
                    className="h-6 w-6 text-teal-700"
                    aria-hidden="true"
                  />
                  <h3 className="text-petrol-950 mt-5 font-semibold">
                    {os.name}
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    {os.detail}
                  </p>
                  <p className="text-petrol-600 mt-2 flex items-start gap-2 text-xs leading-5">
                    <BadgeCheck
                      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-teal-700"
                      aria-hidden="true"
                    />
                    {os.requirements}
                  </p>
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    {os.downloads.map((file) => (
                      <a
                        key={file.id}
                        href={file.href}
                        className={`${buttonStyles.secondary} bg-white ${trackDownload(file.id)}`}
                      >
                        <Download className="h-4 w-4" aria-hidden="true" />
                        {file.label}
                      </a>
                    ))}
                  </div>
                </div>
              ))}
              <div className="border-petrol-950/8 bg-mint-50 rounded-2xl border p-6 sm:col-span-2">
                <RefreshCw
                  className="h-6 w-6 text-teal-700"
                  aria-hidden="true"
                />
                <h3 className="text-petrol-950 mt-5 font-semibold">
                  Updates when you choose
                </h3>
                <p className="text-petrol-600 mt-2 text-sm leading-6">
                  The app tells you when a new release is available and installs
                  it when you choose. You can also turn on automatic installs in
                  Settings. Every version is listed on{" "}
                  <a
                    href={DESKTOP_DOWNLOAD_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={textLink}
                  >
                    GitHub Releases
                  </a>
                  .
                </p>
              </div>
            </div>
          </div>
        </Section>

        <Section id="faq" tone="mint">
          <div className="mx-auto max-w-4xl">
            <div className="mb-10">
              <SectionHeading
                centered
                eyebrow="Questions, answered"
                title="Desktop app FAQ"
              />
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.id}
                  id={`faq-${faq.id}`}
                  className="group border-petrol-950/6 scroll-mt-24 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_30px_-28px_rgba(8,47,54,0.4)]"
                >
                  <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-teal-50/55 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset sm:px-6 [&::-webkit-details-marker]:hidden">
                    <h3 className="text-petrol-950 font-semibold">
                      {faq.question}
                    </h3>
                    <ChevronDown
                      className="h-5 w-5 shrink-0 text-teal-700 transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="text-petrol-600 px-5 pb-5 text-sm leading-6 sm:px-6">
                    {linkifyAnswer(faq.answer)}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </Section>

        <section className="bg-mint-50 px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
          <div className="bg-petrol-950 shadow-soft mx-auto grid max-w-6xl gap-8 rounded-3xl px-6 py-10 text-white sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14">
            <div>
              <Eyebrow inverted>Ready in about 10 minutes</Eyebrow>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-balance text-white sm:text-4xl">
                Set up your app registration and export your first report.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">
                The guide walks through the Entra app registration, the nine
                read-only Graph permissions, and license activation.
              </p>
            </div>
            <Link
              href={DESKTOP_GETTING_STARTED_PATH}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
            >
              Getting started guide
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
