import { Fragment } from "react";
import { checkValueEntries, displayCheckValue } from "../../../../../../src/lib/compliance/check-results";
import { DisclosureSummary } from "../ui/DisclosureSummary";

// Composite values read as a short label and value list; the raw value stays
// one click away for evidence purposes.
export function CheckValue({ value, fallback }: { value: string | null; fallback: string }) {
  if (value === null) return <span>{fallback}</span>;
  const entries = checkValueEntries(value);
  if (!entries) return <span className="break-all">{displayCheckValue(value)}</span>;
  return (
    <div className="min-w-0">
      <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1">
        {entries.map((entry, index) => (
          <Fragment key={`${entry.label}-${index}`}>
            <dt className="text-petrol-600">{entry.label}</dt>
            <dd className="text-petrol-950 font-medium break-words">{entry.value}</dd>
          </Fragment>
        ))}
      </dl>
      <details className="mt-2">
        <DisclosureSummary className="text-petrol-600 text-[11px] font-semibold hover:text-teal-700">
          Show raw
        </DisclosureSummary>
        <pre className="bg-mint-50 text-petrol-800 mt-1.5 rounded-lg p-2 font-mono text-[10px] leading-4 break-all whitespace-pre-wrap">
          {value}
        </pre>
      </details>
    </div>
  );
}
