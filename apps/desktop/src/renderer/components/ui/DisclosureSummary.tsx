import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

// A <summary> with a rotating chevron in place of the default marker. The
// rotation keys off the nearest <details>, so nested disclosures stay
// independent.
export function DisclosureSummary({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <summary
      className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none [&::-webkit-details-marker]:hidden ${className}`}
    >
      <ChevronRight
        className="h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none [details[open]>summary>&]:rotate-90"
        aria-hidden="true"
      />
      {children}
    </summary>
  );
}
