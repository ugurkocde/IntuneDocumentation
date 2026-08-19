"use client";

import { useState, useEffect, useRef } from "react";
import { X, Cookie } from "lucide-react";
import Link from "next/link";

const BANNER_SPACER_CLASS = "cookie-banner-spacer";

export function CookieConsentBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const bannerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem("cookie-consent");
    if (!consent) {
      // Small delay for animation
      setTimeout(() => {
        setShowBanner(true);
        setTimeout(() => setIsVisible(true), 100);
      }, 1000);
    }
  }, []);

  // Reserve space at the bottom of the page so the fixed banner doesn't overlap content
  useEffect(() => {
    if (!showBanner || !bannerRef.current) return;

    const spacer = document.createElement("div");
    spacer.className = BANNER_SPACER_CLASS;
    const bannerHeight = bannerRef.current.getBoundingClientRect().height;
    spacer.style.height = `${bannerHeight}px`;
    document.body.appendChild(spacer);

    return () => {
      spacer.remove();
    };
  }, [showBanner]);

  const handleAccept = () => {
    localStorage.setItem("cookie-consent", "accepted");
    handleClose();
  };

  const handleDecline = () => {
    localStorage.setItem("cookie-consent", "declined");
    handleClose();
  };

  const handleDismiss = () => {
    localStorage.setItem("cookie-consent", "dismissed");
    handleClose();
  };

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(() => setShowBanner(false), 300);
  };

  if (!showBanner) return null;

  return (
    <div
      ref={bannerRef}
      className={`fixed right-0 bottom-0 left-0 z-50 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
    >
      <div className="border-t border-slate-200 bg-white shadow-2xl">
        <div className="container mx-auto px-3 py-3 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
            {/* Icon and Message */}
            <div className="flex flex-1 items-start gap-2 sm:gap-3">
              <Cookie className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-600 sm:h-5 sm:w-5" />
              <div>
                <p className="mb-0.5 text-xs font-medium text-slate-900 sm:mb-1 sm:text-sm">
                  We value your privacy
                </p>
                <p className="text-[11px] leading-relaxed text-slate-600 sm:text-xs">
                  We use privacy-friendly analytics (Plausible) to understand
                  how you use our service. No cookies are stored, and no
                  personal data is tracked.
                  <Link
                    href="/privacy-policy"
                    className="ml-1 text-blue-600 underline hover:text-blue-700"
                  >
                    Learn more
                  </Link>
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex w-full items-center gap-2 sm:w-auto">
              <button
                onClick={handleDecline}
                className="min-h-10 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-800 transition-colors hover:border-slate-400 hover:bg-slate-50 sm:flex-none sm:px-4 sm:text-sm"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="min-h-10 flex-1 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm transition-colors hover:bg-blue-700 sm:flex-none sm:px-4 sm:text-sm"
              >
                Accept
              </button>
              <button
                onClick={handleDismiss}
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-50 hover:text-slate-600 sm:p-2"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
