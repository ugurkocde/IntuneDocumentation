import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

const focusRing =
  "focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none";

export const buttonStyles = {
  // teal-700 keeps white label text above the 4.5:1 AA contrast ratio
  primary: `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-petrol-800 focus-visible:ring-offset-2 ${focusRing}`,
  secondary: `inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-petrol-950/12 px-5 py-2.5 text-sm font-semibold text-petrol-800 transition-colors hover:border-teal-600/30 hover:bg-white ${focusRing}`,
  secondaryInverted:
    "inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/8 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none",
  textLink: `cursor-pointer font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2 hover:text-petrol-950 ${focusRing}`,
};

const tones = {
  mint: "bg-mint-50",
  white: "bg-white",
  dark: "bg-petrol-950 text-white",
};

export function Section({
  id,
  tone,
  className,
  children,
}: {
  id?: string;
  tone: keyof typeof tones;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-24 py-24 sm:py-28", tones[tone], className)}
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8 lg:px-10">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lead,
  inverted = false,
  centered = false,
}: {
  eyebrow: string;
  title: string;
  lead?: ReactNode;
  inverted?: boolean;
  centered?: boolean;
}) {
  return (
    <div className={cn("max-w-2xl", centered && "mx-auto text-center")}>
      <p
        className={cn(
          "mb-4 text-[11px] font-bold tracking-[0.2em] uppercase",
          inverted ? "text-teal-500" : "text-teal-700",
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          "text-3xl leading-tight font-semibold tracking-[-0.035em] sm:text-4xl",
          inverted ? "text-white" : "text-petrol-950",
        )}
      >
        {title}
      </h2>
      {lead && (
        <p
          className={cn(
            "mt-4 text-base leading-7",
            inverted ? "text-white/70" : "text-petrol-600",
          )}
        >
          {lead}
        </p>
      )}
    </div>
  );
}
