import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`border-petrol-950/6 shadow-card flex flex-col items-center rounded-2xl border bg-white text-center ${compact ? "px-6 py-10" : "px-8 py-14"}`}
    >
      {Icon && (
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
          <Icon className="h-6 w-6" strokeWidth={1.8} aria-hidden="true" />
        </span>
      )}
      <p className="text-petrol-950 text-base font-semibold">{title}</p>
      {description && (
        <p className="text-petrol-600 mt-1.5 max-w-md text-sm leading-6">{description}</p>
      )}
      {action && <div className="mt-5 flex flex-wrap justify-center gap-3">{action}</div>}
    </div>
  );
}
