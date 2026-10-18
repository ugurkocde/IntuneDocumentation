import type { ScheduleHours, ScheduleStatus } from "../shared/ipc-types";

// Scheduled collection while the app is open. One timer, one run at a time.
// The next run is due one interval after the latest snapshot of the signed in
// tenant (so a manual collection counts) or after the last attempt. A run
// that is overdue, for example after the computer slept, runs once soon and
// then the interval starts again; missed runs are never caught up one by one.
// A run due while other work runs is skipped, recorded, and tried again a
// little later.

const HOUR_MS = 60 * 60_000;

const SCHEDULE_HOURS: readonly ScheduleHours[] = [0, 6, 12, 24];

export function isScheduleHours(value: unknown): value is ScheduleHours {
  return SCHEDULE_HOURS.includes(value as ScheduleHours);
}
// An overdue run waits this long after start, resume or sign in, so the
// network and the token refresh can settle.
export const OVERDUE_DELAY_MS = 60_000;
// A run skipped because other work was running is tried again after this.
export const SKIP_RETRY_MS = 15 * 60_000;
// The wall clock is checked at least this often, so sleep and clock changes
// never leave a run waiting for a stale timer.
export const MAX_TIMER_MS = HOUR_MS;

export const SCHEDULE_REASONS = {
  historyOff:
    "Keep history on this computer is off. Turn it on to run scheduled collections.",
} as const;

// Thrown by run() when it did not start because other work began meanwhile.
// Recorded as a skipped run, not a failure.
export class ScheduleSkip extends Error {}

export interface SchedulerDeps {
  now?: () => number;
  settings(): Promise<{ scheduleHours: ScheduleHours; keepHistory: boolean }>;
  // Why runs cannot happen now, such as an expired sign-in; null when they can.
  blocker(): string | null;
  // Work that is running, such as "a collection", or null.
  busy(): string | null;
  // Collection time of the latest snapshot of the signed in tenant.
  lastCollectedAt(): Promise<number | null>;
  // Checks the entitlement, then collects and saves a snapshot. Throws when
  // the run failed.
  run(): Promise<void>;
  onStatus(status: ScheduleStatus): void;
}

function iso(time: number | null): string | null {
  return time === null ? null : new Date(time).toISOString();
}

export class CollectionScheduler {
  private readonly deps: SchedulerDeps;
  private readonly now: () => number;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private queue: Promise<void> = Promise.resolve();
  private running = false;
  private stopped = false;
  private hours: ScheduleHours = 0;
  private state: ScheduleStatus["state"] = "off";
  private reason: string | null = null;
  private dueAt: number | null = null;
  // When the current interval was turned on, for a tenant without snapshots.
  private enabledAt: number | null = null;
  private lastAttemptAt: number | null = null;
  // Set after a skipped run: when to try again.
  private retryAt: number | null = null;
  private lastRunAt: number | null = null;
  private lastResult: ScheduleStatus["lastResult"] = null;
  private lastError: string | null = null;
  private lastSkippedAt: number | null = null;
  private lastSkippedReason: string | null = null;

  constructor(deps: SchedulerDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
  }

  status(): ScheduleStatus {
    return {
      hours: this.hours,
      state: this.running ? "running" : this.state,
      reason: this.running ? null : this.reason,
      nextRunAt: this.running || this.state !== "waiting" ? null : iso(this.dueAt),
      lastRunAt: iso(this.lastRunAt),
      lastResult: this.lastResult,
      lastError: this.lastError,
      lastSkippedAt: iso(this.lastSkippedAt),
      lastSkippedReason: this.lastSkippedReason,
    };
  }

  // After start, settings, sign in or out, history changes and resume from
  // sleep. Calls are serialized; the latest state wins.
  refresh(): Promise<void> {
    const next = this.queue.then(() => this.plan());
    this.queue = next.catch(() => undefined);
    return next;
  }

  // Sign out, reset or quit: no timer and no further runs.
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  // Forgets the last results, for example after the account changed.
  reset(): void {
    this.enabledAt = null;
    this.lastAttemptAt = null;
    this.retryAt = null;
    this.lastRunAt = null;
    this.lastResult = null;
    this.lastError = null;
    this.lastSkippedAt = null;
    this.lastSkippedReason = null;
  }

  private clearTimer(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private publish(): void {
    this.deps.onStatus(this.status());
  }

  private async plan(): Promise<void> {
    this.clearTimer();
    if (this.stopped) return;
    const settings = await this.deps.settings();
    const now = this.now();
    if (settings.scheduleHours !== this.hours) {
      this.hours = settings.scheduleHours;
      this.enabledAt = this.hours ? now : null;
    }
    this.dueAt = null;
    if (this.hours === 0) {
      this.state = "off";
      this.reason = null;
    } else if (!settings.keepHistory || this.deps.blocker()) {
      this.state = "paused";
      this.reason = settings.keepHistory ? this.deps.blocker() : SCHEDULE_REASONS.historyOff;
    } else {
      const interval = this.hours * HOUR_MS;
      const last = await this.deps.lastCollectedAt().catch(() => null);
      const base = Math.max(
        last ?? Number.NEGATIVE_INFINITY,
        this.lastAttemptAt ?? Number.NEGATIVE_INFINITY,
      );
      const due = Number.isFinite(base)
        ? base + interval
        : (this.enabledAt ??= now) + interval;
      this.dueAt =
        due > now
          ? due
          : this.retryAt !== null && this.retryAt > now
            ? this.retryAt
            : now + OVERDUE_DELAY_MS;
      this.state = "waiting";
      this.reason = null;
      if (!this.running) this.arm(this.dueAt - now);
    }
    this.publish();
  }

  private arm(delay: number): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, Math.max(0, Math.min(delay, MAX_TIMER_MS)));
  }

  private async tick(): Promise<void> {
    if (this.stopped || this.running) return;
    if (this.dueAt === null || this.now() < this.dueAt) {
      await this.refresh();
      return;
    }
    await this.attempt();
  }

  private async attempt(): Promise<void> {
    // The conditions are checked again right before the run.
    const settings = await this.deps.settings();
    if (
      this.stopped ||
      this.running ||
      settings.scheduleHours === 0 ||
      !settings.keepHistory ||
      this.deps.blocker()
    ) {
      await this.refresh();
      return;
    }
    const busy = this.deps.busy();
    if (busy) {
      this.lastSkippedAt = this.now();
      this.lastSkippedReason = `${busy.charAt(0).toUpperCase()}${busy.slice(1)} was running.`;
      this.retryAt = this.lastSkippedAt + SKIP_RETRY_MS;
      await this.refresh();
      return;
    }
    this.running = true;
    this.publish();
    try {
      await this.deps.run();
      this.lastResult = "collected";
      this.lastError = null;
    } catch (error) {
      if (error instanceof ScheduleSkip) {
        this.running = false;
        this.lastSkippedAt = this.now();
        this.lastSkippedReason = error.message;
        this.retryAt = this.lastSkippedAt + SKIP_RETRY_MS;
        await this.refresh();
        return;
      }
      this.lastResult = "failed";
      this.lastError = error instanceof Error ? error.message : String(error);
    } finally {
      this.running = false;
    }
    this.lastRunAt = this.now();
    this.lastAttemptAt = this.lastRunAt;
    this.retryAt = null;
    await this.refresh();
  }
}
