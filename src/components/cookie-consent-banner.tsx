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
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ${
        isVisible ? "translate-y-0 opacity-100" : "translate-y-full opacity-0"
      }`}
    >
      <div className="bg-white border-t border-slate-200 shadow-2xl">
        <div className="container mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
            {/* Icon and Message */}
            <div className="flex items-start gap-2 sm:gap-3 flex-1">
              <Cookie className="w-4 h-4 sm:w-5 sm:h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs sm:text-sm text-slate-900 font-medium mb-0.5 sm:mb-1">
                  We value your privacy
                </p>
                <p className="text-[11px] sm:text-xs text-slate-600 leading-relaxed">
                  We use privacy-friendly analytics (Plausible) to understand how you use our service.
                  No cookies are stored, and no personal data is tracked.
                  <Link href="/privacy-policy" className="text-blue-600 hover:text-blue-700 underline ml-1">
                    Learn more
                  </Link>
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                onClick={handleDecline}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-lg transition-colors"
              >
                Decline
              </button>
              <button
                onClick={handleAccept}
                className="flex-1 sm:flex-none px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors shadow-sm"
              >
                Accept
              </button>
              <button
                onClick={handleDismiss}
                className="p-1.5 sm:p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-50 transition-colors"
                aria-label="Dismiss"
              >
                <X className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
