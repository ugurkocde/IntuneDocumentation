import type { HTMLAttributes, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

export function Card({
  className = "",
  padded = true,
  children,
  ...rest
}: HTMLAttributes<HTMLElement> & { padded?: boolean }) {
  return (
    <section
      className={`border-petrol-950/6 shadow-card rounded-2xl border bg-white ${padded ? "p-5 sm:p-6" : "overflow-hidden"} ${className}`}
      {...rest}
    >
      {children}
    </section>
  );
}

export function CardHeader({
  icon: Icon,
  eyebrow,
  title,
  description,
  action,
  tone = "teal",
}: {
  icon?: LucideIcon;
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  tone?: "teal" | "amber" | "red";
}) {
  const chip =
    tone === "amber"
      ? "bg-amber-50 text-amber-700"
      : tone === "red"
        ? "bg-red-50 text-red-600"
        : "bg-teal-50 text-teal-700";
  return (
    <div className="flex items-start gap-4">
      {Icon && (
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${chip}`}>
          <Icon className="h-5 w-5" strokeWidth={1.8} aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        )}
        <h2 className={`text-petrol-950 text-base font-semibold tracking-[-0.01em] ${eyebrow ? "mt-1" : ""}`}>
          {title}
        </h2>
        {description && (
          <p className="text-petrol-600 mt-1.5 max-w-2xl text-sm leading-6">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
