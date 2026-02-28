"use client";

import { useState, useEffect, useRef } from "react";
import { ArrowUp } from "lucide-react";

export function BackToTopButton() {
  const [showBackToTop, setShowBackToTop] = useState(false);
  const rafId = useRef(0);

  useEffect(() => {
    const onScroll = () => {
      cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setShowBackToTop(window.scrollY > 600);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(rafId.current);
    };
  }, []);

  return (
    <button
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className={`fixed bottom-6 right-6 z-40 p-3 bg-slate-900 text-white rounded-full shadow-lg hover:bg-slate-800 transition-all cursor-pointer ${
        showBackToTop ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      aria-label="Back to top"
    >
      <ArrowUp className="w-5 h-5" />
    </button>
  );
}
