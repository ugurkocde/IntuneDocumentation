import { Check, Copy } from "lucide-react";
import { useClipboard } from "../../hooks/use-clipboard";

export function CopyButton({
  value,
  label = "Copy",
  showLabel = false,
}: {
  value: string;
  label?: string;
  showLabel?: boolean;
}) {
  const { copied, copy } = useClipboard();
  return (
    <button
      type="button"
      onClick={() => void copy(value)}
      aria-label={copied ? "Copied" : label}
      title={copied ? "Copied" : label}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
        showLabel ? "min-h-8 px-2.5" : "h-8 w-8"
      } ${copied ? "bg-teal-50 text-teal-700" : "text-petrol-600 hover:bg-mint-100 hover:text-petrol-950"}`}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
      ) : (
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      )}
      {showLabel && <span>{copied ? "Copied" : label}</span>}
      <span className="sr-only" aria-live="polite">
        {copied ? "Copied to clipboard" : ""}
      </span>
    </button>
  );
}

export function CopyField({ value, label }: { value: string; label: string }) {
  return (
    <div className="border-petrol-950/8 bg-surface flex min-h-11 items-center gap-2 rounded-xl border py-1 pr-1.5 pl-3.5">
      <code className="text-petrol-950 selectable min-w-0 flex-1 truncate font-mono text-[13px]">
        {value}
      </code>
      <CopyButton value={value} label={label} showLabel />
    </div>
  );
}
