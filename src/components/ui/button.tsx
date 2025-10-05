import { type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "~/lib/utils";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  progress?: number;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  progress = 0,
  className,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const baseStyles = "inline-flex items-center justify-center font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2 cursor-pointer relative overflow-hidden";

  const variants = {
    primary: "bg-slate-900 text-white hover:bg-slate-800 focus:ring-slate-500 shadow-sm hover:shadow-md",
    secondary: "bg-white text-slate-900 border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 focus:ring-slate-500",
    ghost: "text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus:ring-slate-500",
    danger: "bg-red-600 text-white hover:bg-red-700 focus:ring-red-500 shadow-sm hover:shadow-md"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm rounded-md gap-1.5",
    md: "px-5 py-2.5 text-sm rounded-lg gap-2",
    lg: "px-6 py-3 text-base rounded-lg gap-2.5"
  };

  return (
    <button
      className={cn(
        baseStyles,
        variants[variant],
        sizes[size],
        (loading || disabled) && "cursor-not-allowed",
        loading && "text-white",
        "whitespace-nowrap",
        className
      )}
      disabled={loading || disabled}
      {...props}
    >
      {loading && (
        <>
          <div
            className="absolute left-0 top-0 h-full bg-green-500 transition-all duration-300 ease-out overflow-hidden"
            style={{
              width: `${progress}%`,
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent animate-shimmer-loading" />
          </div>
        </>
      )}
      <span className="relative z-10 inline-flex items-center gap-2">{children}</span>
    </button>
  );
}