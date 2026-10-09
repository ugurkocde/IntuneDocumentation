'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface CopyValueProps {
  /** The exact text that is shown and copied. */
  value: string;
}

export function CopyValue({ value }: CopyValueProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <span className="not-prose inline-flex max-w-full items-center gap-0.5 rounded-md border bg-fd-muted py-px pr-0.5 pl-1.5 align-middle font-mono text-[0.85em] text-fd-foreground">
      <code className="break-all">{value}</code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(value).then(() => setCopied(true));
        }}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        title={copied ? 'Copied' : 'Copy'}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        {copied ? <Check className="size-3.5 text-fd-primary" /> : <Copy className="size-3.5" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : ''}
      </span>
    </span>
  );
}
