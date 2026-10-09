'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';

export interface CopyValueProps {
  /** The exact text that is shown and copied. */
  value: string;
}

export function CopyValue({ value }: CopyValueProps) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copied = status === 'copied';

  useEffect(() => {
    if (status === 'idle') return;
    const timer = setTimeout(() => setStatus('idle'), status === 'failed' ? 3000 : 1500);
    return () => clearTimeout(timer);
  }, [status]);

  return (
    <span className="not-prose inline-flex max-w-full items-center gap-0.5 rounded-md border bg-fd-muted py-px pr-0.5 pl-1.5 align-middle font-mono text-[0.85em] text-fd-foreground">
      <code className="break-all">{value}</code>
      <button
        type="button"
        onClick={() => {
          // Clipboard access can be denied; then the value stays selectable for a manual copy.
          navigator.clipboard.writeText(value).then(
            () => setStatus('copied'),
            () => setStatus('failed'),
          );
        }}
        aria-label={copied ? 'Copied' : `Copy ${value}`}
        title={copied ? 'Copied' : status === 'failed' ? 'Copy failed, select the text to copy it' : 'Copy'}
        className="inline-flex size-6 shrink-0 items-center justify-center rounded text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        {copied ? <Check className="size-3.5 text-fd-primary" /> : <Copy className="size-3.5" />}
      </button>
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied to clipboard' : status === 'failed' ? 'Copy failed. Select the text to copy it.' : ''}
      </span>
    </span>
  );
}
