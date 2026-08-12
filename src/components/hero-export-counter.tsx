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
        setExportCount(-1);
      });
  }, []);

  if (exportCount === null) {
    return (
      <div className="inline-flex min-h-8 animate-pulse items-center gap-1.5 rounded-full border border-teal-100 bg-white px-3 py-1.5 shadow-sm">
        <span className="inline-block h-3 w-24 rounded bg-teal-100" />
      </div>
    );
  }

  if (exportCount <= 0) {
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-2 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-teal-100 bg-white px-2.5 py-1.5 shadow-sm duration-700 sm:px-3">
      <span className="text-petrol-600 text-[11px] sm:text-xs">
        <span className="hidden sm:inline">Total docs</span>
        <span className="sm:hidden">Docs</span> exported:
      </span>
      <span className="text-petrol-950 text-xs font-semibold sm:text-sm">
        {exportCount.toLocaleString()}
      </span>
    </div>
  );
}
