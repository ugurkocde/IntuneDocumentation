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
        setMauCount(-1);
      });
  }, []);

  if (mauCount === null) {
    return (
      <div className="inline-flex min-h-8 animate-pulse items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 py-1.5">
        <span className="inline-block h-3 w-20 rounded bg-teal-100" />
      </div>
    );
  }

  if (mauCount < 10) {
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-top-2 inline-flex min-h-8 items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-2.5 py-1.5 duration-700 sm:px-3">
      <span className="text-petrol-600 text-[11px] sm:text-xs">
        <span className="hidden sm:inline">PDFs generated</span>
        <span className="sm:hidden">PDFs</span> this month:
      </span>
      <span className="text-petrol-950 text-xs font-semibold sm:text-sm">
        {mauCount.toLocaleString()}
      </span>
    </div>
  );
}
