import { Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode, Ref } from "react";

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger" | "dangerOutline";
type Size = "sm" | "md";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-petrol-950 text-white shadow-sm hover:bg-petrol-800 hover:shadow-md disabled:hover:bg-petrol-950 disabled:hover:shadow-sm",
  accent:
    "bg-teal-600 text-white shadow-sm hover:bg-teal-700 hover:shadow-md disabled:hover:bg-teal-600",
  secondary:
    "border border-petrol-950/12 bg-white text-petrol-950 hover:border-petrol-950/20 hover:bg-mint-50 disabled:hover:bg-white",
  ghost: "text-petrol-700 hover:bg-mint-50 hover:text-petrol-950 disabled:hover:bg-transparent",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700 disabled:hover:bg-red-600",
  dangerOutline:
    "border border-red-200 bg-white text-red-700 hover:border-red-300 hover:bg-red-50 disabled:hover:bg-white",
};

const SIZES: Record<Size, string> = {
  sm: "min-h-9 gap-1.5 px-3.5 text-[13px]",
  md: "min-h-11 gap-2 px-5 text-sm",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
  trailingIcon?: LucideIcon;
  // Shown as a tooltip while the button is disabled.
  disabledReason?: string | null;
  children?: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  icon: Icon,
  trailingIcon: TrailingIcon,
  disabledReason,
  disabled,
  className = "",
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const isDisabled = Boolean(disabled || loading);
  const iconClass = size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const button = (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={`inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl font-semibold whitespace-nowrap transition-[background-color,border-color,box-shadow,color] focus-visible:ring-2 focus-visible:ring-teal-600/40 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className={`${iconClass} animate-spin`} aria-hidden="true" />
      ) : (
        Icon && <Icon className={iconClass} aria-hidden="true" strokeWidth={2} />
      )}
      {children}
      {TrailingIcon && !loading && (
        <TrailingIcon className={iconClass} aria-hidden="true" strokeWidth={2} />
      )}
    </button>
  );
  if (isDisabled && !loading && disabledReason) {
    return (
      <span className="inline-flex cursor-not-allowed" title={disabledReason}>
        {button}
      </span>
    );
  }
  return button;
}

export function IconButton({
  icon: Icon,
  label,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={`text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 ${className}`}
      {...rest}
    >
      <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
    </button>
  );
}
