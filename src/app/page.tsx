"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { loginRequest } from "~/lib/msal-config";
import { useUserProfile } from "~/hooks/use-user-profile";
import { Shield, FileText, CheckCircle, ChevronDown, Clock, Database, Eye, HelpCircle, XCircle } from "lucide-react";
import { BackToTopButton } from "~/components/back-to-top-button";
import type { ReactNode } from "react";
import { useMemo, useState, useEffect } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { HeroExportCounter } from "~/components/hero-export-counter";
import { HeroMauCounter } from "~/components/hero-mau-counter";
import { DataFlowDiagram } from "~/components/data-flow-diagram";

const faqs = [
  {
    question: "What is the Intune Documentation Generator?",
    answer: "The Intune Documentation Generator is a free tool that connects to your Microsoft Intune tenant via Graph API, fetches all 10 configuration types (policies, profiles, scripts, etc.), and generates comprehensive PDF or Word documents with complete settings, assignments, and filters. It saves IT teams 10+ hours per audit."
  },
  {
    question: "How do I export Intune configurations to PDF?",
    answer: "Simply sign in with your Microsoft account, select the Intune configurations you want to document, and click Export. The tool automatically generates a professional PDF report with all settings, assignments, and group configurations in minutes."
  },
  {
    question: "Is the Intune Documentation tool really free?",
    answer: "Yes, it's completely free. No hidden fees, no premium tiers, no credit card required. You can generate unlimited Intune documentation reports at no cost."
  },
  {
    question: "Is my Intune data secure?",
    answer: "Yes. We use Microsoft OAuth 2.0 with delegated read-only access. All document generation (PDF and DOCX) happens entirely in your browser -- your Intune data never leaves your device. We do not persist your configuration data or generated documents anywhere."
  },
  {
    question: "What Intune policies can I export?",
    answer: "You can export all Intune configuration types including: Device Configurations, Compliance Policies, Settings Catalog, Administrative Templates, Security Baselines, PowerShell Scripts, Shell Scripts, App Configurations, Windows Update Policies, Enrollment Configurations, and Conditional Access Policies."
  },
  {
    question: "Why does Defender flag 'Suspicious application consent for offline access'?",
    answer: "This is a common alert when an app requests the standard 'offline_access' permission from Microsoft identity (used to refresh tokens without repeatedly prompting you). It does NOT grant extra data access beyond your approved read-only scopes, and we use only delegated permissions (no application permissions). Tokens are kept in your browser session, and we do not store tenant data."
  },
  {
    question: "How long does it take to generate Intune documentation?",
    answer: "Most Intune documentation reports are generated in under 2 minutes. The exact time depends on the number of configurations in your tenant and which policies you select for export."
  },
  {
    question: "Can I customize the Intune PDF report?",
    answer: "Yes, you can customize your documentation with branding options including company logo, custom colors, headers, footers, and confidentiality notices. You can also select specific configurations to include or exclude from the report."
  }
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
          className="text-blue-700 underline"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
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
    : { hidden: {}, visible: { transition: { staggerChildren: 0.1 } } };

  // Close modals on Escape key
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
        setSignInError("Pop-up was blocked. Please allow pop-ups for this site and try again.");
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

  const faqJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": faqs.map((f) => ({
      "@type": "Question",
      "name": f.question,
      "acceptedAnswer": {
        "@type": "Answer",
        "text": f.answer,
      },
    })),
  }), []);

  const howToJsonLd = useMemo(() => ({
    "@context": "https://schema.org",
    "@type": "HowTo",
    "name": "Generate Microsoft Intune Documentation",
    "description": "Connect with Microsoft, select configurations, and export a professional PDF.",
    "totalTime": "PT3M",
    "supply": [],
    "tool": [],
    "step": [
      {
        "@type": "HowToStep",
        "name": "Connect",
        "text": "Sign in with your Microsoft account. We request read-only Graph permissions and do not store data.",
        "url": "https://intunedocumentation.com/#how-it-works"
      },
      {
        "@type": "HowToStep",
        "name": "Select",
        "text": "Choose which Intune configurations to include or select all. Assignments and filters included.",
        "url": "https://intunedocumentation.com/#how-it-works"
      },
      {
        "@type": "HowToStep",
        "name": "Export",
        "text": "Generate and download an audit-ready PDF including settings, ADMX values, scripts, and group targets.",
        "url": "https://intunedocumentation.com/#how-it-works"
      }
    ]
  }), []);

  return (
    <>
      {/* Skip link for accessibility */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only fixed top-2 left-2 z-50 bg-white text-slate-900 px-3 py-2 rounded shadow"
      >
        Skip to main content
      </a>

      {/* Navbar */}
      <NavigationHeader />

      {/* Hero Section - Full Screen */}
      <main id="main-content">
        {/* FAQ Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
        {/* HowTo Structured Data */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
        />
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 flex items-center">
          {/* Geometric Pattern Overlay */}
          <div className="absolute inset-0 bg-grid-white/[0.05] bg-[size:50px_50px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent" />
          
          <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="max-w-3xl mx-auto">
              {/* Content */}
              <div className="text-left">

                {/* Stats Counter Badges */}
                <div className="mb-6 flex flex-wrap gap-2">
                  <HeroExportCounter />
                  <HeroMauCounter />
                </div>

                {/* Main Headline */}
                <h1 className="text-3xl sm:text-4xl lg:text-5xl xl:text-6xl font-extrabold text-white mb-6 tracking-tight leading-[1.05]">
                  Stop Spending Hours on{" "}
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Intune Documentation</span>
                </h1>
                
                {/* Subheadline */}
                <p className="text-lg sm:text-xl lg:text-2xl text-blue-100 mb-8 leading-relaxed max-w-2xl">
                  Export all your Intune policies, settings, and assignments as audit-ready PDFs {"\u2014"} in under 3 minutes.
                </p>

                {/* Trust / Value points */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-sm font-medium">100% Free</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <Eye className="w-5 h-5 text-blue-300" />
                    </div>
                    <span className="text-sm font-medium">Read-only</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <Database className="w-5 h-5 text-purple-300" />
                    </div>
                    <span className="text-sm font-medium">No data stored</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <Shield className="w-5 h-5 text-green-300" />
                    </div>
                    <span className="text-sm font-medium">Secure OAuth</span>
                  </div>
                </div>
                
                {/* CTA Section */}
                {!isAuthenticated ? (
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-end gap-4">
                      <div className="flex flex-col items-start gap-3">
                        <span className="text-sm font-semibold text-blue-200 uppercase tracking-wider">Get started free</span>
                        <button
                          onClick={handleSignIn}
                          disabled={signingIn}
                          className={`inline-block rounded-md ring-1 ring-white/25 shadow-lg shadow-blue-500/20 transition-all duration-200 ${signingIn ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:ring-white/50 hover:shadow-blue-500/30 hover:scale-[1.02]"}`}
                          aria-label="Sign in with Microsoft to generate your report"
                        >
                          <img
                            src="/sign-in-light-mode.svg"
                            alt="Sign in with Microsoft"
                            width={215}
                            height={41}
                            loading="eager"
                            decoding="async"
                            fetchPriority="high"
                            className="w-[215px] max-w-full h-auto"
                          />
                        </button>
                      </div>
                      <a
                        href="/api/pdf/sample"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-blue-100 border border-blue-300/30 rounded-lg hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                        aria-label="Preview a sample PDF report"
                      >
                        <Eye className="w-4 h-4" />
                        Preview sample PDF
                      </a>
                    </div>
                    {signingIn && (
                      <div className="text-sm text-blue-100 flex items-center gap-2" aria-live="polite">
                        <svg className="animate-spin h-4 w-4 text-blue-200" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Opening Microsoft sign-in...
                      </div>
                    )}
                    {signInError && (
                      <div className="text-sm text-red-300 bg-red-500/10 border border-red-400/20 rounded-lg px-3 py-2" role="alert">
                        {signInError}
                      </div>
                    )}
                    <p className="text-xs text-blue-200">
                      Read-only access. Your data never leaves your browser.{" "}
                      <button
                        onClick={() => setShowSecurity(true)}
                        className="underline hover:text-white transition-colors cursor-pointer"
                        type="button"
                        aria-label="Learn why sign-in is safe and which permissions are used"
                      >
                        Why it’s safe
                      </button>
                      {" / "}
                      <button
                        onClick={() => setShowPermissions(true)}
                        className="underline hover:text-white transition-colors cursor-pointer"
                        type="button"
                        aria-label="See the required permissions and why each is needed"
                      >
                        Required permissions
                      </button>
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-start gap-6">
                    <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
                      <p className="text-xl text-white mb-2">
                        Welcome back, <span className="font-semibold">{userProfile?.displayName || "User"}</span>
                      </p>
                      <p className="text-blue-200 mb-6">
                        Ready to generate your Intune documentation?
                      </p>
                      <div className="flex gap-4">
                        <button
                          onClick={() => router.push("/dashboard")}
                          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-lg hover:shadow-xl flex items-center gap-2 font-semibold cursor-pointer"
                        >
                          <FileText className="w-5 h-5" />
                          Go to Dashboard
                        </button>
                        <button
                          onClick={handleSignOut}
                          className="px-6 py-3 bg-white/20 backdrop-blur-sm text-white rounded-lg hover:bg-white/30 transition-all border border-white/30 font-semibold cursor-pointer"
                        >
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
            </div>
          </div>
          
          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-gentle-bob" aria-hidden="true">
            <ChevronDown className="w-8 h-8 text-white/70" aria-hidden="true" />
          </div>
        </div>

        {/* How It Works Section */}
        <section className="py-24 bg-white scroll-mt-24" id="how-it-works">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="text-center mb-12"
              >
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Generate Your Report in 3 Steps
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Replace hours of manual documentation with a 3-minute automated process.
                </p>
              </motion.div>
              
              <motion.div
                className="grid md:grid-cols-3 gap-8"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                {[
                  { num: "1", title: "Connect", desc: "Sign in with Microsoft. We use read\u2011only Graph permissions and don\u2019t store your data." },
                  { num: "2", title: "Select", desc: "Pick configurations by type, search, or select all. Assignments and filters included." },
                  { num: "3", title: "Export", desc: "Download a professional PDF with full settings, ADMX values, scripts, and group targeting." },
                ].map((step, i) => (
                  <motion.div key={i} variants={fadeUp} transition={{ duration: 0.5 }} className="text-center card-elevated p-6 relative">
                    {i < 2 && (
                      <div className="hidden md:block absolute top-1/2 -right-5 -translate-y-1/2 text-gray-300" aria-hidden="true">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    )}
                    <div className="w-12 h-12 mx-auto bg-blue-600/10 text-blue-700 rounded-lg flex items-center justify-center font-bold text-lg mb-4">
                      {step.num}
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      {step.title}
                    </h3>
                    <p className="text-gray-600 text-sm">
                      {step.desc}
                    </p>
                  </motion.div>
                ))}
              </motion.div>
            </div>
          </div>
        </section>

        {/* Data Flow Architecture Diagram */}
        <DataFlowDiagram />

        {/* Key Features Section */}
        <section className="py-24 bg-white scroll-mt-24" id="features">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <motion.h2
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="text-3xl font-bold text-gray-900 mb-12 text-center"
              >
                Everything You Need for Clear Intune Docs
              </motion.h2>

              <motion.div
                className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6"
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={staggerContainer}
              >
                {[
                  { icon: <FileText className="w-6 h-6 text-white" />, gradient: "from-blue-500 to-blue-600", title: "Save 10+ Hours Per Audit", desc: "What takes hours manually\u2014screenshots, copy-pasting, formatting\u2014done in 3 minutes. All 10 configuration types included." },
                  { icon: <CheckCircle className="w-6 h-6 text-white" />, gradient: "from-blue-600 to-indigo-600", title: "100% Complete Settings", desc: "Every setting, ADMX value, script content, and assignment captured. No manual gaps or missing configurations." },
                  { icon: <Shield className="w-6 h-6 text-white" />, gradient: "from-indigo-500 to-indigo-600", title: "Zero Data Storage", desc: "We don\u2019t store your tenant data; all processing happens entirely in your browser during your session." },
                  { icon: <Eye className="w-6 h-6 text-white" />, gradient: "from-blue-500 to-blue-600", title: "Read\u2011Only Access", desc: "Uses Microsoft OAuth with read\u2011only scopes for Intune and Graph resources." },
                  { icon: <Database className="w-6 h-6 text-white" />, gradient: "from-indigo-500 to-blue-600", title: "Assignments & Groups", desc: "Group targets and filters resolved for clarity; optional counts by platform." },
                  { icon: <Clock className="w-6 h-6 text-white" />, gradient: "from-blue-600 to-indigo-600", title: "Always Current", desc: "Generate fresh reports anytime. No outdated wikis or stale documentation\u2014always reflects your latest configuration." },
                ].map((feat, i) => (
                  <motion.div key={i} variants={fadeUp} transition={{ duration: 0.5 }} className="bg-white rounded-xl p-6 shadow-md border border-gray-100 flex flex-col">
                    <div className={`w-12 h-12 bg-gradient-to-br ${feat.gradient} rounded-lg flex items-center justify-center mb-4`}>
                      {feat.icon}
                    </div>
                    <h3 className="font-semibold text-gray-900 mb-2">{feat.title}</h3>
                    <p className="text-gray-600 text-sm flex-1">
                      {feat.desc}
                    </p>
                  </motion.div>
                ))}
              </motion.div>

              {/* Before/After Comparison */}
              <motion.div
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="mt-12 rounded-xl overflow-hidden border border-gray-200"
              >
                <div className="grid md:grid-cols-2">
                  <div className="bg-red-50/60 p-5 sm:p-6 md:p-8 border-b md:border-b-0 md:border-r border-gray-200">
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="w-5 h-5 text-red-500" />
                      <h3 className="font-semibold text-red-900 text-sm uppercase tracking-wider">Manual way</h3>
                    </div>
                    <p className="text-red-800/70 text-sm sm:text-base leading-relaxed">10+ hours of screenshots, copy-pasting from the Intune portal, missing settings, and docs that are outdated before you finish.</p>
                  </div>
                  <div className="bg-emerald-50/60 p-5 sm:p-6 md:p-8">
                    <div className="flex items-center gap-2 mb-3">
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                      <h3 className="font-semibold text-emerald-900 text-sm uppercase tracking-wider">With this tool</h3>
                    </div>
                    <p className="text-emerald-800/70 text-sm sm:text-base leading-relaxed">3 minutes to a professional PDF with every setting, ADMX value, assignment, and script captured automatically via Graph API.</p>
                  </div>
                </div>
                <div className="bg-white py-3 flex items-center justify-center border-t border-gray-200">
                  <Clock className="w-4 h-4 text-blue-600 mr-2 flex-shrink-0" />
                  <span className="text-blue-900 font-semibold text-xs sm:text-sm">Average time saved: 10+ hours per documentation cycle</span>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-24 bg-gray-50 scroll-mt-24" id="faq">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <motion.h2
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, margin: "-80px" }}
                variants={fadeUp}
                transition={{ duration: 0.5 }}
                className="text-3xl font-bold text-gray-900 mb-8 text-center"
              >
                Frequently Asked Questions
              </motion.h2>

              <div className="space-y-4">
                {faqs.map((faq, index) => {
                  const isOpen = expandedFaq === index;
                  return (
                    <div
                      key={index}
                      className="bg-white rounded-xl border border-gray-200 overflow-hidden"
                    >
                      <button
                        className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-50 transition-colors cursor-pointer"
                        onClick={() => setExpandedFaq(isOpen ? null : index)}
                        type="button"
                        aria-expanded={isOpen}
                        aria-controls={`faq-answer-${index}`}
                      >
                        <span className="font-semibold text-gray-900">{faq.question}</span>
                        <ChevronDown
                          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </button>
                      <div
                        id={`faq-answer-${index}`}
                        role="region"
                        className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
                      >
                        <div className="overflow-hidden">
                          <div className="px-6 pb-4">
                            <p className="text-gray-600">{linkify(faq.answer)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Complete Your Microsoft 365 Documentation Section */}
        <section className="py-24 bg-white">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <div className="text-center mb-12">
                <h2 className="text-3xl font-bold text-gray-900 mb-4">
                  Complete Your Microsoft 365 Documentation
                </h2>
                <p className="text-lg text-gray-600 max-w-3xl mx-auto">
                  Document your entire Microsoft identity and endpoint management ecosystem with our complementary solution.
                </p>
              </div>

              <div className="bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
                <div className="bg-gradient-to-br from-blue-600 to-blue-700 px-6 py-4">
                  <div className="text-sm font-semibold text-blue-100 uppercase tracking-wider">
                    Complementary Product
                  </div>
                </div>

                <div className="p-8">
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">
                    EntraDocumentation
                  </h3>
                  <p className="text-gray-600 mb-6">
                    Generate comprehensive PDF reports of all your Microsoft Entra ID configurations in under 3 minutes.
                  </p>

                  <div className="grid md:grid-cols-2 gap-6 mb-8">
                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Identity & Access</h4>
                        <p className="text-sm text-gray-600">
                          Users, groups, roles, and administrative units
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Conditional Access</h4>
                        <p className="text-sm text-gray-600">
                          Policies, named locations, and authentication contexts
                        </p>
                      </div>
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Security & Governance</h4>
                        <p className="text-sm text-gray-600">
                          Identity protection, access reviews, and lifecycle workflows
                        </p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Application Management</h4>
                        <p className="text-sm text-gray-600">
                          Enterprise applications, app registrations, and consent policies
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                        <div className="grid grid-cols-2 gap-4 text-center">
                          <div>
                            <div className="text-2xl font-bold text-blue-600">Audit-Ready</div>
                            <div className="text-xs text-gray-600 mt-1">Reports</div>
                          </div>
                          <div>
                            <div className="text-2xl font-bold text-blue-600">3-Minute</div>
                            <div className="text-xs text-gray-600 mt-1">Generation</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <a
                    href="https://entradocumentation.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg hover:from-blue-700 hover:to-blue-800 transition-all shadow-md hover:shadow-lg font-semibold cursor-pointer"
                  >
                    Visit EntraDocumentation.com
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </a>

                  <p className="text-sm text-gray-500 mt-6 italic">
                    <strong>Complete coverage:</strong> Use both tools together to document your entire Microsoft identity and endpoint management infrastructure.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Bottom CTA */}
        <section className="py-20 bg-gradient-to-br from-blue-700 to-blue-800">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-4xl mx-auto text-center">
              <h2 className="text-3xl font-bold text-white mb-4">Ready to document your Intune tenant?</h2>
              <p className="text-blue-100 mb-8">Sign in securely with Microsoft and export your report in minutes.</p>
              {!isAuthenticated ? (
                <div className="flex flex-col items-center gap-4">
                  <button
                    onClick={handleSignIn}
                    disabled={signingIn}
                    className={`inline-block rounded-md ring-1 ring-white/25 shadow-lg shadow-blue-500/20 transition-all duration-200 ${signingIn ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:ring-white/50 hover:shadow-blue-500/30 hover:scale-[1.02]"}`}
                    aria-label="Sign in with Microsoft to Generate Report"
                  >
                    <img
                      src="/sign-in-light-mode.svg"
                      alt="Sign in with Microsoft"
                      width={215}
                      height={41}
                      loading="eager"
                      decoding="async"
                      fetchPriority="high"
                      className="w-[215px] max-w-full h-auto"
                    />
                  </button>
                  <p className="text-sm text-blue-200">
                    Read-only access. No data stored. 100% free.
                  </p>
                </div>
              ) : (
                <button
                  onClick={() => router.push("/dashboard")}
                  className="px-6 py-3 bg-white text-blue-700 rounded-lg hover:bg-blue-50 transition-all shadow-md font-semibold cursor-pointer"
                >
                  Go to Dashboard
                </button>
              )}
            </div>
          </div>
        </section>

        <SiteFooter />
      </main>

      <BackToTopButton />

      {/* Security Modal */}
      {showSecurity && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="security-title"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSecurity(false)} />
          <div className="relative w-full max-w-lg bg-white rounded-xl shadow-2xl ring-1 ring-black/5 max-h-[85svh] overflow-y-auto">
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 id="security-title" className="text-lg font-semibold text-slate-900">How sign‑in and security work</h3>
              </div>
              <p className="text-slate-600 text-sm mb-4">
                You sign in with Microsoft; authentication is handled by Entra ID using OAuth 2.0/OpenID Connect. We never see your password and only request read‑only, delegated permissions.
              </p>
              <ul className="list-disc pl-5 space-y-2 text-sm text-slate-700">
                <li><span className="font-medium">Delegated access only:</span> the app acts on your behalf while you’re signed in. <span className="font-medium">No application (app‑only) permissions</span> are used.</li>
                <li><span className="font-medium">Read‑only scopes:</span> we request the minimal scopes needed to export configurations. Requested scopes:</li>
                <li className="ml-4">
                  <code className="text-xs bg-slate-100 px-2 py-1 rounded">
                    {(loginRequest.scopes || []).join(', ')}
                  </code>
                </li>
                <li><span className="font-medium">No persistent storage:</span> configuration data is fetched during your session and all document generation (PDF and DOCX) happens entirely in your browser. Your data never leaves your device during export.</li>
                <li><span className="font-medium">Tokens stay in your browser:</span> access tokens are kept in session storage by MSAL and are not saved server‑side.</li>
                <li><span className="font-medium">Revoke anytime:</span> remove access from Entra ID &gt; Enterprise Applications, or simply sign out.</li>
              </ul>
              <div className="mt-5 flex items-center justify-between">
                <a href="/privacy-policy" className="text-sm text-blue-700 hover:underline">Read the Privacy Policy</a>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSecurity(false)}
                    type="button"
                    className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Modal */}
      {showPermissions && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="permissions-title"
        >
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowPermissions(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-xl shadow-2xl ring-1 ring-black/5 max-h-[85svh] overflow-y-auto">
            <div className="p-5 sm:p-6">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-blue-600" />
                <h3 id="permissions-title" className="text-lg font-semibold text-slate-900">Required permissions & why</h3>
              </div>
              <p className="text-slate-600 text-sm mb-4">
                We request a small set of delegated, read‑only Microsoft Graph scopes to read your Intune configuration and build your report. No app‑only permissions.
              </p>
              <div className="space-y-3">
                {(loginRequest.scopes || []).map((scope) => {
                  const descriptions: Record<string, string> = {
                    "User.Read": "Basic profile and sign‑in; required by Microsoft identity platform.",
                    "DeviceManagementConfiguration.Read.All": "Read Intune device configuration policies and settings.",
                    "DeviceManagementApps.Read.All": "Read app configuration and app protection policies.",
                    "DeviceManagementManagedDevices.Read.All": "Read managed device inventory for counts by platform.",
                    "DeviceManagementRBAC.Read.All": "Read Intune RBAC roles and assignments if referenced.",
                    "DeviceManagementServiceConfig.Read.All": "Read Intune service configuration information.",
                    "Group.Read.All": "Resolve Azure AD group names in policy assignments.",
                    "Policy.Read.All": "Read Conditional Access policies to include in the report.",
                  };
                  const note = scope === "Policy.Read.All" ? "Admin consent required" : "Delegated, read‑only";
                  return (
                    <div
                      key={scope}
                      className="grid grid-cols-1 sm:grid-cols-[14rem_1fr] md:grid-cols-[16rem_1fr] gap-3 p-3 rounded-lg border border-slate-200"
                    >
                      <div className="sm:pr-2">
                        <code className="block text-xs bg-slate-100 px-2 py-1 rounded break-words w-full mt-0.5">
                          {scope}
                        </code>
                      </div>
                      <div>
                        <div className="text-sm text-slate-800">
                          {descriptions[scope] || "Read access used to generate documentation."}
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{note}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 flex items-center justify-between">
                <a href="https://learn.microsoft.com/graph/permissions-reference" target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">Microsoft Graph permissions reference</a>
                <button
                  onClick={() => setShowPermissions(false)}
                  type="button"
                  className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer"
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
