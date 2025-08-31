"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { loginRequest } from "~/lib/msal-config";
import { useUserProfile } from "~/hooks/use-user-profile";
import { Shield, FileText, Lock, CheckCircle, ChevronRight, ChevronDown, Heart, Clock, Database, Eye } from "lucide-react";
import { useState } from "react";

export default function HomePage() {
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const isAuthenticated = accounts.length > 0;

  const handleSignIn = async () => {
    try {
      await instance.loginPopup(loginRequest);
      router.push("/dashboard");
    } catch (error) {
      console.error("Login failed:", error);
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
    }
  ];

  return (
    <>
      {/* Hero Section - Full Screen */}
      <main>
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-900 via-blue-900 to-blue-800 flex items-center">
          {/* Geometric Pattern Overlay */}
          <div className="absolute inset-0 bg-grid-white/[0.02] bg-[size:50px_50px]" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/50 to-transparent" />
          
          <div className="relative container mx-auto px-4 py-12">
            <div className="grid lg:grid-cols-2 gap-12 items-center max-w-7xl mx-auto">
              {/* Left Column - Content */}
              <div className="text-left">

                {/* Main Headline */}
                <h1 className="text-5xl lg:text-6xl font-bold text-white mb-6 tracking-tight">
                  Generate Professional
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400"> Intune Documentation</span>
                  <span className="text-white"> in Minutes</span>
                </h1>
                
                {/* Subheadline */}
                <p className="text-xl lg:text-2xl text-blue-100 mb-8 leading-relaxed">
                  One click to export all policies, settings, and assignments into a clean, audit-ready PDF document.
                </p>

                {/* Trust Indicators - More Prominent */}
                <div className="grid grid-cols-3 gap-4 mb-10 max-w-lg">
                  <div className="flex items-center gap-2 text-blue-200">
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                      <Shield className="w-5 h-5 text-green-400" />
                    </div>
                    <div className="text-sm">
                      <div className="font-semibold">Secure</div>
                      <div className="text-xs opacity-80">OAuth 2.0</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-blue-200">
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                      <Eye className="w-5 h-5 text-blue-400" />
                    </div>
                    <div className="text-sm">
                      <div className="font-semibold">Read-Only</div>
                      <div className="text-xs opacity-80">View Access</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-blue-200">
                    <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                      <Database className="w-5 h-5 text-purple-400" />
                    </div>
                    <div className="text-sm">
                      <div className="font-semibold">No Storage</div>
                      <div className="text-xs opacity-80">100% Private</div>
                    </div>
                  </div>
                </div>
                
                {/* CTA Section */}
                {!isAuthenticated ? (
                  <div className="flex flex-col items-start gap-4">
                    <div className="flex items-center gap-3">
                      <button
                        onClick={handleSignIn}
                        className="inline-block hover:opacity-90 transition-opacity transform hover:scale-105 cursor-pointer"
                        aria-label="Sign in with Microsoft to Generate Report"
                      >
                        <img 
                          src="/sign-in-light-mode.svg" 
                          alt="Sign in with Microsoft"
                          width={215}
                          height={41}
                        />
                      </button>
                      <div className="flex items-center gap-2 text-sm text-blue-300">
                        <Clock className="w-4 h-4" />
                        <span>Takes 2-3 minutes</span>
                      </div>
                    </div>
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
                <div className="relative w-full">
                  {/* PDF Preview Mock */}
                  <div className="bg-white rounded-xl shadow-2xl p-6 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                    <div className="flex items-center justify-between mb-4">
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
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
            <ChevronDown className="w-8 h-8 text-white/50" />
          </div>
        </div>

        {/* How It Works Section */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-4 text-center">
                How It Works
              </h2>
              <p className="text-lg text-gray-600 text-center mb-12 max-w-2xl mx-auto">
                Three simple steps to comprehensive Intune documentation
              </p>
              
              <div className="grid md:grid-cols-3 gap-8">
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 mx-auto">
                    1
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Connect
                  </h3>
                  <p className="text-gray-600">
                    Sign in with your Microsoft account. We&apos;ll fetch all your Intune configurations via Graph API.
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 mx-auto">
                    2
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Select
                  </h3>
                  <p className="text-gray-600">
                    Choose which policies to include or select all. Filter by type or search for specific configurations.
                  </p>
                </div>
                
                <div className="text-center">
                  <div className="w-16 h-16 bg-gradient-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center text-white font-bold text-xl mb-4 mx-auto">
                    3
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Export
                  </h3>
                  <p className="text-gray-600">
                    Generate a professional PDF with all settings, assignments, and compliance rules included.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Key Features Section */}
        <section className="py-20 bg-gray-50">
          <div className="container mx-auto px-4">
            <div className="max-w-5xl mx-auto">
              <h2 className="text-3xl font-bold text-gray-900 mb-12 text-center">
                What Makes It Different
              </h2>
              
              <div className="grid md:grid-cols-3 gap-8">
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center mb-4">
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Complete Coverage</h3>
                  <p className="text-gray-600">
                    Fetches all 10 Intune configuration types including policies, profiles, scripts, and baselines with full details.
                  </p>
                </div>
                
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center mb-4">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Detailed Export</h3>
                  <p className="text-gray-600">
                    Includes nested settings, ADMX values, script content, group assignments, and filters - nothing is missed.
                  </p>
                </div>
                
                <div className="bg-white rounded-xl p-6 shadow-md">
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-4">
                    <Shield className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-2">Zero Data Storage</h3>
                  <p className="text-gray-600">
                    All processing happens in your browser. We never store your configurations or any data from your tenant.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-20 bg-white">
          <div className="container mx-auto px-4">
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

        {/* Footer */}
        <footer className="py-8 bg-gray-900">
          <div className="container mx-auto px-4">
            <div className="text-center">
              <a
                href="https://www.linkedin.com/in/ugurkocde/"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <span>Made with</span>
                <Heart className="w-4 h-4 text-red-500 fill-red-500" />
                <span>by Ugur</span>
              </a>
            </div>
          </div>
        </footer>
      </main>
    </>
  );
}