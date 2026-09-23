import type { ReactNode } from "react";

export type BadgeVariant = "default" | "info" | "success" | "warning" | "danger" | "solid";

const STYLES: Record<BadgeVariant, string> = {
  default: "bg-mint-100 text-petrol-700",
  info: "bg-teal-50 text-teal-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-800",
  danger: "bg-red-50 text-red-700",
  solid: "bg-teal-600 text-white",
};

export function Badge({
  children,
  variant = "default",
  className = "",
  title,
}: {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] leading-4 font-bold whitespace-nowrap ${STYLES[variant]} ${className}`}
    >
      {children}
    </span>
  );
}
