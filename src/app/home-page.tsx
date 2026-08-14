"use client";

import { useMsal } from "@azure/msal-react";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  ArrowRight,
  Check,
  CheckCircle,
  ChevronDown,
  Cloud,
  Container,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCheck,
  FileText,
  Github,
  KeyRound,
  Lock,
  Monitor,
  RefreshCw,
  ServerOff,
  Shield,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { BackToTopButton } from "~/components/back-to-top-button";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { useUserProfile } from "~/hooks/use-user-profile";
import { loginRequest } from "~/lib/msal-config";
import type { SiteStats } from "~/lib/site-stats";

const faqs = [
  {
    question: "What is the Intune Documentation Generator?",
    answer:
      "The Intune Documentation Generator is a free, read-only tool that collects your Microsoft Intune configuration through Microsoft Graph and turns it into a PDF or Word report. It covers the original policy areas plus 36 additional resource collections across updates, scripts and remediations, enrollment and provisioning, apps, assignments and RBAC, tenant settings, connectors, and specialist policies. The exact resources returned depend on your tenant, licensing, and permissions.",
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
    question: "Can I self-host Intune Documentation?",
    answer:
      "Yes. Intune Documentation is open source under the Elastic License 2.0. The source is at https://github.com/ugurkocde/IntuneDocumentation and you can self-host it with a single docker compose command and your own Microsoft Entra app registration. Telemetry is disabled by default, and your tenant data stays in your browser either way.",
  },
  {
    question: "Is my Intune data secure?",
    answer:
      "We use Microsoft OAuth 2.0 with delegated, read-only access. The application server processes Graph responses transiently to collect, normalize, and redact sensitive values, but it does not persist your tenant configuration or access token. PDF and DOCX generation happens in your browser, and generated documents are not uploaded or stored by us.",
  },
  {
    question: "What Intune policies can I export?",
    answer:
      "Coverage includes device configurations, Settings Catalog, compliance, security baselines, administrative templates, scripts and remediations, app protection and configuration, managed apps, Windows updates, enrollment and Autopilot, assignment filters, RBAC, tenant and service settings, connectors, and specialist policies. Conditional Access is optional and requested separately with Policy.Read.All.",
  },
  {
    question: "What happens if Microsoft Graph cannot return a collection?",
    answer:
      "The dashboard keeps any successfully collected sections and clearly marks partial or failed collections. Warnings include the affected section, endpoint, status code, and a permission hint when available, so a failed request is not presented as a confirmed empty result.",
  },
  {
    question: "Are secrets or script bodies included in the report?",
    answer:
      "No. Sensitive values such as script bodies, passwords, tokens, pre-shared keys, QR-code payloads, encoded configuration files, and large app icons are replaced with [Redacted] before data reaches the dashboard or an export. The report retains useful metadata so reviewers can still identify the resource.",
  },
  {
    question: "Why does the tool use Microsoft Graph beta endpoints?",
    answer:
      "A number of Intune administration resources needed for complete documentation are currently exposed through Microsoft Graph beta. The tool uses those endpoints only for delegated, read-only collection and isolates failures by resource so one unavailable endpoint does not hide the rest of the report.",
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
      "Collection time depends on tenant size, Graph throttling, and the resources available in your environment. The dashboard streams sections as they finish and shows live progress, then lets you export the successfully collected data even when another section reports a warning.",
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

function ProductMockup({ prefersReduced }: { prefersReduced: boolean | null }) {
  const rows = [
    ["Device Configurations", "47 policies"],
    ["Compliance Policies", "12 policies"],
    ["PowerShell Scripts", "8 scripts"],
  ];
  const collectionStory: Variants = prefersReduced
    ? { hidden: {}, visible: {} }
    : {
        hidden: {},
        visible: { transition: { staggerChildren: 0.12 } },
      };
  const reportCard: Variants = prefersReduced
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.35,
            ease: "easeOut",
            delayChildren: 0.18,
            staggerChildren: 0.12,
          },
        },
      };
  const reportRow: Variants = prefersReduced
    ? {
        hidden: { opacity: 1, y: 0 },
        visible: { opacity: 1, y: 0 },
      }
    : {
        hidden: { opacity: 0, y: 14 },
        visible: {
          opacity: 1,
          y: 0,
          transition: {
            duration: 0.35,
            ease: "easeOut",
            when: "beforeChildren",
            delayChildren: 0.1,
          },
        },
      };
  const popIn: Variants = prefersReduced
    ? {
        hidden: { opacity: 1, scale: 1 },
        visible: { opacity: 1, scale: 1 },
      }
    : {
        hidden: { opacity: 0, scale: 0.5 },
        visible: {
          opacity: 1,
          scale: 1,
          transition: {
            duration: 0.28,
            ease: [0.34, 1.56, 0.64, 1],
          },
        },
      };
  const readyBadge: Variants = prefersReduced
    ? {
        hidden: { opacity: 1, x: 0, y: 0, scale: 1 },
        visible: { opacity: 1, x: 0, y: 0, scale: 1 },
      }
    : {
        hidden: { opacity: 0, x: 14, y: -12, scale: 0.96 },
        visible: {
          opacity: 1,
          x: 0,
          y: 0,
          scale: 1,
          transition: {
            duration: 0.4,
            delay: 0.98,
            ease: [0.34, 1.56, 0.64, 1],
          },
        },
      };

  return (
    <motion.div
      initial={prefersReduced ? false : "hidden"}
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      variants={collectionStory}
      className="relative mx-auto w-full max-w-[500px] px-3 pt-12 pb-8 sm:px-10"
      aria-hidden="true"
    >
      <div className="absolute inset-5 -z-10 rounded-[2.5rem] bg-teal-100/75 blur-2xl" />
      <motion.div
        variants={reportCard}
        className="shadow-soft relative rounded-[1.6rem] border border-white bg-white p-5 sm:p-7"
      >
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
            <motion.div
              key={label}
              variants={reportRow}
              className="border-petrol-950/7 bg-surface flex items-center gap-3 rounded-xl border px-3 py-3.5"
            >
              <motion.span
                variants={popIn}
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100 text-teal-700"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </motion.span>
              <span className="text-petrol-800 min-w-0 flex-1 truncate text-[11px] font-semibold sm:text-xs">
                {label}
              </span>
              <span className="text-petrol-600 shrink-0 text-[10px] sm:text-[11px]">
                {value}
              </span>
            </motion.div>
          ))}
        </div>

        <motion.div
          variants={reportRow}
          className="my-4 flex items-center justify-between rounded-xl bg-teal-50 px-3 py-2.5"
        >
          <span className="text-petrol-700 flex items-center gap-2 text-[10px] font-medium sm:text-[11px]">
            <Users className="h-3.5 w-3.5 text-teal-700" />
            Group assignments included
          </span>
          <motion.span
            variants={popIn}
            className="rounded-full bg-white px-2 py-1 text-[9px] font-bold text-teal-700"
          >
            Resolved
          </motion.span>
        </motion.div>

        <div className="bg-petrol-950 flex h-11 items-center justify-center gap-2 rounded-xl text-xs font-semibold text-white">
          <Download className="h-4 w-4" />
          Export PDF
        </div>
      </motion.div>

      <motion.div
        variants={readyBadge}
        className="diagonal-stripes absolute top-0 right-0 w-[175px] rounded-2xl bg-teal-600 p-4 text-white shadow-[0_20px_45px_-22px_rgba(8,47,54,0.55)] sm:right-2 sm:w-[195px] sm:p-5"
      >
        <div className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-[9px] font-semibold tracking-[0.14em] text-white/65 uppercase">
              PDF ready
            </p>
            <p className="mt-1 text-lg font-semibold tracking-tight">
              Coverage checked
            </p>
          </div>
          <FileCheck className="h-6 w-6 text-white/90" />
        </div>
        <div className="border-t border-white/20 pt-3">
          <p className="text-[9px] tracking-[0.14em] text-white/65 uppercase">
            Collection status
          </p>
          <p className="mt-1 text-sm font-semibold">Complete</p>
        </div>
      </motion.div>
    </motion.div>
  );
}

function SpotIllustrationClock() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto" aria-hidden="true">
      <ellipse cx="100" cy="78" rx="78" ry="52" fill="#e7eeec" />
      <circle
        cx="100"
        cy="68"
        r="32"
        fill="#ffffff"
        stroke="#318990"
        strokeWidth="5"
      />
      <path
        d="M100 50v18l13 9"
        stroke="#082f36"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle
        cx="40"
        cy="34"
        r="9"
        fill="none"
        stroke="#45a0a5"
        strokeWidth="6"
      />
      <path d="M156 26l14 22h-28z" fill="#dceff0" />
      <circle cx="170" cy="92" r="5" fill="#318990" />
      <circle cx="30" cy="96" r="4" fill="#082f36" />
    </svg>
  );
}

function SpotIllustrationLayers() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto" aria-hidden="true">
      <ellipse cx="100" cy="76" rx="78" ry="52" fill="#e7eeec" />
      <path
        d="M100 96 L142 76 L100 56 L58 76 Z"
        fill="#dceff0"
        stroke="#ffffff"
        strokeWidth="3"
      />
      <path
        d="M100 82 L142 62 L100 42 L58 62 Z"
        fill="#45a0a5"
        stroke="#ffffff"
        strokeWidth="3"
      />
      <path
        d="M100 68 L142 48 L100 28 L58 48 Z"
        fill="#082f36"
        stroke="#ffffff"
        strokeWidth="3"
      />
      <circle
        cx="168"
        cy="44"
        r="8"
        fill="none"
        stroke="#318990"
        strokeWidth="5"
      />
      <circle cx="34" cy="44" r="5" fill="#318990" />
      <path d="M34 94l11 17H23z" fill="#dceff0" />
    </svg>
  );
}

function SpotIllustrationShield() {
  return (
    <svg viewBox="0 0 200 140" className="h-32 w-auto" aria-hidden="true">
      <ellipse cx="100" cy="78" rx="78" ry="52" fill="#e7eeec" />
      <path
        d="M100 30l32 11v20c0 22-15 34-32 41-17-7-32-19-32-41V41z"
        fill="#318990"
      />
      <path
        d="M86 70l11 11 19-23"
        stroke="#ffffff"
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <circle
        cx="42"
        cy="40"
        r="8"
        fill="none"
        stroke="#45a0a5"
        strokeWidth="5"
      />
      <circle cx="164" cy="52" r="5" fill="#082f36" />
      <path d="M158 90l13 20h-26z" fill="#dceff0" />
      <circle cx="52" cy="106" r="4" fill="#318990" />
    </svg>
  );
}

export function HomePage({ stats }: { stats: SiteStats }) {
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

  // Fixed locale so server-rendered numbers match the client during hydration
  const heroStats: Array<{ value: string; label: string }> = [
    ...(stats.exportCount > 0
      ? [
          {
            value: stats.exportCount.toLocaleString("en-US"),
            label: "Docs exported",
          },
        ]
      : []),
    ...(stats.mauCount >= 10
      ? [
          {
            value: stats.mauCount.toLocaleString("en-US"),
            label: "Exports this month",
          },
        ]
      : []),
    ...(stats.tenantCount >= 10
      ? [
          {
            value: stats.tenantCount.toLocaleString("en-US"),
            label: "Organizations",
          },
        ]
      : []),
  ];

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
        "Connect with Microsoft, select configurations, and export a professional PDF or Word document.",
      supply: [],
      tool: [],
      step: [
        {
          "@type": "HowToStep",
          name: "Connect",
          text: "Sign in with your Microsoft account. We request delegated, read-only Graph permissions and do not persist tenant configuration data.",
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
          text: "Generate and download an audit-ready PDF or Word document including settings, ADMX values, script metadata, and group targets. Sensitive values are redacted.",
          url: "https://intunedocumentation.com/#how-it-works",
        },
      ],
    }),
    [],
  );

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
                or Word documents, with broad coverage and clear collection
                status.
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
                      Read-only access. Tenant data is processed transiently and
                      never persisted.{" "}
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
                  { icon: CheckCircle, label: "100% free" },
                  { icon: Eye, label: "Read-only access" },
                  { icon: Database, label: "No data stored" },
                  { icon: Shield, label: "Microsoft OAuth 2.0" },
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

              {heroStats.length > 0 && (
                <motion.div
                  variants={fadeUp}
                  className="border-petrol-950/8 mt-10 flex flex-wrap items-center gap-x-12 gap-y-4 border-t pt-7"
                >
                  {heroStats.map(({ value, label }) => (
                    <div key={label}>
                      <p className="text-petrol-950 text-3xl font-semibold tracking-[-0.045em] tabular-nums sm:text-4xl">
                        {value}
                      </p>
                      <p className="text-petrol-600 mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
                        {label}
                      </p>
                    </div>
                  ))}
                </motion.div>
              )}
            </motion.div>

            <div className="hidden sm:block">
              <ProductMockup prefersReduced={prefersReduced} />
            </div>
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
            <motion.div
              variants={staggerContainer}
              className="grid gap-12 md:grid-cols-3 md:gap-8"
            >
              {[
                {
                  art: <SpotIllustrationClock />,
                  title: "From hours to minutes",
                  desc: "Replace screenshots, copy-pasting, and manual formatting with a finished report in minutes.",
                },
                {
                  art: <SpotIllustrationLayers />,
                  title: "Expanded Intune coverage",
                  desc: "Policies, apps, updates, enrollment, RBAC, tenant settings, connectors, and specialist resources.",
                },
                {
                  art: <SpotIllustrationShield />,
                  title: "Read-only by design",
                  desc: "Delegated OAuth, sensitive-value redaction, in-browser document generation, and no persistent tenant data storage.",
                },
              ].map(({ art, title, desc }) => (
                <motion.div
                  key={title}
                  variants={fadeUp}
                  className="flex flex-col items-center text-center"
                >
                  {art}
                  <h3 className="text-petrol-950 mt-6 text-base font-semibold">
                    {title}
                  </h3>
                  <p className="text-petrol-600 mt-2 max-w-xs text-sm leading-6">
                    {desc}
                  </p>
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
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
                From tenant to audit-ready documentation in three steps.
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
                  "Sign in with Microsoft. We use delegated, read-only Graph permissions and never persist tenant configuration data.",
                ],
                [
                  "2",
                  "Select",
                  "Pick configurations by type, search, or select all. Assignments and filters included.",
                ],
                [
                  "3",
                  "Export",
                  "Download a professional PDF or Word document with settings, ADMX values, script metadata, and group targeting. Sensitive values stay redacted.",
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

        <section className="bg-white py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                <motion.div variants={fadeUp}>
                  <Eyebrow>Security</Eyebrow>
                  <h2 className="text-petrol-950 max-w-xl text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl">
                    Read-only access without persistent tenant storage.
                  </h2>
                  <p className="text-petrol-600 mt-4 max-w-lg text-sm leading-6">
                    Our application server transiently collects, normalizes, and
                    redacts Microsoft Graph responses. It does not persist your
                    tenant configuration, access token, or generated documents.
                  </p>
                </motion.div>

                <ul className="mt-8 space-y-4">
                  {[
                    {
                      title: "Delegated, read-only permissions",
                      desc: "Microsoft Graph scopes that can read your Intune configuration, never change it.",
                    },
                    {
                      title: "Sensitive values redacted",
                      desc: "Script bodies, passwords, tokens, payloads, QR codes, and configuration-file contents are removed before dashboard display or export.",
                    },
                    {
                      title: "Reports generated in your browser",
                      desc: "PDF and Word documents are built locally on your device, not on a server.",
                    },
                    {
                      title: "Nothing uploaded, nothing stored",
                      desc: "Configuration data is fetched during your session and discarded when you leave.",
                    },
                    {
                      title: "Revoke access anytime",
                      desc: "Remove the app from Entra ID enterprise applications, or simply sign out.",
                    },
                  ].map(({ title, desc }) => (
                    <motion.li
                      key={title}
                      variants={fadeUp}
                      className="flex gap-3"
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} />
                      </span>
                      <div>
                        <p className="text-petrol-950 text-sm font-semibold">
                          {title}
                        </p>
                        <p className="text-petrol-600 mt-0.5 text-sm leading-6">
                          {desc}
                        </p>
                      </div>
                    </motion.li>
                  ))}
                </ul>

                <motion.div
                  variants={fadeUp}
                  className="mt-8 flex flex-wrap gap-3"
                >
                  <button
                    onClick={() => setShowSecurity(true)}
                    type="button"
                    className="border-petrol-950/12 text-petrol-800 hover:bg-mint-50 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-teal-600/30 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    <Shield className="h-4 w-4 text-teal-700" />
                    How sign-in works
                  </button>
                  <button
                    onClick={() => setShowPermissions(true)}
                    type="button"
                    className="border-petrol-950/12 text-petrol-800 hover:bg-mint-50 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-5 py-2.5 text-sm font-semibold transition-colors hover:border-teal-600/30 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                  >
                    <Lock className="h-4 w-4 text-teal-700" />
                    Required permissions
                  </button>
                </motion.div>
              </motion.div>

              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
              >
                <div className="border-petrol-950/6 shadow-soft bg-mint-50 rounded-3xl border p-6 sm:p-8">
                  <p className="text-petrol-600 text-[10px] font-semibold tracking-[0.14em] uppercase">
                    How your data flows
                  </p>
                  <div className="mt-6">
                    {[
                      {
                        icon: Cloud,
                        tile: "bg-white text-teal-700 border-petrol-950/6 border",
                        title: "Microsoft Graph API",
                        desc: "Your Intune tenant, delegated read-only access",
                      },
                      {
                        icon: Database,
                        tile: "bg-white text-teal-700 border-petrol-950/6 border",
                        title: "Transient application processing",
                        desc: "Collects, normalizes, and redacts responses without persistent tenant storage",
                      },
                      {
                        icon: Monitor,
                        tile: "bg-teal-600 text-white",
                        title: "Your browser",
                        desc: "Shows collected sections and builds the report locally",
                      },
                      {
                        icon: FileCheck,
                        tile: "bg-petrol-950 text-white",
                        title: "Your PDF or Word file",
                        desc: "Saved directly to your device",
                      },
                    ].map(({ icon: Icon, tile, title, desc }, i) => (
                      <div key={title}>
                        {i > 0 && (
                          <div
                            className="bg-petrol-950/10 ml-[23px] h-7 w-px"
                            aria-hidden="true"
                          />
                        )}
                        <div className="flex items-center gap-4">
                          <span
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`}
                          >
                            <Icon className="h-5 w-5" strokeWidth={1.8} />
                          </span>
                          <div>
                            <p className="text-petrol-950 text-sm font-semibold">
                              {title}
                            </p>
                            <p className="text-petrol-600 text-xs leading-5">
                              {desc}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="border-petrol-950/8 mt-7 flex items-center justify-between gap-3 border-t pt-5">
                    <span className="text-petrol-600 flex items-center gap-2 text-sm">
                      <ServerOff className="h-4 w-4" />
                      Intune configuration storage
                    </span>
                    <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold tracking-wide text-teal-700 uppercase">
                      Not used
                    </span>
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

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
              className="mt-12 grid gap-5 md:grid-cols-2 lg:grid-cols-6"
            >
              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 shadow-card flex flex-col rounded-3xl border bg-white p-6 sm:p-7 lg:col-span-3"
              >
                <div
                  className="bg-surface border-petrol-950/5 mb-6 flex h-56 items-center justify-center overflow-hidden rounded-2xl border"
                  aria-hidden="true"
                >
                  <div className="w-full max-w-sm px-6">
                    <div className="border-petrol-950/6 rounded-xl border bg-white p-4 shadow-sm">
                      <p className="text-petrol-600 mb-2.5 text-[10px] font-semibold tracking-[0.14em] uppercase">
                        Select configurations
                      </p>
                      {[
                        ["Device Configurations", "47"],
                        ["Apps & Protection", "24"],
                        ["Enrollment & Updates", "18"],
                      ].map(([label, count]) => (
                        <div
                          key={label}
                          className="flex items-center gap-2.5 py-1.5"
                        >
                          <span className="flex h-4 w-4 items-center justify-center rounded bg-teal-600 text-white">
                            <Check className="h-3 w-3" strokeWidth={3} />
                          </span>
                          <span className="text-petrol-800 text-xs font-medium">
                            {label}
                          </span>
                          <span className="text-petrol-600 ml-auto text-[10px]">
                            {count}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="border-petrol-950/8 shadow-card relative z-10 mx-auto -mt-3 flex w-[90%] items-center justify-between gap-3 rounded-xl border bg-white py-2 pr-2 pl-3">
                      <span className="text-petrol-600 text-[11px]">
                        All available sections selected
                      </span>
                      <span className="flex items-center gap-1.5 rounded-lg bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white">
                        <Download className="h-3 w-3" />
                        Export
                      </span>
                    </div>
                  </div>
                </div>
                <h3 className="text-petrol-950 text-lg font-semibold">
                  Broad Intune coverage
                </h3>
                <p className="text-petrol-600 mt-2 text-sm leading-6">
                  Core policies plus 36 additional Graph resource collections
                  spanning apps, updates, enrollment, RBAC, tenant settings,
                  connectors, and more.
                </p>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 shadow-card flex flex-col rounded-3xl border bg-white p-6 sm:p-7 lg:col-span-3"
              >
                <div
                  className="bg-surface border-petrol-950/5 mb-6 flex h-56 items-center justify-center overflow-hidden rounded-2xl border"
                  aria-hidden="true"
                >
                  <div className="relative w-full max-w-sm px-8">
                    <div className="border-petrol-950/6 absolute inset-x-12 -top-2.5 h-full rotate-2 rounded-xl border bg-white/70" />
                    <div className="border-petrol-950/6 relative rounded-xl border bg-white p-4 shadow-sm">
                      <div className="mb-3 flex items-center gap-2.5">
                        <span className="h-7 w-7 rounded-lg bg-teal-600" />
                        <div>
                          <div className="bg-petrol-950/15 h-2 w-24 rounded" />
                          <div className="bg-petrol-950/8 mt-1.5 h-1.5 w-16 rounded" />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <div className="bg-petrol-950/6 h-1.5 w-full rounded" />
                        <div className="bg-petrol-950/6 h-1.5 w-4/5 rounded" />
                        <div className="bg-petrol-950/6 h-1.5 w-3/5 rounded" />
                      </div>
                      <div className="mt-4 flex items-center gap-2">
                        <span className="h-5 w-5 rounded-full bg-teal-600" />
                        <span className="bg-petrol-950 h-5 w-5 rounded-full" />
                        <span className="h-5 w-5 rounded-full bg-teal-100" />
                        <span className="border-petrol-950/10 h-5 w-5 rounded-full border bg-white" />
                        <span className="ml-auto rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold tracking-wide text-teal-700 uppercase">
                          Your brand
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                <h3 className="text-petrol-950 text-lg font-semibold">
                  Custom branding
                </h3>
                <p className="text-petrol-600 mt-2 text-sm leading-6">
                  Add your company logo, colors, headers, footers, and
                  confidentiality notices to every report.
                </p>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 shadow-card flex flex-col rounded-3xl border bg-white p-6 sm:p-7 lg:col-span-2"
              >
                <div
                  className="bg-surface border-petrol-950/5 mb-6 flex h-48 items-center justify-center overflow-hidden rounded-2xl border"
                  aria-hidden="true"
                >
                  <div className="border-petrol-950/6 w-full max-w-[230px] space-y-2 rounded-xl border bg-white p-3 shadow-sm">
                    {[
                      ["Sales Devices", "Resolved"],
                      ["All Users", "Resolved"],
                      ["Windows only", "Filter"],
                    ].map(([label, badge]) => (
                      <div
                        key={label}
                        className="bg-surface flex items-center gap-2 rounded-lg px-2.5 py-2"
                      >
                        <Users className="h-3.5 w-3.5 shrink-0 text-teal-700" />
                        <span className="text-petrol-800 text-[11px] font-medium">
                          {label}
                        </span>
                        <span className="ml-auto rounded-full bg-teal-50 px-2 py-0.5 text-[9px] font-bold text-teal-700">
                          {badge}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <h3 className="text-petrol-950 text-base font-semibold">
                  Assignments and groups
                </h3>
                <p className="text-petrol-600 mt-2 text-sm leading-6">
                  Group targets and filters resolved for clarity, with optional
                  counts by platform.
                </p>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 shadow-card flex flex-col rounded-3xl border bg-white p-6 sm:p-7 lg:col-span-2"
              >
                <div
                  className="bg-surface border-petrol-950/5 mb-6 flex h-48 items-center justify-center overflow-hidden rounded-2xl border"
                  aria-hidden="true"
                >
                  <div className="relative flex items-center justify-center pb-3">
                    <div className="bg-petrol-950 flex h-24 w-20 -rotate-6 flex-col items-center justify-center gap-2 rounded-xl text-white shadow-sm">
                      <FileText className="h-6 w-6" strokeWidth={1.6} />
                      <span className="text-[10px] font-bold tracking-wide">
                        PDF
                      </span>
                    </div>
                    <div className="shadow-card z-10 -ml-4 flex h-24 w-20 rotate-6 flex-col items-center justify-center gap-2 rounded-xl bg-teal-600 text-white">
                      <FileText className="h-6 w-6" strokeWidth={1.6} />
                      <span className="text-[10px] font-bold tracking-wide">
                        DOCX
                      </span>
                    </div>
                    <span className="border-petrol-950/8 absolute -bottom-1 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border bg-white shadow-sm">
                      <Download className="h-3.5 w-3.5 text-teal-700" />
                    </span>
                  </div>
                </div>
                <h3 className="text-petrol-950 text-base font-semibold">
                  PDF and Word exports
                </h3>
                <p className="text-petrol-600 mt-2 text-sm leading-6">
                  Download polished PDF or DOCX documents, ready for audits,
                  handovers, and archives.
                </p>
              </motion.article>

              <motion.article
                variants={fadeUp}
                className="border-petrol-950/6 shadow-card flex flex-col rounded-3xl border bg-white p-6 sm:p-7 lg:col-span-2"
              >
                <div
                  className="bg-surface border-petrol-950/5 mb-6 flex h-48 items-center justify-center overflow-hidden rounded-2xl border"
                  aria-hidden="true"
                >
                  <div className="border-petrol-950/6 w-full max-w-[230px] space-y-2 rounded-xl border bg-white p-3.5 shadow-sm">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </span>
                      <div>
                        <p className="text-petrol-950 text-[11px] font-semibold">
                          Collection complete
                        </p>
                        <p className="text-petrol-600 text-[10px]">Just now</p>
                      </div>
                      <span className="ml-auto h-2 w-2 rounded-full bg-teal-500" />
                    </div>
                    <div className="bg-surface text-petrol-700 rounded-lg px-2.5 py-2 text-[10px]">
                      Successful sections retained
                    </div>
                    <div className="bg-surface text-petrol-700 rounded-lg px-2.5 py-2 text-[10px]">
                      Warnings shown by section
                    </div>
                  </div>
                </div>
                <h3 className="text-petrol-950 text-base font-semibold">
                  Transparent collection status
                </h3>
                <p className="text-petrol-600 mt-2 text-sm leading-6">
                  Partial and failed Graph collections stay visible with their
                  endpoint, status, and permission hint instead of looking
                  empty.
                </p>
              </motion.article>
            </motion.div>
          </div>
        </section>

        <section className="bg-mint-50 py-24 sm:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">
            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="mx-auto max-w-2xl text-center"
            >
              <Eyebrow>Open source</Eyebrow>
              <h2 className="text-petrol-950 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
                Use it hosted, or run it yourself
              </h2>
              <p className="text-petrol-600 mt-4 text-base leading-7">
                Same app, either way. Your tenant data stays in your browser.
              </p>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-80px" }}
              variants={fadeUp}
              className="border-petrol-950/6 shadow-soft mt-12 rounded-3xl border bg-white p-3 sm:p-4"
            >
              <div className="grid gap-3 md:grid-cols-2">
                <article className="p-5 sm:p-7 lg:p-9">
                  <h3 className="text-petrol-950 text-xl font-semibold">
                    Hosted
                  </h3>
                  <ul className="mt-7 space-y-5">
                    {[
                      {
                        icon: ArrowRight,
                        text: "Start documenting at intunedocumentation.com in seconds",
                      },
                      {
                        icon: RefreshCw,
                        text: "Always on the latest version",
                      },
                      { icon: Cloud, text: "Nothing to operate" },
                    ].map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="text-petrol-700 pt-1 text-sm leading-6">
                          {text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </article>

                <article className="rounded-2xl border border-teal-600/15 bg-teal-50/70 p-5 sm:p-7 lg:p-9">
                  <h3 className="text-petrol-950 text-xl font-semibold">
                    Self-hosted
                  </h3>
                  <ul className="mt-7 space-y-5">
                    {[
                      {
                        icon: Container,
                        text: "Runs on your own infrastructure with Docker",
                      },
                      {
                        icon: KeyRound,
                        text: "Connects to your own Entra app registration",
                      },
                      {
                        icon: EyeOff,
                        text: "All telemetry disabled by default",
                      },
                    ].map(({ icon: Icon, text }) => (
                      <li key={text} className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-teal-700 shadow-sm">
                          <Icon className="h-4 w-4" strokeWidth={2} />
                        </span>
                        <span className="text-petrol-700 pt-1 text-sm leading-6">
                          {text}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <pre className="bg-petrol-950 mt-7 overflow-x-auto rounded-xl px-4 py-3.5 text-sm text-white">
                    <code>docker compose up -d</code>
                  </pre>
                </article>
              </div>
            </motion.div>

            <motion.div
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: "-40px" }}
              variants={fadeUp}
              className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row"
            >
              <a
                href="https://github.com/ugurkocde/IntuneDocumentation"
                target="_blank"
                rel="noopener noreferrer"
                className="bg-petrol-950 hover:bg-petrol-900 inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                <Github className="h-4 w-4" />
                View on GitHub
              </a>
              <a
                href="https://github.com/ugurkocde/IntuneDocumentation#self-host-with-docker"
                target="_blank"
                rel="noopener noreferrer"
                className="border-petrol-950/12 text-petrol-800 inline-flex min-h-11 items-center justify-center rounded-full border px-6 py-2.5 text-sm font-semibold transition-colors hover:border-teal-600/30 hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                Self-hosting guide
              </a>
            </motion.div>
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
                  <span className="font-medium">
                    No persistent configuration storage:
                  </span>{" "}
                  our application server processes Graph responses transiently
                  for collection, normalization, and redaction, then discards
                  them. PDF and DOCX generation happens in your browser, and
                  generated files are not uploaded to us.
                </li>
                <li>
                  <span className="font-medium">
                    Sensitive-value redaction:
                  </span>{" "}
                  script bodies, passwords, tokens, payloads, QR codes, and
                  encoded configuration files are replaced with [Redacted]
                  before dashboard display or export.
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
                {Array.from(
                  new Set([...(loginRequest.scopes || []), "Policy.Read.All"]),
                ).map((scope) => {
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
                    "DeviceManagementScripts.Read.All":
                      "Read script and remediation metadata. Script bodies are redacted before display or export.",
                    "Group.Read.All":
                      "Resolve Azure AD group names in policy assignments.",
                    "Policy.Read.All":
                      "Read Conditional Access policies to include in the report.",
                  };
                  const note =
                    scope === "Policy.Read.All"
                      ? "Optional; requested separately for Conditional Access and may require admin consent"
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
