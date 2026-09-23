import { useId, type InputHTMLAttributes, type ReactNode } from "react";

export function Field({
  label,
  hint,
  error,
  mono = true,
  className = "",
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  mono?: boolean;
  label: string;
  hint?: ReactNode;
  error?: string | null;
}) {
  const id = useId();
  const described = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="text-petrol-800 mb-1.5 block text-[13px] font-semibold">
        {label}
      </label>
      <input
        id={id}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={error ? true : undefined}
        aria-describedby={described}
        className={`text-petrol-950 placeholder:text-petrol-600/60 min-h-11 w-full rounded-xl border bg-white px-3.5 ${mono ? "font-mono text-[13px]" : "text-sm"} transition-[border-color,box-shadow] focus-visible:ring-2 focus-visible:outline-none disabled:opacity-60 ${
          error
            ? "border-red-300 focus-visible:border-red-400 focus-visible:ring-red-500/20"
            : "border-petrol-950/8 focus-visible:border-teal-600/40 focus-visible:ring-teal-600/20"
        }`}
        {...rest}
      />
      {error ? (
        <p id={`${id}-error`} className="mt-1.5 text-xs text-red-700">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-petrol-600 mt-1.5 text-xs leading-5">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
