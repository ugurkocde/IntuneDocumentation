"use client";

import { useEffect, useState } from "react";

export function HeroExportCounter() {
  const [exportCount, setExportCount] = useState<number | null>(null);

  useEffect(() => {
    // Fetch the export count
    fetch("/api/stats/exports")
      .then((res) => res.json())
      .then((data) => {
        setExportCount(data.export_count ?? 0);
      })
      .catch((error) => {
        console.error("Failed to fetch export count:", error);
        setExportCount(0);
      });
  }, []);

  if (exportCount === null) {
    return (
      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 animate-pulse">
        <span className="inline-block w-24 h-3 rounded bg-blue-200/20" />
      </div>
    );
  }

  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm border border-white/20 animate-in fade-in slide-in-from-top-2 duration-700"
      aria-live="polite"
    >
      <span className="text-[10px] sm:text-xs text-blue-200/90">
        <span className="hidden sm:inline">Total Documentation </span>
        Exports:
      </span>
      <span className="text-xs sm:text-sm font-semibold text-white">{exportCount.toLocaleString()}</span>
    </div>
  );
}
