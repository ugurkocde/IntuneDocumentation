"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

// Inline code value with a copy button, for values admins paste into the
// Entra admin center. Long values that must stay fully visible, such as
// license keys, set wrap instead of truncating.
export function CopyValue({
  value,
  wrap = false,
}: {
  value: string;
  wrap?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be blocked; the value stays selectable.
    }
  };

  return (
    <span className="border-petrol-950/10 bg-mint-50 inline-flex max-w-full items-center gap-1 rounded-lg border py-0.5 pr-0.5 pl-2.5 align-middle">
      <code
        className={`text-petrol-950 font-mono text-[13px] select-all ${wrap ? "break-all" : "truncate"}`}
      >
        {value}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label={copied ? `Copied ${value}` : `Copy ${value}`}
        className="text-petrol-600 hover:text-petrol-950 inline-flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-teal-700" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </span>
  );
}
