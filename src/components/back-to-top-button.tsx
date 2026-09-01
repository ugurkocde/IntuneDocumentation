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
      className={`back-to-top-button fixed right-6 bottom-6 z-40 cursor-pointer rounded-full bg-slate-900 p-3 text-white shadow-lg transition-all hover:bg-slate-800 ${
        showBackToTop
          ? "translate-y-0 opacity-100"
          : "pointer-events-none translate-y-4 opacity-0"
      }`}
      aria-label="Back to top"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
