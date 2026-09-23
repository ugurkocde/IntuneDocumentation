import { Check, Minus } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

// A native checkbox with the app's focus ring and a 36 px hit area. Mixed
// shows the indeterminate state of a "Select all" box.
export function Checkbox({
  checked,
  mixed = false,
  onChange,
  label,
  children,
  className = "",
}: {
  checked: boolean;
  mixed?: boolean;
  onChange: (checked: boolean) => void;
  // Accessible name when no visible text follows the box.
  label?: string;
  children?: ReactNode;
  className?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (input.current) input.current.indeterminate = mixed;
  }, [mixed]);
  const on = checked || mixed;
  return (
    <label className={`group inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-2.5 ${className}`}>
      <span className="relative flex h-9 w-9 items-center justify-center">
        <input
          ref={input}
          type="checkbox"
          checked={checked}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
          className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
        <span
          aria-hidden="true"
          className={`flex h-[18px] w-[18px] items-center justify-center rounded-md border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-teal-600 peer-focus-visible:ring-offset-2 ${
            on
              ? "border-teal-600 bg-teal-600 text-white"
              : "border-petrol-950/25 group-hover:border-petrol-950/45 bg-white"
          }`}
        >
          {mixed ? (
            <Minus className="h-3 w-3" strokeWidth={3.5} />
          ) : checked ? (
            <Check className="h-3 w-3" strokeWidth={3.5} />
          ) : null}
        </span>
      </span>
      {children}
    </label>
  );
}
