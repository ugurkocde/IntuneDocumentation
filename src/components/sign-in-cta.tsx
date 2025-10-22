"use client";

import { Shield, HelpCircle } from "lucide-react";

interface SignInCTAProps {
  signingIn: boolean;
  onSignIn: () => void;
  onShowSecurity: () => void;
  onShowPermissions: () => void;
  showSampleLink?: boolean;
  variant?: "hero" | "bottom";
}

export function SignInCTA({
  signingIn,
  onSignIn,
  onShowSecurity,
  onShowPermissions,
  showSampleLink = true,
  variant = "hero",
}: SignInCTAProps) {
  return (
    <div className="flex flex-col items-start gap-3">
      <button
        onClick={onSignIn}
        disabled={signingIn}
        className={`inline-block transition-all transform hover:scale-105 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100 ${
          signingIn ? "opacity-60 pointer-events-none" : "hover:opacity-90"
        }`}
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
        <div className="flex items-center gap-2 text-sm text-blue-100" aria-live="polite">
          <svg
            className="animate-spin h-4 w-4 text-blue-100"
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
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span>Opening Microsoft sign-in…</span>
        </div>
      )}
      <div className={`${variant === "hero" ? "mt-2" : "mt-1"} flex flex-wrap ${variant === "bottom" ? "justify-center" : "items-center"} gap-2 text-xs text-blue-100`}>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
          <Shield className="w-3.5 h-3.5" />
          OAuth 2.0
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
          Delegated read‑only
        </span>
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/10 border border-white/20">
          No persistent storage
        </span>
        <span className="hidden sm:inline text-white/30 mx-1">|</span>
        <button
          onClick={onShowSecurity}
          className="underline hover:text-white transition-colors cursor-pointer inline-flex items-center gap-1"
          aria-label="Learn why sign-in is safe and which permissions are used"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          Why it&apos;s safe
        </button>
        <span className="hidden sm:inline text-white/30">/</span>
        <button
          onClick={onShowPermissions}
          className="underline hover:text-white transition-colors cursor-pointer"
          aria-label="See the required permissions and why each is needed"
        >
          Required permissions
        </button>
      </div>
      {showSampleLink && (
        <a
          href="/api/pdf/sample"
          download="IntuneDocumentation-Sample.pdf"
          className="text-sm text-blue-100 underline underline-offset-2 hover:text-white transition-colors cursor-pointer"
          aria-label="Preview a sample PDF"
        >
          Preview a sample PDF
        </a>
      )}
    </div>
  );
}
