import { describe, expect, it, vi } from "vitest";
import { SignInUnreachableError } from "./auth-errors";
import {
  CollectionRunner,
  SCHEDULED_RUN_ACTIVE,
  SCHEDULED_SIGN_IN_UNREACHABLE,
} from "./collection-runner";
import { ScheduleSkip } from "./scheduler";

type Progress = (step: string) => void;

function setup() {
  const env = {
    owner: "owner-1" as string | null,
    // Microsoft sign-in did not answer, for example right after wake.
    unreachable: false,
    licensed: true,
    // A pending entitlement check, released by the test.
    license: null as Promise<void> | null,
    otherWork: null as string | null,
    historyBlocker: null as string | null,
    signedIn: true,
    hasAccount: true,
    // Pending collections, resolved or rejected by the test.
    pending: [] as Array<{
      owner: string;
      signal: AbortSignal;
      progress: Progress | null;
      resolve: (value: string) => void;
      reject: (error: Error) => void;
    }>,
  };
  const collected = vi.fn(async (_owner: string, _scheduled: boolean) => undefined);
  const runner = new CollectionRunner<string, Progress>({
    requireOwner: async () => {
      if (env.unreachable) throw new SignInUnreachableError();
      if (!env.owner) throw new Error("Sign in before continuing.");
      return env.owner;
    },
    requireLicense: async () => {
      if (env.license) await env.license;
      if (!env.licensed) throw new Error("The license is not valid for this tenant.");
    },
    owner: () => env.owner,
    otherWork: () => env.otherWork,
    historyBlocker: () => env.historyBlocker,
    signedIn: () => env.signedIn,
    hasAccount: () => env.hasAccount,
    collect: (owner, signal, progress) =>
      new Promise<string>((resolve, reject) => {
        const entry = { owner, signal, progress, resolve, reject };
        // The real collector rejects once its signal aborts.
        signal.addEventListener("abort", () => reject(new Error("The operation was aborted.")));
        env.pending.push(entry);
      }),
    collected,
  });
  return { env, runner, collected };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

describe("CollectionRunner", () => {
  it("does not collect when the entitlement check fails, and reports a skip", async () => {
    const { env, runner, collected } = setup();
    env.licensed = false;
    await expect(runner.scheduled()).rejects.toEqual(
      new ScheduleSkip("The license is not valid for this tenant."),
    );
    expect(env.pending).toHaveLength(0);
    expect(collected).not.toHaveBeenCalled();
  });

  it("does not collect when the sign-in cannot be refreshed", async () => {
    const { env, runner } = setup();
    env.owner = null;
    await expect(runner.scheduled()).rejects.toBeInstanceOf(ScheduleSkip);
    expect(env.pending).toHaveLength(0);
  });

  it("says sign-in could not be reached, not to sign in, when the network is down", async () => {
    const { env, runner } = setup();
    env.unreachable = true;
    await expect(runner.scheduled()).rejects.toEqual(new ScheduleSkip(SCHEDULED_SIGN_IN_UNREACHABLE));
    expect(SCHEDULED_SIGN_IN_UNREACHABLE).toBe(
      "Could not reach Microsoft sign-in. The scheduled collection tries again in 15 minutes.",
    );
    expect(env.pending).toHaveLength(0);
  });

  it("skips while an export runs and never cancels it", async () => {
    const { env, runner } = setup();
    env.otherWork = "an export";
    await expect(runner.scheduled()).rejects.toEqual(new ScheduleSkip("An export started meanwhile."));
    expect(env.pending).toHaveLength(0);
    expect(runner.busy()).toBe("an export");
  });

  it("skips while a manual collection runs and leaves it running", async () => {
    const { env, runner } = setup();
    const manual = runner.manual(() => undefined);
    await flush();
    await expect(runner.scheduled()).rejects.toEqual(new ScheduleSkip("A collection started meanwhile."));
    expect(env.pending).toHaveLength(1);
    expect(env.pending[0]!.signal.aborted).toBe(false);
    env.pending[0]!.resolve("manual summary");
    await expect(manual).resolves.toBe("manual summary");
  });

  it("refuses a manual collection during a scheduled run without failing either", async () => {
    const { env, runner, collected } = setup();
    const scheduled = runner.scheduled();
    await flush();
    expect(runner.current()).toBe("scheduled");
    expect(runner.busy()).toBe("a scheduled collection");
    await expect(runner.manual(() => undefined)).rejects.toThrow(SCHEDULED_RUN_ACTIVE);
    expect(env.pending).toHaveLength(1);
    expect(env.pending[0]!.signal.aborted).toBe(false);
    env.pending[0]!.resolve("scheduled summary");
    await expect(scheduled).resolves.toBeUndefined();
    expect(collected).toHaveBeenCalledWith("owner-1", true);
    expect(runner.current()).toBeNull();
    // Afterwards a manual collection works again.
    const manual = runner.manual(() => undefined);
    await flush();
    env.pending[1]!.resolve("next");
    await expect(manual).resolves.toBe("next");
  });

  it("records a cancelled scheduled run as a skip with the reason", async () => {
    const { env, runner, collected } = setup();
    const scheduled = runner.scheduled();
    await flush();
    runner.cancel("Cancelled in the app.");
    await expect(scheduled).rejects.toEqual(new ScheduleSkip("Cancelled in the app."));
    expect(collected).not.toHaveBeenCalled();
    expect(runner.current()).toBeNull();
    expect(env.pending[0]!.signal.aborted).toBe(true);
  });

  it("lets a new manual collection replace an earlier one, as before", async () => {
    const { env, runner, collected } = setup();
    const first = runner.manual(() => undefined);
    await flush();
    // Attached before the second run aborts the first, so the rejection is
    // never unhandled.
    const firstAborted = expect(first).rejects.toThrow("aborted");
    const second = runner.manual(() => undefined);
    await flush();
    await firstAborted;
    env.pending[1]!.resolve("second");
    await expect(second).resolves.toBe("second");
    expect(collected).toHaveBeenCalledTimes(1);
  });

  it("passes progress for manual runs only", async () => {
    const { env, runner } = setup();
    const progress = vi.fn();
    void runner.manual(progress).catch(() => undefined);
    await flush();
    expect(env.pending[0]!.progress).toBe(progress);
    runner.cancel();
    void runner.scheduled().catch(() => undefined);
    await flush();
    expect(env.pending[1]!.progress).toBeNull();
    runner.cancel();
  });

  it("explains why scheduled runs cannot happen", () => {
    const { env, runner } = setup();
    expect(runner.blocker()).toBeNull();
    env.signedIn = false;
    expect(runner.blocker()).toBe("The sign-in expired. Sign in again to resume scheduled collection.");
    env.hasAccount = false;
    expect(runner.blocker()).toBe("Sign in to run scheduled collections.");
    env.historyBlocker = "Secure storage is not available on this computer.";
    expect(runner.blocker()).toBe("Secure storage is not available on this computer.");
  });

  it("waits for the snapshot of a scheduled run and fails when it is not saved", async () => {
    const { env, runner, collected } = setup();
    let release!: () => void;
    collected.mockImplementationOnce(
      () =>
        new Promise<undefined>((_resolve, reject) => {
          release = () => reject(new Error("No space left on the disk."));
        }),
    );
    const scheduled = runner.scheduled();
    await flush();
    env.pending[0]!.resolve("summary");
    await flush();
    // Still running while the snapshot is written.
    expect(runner.busy()).toBe("a scheduled collection");
    release();
    await expect(scheduled).rejects.toThrow("Snapshot not saved. No space left on the disk.");
    await expect(scheduled).rejects.not.toBeInstanceOf(ScheduleSkip);
    expect(runner.current()).toBeNull();
  });

  it("does not wait for or fail on the snapshot of a manual run", async () => {
    const { env, runner, collected } = setup();
    collected.mockRejectedValueOnce(new Error("No space left on the disk."));
    const manual = runner.manual(() => undefined);
    await flush();
    env.pending[0]!.resolve("summary");
    await expect(manual).resolves.toBe("summary");
    expect(collected).toHaveBeenCalledWith("owner-1", false);
    await flush();
  });

  it("reports a failed scheduled collection as an error, not a skip", async () => {
    const { env, runner } = setup();
    const scheduled = runner.scheduled();
    await flush();
    env.pending[0]!.reject(new Error("Graph returned 503."));
    await expect(scheduled).rejects.toThrow("Graph returned 503.");
    await expect(scheduled).rejects.not.toBeInstanceOf(ScheduleSkip);
  });

  // A sign-in that switches the account while the entitlement of the first
  // one is still being checked must not let the run collect the second
  // account under the first one's name and entitlement.
  it("counts the checks as running work and skips when the account changed during them", async () => {
    const { env, runner, collected } = setup();
    let release!: () => void;
    env.license = new Promise<void>((resolve) => (release = resolve));
    const scheduled = runner.scheduled();
    await flush();
    // A sign-in started now is refused: the checks count as running work.
    expect(runner.busy()).toBe("a scheduled collection");
    await expect(runner.manual(() => undefined)).rejects.toThrow(SCHEDULED_RUN_ACTIVE);
    // A switch that happens anyway, for example a sign-in that was already
    // open in the browser.
    env.owner = "owner-2";
    release();
    await expect(scheduled).rejects.toEqual(
      new ScheduleSkip("The signed in account changed before the collection started."),
    );
    expect(env.pending).toHaveLength(0);
    expect(collected).not.toHaveBeenCalled();
    expect(runner.busy()).toBeNull();
  });

  it("does not collect a manual run when the account changed during the checks", async () => {
    const { env, runner } = setup();
    let release!: () => void;
    env.license = new Promise<void>((resolve) => (release = resolve));
    const manual = runner.manual(() => undefined);
    await flush();
    expect(runner.busy()).toBe("a collection");
    env.owner = "owner-2";
    release();
    await expect(manual).rejects.toThrow(
      "The signed in account changed before the collection started.",
    );
    expect(env.pending).toHaveLength(0);
  });

  it("stops at the checks when cancelled, for example by a sign-out", async () => {
    const { env, runner, collected } = setup();
    let release!: () => void;
    env.license = new Promise<void>((resolve) => (release = resolve));
    const scheduled = runner.scheduled();
    await flush();
    runner.cancel("Stopped because the account or the settings changed.");
    expect(runner.busy()).toBeNull();
    release();
    await expect(scheduled).rejects.toEqual(
      new ScheduleSkip("Stopped because the account or the settings changed."),
    );
    expect(env.pending).toHaveLength(0);
    expect(collected).not.toHaveBeenCalled();
  });

  it("skips a scheduled run when an export started during the checks", async () => {
    const { env, runner } = setup();
    let release!: () => void;
    env.license = new Promise<void>((resolve) => (release = resolve));
    const scheduled = runner.scheduled();
    await flush();
    env.otherWork = "an export";
    release();
    await expect(scheduled).rejects.toEqual(new ScheduleSkip("An export started meanwhile."));
    expect(env.pending).toHaveLength(0);
  });
});
