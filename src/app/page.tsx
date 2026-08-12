"use client";

import { useMsal } from "@azure/msal-react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  Clock,
  Cloud,
  Database,
  Download,
  Eye,
  FileCheck,
  FileText,
  Layers,
  Lock,
  Settings,
  Shield,
  Users,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BackToTopButton } from "~/components/back-to-top-button";
import { DataFlowDiagram } from "~/components/data-flow-diagram";
import { HeroExportCounter } from "~/components/hero-export-counter";
import { HeroMauCounter } from "~/components/hero-mau-counter";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { useUserProfile } from "~/hooks/use-user-profile";
import { loginRequest } from "~/lib/msal-config";

const faqs = [
  {
    question: "What is the Intune Documentation Generator?",
    answer:
      "The Intune Documentation Generator is a free tool that connects to your Microsoft Intune tenant via Graph API, fetches all 10 configuration types (policies, profiles, scripts, etc.), and generates comprehensive PDF or Word documents with complete settings, assignments, and filters. It saves IT teams 10+ hours per audit.",
  },
  {
    question: "How do I export Intune configurations to PDF?",
    answer:
      "Simply sign in with your Microsoft account, select the Intune configurations you want to document, and click Export. The tool automatically generates a professional PDF report with all settings, assignments, and group configurations in minutes.",
  },
  {
    question: "Is the Intune Documentation tool really free?",
    answer:
      "Yes, it's completely free. No hidden fees, no premium tiers, no credit card required. You can generate unlimited Intune documentation reports at no cost.",
  },
  {
    question: "Is my Intune data secure?",
    answer:
      "Yes. We use Microsoft OAuth 2.0 with delegated read-only access. All document generation (PDF and DOCX) happens entirely in your browser -- your Intune data never leaves your device. We do not persist your configuration data or generated documents anywhere.",
  },
  {
    question: "What Intune policies can I export?",
    answer:
      "You can export all Intune configuration types including: Device Configurations, Compliance Policies, Settings Catalog, Administrative Templates, Security Baselines, PowerShell Scripts, Shell Scripts, App Configurations, Windows Update Policies, Enrollment Configurations, and Conditional Access Policies.",
  },
  {
    question:
      "Why does Defender flag 'Suspicious application consent for offline access'?",
    answer:
      "This is a common alert when an app requests the standard 'offline_access' permission from Microsoft identity (used to refresh tokens without repeatedly prompting you). It does NOT grant extra data access beyond your approved read-only scopes, and we use only delegated permissions (no application permissions). Tokens are kept in your browser session, and we do not store tenant data.",
  },
  {
    question: "How long does it take to generate Intune documentation?",
    answer:
      "Most Intune documentation reports are generated in under 2 minutes. The exact time depends on the number of configurations in your tenant and which policies you select for export.",
  },
  {
    question: "Can I customize the Intune PDF report?",
    answer:
      "Yes, you can customize your documentation with branding options including company logo, custom colors, headers, footers, and confidentiality notices. You can also select specific configurations to include or exclude from the report.",
  },
];

function linkify(text: string): ReactNode {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return parts.map((part, i) => {
    if (/^https?:\/\//.test(part)) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-teal-700 underline decoration-teal-600/40 underline-offset-2"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
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

function ProductMockup() {
  const rows = [
    ["Device Configurations", "47 policies"],
    ["Compliance Policies", "12 policies"],
    ["PowerShell Scripts", "8 scripts"],
  ];

  return (
    <div
      className="relative mx-auto w-full max-w-[500px] px-3 pt-12 pb-8 sm:px-10"
      aria-hidden="true"
    >
      <div className="absolute inset-5 -z-10 rounded-[2.5rem] bg-teal-100/75 blur-2xl" />
      <div className="shadow-soft relative rounded-[1.6rem] border border-white bg-white p-5 sm:p-7">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-600 text-white">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <p className="text-petrol-950 text-xs font-semibold sm:text-sm">
              Intune Documentation Report
            </p>
            <p className="text-petrol-600 mt-0.5 text-[10px]">
              Contoso IT · Generated today
            </p>
          </div>
        </div>

        <div className="space-y-2.5">
          {rows.map(([label, value]) => (
            <div
              key={label}
              className="border-petrol-950/7 bg-surface flex items-center gap-3 rounded-xl border px-3 py-3.5"
            >
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </span>
              <span className="text-petrol-800 min-w-0 flex-1 truncate text-[11px] font-semibold sm:text-xs">
                {label}
              </span>
              <span className="text-petrol-600 shrink-0 text-[10px] sm:text-[11px]">
                {value}
              </span>
            </div>
          ))}
        </div>

        <div className="my-4 flex items-center justify-between rounded-xl bg-teal-50 px-3 py-2.5">
          <span className="text-petrol-700 flex items-center gap-2 text-[10px] font-medium sm:text-[11px]">
            <Users className="h-3.5 w-3.5 text-teal-700" />
            Group assignments included
          </span>
          <span className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-teal-700">
            Resolved
          </span>
        </div>

        <div className="bg-petrol-950 flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-white">
          <Download className="h-4 w-4" />
          Export PDF
        </div>
      </div>

      <div className="diagonal-stripes absolute top-0 right-0 w-[175px] rounded-2xl bg-teal-600 p-4 text-white shadow-[0_20px_45px_-22px_rgba(8,47,54,0.55)] sm:right-2 sm:w-[195px] sm:p-5">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.14em] text-white/65 uppercase">
              PDF ready
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight">
              100% complete
            </p>
          </div>
          <FileCheck className="h-6 w-6 text-white/90" />
        </div>
        <div className="border-t border-white/20 pt-3">
          <p className="text-[9px] tracking-[0.14em] text-white/65 uppercase">
            Generated in
          </p>
          <p className="mt-1 text-sm font-semibold">2m 14s</p>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(0);
  const [signingIn, setSigningIn] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);
  const isAuthenticated = accounts.length > 0;
  const prefersReduced = useReducedMotion();

  const fadeUp = prefersReduced
    ? { hidden: { opacity: 1, y: 0 }, visible: { opacity: 1, y: 0 } }
    : { hidden: { opacity: 0, y: 24 }, visible: { opacity: 1, y: 0 } };
  const staggerContainer = prefersReduced
    ? { hidden: {}, visible: {} }
    : { hidden: {}, visible: { transition: { staggerChildren: 0.08 } } };

  useEffect(() => {
    if (!showSecurity && !showPermissions) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowSecurity(false);
        setShowPermissions(false);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [showSecurity, showPermissions]);

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      setSignInError(null);
      await instance.loginPopup(loginRequest);
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error?.errorCode === "popup_window_error") {
        setSignInError(
          "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        );
      } else if (error?.errorCode === "user_cancelled") {
        setSignInError(null);
      } else {
        setSignInError("Sign-in failed. Please try again.");
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const faqJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: faqs.map((f) => ({
        "@type": "Question",
        name: f.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: f.answer,
        },
      })),
    }),
    [],
  );

  const howToJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "HowTo",
      name: "Generate Microsoft Intune Documentation",
      description:
        "Connect with Microsoft, select configurations, and export a professional PDF.",
      totalTime: "PT3M",
      supply: [],
      tool: [],
      step: [
        {
          "@type": "HowToStep",
          name: "Connect",
          text: "Sign in with your Microsoft account. We request read-only Graph permissions and do not store data.",
          url: "https://intunedocumentation.com/#how-it-works",
        },
        {
          "@type": "HowToStep",
          name: "Select",
          text: "Choose which Intune configurations to include or select all. Assignments and filters included.",
          url: "https://intunedocumentation.com/#how-it-works",
        },
        {
          "@type": "HowToStep",
          name: "Export",
          text: "Generate and download an audit-ready PDF including settings, ADMX values, scripts, and group targets.",
          url: "https://intunedocumentation.com/#how-it-works",
        },
      ],
    }),
    [],
  );

  const featureCards = [
    {
      icon: FileText,
      title: "Save 10+ Hours Per Audit",
      desc: "What takes hours manually, screenshots, copy-pasting, and formatting, is done in 3 minutes. All 10 configuration types included.",
    },
    {
      icon: CheckCircle,
      title: "100% Complete Settings",
      desc: "Every setting, ADMX value, script content, and assignment captured. No manual gaps or missing configurations.",
    },
    {
      icon: Shield,
      title: "Zero Data Storage",
      desc: "We don't store your tenant data. All processing happens entirely in your browser during your session.",
    },
    {
      icon: Eye,
      title: "Read-Only Access",
      desc: "Uses Microsoft OAuth with read-only scopes for Intune and Microsoft Graph resources.",
    },
    {
      icon: Database,
      title: "Assignments & Groups",
      desc: "Group targets and filters resolved for clarity, with optional counts by platform.",
    },
    {
      icon: Clock,
      title: "Always Current",
      desc: "Generate fresh reports anytime. No outdated wikis or stale documentation. Your report reflects the latest configuration.",
    },
  ];

  return (
    <>
      <a
        href="#main-content"
        className="text-petrol-950 sr-only fixed top-2 left-2 z-[60] rounded-lg bg-white px-3 py-2 shadow focus:not-sr-only focus:ring-2 focus:ring-teal-600 focus:outline-none"
      >
        Skip to main content
      </a>

      <NavigationHeader />

      <main id="main-content" className="bg-mint-50 overflow-hidden">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
        />

        <section className="hero-stripes bg-mint-50 relative pt-28 pb-20 sm:pt-32 sm:pb-24 lg:min-h-[760px] lg:pt-36 lg:pb-28">
          <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.04fr_0.96fr] lg:gap-10 lg:px-10">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="relative z-10"
            >
              <motion.div
                variants={fadeUp}
                className="mb-6 flex min-h-8 flex-wrap gap-2"
              >
                <HeroExportCounter />
                <HeroMauCounter />
              </motion.div>

              <motion.h1
                variants={fadeUp}
                className="text-petrol-950 max-w-3xl text-[2.65rem] leading-[0.98] font-semibold tracking-[-0.055em] sm:text-6xl lg:text-[4.15rem]"
              >
                Intune Documentation in minutes, not hours.
              </motion.h1>

              <motion.p
                variants={fadeUp}
                className="text-petrol-600 mt-6 max-w-xl text-base leading-7 sm:text-lg"
              >
                Export policies, settings, and assignments as audit-ready PDFs
                in under 3 minutes.
              </motion.p>

              <motion.div variants={fadeUp} className="mt-8">
                {!isAuthenticated ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                      <button
                        onClick={handleSignIn}
                        disabled={signingIn}
                        className={`ring-petrol-950/10 shadow-card inline-block min-h-11 rounded-md bg-white ring-1 transition-[transform,box-shadow,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none ${signingIn ? "cursor-not-allowed opacity-60" : "hover:shadow-soft cursor-pointer hover:-translate-y-0.5"}`}
                        aria-label="Sign in with Microsoft to generate your report"
                        type="button"
                      >
                        <img
                          src="/sign-in-light-mode.svg"
                          alt="Sign in with Microsoft"
                          width={215}
                          height={41}
                          loading="eager"
                          decoding="async"
                          fetchPriority="high"
                          className="h-auto w-[215px] max-w-full"
                        />
                      </button>
                      <a
                        href="/api/pdf/sample"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="border-petrol-950/12 text-petrol-800 inline-flex min-h-11 items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-teal-600/30 hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                        aria-label="Preview a sample PDF report"
                      >
                        <Eye className="h-4 w-4" />
                        Preview sample PDF
                      </a>
                    </div>
                    {signingIn && (
                      <div
                        className="text-petrol-600 flex items-center gap-2 text-sm"
                        aria-live="polite"
                      >
                        <svg
                          className="h-4 w-4 animate-spin text-teal-600"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        Opening Microsoft sign-in…
                      </div>
                    )}
                    {signInError && (
                      <div
                        className="max-w-xl rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
                        role="alert"
                      >
                        {signInError}
                      </div>
                    )}
                    <p className="text-petrol-600 text-xs leading-5">
                      Read-only access. Your data never leaves your browser.{" "}
                      <button
                        onClick={() => setShowSecurity(true)}
                        className="hover:text-petrol-950 cursor-pointer font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                        type="button"
                        aria-label="Learn why sign-in is safe and which permissions are used"
                      >
                        Why it’s safe
                      </button>
                      {" / "}
                      <button
                        onClick={() => setShowPermissions(true)}
                        className="hover:text-petrol-950 cursor-pointer font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                        type="button"
                        aria-label="See the required permissions and why each is needed"
                      >
                        Required permissions
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="border-petrol-950/8 shadow-card max-w-lg rounded-2xl border bg-white p-5 sm:p-6">
                    <p className="text-petrol-950 text-lg">
                      Welcome back,{" "}
                      <span className="font-semibold">
                        {userProfile?.displayName || "User"}
                      </span>
                    </p>
                    <p className="text-petrol-600 mt-1 text-sm">
                      Ready to generate your Intune documentation?
                    </p>
                    <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                      <button
                        onClick={() => router.push("/dashboard")}
                        className="inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                        type="button"
                      >
                        <FileText className="h-4 w-4" />
                        Go to Dashboard
                      </button>
                      <button
                        onClick={handleSignOut}
                        className="border-petrol-950/12 text-petrol-800 hover:bg-mint-50 min-h-11 cursor-pointer rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                        type="button"
                      >
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>

              <motion.div
                variants={fadeUp}
                className="mt-9 grid grid-cols-2 gap-x-4 gap-y-4 sm:flex sm:flex-wrap sm:gap-6"
              >
                {[
                  { icon: CheckCircle, label: "100% Free" },
                  { icon: Eye, label: "Read-only access" },
                  { icon: Database, label: "No data stored" },
                  { icon: Shield, label: "Secure OAuth" },
                ].map(({ icon: Icon, label }) => (
                  <div
                    key={label}
                    className="text-petrol-700 flex items-center gap-2 text-xs font-semibold"
                  >
                    <Icon className="h-4 w-4 text-teal-700" />
                    <span>{label}</span>
                  </div>
                ))}
              </motion.div>
            </motion.div>

            <motion.div
              initial="hidden"
              animate="visible"
              variants={fadeUp}
              transition={{ duration: 0.6, delay: prefersReduced ? 0 : 0.18 }}
              className="hidden sm:block"
            >
              <ProductMockup />
            </motion.div>
          </div>
        </section>

        <section className="relative z-10 -mt-2 px-5 pb-24 sm:-mt-6 sm:px-8 lg:-mt-12 lg:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="border-petrol-950/6 shadow-soft mx-auto max-w-6xl rounded-3xl border bg-white px-6 py-10 sm:px-10 sm:py-12 lg:px-14"
          >
            <div className="grid gap-6 lg:grid-cols-2 lg:items-end">
              <div>
                <Eyebrow>Built for IT teams</Eyebrow>
                <h2 className="text-petrol-950 max-w-xl text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl">
                  Documentation that grows with your tenant.
                </h2>
              </div>
              <p className="text-petrol-600 max-w-md text-sm leading-6 lg:justify-self-end">
                A secure reporting workflow for audits, handovers, and ongoing
                configuration management.
              </p>
            </div>

            <motion.div
              variants={staggerContainer}
              className="mt-12 grid gap-9 md:grid-cols-3 md:gap-8"
            >
              {[
                {
                  icon: Clock,
                  title: "Save 10+ hours per audit",
                  desc: "Replace screenshots, copy-pasting, and manual formatting with a finished report in minutes.",
                },
                {
                  icon: Layers,
                  title: "All 10 configuration types",
                  desc: "Complete settings, ADMX values, scripts, assignments, group targets, and filters.",
                },
                {
                  icon: Shield,
                  title: "Unmatched security",
                  desc: "Read-only OAuth, in-browser generation, and zero persistent tenant data storage.",
                },
              ].map(({ icon: Icon, title, desc }) => (
                <motion.div key={title} variants={fadeUp}>
                  <Icon
                    className="mb-5 h-7 w-7 text-teal-700"
                    strokeWidth={1.6}
                  />
                  <h3 className="text-petrol-950 text-base font-semibold">
                    {title}
                  </h3>
                  <p className="text-petrol-600 mt-2 text-sm leading-6">
                    {desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </section>

        <section className="pb-24 sm:pb-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="mb-10 text-center"
            >
              <Eyebrow>Why us</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Why IT teams prefer this tool
              </h2>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="grid gap-4 md:grid-cols-2"
            >
              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 min-h-64 rounded-3xl border bg-[#eaf1ef] p-7 sm:p-9"
              >
                <p className="text-6xl font-semibold tracking-[-0.06em] text-teal-600 tabular-nums sm:text-7xl">
                  10+
                </p>
                <p className="text-petrol-950 mt-10 max-w-xs text-lg leading-snug font-semibold">
                  Hours saved on every documentation cycle
                </p>
                <p className="text-petrol-600 mt-2 text-sm">
                  From sign-in to audit-ready report in about 3 minutes.
                </p>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 min-h-64 rounded-3xl border bg-[#edf3f1] p-7 sm:p-9"
              >
                <h3 className="text-petrol-950 max-w-sm text-xl leading-snug font-semibold">
                  Export your documentation at any time
                </h3>
                <div className="mt-12 flex items-center gap-4 sm:gap-6">
                  <span className="shadow-card flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-600 text-white">
                    <Cloud className="h-6 w-6" />
                  </span>
                  <div className="flex items-center gap-1 text-teal-700/50">
                    <ArrowRight className="h-5 w-5" />
                    <ArrowRight className="-ml-2 h-5 w-5" />
                  </div>
                  <span className="bg-petrol-950 shadow-card flex h-14 w-14 items-center justify-center rounded-full text-white">
                    <FileText className="h-6 w-6" />
                  </span>
                </div>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 rounded-3xl border bg-[#eaf1ef] p-7 sm:p-9 md:col-span-2"
              >
                <div className="grid items-center gap-8 lg:grid-cols-[0.72fr_1.28fr]">
                  <div>
                    <h3 className="text-petrol-950 text-xl font-semibold">
                      Always current, never stale
                    </h3>
                    <p className="text-petrol-600 mt-3 max-w-sm text-sm leading-6">
                      Generate a fresh report whenever your tenant changes. No
                      outdated wikis, missing assignments, or version drift.
                    </p>
                  </div>
                  <div className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white p-5">
                    <div className="mb-5 flex items-start justify-between">
                      <div>
                        <p className="text-petrol-600 text-[10px] font-semibold tracking-[0.14em] uppercase">
                          Summary
                        </p>
                        <p className="text-petrol-950 mt-1 text-xl font-semibold">
                          Docs exported
                        </p>
                      </div>
                      <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-semibold text-teal-700">
                        6 months
                      </span>
                    </div>
                    <div className="chart-grid h-36 rounded-xl px-2 pt-2">
                      <svg
                        viewBox="0 0 480 150"
                        className="h-full w-full"
                        aria-hidden="true"
                        preserveAspectRatio="none"
                      >
                        <defs>
                          <linearGradient
                            id="chartFill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor="#45a0a5"
                              stopOpacity="0.28"
                            />
                            <stop
                              offset="100%"
                              stopColor="#45a0a5"
                              stopOpacity="0.02"
                            />
                          </linearGradient>
                        </defs>
                        <path
                          d="M0 128 L75 93 L155 78 L240 58 L330 47 L405 20 L480 8 L480 150 L0 150 Z"
                          fill="url(#chartFill)"
                        />
                        <path
                          d="M0 128 L75 93 L155 78 L240 58 L330 47 L405 20 L480 8"
                          fill="none"
                          stroke="#318990"
                          strokeWidth="3"
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
              </motion.article>
            </motion.div>
          </div>
        </section>

        <section
          className="bg-petrol-950 scroll-mt-24 py-24 text-white sm:py-28"
          id="how-it-works"
        >
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="max-w-3xl"
            >
              <Eyebrow inverted>How it works</Eyebrow>
              <h2 className="text-3xl leading-tight font-semibold tracking-[-0.035em] text-white sm:text-4xl lg:text-5xl">
                From tenant to audit-ready PDF in three steps.
              </h2>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="mt-12 grid gap-4 md:grid-cols-3"
            >
              {[
                [
                  "1",
                  "Connect",
                  "Sign in with Microsoft. We use read-only Graph permissions and don't store your data.",
                ],
                [
                  "2",
                  "Select",
                  "Pick configurations by type, search, or select all. Assignments and filters included.",
                ],
                [
                  "3",
                  "Export",
                  "Download a professional PDF with full settings, ADMX values, scripts, and group targeting.",
                ],
              ].map(([num, title, desc]) => (
                <motion.article
                  key={num}
                  variants={fadeUp}
                  className="min-h-56 rounded-2xl border border-white/6 bg-white/[0.045] p-6 sm:p-7"
                >
                  <p className="text-6xl leading-none font-semibold text-white/18">
                    {num}
                  </p>
                  <h3 className="mt-8 text-lg font-semibold text-white">
                    {title}
                  </h3>
                  <p className="mt-2 text-sm leading-6 text-white/58">{desc}</p>
                </motion.article>
              ))}
            </motion.div>
          </div>
        </section>

        <DataFlowDiagram />

        <section
          className="bg-mint-50 scroll-mt-24 py-24 sm:py-28"
          id="features"
        >
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="mx-auto max-w-2xl text-center"
            >
              <Eyebrow>Complete coverage</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Everything you need for clear Intune docs
              </h2>
              <p className="text-petrol-600 mt-4 text-base leading-7">
                Complete tenant detail, professional exports, and a security
                model designed for IT teams.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
            >
              {featureCards.map((feature) => {
                const Icon = feature.icon;
                return (
                  <motion.article
                    key={feature.title}
                    variants={fadeUp}
                    className="group border-petrol-950/6 shadow-card hover:shadow-soft rounded-2xl border bg-white p-6 transition duration-200 hover:-translate-y-1 sm:p-7"
                  >
                    <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-50 text-teal-700 transition-colors group-hover:bg-teal-100">
                      <Icon className="h-5 w-5" strokeWidth={1.8} />
                    </span>
                    <h3 className="text-petrol-950 mt-6 text-base font-semibold">
                      {feature.title}
                    </h3>
                    <p className="text-petrol-600 mt-2 text-sm leading-6">
                      {feature.desc}
                    </p>
                  </motion.article>
                );
              })}
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="border-petrol-950/8 shadow-card mt-10 overflow-hidden rounded-3xl border bg-white"
            >
              <div className="grid md:grid-cols-2">
                <div className="border-b border-red-900/8 bg-red-50/60 p-6 sm:p-8 md:border-r md:border-b-0">
                  <div className="flex items-center gap-2">
                    <XCircle className="h-5 w-5 text-red-600" />
                    <h3 className="text-xs font-bold tracking-[0.16em] text-red-900 uppercase">
                      Manual way
                    </h3>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-red-950/70">
                    10+ hours of screenshots, copy-pasting from the Intune
                    portal, missing settings, and docs that are outdated before
                    you finish.
                  </p>
                </div>
                <div className="bg-emerald-50/60 p-6 sm:p-8">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-emerald-700" />
                    <h3 className="text-xs font-bold tracking-[0.16em] text-emerald-900 uppercase">
                      With this tool
                    </h3>
                  </div>
                  <p className="mt-4 text-sm leading-6 text-emerald-950/70">
                    3 minutes to a professional PDF with every setting, ADMX
                    value, assignment, and script captured automatically via
                    Microsoft Graph.
                  </p>
                </div>
              </div>
              <div className="border-petrol-950/6 flex items-center justify-center gap-2 border-t bg-white px-4 py-4 text-center">
                <Clock className="h-4 w-4 shrink-0 text-teal-700" />
                <span className="text-petrol-800 text-xs font-semibold sm:text-sm">
                  Average time saved: 10+ hours per documentation cycle
                </span>
              </div>
            </motion.div>
          </div>
        </section>

        <section className="bg-white py-24 sm:py-28">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="mx-auto max-w-5xl px-5 text-center sm:px-8"
          >
            <Eyebrow>Our impact</Eyebrow>
            <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
              Trusted by IT teams worldwide
            </h2>
            <p className="text-petrol-600 mx-auto mt-4 max-w-xl text-sm leading-6">
              From routine reviews to major audits, documentation becomes a
              repeatable part of tenant management.
            </p>
            <motion.div
              variants={staggerContainer}
              className="mt-14 grid gap-10 sm:grid-cols-3"
            >
              {[
                ["10+", "Hours saved per audit"],
                ["10", "Configuration types covered"],
                ["3 min", "Average export time"],
              ].map(([value, label]) => (
                <motion.div key={label} variants={fadeUp}>
                  <p className="text-petrol-950 text-4xl font-semibold tracking-[-0.045em] tabular-nums sm:text-5xl">
                    {value}
                  </p>
                  <p className="text-petrol-600 mt-3 text-xs font-semibold tracking-[0.13em] uppercase">
                    {label}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        </section>

        <section className="bg-white pb-24 sm:pb-28">
          <div className="mx-auto max-w-5xl px-5 sm:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="mb-8 text-center"
            >
              <Eyebrow>The ecosystem</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Document every side of Microsoft management
              </h2>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={staggerContainer}
              className="grid gap-4 md:grid-cols-2"
            >
              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 flex min-h-[330px] flex-col rounded-3xl border bg-[#eaf1ef] p-7 sm:p-9"
              >
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-petrol-950 text-2xl font-semibold tracking-[-0.03em]">
                      IntuneDocumentation
                    </p>
                    <p className="mt-2 text-base font-semibold text-teal-700">
                      Free forever
                    </p>
                  </div>
                  <Settings className="h-7 w-7 text-teal-700" />
                </div>
                <ul className="text-petrol-700 mt-8 space-y-3 text-sm">
                  {[
                    "Unlimited exports",
                    "No credit card required",
                    "PDF and DOCX formats",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5">
                      <Check
                        className="h-4 w-4 text-teal-700"
                        strokeWidth={2.5}
                      />
                      {item}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={handleSignIn}
                  disabled={signingIn}
                  type="button"
                  aria-label="Get started with IntuneDocumentation"
                  className="border-petrol-950/12 text-petrol-950 mt-auto flex h-12 w-12 cursor-pointer items-center justify-center self-end rounded-full border transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="diagonal-stripes shadow-card flex min-h-[330px] flex-col rounded-3xl bg-teal-600 p-7 text-white sm:p-9"
              >
                <div className="flex items-start justify-between gap-5">
                  <div>
                    <p className="text-2xl font-semibold tracking-[-0.03em]">
                      EntraDocumentation
                    </p>
                    <p className="mt-2 text-sm font-medium text-white/72">
                      Your identity documentation companion
                    </p>
                  </div>
                  <Users className="h-7 w-7 text-white/85" />
                </div>
                <p className="mt-9 max-w-sm text-sm leading-6 text-white/78">
                  Document your Microsoft Entra ID tenant: users, groups,
                  Conditional Access, and more.
                </p>
                <a
                  href="https://entradocumentation.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Visit EntraDocumentation in a new tab"
                  className="mt-auto flex h-12 w-12 items-center justify-center self-end rounded-full border border-white/25 text-white transition-colors hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none"
                >
                  <ArrowRight className="h-5 w-5" />
                </a>
              </motion.article>
            </motion.div>
            <p className="text-petrol-600 mx-auto mt-6 max-w-3xl text-center text-sm leading-6">
              Use both tools together to document your entire Microsoft identity
              and endpoint management infrastructure.
            </p>
          </div>
        </section>

        <section className="bg-mint-50 scroll-mt-24 py-24 sm:py-28" id="faq">
          <div className="mx-auto max-w-4xl px-5 sm:px-8">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="mb-10 text-center"
            >
              <Eyebrow>Questions, answered</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Frequently asked questions
              </h2>
            </motion.div>

            <div className="space-y-3">
              {faqs.map((faq, index) => {
                const isOpen = expandedFaq === index;
                return (
                  <motion.div
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true, margin: "-40px" }}
                    variants={fadeUp}
                    key={index}
                    className="border-petrol-950/6 overflow-hidden rounded-2xl border bg-white shadow-[0_8px_30px_-28px_rgba(8,47,54,0.4)]"
                  >
                    <button
                      className="flex min-h-16 w-full cursor-pointer items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-teal-50/55 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none focus-visible:ring-inset sm:px-6"
                      onClick={() => setExpandedFaq(isOpen ? null : index)}
                      type="button"
                      aria-expanded={isOpen}
                      aria-controls={`faq-answer-${index}`}
                    >
                      <span className="text-petrol-950 font-semibold">
                        {faq.question}
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-teal-700 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                      />
                    </button>
                    <div
                      id={`faq-answer-${index}`}
                      role="region"
                      className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                    >
                      <div className="overflow-hidden">
                        <div className="px-5 pb-5 sm:px-6">
                          <p className="text-petrol-600 max-w-3xl text-sm leading-6">
                            {linkify(faq.answer)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="bg-mint-50 px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={fadeUp}
            className="bg-petrol-950 shadow-soft mx-auto grid max-w-6xl gap-8 rounded-3xl px-6 py-10 text-white sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14"
          >
            <div>
              <Eyebrow inverted>Try it now</Eyebrow>
              <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
                Ready to stop documenting Intune by hand?
              </h2>
              <p className="mt-4 max-w-xl text-sm leading-6 text-white/62">
                Sign in securely with Microsoft and export a professional report
                in minutes.
              </p>
            </div>
            <div className="flex flex-col items-start gap-3 lg:items-end">
              {!isAuthenticated ? (
                <>
                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                    <button
                      onClick={handleSignIn}
                      disabled={signingIn}
                      className={`focus-visible:ring-offset-petrol-950 inline-block min-h-11 rounded-md bg-white ring-1 ring-white/20 transition-[transform,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 focus-visible:outline-none ${signingIn ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:-translate-y-0.5"}`}
                      aria-label="Sign in with Microsoft to generate your report"
                      type="button"
                    >
                      <img
                        src="/sign-in-light-mode.svg"
                        alt="Sign in with Microsoft"
                        width={215}
                        height={41}
                        loading="eager"
                        decoding="async"
                        fetchPriority="high"
                        className="h-auto w-[215px] max-w-full"
                      />
                    </button>
                    <a
                      href="/api/pdf/sample"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-11 items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
                    >
                      Preview sample PDF
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </div>
                  {signingIn && (
                    <p className="text-xs text-white/60" aria-live="polite">
                      Opening Microsoft sign-in…
                    </p>
                  )}
                  {signInError && (
                    <p className="max-w-md text-sm text-red-200" role="alert">
                      {signInError}
                    </p>
                  )}
                </>
              ) : (
                <button
                  onClick={() => router.push("/dashboard")}
                  type="button"
                  className="min-h-11 cursor-pointer rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
                >
                  Go to Dashboard
                </button>
              )}
            </div>
          </motion.div>
        </section>

        <SiteFooter />
      </main>

      <BackToTopButton />

      {showSecurity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="security-title"
        >
          <button
            className="bg-petrol-950/70 absolute inset-0 cursor-default backdrop-blur-sm"
            onClick={() => setShowSecurity(false)}
            aria-label="Close security dialog"
            type="button"
          />
          <div className="relative max-h-[85svh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="p-5 sm:p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Shield className="h-5 w-5" />
                </span>
                <h3
                  id="security-title"
                  className="text-petrol-950 text-lg font-semibold"
                >
                  How sign‑in and security work
                </h3>
              </div>
              <p className="text-petrol-600 mb-4 text-sm leading-6">
                You sign in with Microsoft; authentication is handled by Entra
                ID using OAuth 2.0/OpenID Connect. We never see your password
                and only request read‑only, delegated permissions.
              </p>
              <ul className="text-petrol-700 list-disc space-y-2 pl-5 text-sm leading-6">
                <li>
                  <span className="font-medium">Delegated access only:</span>{" "}
                  the app acts on your behalf while you’re signed in.{" "}
                  <span className="font-medium">
                    No application (app‑only) permissions
                  </span>{" "}
                  are used.
                </li>
                <li>
                  <span className="font-medium">Read‑only scopes:</span> we
                  request the minimal scopes needed to export configurations.
                  Requested scopes:
                </li>
                <li className="ml-4">
                  <code className="bg-mint-50 rounded px-2 py-1 text-xs">
                    {(loginRequest.scopes || []).join(", ")}
                  </code>
                </li>
                <li>
                  <span className="font-medium">No persistent storage:</span>{" "}
                  configuration data is fetched during your session and all
                  document generation (PDF and DOCX) happens entirely in your
                  browser. Your data never leaves your device during export.
                </li>
                <li>
                  <span className="font-medium">
                    Tokens stay in your browser:
                  </span>{" "}
                  access tokens are kept in session storage by MSAL and are not
                  saved server‑side.
                </li>
                <li>
                  <span className="font-medium">Revoke anytime:</span> remove
                  access from Entra ID &gt; Enterprise Applications, or simply
                  sign out.
                </li>
              </ul>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <a
                  href="/privacy-policy"
                  className="text-sm font-semibold text-teal-700 hover:underline"
                >
                  Read the Privacy Policy
                </a>
                <button
                  onClick={() => setShowSecurity(false)}
                  type="button"
                  className="bg-mint-50 text-petrol-800 hover:bg-mint-100 min-h-11 cursor-pointer rounded-full px-5 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPermissions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permissions-title"
        >
          <button
            className="bg-petrol-950/70 absolute inset-0 cursor-default backdrop-blur-sm"
            onClick={() => setShowPermissions(false)}
            aria-label="Close permissions dialog"
            type="button"
          />
          <div className="relative max-h-[85svh] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-3xl border border-white/10 bg-white shadow-2xl">
            <div className="p-5 sm:p-7">
              <div className="mb-3 flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                  <Lock className="h-5 w-5" />
                </span>
                <h3
                  id="permissions-title"
                  className="text-petrol-950 text-lg font-semibold"
                >
                  Required permissions & why
                </h3>
              </div>
              <p className="text-petrol-600 mb-5 text-sm leading-6">
                We request a small set of delegated, read‑only Microsoft Graph
                scopes to read your Intune configuration and build your report.
                No app‑only permissions.
              </p>
              <div className="space-y-3">
                {(loginRequest.scopes || []).map((scope) => {
                  const descriptions: Record<string, string> = {
                    "User.Read":
                      "Basic profile and sign‑in; required by Microsoft identity platform.",
                    "DeviceManagementConfiguration.Read.All":
                      "Read Intune device configuration policies and settings.",
                    "DeviceManagementApps.Read.All":
                      "Read app configuration and app protection policies.",
                    "DeviceManagementManagedDevices.Read.All":
                      "Read managed device inventory for counts by platform.",
                    "DeviceManagementRBAC.Read.All":
                      "Read Intune RBAC roles and assignments if referenced.",
                    "DeviceManagementServiceConfig.Read.All":
                      "Read Intune service configuration information.",
                    "Group.Read.All":
                      "Resolve Azure AD group names in policy assignments.",
                    "Policy.Read.All":
                      "Read Conditional Access policies to include in the report.",
                  };
                  const note =
                    scope === "Policy.Read.All"
                      ? "Admin consent required"
                      : "Delegated, read‑only";
                  return (
                    <div
                      key={scope}
                      className="border-petrol-950/8 grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[14rem_1fr] md:grid-cols-[16rem_1fr]"
                    >
                      <div className="sm:pr-2">
                        <code className="bg-mint-50 text-petrol-800 mt-0.5 block w-full rounded-lg px-2 py-1 text-xs break-words">
                          {scope}
                        </code>
                      </div>
                      <div>
                        <div className="text-petrol-800 text-sm">
                          {descriptions[scope] ||
                            "Read access used to generate documentation."}
                        </div>
                        <div className="text-petrol-600 mt-1 text-xs">
                          {note}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
                <a
                  href="https://learn.microsoft.com/graph/permissions-reference"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm font-semibold text-teal-700 hover:underline"
                >
                  Microsoft Graph permissions reference
                </a>
                <button
                  onClick={() => setShowPermissions(false)}
                  type="button"
                  className="bg-mint-50 text-petrol-800 hover:bg-mint-100 min-h-11 cursor-pointer rounded-full px-5 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
