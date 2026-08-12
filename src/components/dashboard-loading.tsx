"use client";

import {
  Check,
  FileText,
  LayoutGrid,
  Lock,
  RefreshCw,
  Terminal,
  XCircle,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface FetchStep {
  name: string;
  status: "pending" | "loading" | "completed" | "error";
  current?: number;
  total?: number;
}

interface DashboardLoadingProps {
  steps: FetchStep[];
  currentStep: number;
}

interface TileGroup {
  label: string;
  icon: LucideIcon;
  match: (name: string) => boolean;
}

const TILE_GROUPS: TileGroup[] = [
  {
    label: "Policies",
    icon: FileText,
    match: (n) =>
      /Settings Catalog|Device Configurations|Administrative Templates|Security Baselines|Compliance|Windows Update|Enrollment/i.test(
        n,
      ),
  },
  {
    label: "Apps",
    icon: LayoutGrid,
    match: (n) => /App Protection|App Configurations/i.test(n),
  },
  {
    label: "Scripts",
    icon: Terminal,
    match: (n) => /Scripts/i.test(n),
  },
  {
    label: "Access",
    icon: Lock,
    match: (n) => /Conditional Access/i.test(n),
  },
];

// A step counts fully when done; a step with live batch counts contributes
// its fraction, so long-running types move the number instead of freezing it.
function stepCredit(step: FetchStep): number {
  if (step.status === "completed") return 1;
  if (step.status === "error") return 1;
  if (step.status === "loading" && step.total && step.total > 0) {
    return Math.min((step.current ?? 0) / step.total, 0.95);
  }
  return 0;
}

export function DashboardLoading({
  steps,
  currentStep,
}: DashboardLoadingProps) {
  const total = Math.max(steps.length, 1);
  const completed = steps.filter(
    (s) => s.status === "completed" || s.status === "error",
  ).length;
  const percent = Math.min(
    99,
    Math.round(
      (steps.reduce((sum, step) => sum + stepCredit(step), 0) / total) * 100,
    ),
  );

  // Prefer the step that reports real batch counts, since it carries the
  // most information; otherwise the first step still in flight.
  const activeStep =
    steps.find((s) => s.status === "loading" && s.total) ??
    steps.find((s) => s.status === "loading") ??
    steps[Math.min(currentStep, steps.length - 1)];

  const groups = TILE_GROUPS.map((group) => {
    const groupSteps = steps.filter((s) => group.match(s.name));
    return {
      ...group,
      total: groupSteps.length,
      done: groupSteps.filter((s) => s.status === "completed").length,
      active: groupSteps.some((s) => s.status === "loading"),
    };
  });

  // Macro stages for the pill timeline: connect, then the tile groups that exist
  const stages = [
    {
      label: "Connect",
      done: steps[0]?.status === "completed",
      active: steps[0]?.status === "loading",
    },
    ...groups
      .filter((g) => g.total > 0)
      .map((g) => ({
        label: g.label,
        done: g.total > 0 && g.done === g.total,
        active: g.active,
      })),
  ];

  return (
    <div className="bg-mint-50 relative min-h-screen overflow-hidden pt-16">
      {/* Decorative background: soft glow and concentric arcs */}
      <div aria-hidden="true">
        <div className="absolute top-24 left-1/2 h-72 w-[560px] -translate-x-1/2 rounded-full bg-teal-100/60 blur-3xl" />
        <div className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full border-[28px] border-teal-100/50" />
        <div className="absolute -bottom-64 -left-48 h-[36rem] w-[36rem] rounded-full border-[28px] border-teal-100/30" />
        <div className="absolute -top-24 -right-32 h-80 w-80 rounded-full border-[24px] border-teal-100/40" />
      </div>

      <div className="relative mx-auto flex max-w-xl flex-col items-center px-5 py-12 sm:py-16">
        {/* Stage pill */}
        <div className="border-petrol-950/6 shadow-card flex items-center gap-4 rounded-full border bg-white py-2.5 pr-5 pl-5">
          <span className="text-petrol-950 text-sm font-semibold">
            Preparing your documentation
          </span>
          <span className="flex items-center" aria-hidden="true">
            {stages.map((stage, i) => (
              <span key={stage.label} className="flex items-center">
                {i > 0 && <span className="bg-petrol-950/15 h-px w-3.5" />}
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full border-2 ${
                    stage.done
                      ? "border-petrol-950 bg-petrol-950"
                      : stage.active
                        ? "border-teal-600"
                        : "border-petrol-950/20"
                  }`}
                  title={stage.label}
                >
                  {stage.done ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-white" />
                  ) : stage.active ? (
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-600" />
                  ) : null}
                </span>
              </span>
            ))}
          </span>
        </div>

        {/* Main card */}
        <div className="border-petrol-950/8 shadow-soft mt-10 w-full rounded-[2rem] border bg-white p-6 sm:p-9">
          {/* Hero: overall progress */}
          <div className="text-center" role="status" aria-live="polite">
            <p className="text-petrol-950 text-6xl font-semibold tracking-[-0.05em] tabular-nums sm:text-7xl">
              {percent}
              <span className="text-petrol-600 ml-1 align-super text-2xl font-semibold sm:text-3xl">
                %
              </span>
            </p>
            <p className="text-petrol-950 mt-3 text-lg font-semibold">
              {activeStep?.name ?? "Connecting to Microsoft Graph"}
            </p>
            <p className="text-petrol-600 mt-1 text-sm">
              {completed} of {total} steps complete
            </p>
          </div>

          {/* Category tiles */}
          <div className="mt-8 grid grid-cols-4 gap-3">
            {groups.map(
              ({ label, icon: Icon, done, total: groupTotal, active }) => (
                <div key={label} className="flex flex-col items-center">
                  <div className="relative w-full">
                    <div
                      className={`flex aspect-square w-full items-center justify-center rounded-2xl border transition-colors ${
                        active
                          ? "border-teal-600/30 bg-teal-50"
                          : groupTotal > 0 && done === groupTotal
                            ? "border-petrol-950/6 bg-surface"
                            : "border-petrol-950/6 bg-surface opacity-70"
                      }`}
                    >
                      <Icon
                        className={`h-6 w-6 ${active ? "text-teal-700" : groupTotal > 0 && done === groupTotal ? "text-petrol-950" : "text-petrol-600/60"}`}
                        strokeWidth={1.7}
                      />
                    </div>
                    {groupTotal > 0 && (
                      <span
                        className={`absolute -bottom-2.5 left-1/2 flex -translate-x-1/2 items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${
                          done === groupTotal
                            ? "border-teal-600/30 bg-teal-50 text-teal-700"
                            : "border-petrol-950/10 text-petrol-700 bg-white"
                        }`}
                      >
                        {done === groupTotal ? (
                          <Check className="h-3 w-3" strokeWidth={3} />
                        ) : (
                          `${done}/${groupTotal}`
                        )}
                      </span>
                    )}
                  </div>
                  <span className="text-petrol-600 mt-5 text-[10px] font-semibold tracking-[0.08em] uppercase">
                    {label}
                  </span>
                </div>
              ),
            )}
          </div>

          {/* Step list */}
          <div className="mt-8">
            <p className="text-petrol-950 text-sm font-semibold">
              Every configuration type, tracked
            </p>
            <p className="text-petrol-600 mt-1 text-xs leading-5">
              We fetch complete settings, assignments, and filters directly from
              Microsoft Graph. Nothing is stored on our servers.
            </p>
            <ul className="mt-4 space-y-1">
              {steps.map((step) => (
                <li
                  key={step.name}
                  className={`relative flex min-h-9 items-center gap-3 overflow-hidden rounded-xl px-3 py-1.5 ${
                    step.status === "loading" ? "bg-teal-50" : ""
                  }`}
                >
                  {step.status === "loading" &&
                    typeof step.total === "number" &&
                    step.total > 0 && (
                      <span
                        className="absolute inset-x-0 bottom-0 h-0.5 bg-teal-600/15"
                        aria-hidden="true"
                      >
                        <span
                          className="block h-full bg-teal-600 transition-[width] duration-500"
                          style={{
                            width: `${Math.min(((step.current ?? 0) / step.total) * 100, 100)}%`,
                          }}
                        />
                      </span>
                    )}
                  {step.status === "completed" ? (
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white">
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                  ) : step.status === "loading" ? (
                    <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-teal-700" />
                  ) : step.status === "error" ? (
                    <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                  ) : (
                    <span className="border-petrol-950/20 h-4 w-4 shrink-0 rounded-full border-2" />
                  )}
                  <span
                    className={`flex-1 text-xs sm:text-sm ${
                      step.status === "pending"
                        ? "text-petrol-600/70"
                        : "text-petrol-800"
                    } ${step.status === "loading" ? "font-semibold" : ""}`}
                  >
                    {step.name.replace(/^Fetching /, "")}
                  </span>
                  <span className="text-petrol-600 shrink-0 text-[10px] font-semibold tracking-[0.08em] uppercase">
                    {step.status === "completed"
                      ? "Done"
                      : step.status === "loading"
                        ? "Fetching"
                        : step.status === "error"
                          ? "Failed"
                          : "Queued"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-petrol-600 mt-6 text-center text-xs leading-5">
          This usually takes under a minute, depending on the size of your
          tenant.
        </p>
      </div>
    </div>
  );
}
