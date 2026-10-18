import type { IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import { scopeKeyOf } from "../../../../src/lib/compliance/management/management-summary";
import type { ComplianceAssessment } from "../../../../src/lib/compliance/types";
import {
  projectSnapshot,
  type SnapshotProjection,
  type SnapshotSource,
} from "../../../../src/lib/snapshots/projection";
import {
  capComparison,
  compareSettings,
  createReference,
  parseReference,
  projectionSettings,
  REFERENCE_MAX_BYTES,
  REFERENCE_REJECTION_MESSAGES,
  referenceFileName,
  referenceSettings,
  serializeReference,
  type ReferenceFile,
  type SettingSet,
} from "../../../../src/lib/snapshots/reference";
import type {
  CompareSource,
  CompareTenant,
  CompareView,
  ComplianceFrameworkId,
  ComplianceRequest,
  HistoryStatus,
  ManagementChangesResult,
  PortfolioTenant,
  PortfolioView,
  ReferenceLoadResult,
  ReferenceSummary,
  ScheduleStatus,
} from "../shared/ipc-types";
import { isGuid } from "../shared/validators";
import { parseComplianceRequest, tenantLabelOf } from "./compliance";
import {
  compareProjections,
  historyDiffView,
  managementChanges,
  parseHistoryDiffRequest,
  parseSnapshotId,
  pickPair,
  previousSnapshot,
  type ComparedSnapshots,
} from "./history";
import type { LicenseService } from "./license";
import { isScheduleHours, type CollectionScheduler } from "./scheduler";
import type { AppSettings } from "./settings";
import {
  HistoryUnavailableError,
  MAX_TENANT_LABEL,
  type SnapshotStore,
  type StoredTenant,
} from "./snapshots";

// History, Compare and Portfolio handlers. Every handler checks sign in and
// entitlement here, in main, before it reads anything; Portfolio and the
// comparison with another tenant also require the MSP plan. Decryption,
// diffing and comparison stay in main and the renderer gets capped rows.

type Listener = (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown;

export interface SnapshotInputs {
  collection: SnapshotSource & { collectedAt?: string };
  assessment: ComplianceAssessment;
  groupNames: ReadonlyMap<string, string>;
}

export interface HistoryIpcDeps {
  // Registers a handler behind the trusted sender check.
  handle(channel: string, listener: Listener): void;
  // The signed in account with a usable token; throws otherwise.
  requireOwner(): Promise<string>;
  signedInTenant(): string | null;
  license: Pick<LicenseService, "requireEntitlement" | "requireMspPlan">;
  store: Pick<
    SnapshotStore,
    | "unavailableReason"
    | "list"
    | "read"
    | "delete"
    | "deleteTenant"
    | "tenants"
    | "setLabel"
  >;
  readSettings(): Promise<AppSettings>;
  writeSettings(input: Partial<AppSettings>): Promise<AppSettings>;
  // The owner's current collection with its full scope assessment; throws
  // "Collect tenant data first." without one.
  currentInputs(owner: string): Promise<SnapshotInputs>;
  // Counts the work as running, so a sign-in waits for it.
  track<T>(work: () => Promise<T>): Promise<T>;
  saveFile(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  pickJsonFile(): Promise<string | null>;
  scheduler: Pick<CollectionScheduler, "status" | "refresh">;
  // History of the signed in tenant changed.
  notifyHistoryChanged(): void;
  log(level: "info" | "warn", message: string, data?: Record<string, unknown>): void;
  now?: () => Date;
}

export const NEEDS_REFERENCE = "Load a reference file first.";
const ACCOUNT_CHANGED =
  "The signed in account changed while the file was opened. Open it again.";
export const ACCOUNT_SWITCHED =
  "The signed in account changed while this was running. Try again.";
// No control characters, line or paragraph separators, zero width characters
// or bidirectional overrides, which could disguise a tenant name.
const LABEL_CHARACTERS =
  /^[^\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff]*$/;

function parseTenantId(input: unknown): string {
  if (typeof input !== "string" || !isGuid(input)) throw new Error("Unknown tenant.");
  return input.trim().toLowerCase();
}

export function parseTenantLabel(input: unknown): string {
  if (typeof input !== "string") throw new Error("Enter a name for the tenant.");
  const label = input.trim();
  if (label.length > MAX_TENANT_LABEL) {
    throw new Error(`Use at most ${MAX_TENANT_LABEL} characters for the tenant name.`);
  }
  if (!LABEL_CHARACTERS.test(label)) {
    throw new Error("The tenant name contains characters that are not allowed.");
  }
  return label;
}

export function parseCompareSource(input: unknown): CompareSource {
  const raw = (input ?? {}) as Record<string, unknown>;
  if (typeof input === "object" && input !== null) {
    if (raw.kind === "reference" && Object.keys(raw).length === 1) return { kind: "reference" };
    if (raw.kind === "tenant" && Object.keys(raw).length === 2) {
      return { kind: "tenant", tenantId: parseTenantId(raw.tenantId) };
    }
  }
  throw new Error("Refused an unexpected comparison.");
}

function referenceSummary(file: ReferenceFile): ReferenceSummary {
  return {
    label: file.source.label,
    createdAt: file.createdAt,
    rulesetVersion: file.rulesetVersion,
    settings: file.settings.length,
    notCompared: file.notCompared.length,
  };
}

function shortLabel(tenantId: string): string {
  return tenantLabelOf(tenantId) ?? tenantId;
}

export function registerHistoryIpc(deps: HistoryIpcDeps) {
  const { handle, store, license } = deps;
  const now = deps.now ?? (() => new Date());
  // The last history comparison, so switching the framework does not
  // decrypt again.
  let historyDiff: { key: string; compared: ComparedSnapshots } | null = null;
  // The last change section comparison of the current collection.
  let changes: { key: string; compared: ComparedSnapshots; from: SnapshotProjection } | null =
    null;
  // A loaded reference file stays in memory for the account that loaded it.
  let reference: { owner: string; file: ReferenceFile } | null = null;
  // Bumped by every reset, so a file picked before a sign-out is dropped.
  let generation = 0;
  const projections = new WeakMap<object, SnapshotProjection>();

  // Signed in, licensed, and the signed in tenant.
  // The tenant is read once, before the awaits, and must still be the
  // signed in one afterwards.
  async function licensed(): Promise<{ owner: string; tenant: string }> {
    const tenant = deps.signedInTenant()?.toLowerCase();
    const owner = await deps.requireOwner();
    if (!tenant || !isGuid(tenant)) throw new Error("Sign in before continuing.");
    await license.requireEntitlement(tenant);
    if (deps.signedInTenant()?.toLowerCase() !== tenant) throw new Error(ACCOUNT_SWITCHED);
    return { owner, tenant };
  }

  // Work that awaited must still belong to the account that started it.
  function stillCurrent(tenant: string, started: number): void {
    if (generation !== started || deps.signedInTenant()?.toLowerCase() !== tenant) {
      throw new Error(ACCOUNT_SWITCHED);
    }
  }

  // Portfolio and cross tenant comparison: the MSP plan of the signed in
  // tenant's entitlement.
  async function msp(): Promise<{ owner: string; tenant: string }> {
    const signedIn = await licensed();
    await license.requireMspPlan(signedIn.tenant);
    return signedIn;
  }

  async function historyStatus(tenant: string): Promise<HistoryStatus> {
    const settings = await deps.readSettings();
    let reason = store.unavailableReason();
    let count = 0;
    if (!reason) {
      try {
        count = (await store.list(tenant)).length;
      } catch (error) {
        reason =
          error instanceof HistoryUnavailableError
            ? error.message
            : "History could not be read on this computer.";
      }
    }
    return { enabled: settings.keepHistory, available: !reason, reason, count };
  }

  // The current collection as a snapshot projection, built once per
  // collection.
  async function currentProjection(owner: string): Promise<SnapshotProjection> {
    const inputs = await deps.currentInputs(owner);
    let projection = projections.get(inputs.collection);
    if (!projection) {
      projection = projectSnapshot(inputs.collection, inputs.assessment, inputs.groupNames);
      projections.set(inputs.collection, projection);
    }
    return projection;
  }

  async function changesFor(
    owner: string,
    tenant: string,
    request: ComplianceRequest & { frameworkId: ComplianceFrameworkId },
  ): Promise<ManagementChangesResult> {
    if (store.unavailableReason()) return { state: "none", reason: "unavailable" };
    const current = await currentProjection(owner);
    let entries;
    try {
      entries = await store.list(tenant);
    } catch (error) {
      if (error instanceof HistoryUnavailableError) {
        return { state: "none", reason: "unavailable" };
      }
      throw error;
    }
    const previous = previousSnapshot(entries, current.collectedAt);
    if (!previous) return { state: "none", reason: "noSnapshot" };
    // Snapshots keep the full scope assessment only.
    if (scopeKeyOf(request.scope) !== scopeKeyOf(current.assessment.scope)) {
      return { state: "none", reason: "scope" };
    }
    const key = `${tenant}|${previous.id}|${current.collectedAt}`;
    if (changes?.key !== key) {
      const from = await store.read(tenant, previous.id);
      if (scopeKeyOf(from.assessment.scope) !== scopeKeyOf(current.assessment.scope)) {
        return { state: "none", reason: "scope" };
      }
      changes = { key, compared: compareProjections(from, current), from };
    }
    return {
      state: "ready",
      changes: managementChanges(changes.from, current, changes.compared, request.frameworkId),
    };
  }

  function invalidate(): void {
    historyDiff = null;
    changes = null;
  }

  // ---- History --------------------------------------------------------------

  handle("history:status", async () => historyStatus((await licensed()).tenant));

  // Writes the setting only; unlike settings:save it keeps the sign in and
  // the collection.
  handle("history:setEnabled", async (_event, enabled) => {
    if (typeof enabled !== "boolean") {
      throw new Error("Refused an unexpected history setting.");
    }
    const { tenant } = await licensed();
    const reason = store.unavailableReason();
    if (enabled && reason) throw new Error(reason);
    await deps.writeSettings({ keepHistory: enabled });
    deps.log("info", "history changed", { enabled });
    await deps.scheduler.refresh();
    return historyStatus(tenant);
  });

  handle("history:list", async () => store.list((await licensed()).tenant));

  handle("history:diff", async (_event, input) => {
    const request = parseHistoryDiffRequest(input);
    const { tenant } = await licensed();
    const { from, to } = pickPair(await store.list(tenant), request);
    const key = `${tenant}|${from.id}|${to.id}`;
    let compared = historyDiff?.key === key ? historyDiff.compared : null;
    if (!compared) {
      const before = await store.read(tenant, from.id);
      const after = await store.read(tenant, to.id);
      compared = compareProjections(before, after);
      historyDiff = { key, compared };
    }
    return historyDiffView(from, to, compared, request.frameworkId);
  });

  handle("history:delete", async (_event, input) => {
    const id = parseSnapshotId(input);
    const { tenant } = await licensed();
    await store.delete(tenant, id);
    invalidate();
    deps.log("info", "snapshot deleted");
    await deps.scheduler.refresh();
    return store.list(tenant);
  });

  handle("history:deleteAll", async () => {
    const { tenant } = await licensed();
    await store.deleteTenant(tenant);
    invalidate();
    deps.log("info", "history deleted");
    await deps.scheduler.refresh();
    return historyStatus(tenant);
  });

  handle("history:changes", async (_event, input) => {
    const request = parseComplianceRequest(input, true) as ComplianceRequest & {
      frameworkId: ComplianceFrameworkId;
    };
    const { owner, tenant } = await licensed();
    return deps.track(() => changesFor(owner, tenant, request));
  });

  handle("history:scheduleStatus", async (): Promise<ScheduleStatus> => {
    await licensed();
    return deps.scheduler.status();
  });

  handle("history:setSchedule", async (_event, hours): Promise<ScheduleStatus> => {
    if (!isScheduleHours(hours)) throw new Error("Refused an unexpected schedule.");
    await licensed();
    if (hours > 0) {
      const reason = store.unavailableReason();
      if (reason) throw new Error(reason);
      if (!(await deps.readSettings()).keepHistory) {
        throw new Error("Turn on Keep history on this computer first.");
      }
    }
    await deps.writeSettings({ scheduleHours: hours });
    deps.log("info", "schedule changed", { hours });
    await deps.scheduler.refresh();
    return deps.scheduler.status();
  });

  // ---- Compare ----------------------------------------------------------------

  handle("compare:exportReference", async () => {
    const started = generation;
    const { owner, tenant } = await licensed();
    const file = await deps.track(async () => {
      const reference = await createReference(await currentProjection(owner), {
        createdAt: now().toISOString(),
        sourceLabel: shortLabel(tenant),
      });
      stillCurrent(tenant, started);
      return reference;
    });
    deps.log("info", "reference exported", { settings: file.settings.length });
    return deps.saveFile(
      referenceFileName(now()),
      new TextEncoder().encode(serializeReference(file)),
    );
  });

  handle("compare:loadReference", async (): Promise<ReferenceLoadResult> => {
    const started = generation;
    const { owner, tenant } = await licensed();
    const file = await deps.pickJsonFile();
    if (!file) return { canceled: true };
    // The size is checked before the file is read.
    const stat = await fs.stat(file).catch(() => null);
    if (!stat?.isFile()) return { ok: false, message: "The reference file could not be read." };
    if (stat.size > REFERENCE_MAX_BYTES) {
      return { ok: false, message: REFERENCE_REJECTION_MESSAGES.size };
    }
    const parsed = await parseReference(await fs.readFile(file, "utf8"));
    deps.log("info", "reference load", { outcome: parsed.ok ? "loaded" : parsed.reason });
    if (!parsed.ok) return { ok: false, message: REFERENCE_REJECTION_MESSAGES[parsed.reason] };
    if (generation !== started || deps.signedInTenant()?.toLowerCase() !== tenant) {
      return { ok: false, message: ACCOUNT_CHANGED };
    }
    reference = { owner, file: parsed.file };
    return { ok: true, reference: referenceSummary(parsed.file) };
  });

  handle("compare:referenceStatus", async (): Promise<ReferenceSummary | null> => {
    const { owner } = await licensed();
    return reference?.owner === owner ? referenceSummary(reference.file) : null;
  });

  handle("compare:clearReference", async () => {
    await licensed();
    reference = null;
    return true;
  });

  handle("compare:tenants", async (): Promise<CompareTenant[]> => {
    const { tenant } = await msp();
    return (await store.tenants())
      .filter((entry) => entry.tenantId !== tenant && entry.latest)
      .map((entry) => ({
        tenantId: entry.tenantId,
        label: entry.label ?? shortLabel(entry.tenantId),
        collectedAt: entry.latest!.collectedAt,
        partial: entry.latest!.partial,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  handle("compare:run", async (_event, input): Promise<CompareView> => {
    const source = parseCompareSource(input);
    const started = generation;
    const { owner, tenant } = source.kind === "tenant" ? await msp() : await licensed();
    return deps.track(async () => {
      let target: SettingSet;
      let info: CompareView["source"];
      if (source.kind === "reference") {
        if (!reference || reference.owner !== owner) throw new Error(NEEDS_REFERENCE);
        const { file } = reference;
        target = referenceSettings(file);
        info = {
          kind: "reference",
          label: file.source.label,
          collectedAt: file.createdAt,
          rulesetVersion: file.rulesetVersion,
        };
      } else {
        if (source.tenantId === tenant) {
          throw new Error("Choose another tenant. History compares the signed in tenant with itself.");
        }
        const stored = (await store.tenants()).find((entry) => entry.tenantId === source.tenantId);
        if (!stored?.latest) throw new Error("This tenant has no snapshot on this computer.");
        const projection = await store.read(source.tenantId, stored.latest.id);
        target = projectionSettings(projection);
        info = {
          kind: "tenant",
          label: stored.label ?? shortLabel(stored.tenantId),
          collectedAt: projection.collectedAt,
          rulesetVersion: projection.rulesetVersion,
        };
      }
      const current = await currentProjection(owner);
      stillCurrent(tenant, started);
      const result = capComparison(compareSettings(target, projectionSettings(current)));
      deps.log("info", "comparison run", { source: source.kind, ...result.totals });
      return {
        source: info,
        current: { collectedAt: current.collectedAt, rulesetVersion: current.rulesetVersion },
        totals: result.totals,
        groups: result.groups,
        notCompared: result.notCompared,
        rulesetChanged: result.rulesetChanged,
      };
    });
  });

  // ---- Portfolio --------------------------------------------------------------

  async function portfolio(tenant: string): Promise<PortfolioView> {
    const reason = store.unavailableReason();
    if (reason) return { available: false, reason, tenants: [] };
    let stored: StoredTenant[];
    try {
      stored = await store.tenants();
    } catch (error) {
      if (error instanceof HistoryUnavailableError) {
        return { available: false, reason: error.message, tenants: [] };
      }
      throw error;
    }
    const tenants: PortfolioTenant[] = stored.map((entry) => ({
      tenantId: entry.tenantId,
      label: entry.label,
      shortLabel: shortLabel(entry.tenantId),
      current: entry.tenantId === tenant,
      snapshots: entry.snapshots,
      latest: entry.latest
        ? {
            collectedAt: entry.latest.collectedAt,
            partial: entry.latest.partial,
            rulesetVersion: entry.latest.rulesetVersion,
          }
        : null,
      frameworks: (entry.latest?.frameworks ?? []).map((framework) => ({ ...framework })),
    }));
    tenants.sort(
      (a, b) =>
        Number(b.current) - Number(a.current) ||
        (a.label ?? a.shortLabel).localeCompare(b.label ?? b.shortLabel),
    );
    return { available: true, reason: null, tenants };
  }

  handle("portfolio:list", async () => portfolio((await msp()).tenant));

  handle("portfolio:setLabel", async (_event, tenantId, label) => {
    const target = parseTenantId(tenantId);
    const clean = parseTenantLabel(label);
    const { tenant } = await msp();
    await store.setLabel(target, clean);
    deps.log("info", "tenant label changed", { cleared: clean === "" });
    return portfolio(tenant);
  });

  handle("portfolio:deleteTenant", async (_event, tenantId) => {
    const target = parseTenantId(tenantId);
    const { tenant } = await msp();
    await store.deleteTenant(target);
    invalidate();
    deps.log("info", "tenant history deleted", { current: target === tenant });
    if (target === tenant) {
      deps.notifyHistoryChanged();
      await deps.scheduler.refresh();
    }
    return portfolio(tenant);
  });

  return {
    // The management report's change section, for the signed in owner.
    changesFor,
    // A snapshot was saved or removed: comparisons are made again.
    invalidate,
    // Sign out, settings changes and resets: also drops a loaded reference.
    reset(): void {
      invalidate();
      reference = null;
      generation += 1;
    },
  };
}
