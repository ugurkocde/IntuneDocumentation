import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleHours, ScheduleStatus } from "../shared/ipc-types";
import {
  CollectionScheduler,
  MAX_TIMER_MS,
  OVERDUE_DELAY_MS,
  SCHEDULE_REASONS,
  ScheduleSkip,
  SKIP_RETRY_MS,
} from "./scheduler";

const HOUR = 60 * 60_000;
const T0 = Date.UTC(2026, 9, 18, 8, 0, 0);

function setup(options: { hours?: ScheduleHours; keepHistory?: boolean; last?: number | null } = {}) {
  const env = {
    hours: options.hours ?? 6,
    keepHistory: options.keepHistory ?? true,
    blocker: null as string | null,
    busy: null as string | null,
    last: options.last === undefined ? T0 : options.last,
    runs: 0,
    fail: null as string | null,
    skip: null as string | null,
    // Resolves the run in progress when set.
    hold: null as null | { release: () => void },
    statuses: [] as ScheduleStatus[],
  };
  const scheduler = new CollectionScheduler({
    settings: async () => ({ scheduleHours: env.hours, keepHistory: env.keepHistory }),
    blocker: () => env.blocker,
    busy: () => env.busy,
    lastCollectedAt: async () => env.last,
    run: async () => {
      env.runs += 1;
      if (env.hold) {
        await new Promise<void>((resolve) => {
          env.hold = { release: resolve };
        });
      }
      if (env.skip) throw new ScheduleSkip(env.skip);
      if (env.fail) throw new Error(env.fail);
      env.last = Date.now();
    },
    onStatus: (status) => env.statuses.push(status),
  });
  return { env, scheduler, latest: () => env.statuses.at(-1)! };
}

describe("CollectionScheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("is off by default and never runs", async () => {
    const { env, scheduler, latest } = setup({ hours: 0 });
    await scheduler.refresh();
    expect(latest()).toMatchObject({ hours: 0, state: "off", nextRunAt: null });
    await vi.advanceTimersByTimeAsync(48 * HOUR);
    expect(env.runs).toBe(0);
  });

  it("runs one interval after the latest snapshot, then every interval", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    await scheduler.refresh();
    expect(latest()).toMatchObject({ state: "waiting", nextRunAt: new Date(T0 + 6 * HOUR).toISOString() });
    await vi.advanceTimersByTimeAsync(6 * HOUR - 1000);
    expect(env.runs).toBe(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(env.runs).toBe(1);
    expect(latest()).toMatchObject({ state: "waiting", lastResult: "collected", lastError: null });
    await vi.advanceTimersByTimeAsync(6 * HOUR);
    expect(env.runs).toBe(2);
  });

  it("counts a manual collection as the latest run", async () => {
    const { env, scheduler } = setup({ hours: 12 });
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(10 * HOUR);
    env.last = Date.now();
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(3 * HOUR);
    expect(env.runs).toBe(0);
    await vi.advanceTimersByTimeAsync(9 * HOUR + 1000);
    expect(env.runs).toBe(1);
  });

  it("starts from the time it was turned on when the tenant has no snapshot", async () => {
    const { env, scheduler, latest } = setup({ hours: 24, last: null });
    await scheduler.refresh();
    expect(latest().nextRunAt).toBe(new Date(T0 + 24 * HOUR).toISOString());
    await vi.advanceTimersByTimeAsync(24 * HOUR + 1000);
    expect(env.runs).toBe(1);
  });

  it("requires history and pauses with the reason", async () => {
    const { env, scheduler, latest } = setup({ keepHistory: false });
    await scheduler.refresh();
    expect(latest()).toMatchObject({ state: "paused", reason: SCHEDULE_REASONS.historyOff, nextRunAt: null });
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(env.runs).toBe(0);
  });

  it("pauses visibly when the sign-in expires and resumes after sign in", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    await scheduler.refresh();
    env.blocker = "Sign in again to resume scheduled collection.";
    await scheduler.refresh();
    expect(latest()).toMatchObject({ state: "paused", reason: env.blocker });
    await vi.advanceTimersByTimeAsync(12 * HOUR);
    expect(env.runs).toBe(0);
    env.blocker = null;
    await scheduler.refresh();
    // Overdue now: one run after the short delay, not one per missed slot.
    expect(latest().nextRunAt).toBe(new Date(Date.now() + OVERDUE_DELAY_MS).toISOString());
    await vi.advanceTimersByTimeAsync(OVERDUE_DELAY_MS + 1000);
    expect(env.runs).toBe(1);
    await vi.advanceTimersByTimeAsync(5 * HOUR);
    expect(env.runs).toBe(1);
  });

  it("checks the blocker again right before a run", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(6 * HOUR - 10);
    env.blocker = "Sign in again to resume scheduled collection.";
    await vi.advanceTimersByTimeAsync(1000);
    expect(env.runs).toBe(0);
    expect(latest().state).toBe("paused");
  });

  it("skips without throwing while other work runs, records why and retries", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    await scheduler.refresh();
    env.busy = "an export";
    await vi.advanceTimersByTimeAsync(6 * HOUR + 1000);
    expect(env.runs).toBe(0);
    expect(latest()).toMatchObject({
      state: "waiting",
      lastSkippedReason: "An export was running.",
      lastResult: null,
    });
    expect(latest().lastSkippedAt).not.toBeNull();
    env.busy = null;
    await vi.advanceTimersByTimeAsync(SKIP_RETRY_MS + 1000);
    expect(env.runs).toBe(1);
  });

  it("runs once after sleep when overdue", async () => {
    const { env, scheduler } = setup({ hours: 6 });
    await scheduler.refresh();
    // The machine sleeps for two days: timers do not fire, the clock moves.
    vi.setSystemTime(T0 + 48 * HOUR);
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(OVERDUE_DELAY_MS + 1000);
    expect(env.runs).toBe(1);
    await vi.advanceTimersByTimeAsync(6 * HOUR - OVERDUE_DELAY_MS - 5000);
    expect(env.runs).toBe(1);
  });

  it("notices a clock jump through the hourly check without a resume event", async () => {
    const { env, scheduler } = setup({ hours: 24 });
    await scheduler.refresh();
    vi.setSystemTime(T0 + 30 * HOUR);
    await vi.advanceTimersByTimeAsync(MAX_TIMER_MS + 1000);
    await vi.advanceTimersByTimeAsync(OVERDUE_DELAY_MS + 1000);
    expect(env.runs).toBe(1);
  });

  it("never stacks runs", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    env.hold = { release: () => undefined };
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(6 * HOUR + 1000);
    expect(env.runs).toBe(1);
    expect(latest().state).toBe("running");
    // Resume, settings and sign-in events while it runs start nothing new.
    await scheduler.refresh();
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(12 * HOUR);
    expect(env.runs).toBe(1);
    expect(latest().state).toBe("running");
    const hold = env.hold!;
    env.hold = null;
    hold.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(latest()).toMatchObject({ state: "waiting", lastResult: "collected" });
  });

  it("records a failed run, for example a lapsed license, and tries again next interval", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    env.fail = "The license is not valid for this tenant.";
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(6 * HOUR + 1000);
    expect(env.runs).toBe(1);
    expect(latest()).toMatchObject({
      state: "waiting",
      lastResult: "failed",
      lastError: "The license is not valid for this tenant.",
    });
    env.fail = null;
    await vi.advanceTimersByTimeAsync(6 * HOUR);
    expect(env.runs).toBe(2);
    expect(latest()).toMatchObject({ lastResult: "collected", lastError: null });
  });

  it("stops for good", async () => {
    const { env, scheduler } = setup({ hours: 6 });
    await scheduler.refresh();
    scheduler.stop();
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(env.runs).toBe(0);
  });

  it("turning the schedule off clears the timer", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    await scheduler.refresh();
    env.hours = 0;
    await scheduler.refresh();
    expect(latest().state).toBe("off");
    await vi.advanceTimersByTimeAsync(24 * HOUR);
    expect(env.runs).toBe(0);
  });

  it("records a run that did not start because work began meanwhile as skipped", async () => {
    const { env, scheduler, latest } = setup({ hours: 6 });
    env.skip = "An export started meanwhile.";
    await scheduler.refresh();
    await vi.advanceTimersByTimeAsync(6 * HOUR + 1000);
    expect(env.runs).toBe(1);
    expect(latest()).toMatchObject({
      state: "waiting",
      lastResult: null,
      lastRunAt: null,
      lastSkippedReason: "An export started meanwhile.",
    });
    env.skip = null;
    await vi.advanceTimersByTimeAsync(SKIP_RETRY_MS + 1000);
    expect(env.runs).toBe(2);
    expect(latest().lastResult).toBe("collected");
  });
});
