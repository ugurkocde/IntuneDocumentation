"use client";

import { RefreshCw, Search, X } from "lucide-react";

interface DashboardHeaderProps {
  title: string;
  searchQuery: string;
  lastFetched: Date | null;
  refreshing?: boolean;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
}

export function DashboardHeader({
  title,
  searchQuery,
  lastFetched,
  refreshing = false,
  onSearchChange,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-center">
      <div className="min-w-52 shrink-0">
        <h1 className="text-petrol-950 text-2xl font-semibold tracking-[-0.035em] sm:text-[28px]">
          {title}
        </h1>
      </div>

      <div className="flex flex-1 flex-col gap-3 sm:flex-row sm:items-center xl:justify-end">
        <div className="relative w-full sm:max-w-md xl:max-w-xl">
          <Search
            className="text-petrol-600 pointer-events-none absolute top-1/2 left-4 h-4 w-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <label htmlFor="dashboard-search" className="sr-only">
            Search configurations by name or description
          </label>
          <input
            id="dashboard-search"
            type="search"
            name="dashboard-search"
            autoComplete="off"
            placeholder="Search configurations…"
            value={searchQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            className="border-petrol-950/8 text-petrol-950 placeholder:text-petrol-600/70 min-h-11 w-full rounded-xl border bg-white py-2.5 pr-11 pl-11 text-sm shadow-[0_8px_24px_-22px_rgba(8,47,54,0.45)] transition-[border-color,box-shadow] focus-visible:border-teal-600/40 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange("")}
              className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 absolute top-1/2 right-0 flex h-11 w-11 -translate-y-1/2 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-start">
          <span className="text-petrol-600 text-xs whitespace-nowrap tabular-nums">
            {lastFetched
              ? `Updated ${lastFetched.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "Not updated yet"}
          </span>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="border-petrol-950/8 text-petrol-700 hover:bg-mint-50 hover:text-petrol-950 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
}
