"use client";

import { useEffect, useState } from "react";

export function HeroMauCounter() {
  const [mauCount, setMauCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch the MAU count
    fetch("/api/stats/mau")
      .then((res) => res.json())
      .then((data) => {
        setMauCount(data.mau_count ?? 0);
      })
      .catch((error) => {
        console.error("Failed to fetch MAU count:", error);
        setMauCount(0);
      });
  }, []);

  if (mauCount === null) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 animate-pulse">
        <span className="inline-block w-20 h-3 rounded bg-blue-200/20" />
      </div>
    );
  }

  // Don't display if count is below threshold
  if (mauCount < 10) {
    return null;
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 animate-in fade-in slide-in-from-top-2 duration-700"
      aria-live="polite"
    >
      <span className="text-[10px] sm:text-xs text-blue-200/90">
        <span className="hidden sm:inline">IT Professionals </span>
        This Month:
      </span>
      <span className="text-xs sm:text-sm font-semibold text-white">
        {mauCount.toLocaleString()}
      </span>
    </div>
  );
}
