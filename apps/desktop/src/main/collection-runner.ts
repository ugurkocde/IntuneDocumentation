import { SignInUnreachableError } from "./auth-errors";
import { ScheduleSkip, SKIP_RETRY_MS } from "./scheduler";

// The one collection that may run at a time, manual or scheduled. A manual
// collection replaces an earlier manual one, as before. A scheduled run never
// replaces work the user started, and a manual collection is refused while a
// scheduled run is active, so neither fails the other. A scheduled run that
// is cancelled or does not start counts as skipped, not as failed.
//
// The sign-in and entitlement checks before a collection count as running
// work, so a sign-in cannot switch the account while they are pending, and a
// cancel (sign-out, changed settings) stops them. After each check, and right
// before collecting, the signed in account must still be the one checked:
// the collector reads tokens from whoever is signed in at that moment.

export const SCHEDULED_RUN_ACTIVE =
  "A scheduled collection is running. Wait until it finishes, or cancel it and collect again.";

// A skipped run is tried again after SKIP_RETRY_MS.
export const SCHEDULED_SIGN_IN_UNREACHABLE = `Could not reach Microsoft sign-in. The scheduled collection tries again in ${SKIP_RETRY_MS / 60_000} minutes.`;

export interface CollectionRunnerDeps<Summary, Progress> {
  // The signed in account with a usable token; throws otherwise.
  requireOwner(): Promise<string>;
  // The entitlement of the signed in tenant; throws otherwise.
  requireLicense(): Promise<void>;
  // The account known now, as requireOwner names it (account and tenant), or
  // null.
  owner(): string | null;
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

function startedMeanwhile(work: string): ScheduleSkip {
  return new ScheduleSkip(`${work.charAt(0).toUpperCase()}${work.slice(1)} started meanwhile.`);
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

  // The sign-in and entitlement of the account to collect are checked here.
  async manual(progress: Progress): Promise<Summary> {
    if (this.active?.scheduled) throw new Error(SCHEDULED_RUN_ACTIVE);
    this.cancel("Replaced by a new collection.");
    return this.run(this.begin(false), progress);
  }

  // One scheduled run. Sign in and entitlement are checked at the start;
  // when either fails, or work started meanwhile, the run is skipped.
  async scheduled(): Promise<void> {
    const busy = this.busy();
    if (busy) throw startedMeanwhile(busy);
    const entry = this.begin(true);
    try {
      await this.run(entry, null);
    } catch (error) {
      if (entry.controller.signal.aborted) {
        throw new ScheduleSkip(entry.reason ?? "The collection was cancelled.");
      }
      throw error;
    }
  }

  private begin(scheduled: boolean): Active {
    const entry: Active = { controller: new AbortController(), scheduled, reason: null };
    this.active = entry;
    return entry;
  }

  // The checks before collecting. Throws a skip for a scheduled run.
  private async preflight(entry: Active): Promise<string> {
    const stillCurrent = (owner: string) => {
      if (entry.controller.signal.aborted) {
        throw new Error(entry.reason ?? "The collection was cancelled.");
      }
      if (this.deps.owner() !== owner || !this.deps.signedIn()) {
        throw new Error("The signed in account changed before the collection started.");
      }
    };
    try {
      const owner = await this.deps.requireOwner();
      stillCurrent(owner);
      await this.deps.requireLicense();
      stillCurrent(owner);
      return owner;
    } catch (error) {
      if (!entry.scheduled || entry.controller.signal.aborted) throw error;
      throw new ScheduleSkip(
        error instanceof SignInUnreachableError ? SCHEDULED_SIGN_IN_UNREACHABLE : message(error),
      );
    }
  }

  // Null progress marks a scheduled run.
  private async run(entry: Active, progress: Progress | null): Promise<Summary> {
    const scheduled = entry.scheduled;
    try {
      const owner = await this.preflight(entry);
      // Work other than a collection does not wait for the checks.
      const other = this.deps.otherWork();
      if (scheduled && other) throw startedMeanwhile(other);
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
    } finally {
      if (this.active === entry) this.active = null;
    }
  }
}
