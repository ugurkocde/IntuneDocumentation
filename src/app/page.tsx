"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { loginRequest } from "~/lib/msal-config";
import { useUserProfile } from "~/hooks/use-user-profile";
import { Shield, FileText, CheckCircle, ChevronDown, Clock, Database, Eye, Download, HelpCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";

export default function HomePage() {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [showSecurity, setShowSecurity] = useState(false);
  const [showPermissions, setShowPermissions] = useState(false);

  const isAuthenticated = accounts.length > 0;

  const handleSignIn = async () => {
    try {
      setSigningIn(true);
      await instance.loginPopup(loginRequest);
      router.push("/dashboard");
    } catch (error) {
      console.error("Login failed:", error);
    } finally {
      setSigningIn(false);
    }
  };
  
  const handleSignOut = () => {
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const faqs = [
    {
      question: "What does this tool do?",
      answer: "It connects to your Microsoft Intune tenant via Graph API, fetches all 10 configuration types (policies, profiles, scripts, etc.), and generates a comprehensive PDF document with complete settings, assignments, and filters."
    },
    {
      question: "Is my data secure?",
      answer: "Yes. We use Microsoft OAuth 2.0 for authentication, only request read-only access, and store absolutely no data. All processing happens in your browser session."
    },
    {
      question: "How much does it cost?",
      answer: "It's completely free. No hidden fees, no premium tiers, no credit card required."
    },
    {
      question: "Why does Defender flag 'Suspicious application consent for offline access'?",
      answer: "This is a common alert when an app requests the standard 'offline_access' permission from Microsoft identity (used to refresh tokens without repeatedly prompting you). It does NOT grant extra data access beyond your approved read-only scopes, and we use only delegated permissions (no application permissions). Tokens are kept in your browser session, and we do not store tenant data. An admin can pre-consent the app to reduce such alerts."
    }
  ];

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
  }), [faqs]);

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
          // eslint-disable-next-line @typescript-eslint/naming-convention
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
        {/* HowTo Structured Data */}
        <script
          type="application/ld+json"
          // eslint-disable-next-line @typescript-eslint/naming-convention
          dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
        />
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 flex items-center">
          {/* Geometric Pattern Overlay */}
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:50px_50px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent" />
          
          <div className="relative container mx-auto px-4 sm:px-6 lg:px-8 py-12">
            <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center max-w-7xl mx-auto">
              {/* Left Column - Content */}
              <div className="text-left">

                {/* Main Headline */}
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white mb-6 tracking-tight leading-[1.05]">
                  Generate
                  <span className="mx-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300">Intune Documentation</span>
                  in Minutes
                </h1>
                
                {/* Subheadline */}
                <p className="text-lg sm:text-xl lg:text-2xl text-blue-100/90 mb-8 leading-relaxed max-w-2xl">
                  Create audit‑ready PDF reports of your Microsoft Intune policies, settings catalogs, scripts, and assignments — fast, accurate, and secure.
                </p>

                {/* Trust / Value points */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-10 max-w-2xl">
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <CheckCircle className="w-5 h-5 text-emerald-400" />
                    </div>
                    <span className="text-xs font-medium">Free</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <Eye className="w-5 h-5 text-blue-300" />
                    </div>
                    <span className="text-xs font-medium">Read‑only</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <Database className="w-5 h-5 text-purple-300" />
                    </div>
                    <span className="text-xs font-medium">No storage</span>
                  </div>
                  <div className="flex items-center gap-2 text-blue-100">
                    <div className="w-9 h-9 bg-white/10 rounded-lg flex items-center justify-center">
                      <Shield className="w-5 h-5 text-green-300" />
                    </div>
                    <span className="text-xs font-medium">Secure OAuth</span>
                  </div>
                </div>
                
                {/* CTA Section */}
                {!isAuthenticated ? (
                  <div className="flex flex-col items-start gap-3">
                    <button
                      onClick={handleSignIn}
                      className={`inline-block transition-opacity transform hover:scale-105 cursor-pointer ${signingIn ? "opacity-60 pointer-events-none" : "hover:opacity-90"}`}
                      aria-label="Sign in with Microsoft to Generate Report"
                      aria-disabled={signingIn}
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
                    {signingIn && (
                      <div className="text-sm text-blue-100" aria-live="polite">
                        Opening Microsoft sign-in…
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-blue-100">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                        <Shield className="w-3.5 h-3.5" />
                        OAuth 2.0
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                        Delegated read‑only
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                        No storage
                      </span>
                      <span className="hidden sm:inline text-white/30 mx-1">|</span>
                      <button
                        onClick={() => setShowSecurity(true)}
                        className="underline hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1"
                        aria-label="Learn why sign-in is safe and which permissions are used"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Why it’s safe
                      </button>
                      <span className="hidden sm:inline text-white/30">/</span>
                      <button
                        onClick={() => setShowPermissions(true)}
                        className="underline hover:text-white transition-colors cursor-pointer"
                        aria-label="See the required permissions and why each is needed"
                      >
                        Required permissions
                      </button>
                    </div>
                    <a
                      href="/api/pdf/sample"
                      download="IntuneDocumentation-Sample.pdf"
                      className="text-sm text-blue-100 underline underline-offset-2 hover:text-white transition-colors cursor-pointer"
                      aria-label="Preview a sample PDF"
                    >
                      Preview a sample PDF
                    </a>
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
              
              {/* Right Column - Visual Preview */}
              <div className="flex items-center justify-center">
                <div className="relative w-full max-w-md sm:max-w-lg mx-auto lg:max-w-none animate-float">
                  {/* Decorative blob */}
                  <div className="absolute -inset-10 bg-gradient-to-tr from-cyan-400/20 via-blue-500/10 to-indigo-500/20 blur-3xl rounded-full" aria-hidden="true"></div>
                  {/* PDF Preview Mock */}
                  <div className="relative bg-white rounded-xl shadow-2xl p-6 ring-1 ring-black/5 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                    {/* Window controls */}
                    <div className="flex items-center gap-1.5 absolute top-3 left-4" aria-hidden="true">
                      <span className="w-2.5 h-2.5 rounded-full bg-red-400/90"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/90"></span>
                      <span className="w-2.5 h-2.5 rounded-full bg-green-400/90"></span>
                    </div>
                    <div className="flex items-center justify-between mb-5 pt-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
                          <FileText className="w-4 h-4 text-white" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Intune-Documentation.pdf</div>
                          <div className="text-xs text-gray-500">Generated just now</div>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">247 pages</div>
                    </div>
                    
                    {/* Sample Content */}
                    <div className="space-y-2">
                      <div className="h-2 bg-gray-200 rounded w-full"></div>
                      <div className="h-2 bg-gray-200 rounded w-4/5"></div>
                      <div className="h-2 bg-gray-200 rounded w-3/4"></div>
                      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
                        <div className="text-xs font-semibold text-blue-900 mb-1">✓ 10 Configuration Types</div>
                        <div className="text-xs font-semibold text-blue-900 mb-1">✓ 156 Policies Documented</div>
                        <div className="text-xs font-semibold text-blue-900">✓ Complete Settings Export</div>
                      </div>
                      <div className="h-2 bg-gray-200 rounded w-full mt-4"></div>
                      <div className="h-2 bg-gray-200 rounded w-3/5"></div>
                    </div>
                  </div>
                  
                  {/* Floating badges */}
                  <div className="absolute -top-4 -right-4 bg-green-500 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
                    Audit Ready
                  </div>
                  <div className="absolute -bottom-4 -left-4 bg-blue-500 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
                    Professional Format
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Scroll Indicator */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce" aria-hidden="true">
            <ChevronDown className="w-8 h-8 text-white/50" aria-hidden="true" />
          </div>
        </div>

        {/* How It Works Section */}
        <section className="py-24 bg-white scroll-mt-24" id="how-it-works">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
                Generate Your Report in 3 Steps
              </h2>
              <p className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto">
                Simple, secure, and fast — from sign‑in to download.
              </p>
              
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center card-elevated p-6">
                  <div className="w-12 h-12 mx-auto bg-blue-600/10 text-blue-700 rounded-lg flex items-center justify-center font-bold text-lg mb-4">
                    1
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Connect
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Sign in with Microsoft. We use read‑only Graph permissions and don’t store your data.
                  </p>
                </div>
                
                <div className="text-center card-elevated p-6">
                  <div className="w-12 h-12 mx-auto bg-blue-600/10 text-blue-700 rounded-lg flex items-center justify-center font-bold text-lg mb-4">
                    2
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Select
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Pick configurations by type, search, or select all. Assignments and filters included.
                  </p>
                </div>
                
                <div className="text-center card-elevated p-6">
                  <div className="w-12 h-12 mx-auto bg-green-600/10 text-green-700 rounded-lg flex items-center justify-center font-bold text-lg mb-4">
                    3
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">
                    Export
                  </h3>
                  <p className="text-gray-600 text-sm">
                    Download a professional PDF with full settings, ADMX values, scripts, and group targeting.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features Section */}
        <section className="py-24 bg-gray-50 scroll-mt-24" id="features">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
                Everything You Need for Clear Intune Docs
              </h2>
              
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Comprehensive Export</h3>
                  <p className="text-gray-600 text-sm">
                    Settings Catalog, device configurations, ADMX, baselines, scripts, app configs, Windows Update, and enrollment.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-4">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Audit‑Ready PDFs</h3>
                  <p className="text-gray-600 text-sm">
                    Full settings with ADMX values, assignments, and filters — formatted for reviews and audits.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Zero Data Storage</h3>
                  <p className="text-gray-600 text-sm">
                    We don’t store your tenant data; processing happens during your session.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                    <Eye className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Read‑Only Access</h3>
                  <p className="text-gray-600 text-sm">
                    Uses Microsoft OAuth with read‑only scopes for Intune and Graph resources.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                    <Database className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Assignments & Groups</h3>
                  <p className="text-gray-600 text-sm">
                    Group targets and filters resolved for clarity; optional counts by platform.
                  </p>
                </div>

                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-sky-500 to-cyan-600 rounded-lg flex items-center justify-center mb-4">
                    <Download className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Fast Export</h3>
                  <p className="text-gray-600 text-sm">
                    Optimized paging ensures large tenants export reliably beyond default limits.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-24 bg-white scroll-mt-24" id="faq">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-8 text-center">
                Frequently Asked Questions
              </h2>
              
              <div className="space-y-4">
                {faqs.map((faq, index) => (
                  <div
                    key={index}
                    className="bg-gray-50 rounded-xl border border-gray-200 overflow-hidden"
                  >
                    <button
                      className="w-full px-6 py-4 text-left flex items-center justify-between hover:bg-gray-100 transition-colors cursor-pointer"
                      onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    >
                      <span className="font-semibold text-gray-900">{faq.question}</span>
                      <ChevronDown
                        className={`w-5 h-5 text-gray-500 transition-transform ${
                          expandedFaq === index ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                    {expandedFaq === index && (
                      <div className="px-6 pb-4">
                        <p className="text-gray-600">{faq.answer}</p>
                      </div>
                    )}
                  </div>
                ))}
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
                <div className="flex flex-col items-center gap-3">
                  <button
                    onClick={handleSignIn}
                    className={`inline-block transition-opacity transform hover:scale-105 cursor-pointer ${signingIn ? "opacity-60 pointer-events-none" : "hover:opacity-90"}`}
                    aria-label="Sign in with Microsoft to Generate Report"
                    aria-disabled={signingIn}
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
                  <div className="flex flex-col items-center gap-3 text-xs text-blue-100">
                    <div className="mt-1 flex flex-wrap justify-center items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                        <Shield className="w-3.5 h-3.5" />
                        OAuth 2.0
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                        Delegated read‑only
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
                        No storage
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setShowSecurity(true)}
                        className="underline hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1"
                        aria-label="Learn why sign-in is safe and which permissions are used"
                      >
                        <HelpCircle className="w-3.5 h-3.5" />
                        Why it’s safe
                      </button>
                      <span className="hidden sm:inline text-white/30">/</span>
                      <button
                        onClick={() => setShowPermissions(true)}
                        className="underline hover:text-white transition-colors cursor-pointer"
                        aria-label="See the required permissions and why each is needed"
                      >
                        Required permissions
                      </button>
                    </div>
                    <a
                      href="/api/pdf/sample"
                      download="IntuneDocumentation-Sample.pdf"
                      className="text-blue-100 underline underline-offset-2 hover:text-white transition-colors cursor-pointer"
                      aria-label="Preview a sample PDF"
                    >
                      Preview a sample PDF
                    </a>
                  </div>
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
                <li><span className="font-medium">No data stored:</span> configuration data is fetched during your session to generate PDFs and is not persisted on our servers.</li>
                <li><span className="font-medium">Tokens stay in your browser:</span> access tokens are kept in session storage by MSAL and are not saved server‑side.</li>
                <li><span className="font-medium">Revoke anytime:</span> remove access from Entra ID &gt; Enterprise Applications, or simply sign out.</li>
              </ul>
              <div className="mt-5 flex items-center justify-between">
                <a href="/privacy-policy" className="text-sm text-blue-700 hover:underline">Read the Privacy Policy</a>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowSecurity(false)}
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
