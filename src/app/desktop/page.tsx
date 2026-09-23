import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Building2,
  Download,
  FileText,
  HardDrive,
  KeyRound,
  Laptop,
  Lock,
  Monitor,
  RefreshCw,
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
  DESKTOP_TRIAL_DAYS,
  formatDesktopPrice,
} from "~/lib/desktop-app";
import { PricingPlans } from "./pricing-plans";

const title = "Intune Documentation Desktop App";
const description = `Document Microsoft Intune from your own machine with your own Entra app registration. Word and PDF exports, compliance evidence for 10 frameworks, and multi tenant support for MSPs. ${DESKTOP_TRIAL_DAYS} day free trial.`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: "/desktop" },
  openGraph: {
    title: `${title} | Intune Documentation`,
    description,
    url: "/desktop",
    type: "website",
  },
};

const pro = DESKTOP_PLANS.pro;
const msp = DESKTOP_PLANS.msp;

const staysLocal = [
  "Intune configuration collected from Microsoft Graph",
  "Microsoft access and refresh tokens",
  "Exported Word and PDF documents",
  "Compliance evidence reports",
];

const sentToLicensing = [
  "License key",
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

const features = [
  {
    icon: FileText,
    title: "Word and PDF export",
    detail:
      "Policies, settings, assignments, scripts, and baselines in the same audit-ready documents as the website, generated on your machine.",
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
    title: "Multi tenant for MSPs",
    detail:
      "One MSP license covers every customer tenant you activate. Switch tenants in the app without juggling keys.",
  },
  {
    icon: WifiOff,
    title: "Offline grace",
    detail: `After a successful license check, the app keeps working for ${DESKTOP_OFFLINE_GRACE_DAYS} days without internet access to our licensing service.`,
  },
];

const faqs = [
  {
    question: "How does licensing work?",
    answer: `You buy a Pro or MSP subscription and receive a license key by email. Paste the key into the app after signing in. The app activates the key for the tenant you signed into and stores a signed license token on your machine. Anyone who signs in to your tenant's Intune Documentation app registration can use a shared license, without the key. Every plan starts with a ${DESKTOP_TRIAL_DAYS} day free trial. A payment card is required, and you can cancel before the trial ends without being charged.`,
  },
  {
    question: "Can I use the app offline?",
    answer: `Yes, for collection and export the app only needs to reach Microsoft Graph. It checks the license with our service regularly while online. If the service is unreachable, the app keeps working for ${DESKTOP_OFFLINE_GRACE_DAYS} days after the last successful check.`,
  },
  {
    question: "What data is sent to your servers?",
    answer:
      "Only what the licensing service needs: the license key or, for an organization license, a Microsoft sign-in token that is verified and only its tenant ID used, never stored. Plus a random installation ID, your Entra tenant ID, the operating system, and the app version. Tenant configuration, Microsoft access tokens, and exported documents never leave your machine. Graph calls go directly from the app to Microsoft.",
  },
  {
    question: "How many tenants and installations are included?",
    answer: `Pro covers ${pro.tenantsIncluded} tenant and up to ${DESKTOP_INSTALLS_PER_TENANT} installations for that tenant. MSP covers ${msp.tenantsIncluded} tenants by default, or the tenant count you purchase, with up to ${DESKTOP_INSTALLS_PER_TENANT} installations per tenant. You can free an installation from the app or the customer portal.`,
  },
  {
    question: "Why do I need my own app registration?",
    answer:
      "The desktop app signs in with an Entra app registration in your tenant, so you control consent, permissions, and Conditional Access. It uses the Mobile and desktop applications platform, which is different from the single page application registration used by the website.",
  },
  {
    question: "How do I cancel or change my plan?",
    answer:
      "Manage your subscription, invoices, and tenant count in the Polar customer portal. Polar is our merchant of record and handles payments, taxes, and invoices.",
  },
];

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

export default function DesktopPage() {
  return (
    <div className="bg-mint-50 min-h-screen">
      <NavigationHeader />
      <main className="overflow-hidden">
        <section className="hero-stripes bg-mint-50 relative pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-36">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-12 lg:px-10">
            <div>
              <Eyebrow>Desktop app for macOS and Windows</Eyebrow>
              <h1 className="text-petrol-950 max-w-3xl text-[2.5rem] leading-[1] font-semibold tracking-[-0.05em] sm:text-6xl lg:text-[3.9rem]">
                Intune documentation that never leaves your machine.
              </h1>
              <p className="text-petrol-600 mt-6 max-w-xl text-base leading-7 sm:text-lg">
                Collect your Intune configuration with your own Entra app
                registration, then export Word, PDF, and compliance evidence
                locally. Built for admins and MSPs who cannot send tenant data
                to a website.
              </p>
              <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                <a
                  href="#pricing"
                  className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  Start {DESKTOP_TRIAL_DAYS} day free trial
                  <ArrowRight className="h-4 w-4" />
                </a>
                <a
                  href="#download"
                  className="border-petrol-950/12 text-petrol-800 inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-teal-600/30 hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                >
                  <Download className="h-4 w-4" />
                  Download
                </a>
              </div>
              <p className="text-petrol-600 mt-5 text-sm">
                From {formatDesktopPrice(pro.price.monthly)} per month for one
                tenant.{" "}
                <Link
                  href={DESKTOP_GETTING_STARTED_PATH}
                  className="hover:text-petrol-950 font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2"
                >
                  Read the setup guide
                </Link>
              </p>
            </div>

            <div className="border-petrol-950/8 shadow-soft rounded-3xl border bg-white p-6 sm:p-8">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Laptop className="h-5 w-5" />
                </span>
                <div>
                  <p className="text-petrol-950 text-sm font-semibold">
                    Your machine
                  </p>
                  <p className="text-petrol-600 text-xs">
                    Talks to Microsoft Graph directly
                  </p>
                </div>
              </div>
              <ul className="mt-5 space-y-2.5">
                {staysLocal.map((item) => (
                  <li
                    key={item}
                    className="text-petrol-700 bg-mint-50 flex items-center gap-3 rounded-xl px-4 py-3 text-sm"
                  >
                    <HardDrive className="h-4 w-4 shrink-0 text-teal-700" />
                    {item}
                  </li>
                ))}
              </ul>
              <div className="border-petrol-950/10 mt-6 border-t border-dashed pt-5">
                <div className="flex items-center gap-3">
                  <span className="bg-mint-100 text-petrol-700 flex h-10 w-10 items-center justify-center rounded-xl">
                    <KeyRound className="h-5 w-5" />
                  </span>
                  <div>
                    <p className="text-petrol-950 text-sm font-semibold">
                      Licensing service
                    </p>
                    <p className="text-petrol-600 text-xs">
                      The only data we receive
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
          </div>
        </section>

        <section className="bg-white py-24 sm:py-28" id="privacy">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <Eyebrow>What stays local</Eyebrow>
              <h2 className="text-petrol-950 text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl">
                Your tenant data stays on your device.
              </h2>
              <p className="text-petrol-600 mt-4 text-base leading-7">
                The app signs in with your own app registration and calls
                Microsoft Graph directly. There is no Intune Documentation
                server in the middle.
              </p>
            </div>
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {localPrinciples.map(
                ({ icon: Icon, title: principle, detail }) => (
                  <div
                    key={principle}
                    className="border-petrol-950/8 bg-mint-50/60 rounded-2xl border p-6 sm:p-7"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal-700">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="text-petrol-950 mt-5 text-lg font-semibold">
                      {principle}
                    </h3>
                    <p className="text-petrol-600 mt-2 text-sm leading-6">
                      {detail}
                    </p>
                  </div>
                ),
              )}
            </div>
            <p className="text-petrol-600 mt-8 max-w-3xl text-sm leading-6">
              The licensing service receives only the license key (or, for an
              organization license, a Microsoft sign-in token that is verified
              and only its tenant ID used, never stored), a random installation
              ID, your Entra tenant ID, the operating system, and the app
              version. It uses them to validate your subscription and
              enforce tenant and installation limits. Details are in the{" "}
              <Link
                href="/privacy-policy#desktop-app"
                className="font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2"
              >
                privacy policy
              </Link>
              .
            </p>
          </div>
        </section>

        <section
          className="bg-petrol-950 py-24 text-white sm:py-28"
          id="features"
        >
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-3xl">
              <Eyebrow inverted>Features</Eyebrow>
              <h2 className="text-3xl leading-tight font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                Everything the website does, on your own terms.
              </h2>
            </div>
            <div className="mt-12 grid gap-4 sm:grid-cols-2">
              {features.map(
                ({ icon: Icon, title: featureTitle, detail, href }) => (
                  <article
                    key={featureTitle}
                    className="rounded-2xl border border-white/6 bg-white/[0.045] p-6 sm:p-7"
                  >
                    <Icon className="h-6 w-6 text-teal-500" />
                    <h3 className="mt-6 text-lg font-semibold text-white">
                      {featureTitle}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-white/60">
                      {detail}
                    </p>
                    {href && (
                      <Link
                        href={href}
                        className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-teal-500 hover:text-teal-100"
                      >
                        See the frameworks
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    )}
                  </article>
                ),
              )}
            </div>
          </div>
        </section>

        <section
          className="bg-mint-50 scroll-mt-16 py-24 sm:py-28"
          id="pricing"
        >
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <div className="mx-auto mb-10 max-w-2xl text-center">
              <Eyebrow>Pricing</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                One plan per organization, one for partners.
              </h2>
              <p className="text-petrol-600 mt-4 text-base leading-7">
                Both plans include every feature. Prices in EUR, taxes
                calculated at checkout.
              </p>
            </div>
            <PricingPlans />
            <p className="text-petrol-600 mx-auto mt-8 max-w-2xl text-center text-sm leading-6">
              Every plan starts with a {DESKTOP_TRIAL_DAYS} day free trial. A
              payment card is required, and you are not charged if you cancel
              before the trial ends. Already a customer?{" "}
              <a
                href={DESKTOP_PORTAL_URL}
                rel="noopener"
                className="font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2"
              >
                Open the customer portal
              </a>
              .
            </p>
          </div>
        </section>

        <section className="scroll-mt-16 bg-white py-24 sm:py-28" id="download">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-center">
              <div>
                <Eyebrow>Download</Eyebrow>
                <h2 className="text-petrol-950 text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl">
                  Install once, stay current automatically.
                </h2>
                <p className="text-petrol-600 mt-4 text-base leading-7">
                  Installers are published on GitHub Releases, and the app
                  updates itself from the same place.
                </p>
                <div className="mt-8 flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                  <a
                    href={DESKTOP_DOWNLOAD_URL}
                    rel="noopener"
                    className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-11 items-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                  >
                    <Download className="h-4 w-4" />
                    All releases on GitHub
                  </a>
                  <Link
                    href={DESKTOP_GETTING_STARTED_PATH}
                    className="border-petrol-950/12 text-petrol-800 hover:bg-mint-50 inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-teal-600/30 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    Getting started guide
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="border-petrol-950/8 bg-mint-50 rounded-2xl border p-6">
                  <Monitor className="h-6 w-6 text-teal-700" />
                  <h3 className="text-petrol-950 mt-5 font-semibold">macOS</h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    Disk image for Apple Silicon and Intel Macs. Open it and
                    drag the app to Applications.
                  </p>
                  <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                    <a
                      href={DESKTOP_DOWNLOADS.macArm64}
                      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <Download className="h-4 w-4" />
                      Apple Silicon
                    </a>
                    <a
                      href={DESKTOP_DOWNLOADS.macX64}
                      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <Download className="h-4 w-4" />
                      Intel
                    </a>
                  </div>
                </div>
                <div className="border-petrol-950/8 bg-mint-50 rounded-2xl border p-6">
                  <Monitor className="h-6 w-6 text-teal-700" />
                  <h3 className="text-petrol-950 mt-5 font-semibold">
                    Windows
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    Installer for 64 bit Windows. Run it and follow the prompts.
                  </p>
                  <div className="mt-4">
                    <a
                      href={DESKTOP_DOWNLOADS.windows}
                      className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-teal-700 underline-offset-4 hover:text-teal-600 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <Download className="h-4 w-4" />
                      Windows installer
                    </a>
                  </div>
                </div>
                <div className="border-petrol-950/8 bg-mint-50 rounded-2xl border p-6 sm:col-span-2">
                  <RefreshCw className="h-6 w-6 text-teal-700" />
                  <h3 className="text-petrol-950 mt-5 font-semibold">
                    Automatic updates
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    New releases are tagged with the desktop-v prefix and
                    delivered to the installed app automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-mint-50 scroll-mt-16 py-24 sm:py-28" id="faq">
          <div className="mx-auto max-w-4xl px-5 sm:px-8">
            <div className="mb-10 text-center">
              <Eyebrow>Questions, answered</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Desktop app FAQ
              </h2>
            </div>
            <div className="space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.question}
                  className="group border-petrol-950/6 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_30px_-28px_rgba(8,47,54,0.4)]"
                >
                  <summary className="text-petrol-950 flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-semibold transition-colors hover:bg-teal-50/55 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset sm:px-6 [&::-webkit-details-marker]:hidden">
                    {faq.question}
                    <span
                      aria-hidden="true"
                      className="text-xl leading-none text-teal-700 transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="text-petrol-600 px-5 pb-5 text-sm leading-6 sm:px-6">
                    {faq.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-mint-50 px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
          <div className="bg-petrol-950 shadow-soft mx-auto grid max-w-6xl gap-8 rounded-3xl px-6 py-10 text-white sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14">
            <div>
              <Eyebrow inverted>Ready in ten minutes</Eyebrow>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                Set up your app registration and export your first report.
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/62">
                The guide walks through the Entra app registration, the nine
                read-only Graph permissions, and license activation.
              </p>
            </div>
            <Link
              href={DESKTOP_GETTING_STARTED_PATH}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
            >
              Open the getting started guide
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
      <BackToTopButton />
    </div>
  );
}
