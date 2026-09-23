import { AlertCircle, AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; icon: string; title: string; body: string; Icon: typeof Info }> = {
  info: { box: "border-teal-600/20 bg-teal-50", icon: "text-teal-700", title: "text-petrol-950", body: "text-petrol-700", Icon: Info },
  success: { box: "border-teal-600/20 bg-teal-50", icon: "text-teal-700", title: "text-petrol-950", body: "text-petrol-700", Icon: CheckCircle2 },
  warning: { box: "border-amber-200/80 bg-amber-50/70", icon: "text-amber-700", title: "text-amber-950", body: "text-amber-900/85", Icon: AlertTriangle },
  danger: { box: "border-red-200 bg-red-50", icon: "text-red-600", title: "text-red-900", body: "text-red-800", Icon: AlertCircle },
};

export function Alert({
  tone = "info",
  title,
  children,
  action,
  className = "",
}: {
  tone?: Tone;
  title?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const style = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded-2xl border p-4 ${style.box} ${className}`}
    >
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white ${style.icon}`}>
        <style.Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        {title && <p className={`text-sm font-semibold ${style.title}`}>{title}</p>}
        {children && (
          <div className={`text-[13px] leading-5 ${style.body} ${title ? "mt-1" : ""}`}>{children}</div>
        )}
        {action && <div className="mt-3 flex flex-wrap gap-2">{action}</div>}
      </div>
    </div>
  );
}
