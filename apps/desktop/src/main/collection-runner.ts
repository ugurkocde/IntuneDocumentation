import { SignInUnreachableError } from "./auth";
import { ScheduleSkip, SKIP_RETRY_MS } from "./scheduler";

// The one collection that may run at a time, manual or scheduled. A manual
// collection replaces an earlier manual one, as before. A scheduled run never
// replaces work the user started, and a manual collection is refused while a
// scheduled run is active, so neither fails the other. A scheduled run that
// is cancelled or does not start counts as skipped, not as failed.

export const SCHEDULED_RUN_ACTIVE =
  "A scheduled collection is running. Wait until it finishes, or cancel it and collect again.";

// A skipped run is tried again after SKIP_RETRY_MS.
export const SCHEDULED_SIGN_IN_UNREACHABLE = `Could not reach Microsoft sign-in. The scheduled collection tries again in ${SKIP_RETRY_MS / 60_000} minutes.`;

export interface CollectionRunnerDeps<Summary, Progress> {
  // The signed in account with a usable token; throws otherwise.
  requireOwner(): Promise<string>;
  // The entitlement of the signed in tenant; throws otherwise.
  requireLicense(): Promise<void>;
  // Work other than a collection, such as "an export", or null.
  otherWork(): string | null;
  // Progress is null for scheduled runs, which report no progress.
  collect(
    owner: string,
    signal: AbortSignal,
    progress: Progress | null,
  ): Promise<Summary>;
  // After a collection finished, for example to save a snapshot. A
  // scheduled run waits for it and fails when it rejects; a manual run does
  // not wait.
  collected(owner: string, scheduled: boolean): Promise<void>;
  // Why history cannot be used, or null.
  historyBlocker(): string | null;
  signedIn(): boolean;
  // An account is known, even if its sign-in expired.
  hasAccount(): boolean;
}

interface Active {
  controller: AbortController;
  scheduled: boolean;
  reason: string | null;
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class CollectionRunner<Summary, Progress> {
  private active: Active | null = null;

  constructor(private readonly deps: CollectionRunnerDeps<Summary, Progress>) {}

  current(): "manual" | "scheduled" | null {
    return this.active ? (this.active.scheduled ? "scheduled" : "manual") : null;
  }

  // Work that is running, or null. A sign-in waits for it and a scheduled
  // run is skipped.
  busy(): string | null {
    if (this.active) return this.active.scheduled ? "a scheduled collection" : "a collection";
    return this.deps.otherWork();
  }

  // Why scheduled collection cannot run now, or null.
  blocker(): string | null {
    const reason = this.deps.historyBlocker();
    if (reason) return reason;
    if (this.deps.signedIn()) return null;
    return this.deps.hasAccount()
      ? "The sign-in expired. Sign in again to resume scheduled collection."
      : "Sign in to run scheduled collections.";
  }

  cancel(reason = "The collection was cancelled."): void {
    if (!this.active) return;
    this.active.reason = reason;
    this.active.controller.abort();
    this.active = null;
  }

  async manual(owner: string, progress: Progress): Promise<Summary> {
    if (this.active?.scheduled) throw new Error(SCHEDULED_RUN_ACTIVE);
    return this.run(owner, progress);
  }

  // One scheduled run. Sign in and entitlement are checked at the start;
  // when either fails, or work started meanwhile, the run is skipped.
  async scheduled(): Promise<void> {
    let owner: string;
    try {
      owner = await this.deps.requireOwner();
      await this.deps.requireLicense();
    } catch (error) {
      throw new ScheduleSkip(
        error instanceof SignInUnreachableError ? SCHEDULED_SIGN_IN_UNREACHABLE : message(error),
      );
    }
    const busy = this.busy();
    if (busy) {
      throw new ScheduleSkip(`${busy.charAt(0).toUpperCase()}${busy.slice(1)} started meanwhile.`);
    }
    await this.run(owner, null);
  }

  // Null progress marks a scheduled run.
  private async run(owner: string, progress: Progress | null): Promise<Summary> {
    const scheduled = progress === null;
    this.cancel("Replaced by a new collection.");
    const entry: Active = { controller: new AbortController(), scheduled, reason: null };
    this.active = entry;
    try {
      const summary = await this.deps.collect(owner, entry.controller.signal, progress);
      if (!entry.controller.signal.aborted) {
        const saved = this.deps.collected(owner, scheduled);
        if (scheduled) {
          await saved.catch((error: unknown) => {
            throw new Error(`Snapshot not saved. ${message(error)}`);
          });
        } else {
          // Reported by the callback itself.
          void saved.catch(() => undefined);
        }
      }
      return summary;
    } catch (error) {
      if (scheduled && entry.controller.signal.aborted) {
        throw new ScheduleSkip(entry.reason ?? "The collection was cancelled.");
      }
      throw error;
    } finally {
      if (this.active === entry) this.active = null;
    }
  }
}
