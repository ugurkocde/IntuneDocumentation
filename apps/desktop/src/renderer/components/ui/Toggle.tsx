import { useId, type ReactNode } from "react";

export function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={`border-petrol-950/8 bg-mint-50 flex items-center justify-between gap-4 rounded-2xl border p-4 transition-colors focus-within:ring-2 focus-within:ring-teal-600/30 ${disabled ? "cursor-not-allowed opacity-60" : "hover:border-petrol-950/12 cursor-pointer"}`}
    >
      <span className="min-w-0">
        <span className="text-petrol-950 block text-sm font-semibold">{label}</span>
        {description && (
          <span className="text-petrol-600 mt-1 block text-[13px] leading-5">{description}</span>
        )}
      </span>
      <span className="relative inline-flex shrink-0 items-center">
        <input
          id={id}
          type="checkbox"
          role="switch"
          checked={checked}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          className="peer sr-only"
        />
        <span className="bg-petrol-950/15 h-7 w-12 rounded-full transition-colors peer-checked:bg-teal-600" />
        <span className="pointer-events-none absolute left-1 h-5 w-5 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" />
      </span>
    </label>
  );
}
