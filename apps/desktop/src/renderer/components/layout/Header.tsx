import type { ReactNode } from "react";

export function Header({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 flex-1 basis-80">
        {eyebrow && (
          <p className="text-petrol-600 mb-1.5 text-[10px] font-bold tracking-[0.14em] uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-petrol-950 text-2xl font-semibold tracking-[-0.035em] xl:text-[28px]">
          {title}
        </h1>
        {description && (
          <p className="text-petrol-600 mt-1.5 max-w-2xl text-sm leading-6">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
    </header>
  );
}

export function formatAgo(iso: string, now: number): string {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes === 1) return "1 minute ago";
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
  return new Date(iso).toLocaleString();
}
