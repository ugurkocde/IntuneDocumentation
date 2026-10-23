import { safeStorage } from "electron";
import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip, gzip } from "node:zlib";
import { isAssessedFramework } from "../../../../src/lib/compliance/engine";
import {
  SNAPSHOT_FORMAT,
  withAssessedFrameworks,
  type SnapshotFingerprint,
  type SnapshotProjection,
} from "../../../../src/lib/snapshots/projection";
import type { HistoryEntry } from "../shared/ipc-types";
import { isGuid } from "../shared/validators";
import { SNAPSHOT_ID_PATTERN } from "./history";
import { log } from "./logger";

// Local history of collections. Threat model: protects tenant data at rest
// against a copied disk or userData folder and against other OS users. It
// does not protect against software running as the same OS user, since
// safeStorage unwraps the key for any process of that user.
//
// Layout under userData/snapshots:
//   key.bin              random 256 bit master key, wrapped with safeStorage
//   index.bin            encrypted index of every snapshot
//   index.bin.bak        the index before its last write, read when
//                        index.bin cannot be
//   <tenant tag>/<id>.snap  one encrypted snapshot
// Every encrypted file is gzip, then AES-256-GCM with a random 96 bit nonce
// and the format, tenant id and snapshot id as additional authenticated data,
// so a file moved to another tenant or renamed does not decrypt.

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

const MAGIC = Buffer.from("IDS1", "ascii");
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const INDEX_FORMAT = "intunedoc.snapshot-index/1";
const DAY_MS = 24 * 60 * 60_000;

export interface RetentionLimits {
  perTenant: number;
  maxAgeDays: number;
  maxBytes: number;
}

export const DEFAULT_RETENTION: RetentionLimits = {
  perTenant: 30,
  maxAgeDays: 365,
  maxBytes: 500 * 1024 * 1024,
};

interface IndexEntry extends HistoryEntry {
  savedAt: string;
  // Per framework coverage from the stored assessment, for summaries that
  // must not decrypt every snapshot.
  frameworks: Array<{
    id: string;
    name: string;
    totalControls: number;
    withEvidence: number;
    partial: number;
    applicableControls: number;
  }>;
  // The benchmark runs the snapshot holds, so trend and portfolio decrypt
  // only the snapshots they need. Absent when it holds none.
  benchmarks?: BenchmarkRunKey[];
}

// One stored benchmark run as the index names it: ids and time only.
export interface BenchmarkRunKey {
  benchmark: string;
  version: string;
  level: 1 | 2;
  assessedAt: string;
}

// A snapshot that holds benchmark runs, from the index.
export interface BenchmarkRunSnapshot {
  tenantId: string;
  id: string;
  collectedAt: string;
  runs: BenchmarkRunKey[];
}

interface StoredIndex {
  format: typeof INDEX_FORMAT;
  tenants: Record<string, { label?: string; snapshots: IndexEntry[] }>;
}

// One stored tenant as the encrypted index describes it.
export interface StoredTenant {
  tenantId: string;
  label: string | null;
  snapshots: number;
  latest: (HistoryEntry & { frameworks: IndexEntry["frameworks"] }) | null;
}

export const MAX_TENANT_LABEL = 60;

// History cannot be used until the user deletes it, or secure storage is
// missing. Delete all removes it without decrypting.
export class HistoryUnavailableError extends Error {}

// History is intact but could not be read right now, for example while the
// keychain is locked or another program holds a file. Never latched and never
// a reason to delete anything: the next attempt tries again.
export class HistoryLockedError extends Error {}

export const UNAVAILABLE_REASONS = {
  encryption:
    "Secure storage is not available on this computer, so history is off. Snapshots are never stored without encryption.",
  key: "The history key on this computer could not be unlocked. Delete all history to start again.",
  index:
    "The history index could not be read. Delete all history to start again.",
} as const;

// Secure storage refused to unwrap the key, for example while the keychain is
// locked. Not latched: the next read tries again.
export const KEY_LOCKED =
  "The history key could not be unlocked right now. Make sure your keychain or credential store is unlocked, then try again.";

// A history file exists but could not be read right now, for example while
// another program holds it open. Not latched either.
export const FILE_BUSY =
  "The history files could not be read right now. Close any program that may use them, then try again.";

function emptyIndex(): StoredIndex {
  return { format: INDEX_FORMAT, tenants: {} };
}

function aad(...parts: string[]): Buffer {
  return Buffer.from(parts.join("\n"), "utf8");
}

export function seal(key: Buffer, additional: Buffer, plain: Buffer): Buffer {
  const nonce = randomBytes(NONCE_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(additional);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), body]);
}

// Throws on any change to the file, a wrong key or other authenticated data.
export function unseal(key: Buffer, additional: Buffer, sealed: Buffer): Buffer {
  const header = MAGIC.length + NONCE_BYTES + TAG_BYTES;
  if (sealed.length < header || !sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
    throw new Error("Not a history file.");
  }
  const nonce = sealed.subarray(MAGIC.length, MAGIC.length + NONCE_BYTES);
  const tag = sealed.subarray(MAGIC.length + NONCE_BYTES, header);
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(additional);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(sealed.subarray(header)), decipher.final()]);
}

// Temp file, flushed to disk, then rename, so a reader never sees a partial
// file, also after a power loss. Temp names never match a snapshot id and are
// swept on the next start.
export async function writeAtomic(file: string, bytes: Buffer): Promise<void> {
  const temp = `${file}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    const handle = await fs.open(temp, "w", 0o600);
    try {
      await handle.writeFile(bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temp, file);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

// Removal of a folder that Windows may still hold open for a moment.
export const RM_RETRY = { maxRetries: 5, retryDelay: 200 } as const;

function newSnapshotId(now: number): string {
  const stamp = new Date(now)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
  return `${stamp}-${randomBytes(4).toString("hex")}`;
}

function normalizeTenant(tenantId: string): string {
  const tenant = tenantId.trim().toLowerCase();
  if (!isGuid(tenant)) throw new Error("Unknown tenant.");
  return tenant;
}

function isEntry(value: unknown): value is IndexEntry {
  const entry = value as Partial<IndexEntry> | null;
  return Boolean(
    entry &&
      typeof entry.id === "string" &&
      SNAPSHOT_ID_PATTERN.test(entry.id) &&
      typeof entry.collectedAt === "string" &&
      typeof entry.savedAt === "string" &&
      typeof entry.bytes === "number" &&
      typeof entry.items === "number" &&
      typeof entry.partial === "boolean" &&
      typeof entry.rulesetVersion === "string" &&
      Array.isArray(entry.frameworks),
  );
}

function runKeys(runs: unknown): BenchmarkRunKey[] {
  return (Array.isArray(runs) ? runs : []).flatMap((run) => {
    const value = run as Partial<BenchmarkRunKey> | null;
    return value &&
      typeof value.benchmark === "string" &&
      typeof value.version === "string" &&
      (value.level === 1 || value.level === 2) &&
      typeof value.assessedAt === "string"
      ? [{ benchmark: value.benchmark, version: value.version, level: value.level, assessedAt: value.assessedAt }]
      : [];
  });
}

function withRunKeys(entry: IndexEntry, runs: unknown): IndexEntry {
  const { benchmarks: _old, ...rest } = entry;
  const keys = runKeys(runs);
  return keys.length ? { ...rest, benchmarks: keys } : rest;
}

function parseIndex(text: string): StoredIndex {
  const parsed = JSON.parse(text) as Partial<StoredIndex> | null;
  if (!parsed || parsed.format !== INDEX_FORMAT || typeof parsed.tenants !== "object") {
    throw new Error("Unknown index format.");
  }
  const index = emptyIndex();
  for (const [tenant, value] of Object.entries(parsed.tenants ?? {})) {
    if (!isGuid(tenant) || tenant !== tenant.toLowerCase() || !value) continue;
    index.tenants[tenant] = {
      ...(typeof value.label === "string" ? { label: value.label.slice(0, 100) } : {}),
      snapshots: (Array.isArray(value.snapshots) ? value.snapshots : [])
        .filter(isEntry)
        .map((entry) => withRunKeys(entry, entry.benchmarks))
        // A framework removed since the entry was written is not shown.
        .map((entry) => ({
          ...entry,
          frameworks: entry.frameworks.filter((framework) => isAssessedFramework(framework?.id)),
        })),
    };
  }
  return index;
}

function publicEntry(entry: IndexEntry): HistoryEntry {
  return {
    id: entry.id,
    collectedAt: entry.collectedAt,
    items: entry.items,
    partial: entry.partial,
    rulesetVersion: entry.rulesetVersion,
    bytes: entry.bytes,
  };
}

const byCollected = (a: IndexEntry, b: IndexEntry) =>
  a.collectedAt < b.collectedAt ? -1 : a.collectedAt > b.collectedAt ? 1 : a.id < b.id ? -1 : 1;

export interface SnapshotStoreOptions {
  dir: () => string;
  limits?: Partial<RetentionLimits>;
  now?: () => number;
}

export interface SaveGuard {
  // From begin(); a later invalidate() makes the save a no-op.
  generation: number;
  // Still the account that collected, checked again right before writing.
  isCurrent: () => boolean;
}

// Delete, label and reset requests: still the account that asked, checked
// inside the store queue right before anything is changed.
export type MutationGuard = () => boolean;

export class SnapshotStore {
  private readonly dir: () => string;
  private readonly limits: RetentionLimits;
  private readonly now: () => number;
  private key: Buffer | null = null;
  private index: StoredIndex | null = null;
  private damaged: keyof typeof UNAVAILABLE_REASONS | null = null;
  private swept = false;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  // The fingerprint function for the current master key.
  private fingerprint: { key: Buffer; digest: SnapshotFingerprint } | null = null;

  constructor(options: SnapshotStoreOptions) {
    this.dir = options.dir;
    this.limits = { ...DEFAULT_RETENTION, ...options.limits };
    this.now = options.now ?? Date.now;
  }

  // Why history cannot be used right now, or null.
  unavailableReason(): string | null {
    if (!safeStorage.isEncryptionAvailable()) return UNAVAILABLE_REASONS.encryption;
    // Linux without a keyring falls back to a fixed password: not encryption.
    if (
      process.platform === "linux" &&
      safeStorage.getSelectedStorageBackend?.() === "basic_text"
    ) {
      return UNAVAILABLE_REASONS.encryption;
    }
    return this.damaged ? UNAVAILABLE_REASONS[this.damaged] : null;
  }

  // Captured before slow work such as the assessment that feeds a save.
  begin(): number {
    return this.generation;
  }

  // Sign out, settings changes and resets: a save that started before is
  // dropped.
  invalidate(): void {
    this.generation += 1;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private file(name: string): string {
    return path.join(this.dir(), name);
  }

  private tenantDir(tenant: string): string {
    // An opaque tag keeps tenant ids out of folder names.
    const tag = createHmac("sha256", this.key!)
      .update(`tenant:${tenant}`)
      .digest("hex")
      .slice(0, 32);
    return path.join(this.dir(), tag);
  }

  private snapshotFile(tenant: string, id: string): string {
    if (!SNAPSHOT_ID_PATTERN.test(id)) throw new Error("Unknown snapshot.");
    return path.join(this.tenantDir(tenant), `${id}.snap`);
  }

  private requireAvailable(): void {
    const reason = this.unavailableReason();
    if (reason) throw new HistoryUnavailableError(reason);
  }

  // Loads or, when create is set, makes the master key. Only the reason of a
  // failure is logged, never content.
  private async loadKey(create: boolean): Promise<boolean> {
    if (this.key) return true;
    let wrapped: Buffer;
    try {
      wrapped = await fs.readFile(this.file("key.bin"));
    } catch (error) {
      // Busy, locked or not permitted right now: the key is still there.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        log("warn", "history key not read", {
          reason: "unreadable",
          code: (error as NodeJS.ErrnoException).code,
        });
        throw new HistoryLockedError(FILE_BUSY);
      }
      if (!create) return false;
      const key = randomBytes(32);
      await fs.mkdir(this.dir(), { recursive: true, mode: 0o700 });
      await writeAtomic(
        this.file("key.bin"),
        safeStorage.encryptString(key.toString("base64")),
      );
      this.key = key;
      return true;
    }
    let unwrapped: string;
    try {
      unwrapped = safeStorage.decryptString(wrapped);
    } catch {
      log("warn", "history key not unlocked", { reason: "decrypt_failed" });
      throw new HistoryLockedError(KEY_LOCKED);
    }
    const key = Buffer.from(unwrapped, "base64");
    if (key.length !== 32) {
      log("warn", "history key ignored", { reason: "invalid_length" });
      this.damaged = "key";
      throw new HistoryUnavailableError(UNAVAILABLE_REASONS.key);
    }
    this.key = key;
    return true;
  }

  // The index, or its backup when the index itself cannot be read. Only when
  // neither can is the history damaged.
  //
  // An index that exists but cannot be read right now (busy, locked, not
  // permitted) is not damage. Reads then use the backup without keeping it,
  // and writes wait, since the newer index may list snapshots the backup does
  // not; with no readable copy at all the retryable locked error is thrown.
  private async loadIndex(write: boolean): Promise<StoredIndex> {
    if (this.index) return this.index;
    let found = false;
    let busy = false;
    for (const name of ["index.bin", "index.bin.bak"]) {
      let sealed: Buffer;
      try {
        sealed = await fs.readFile(this.file(name));
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code === "ENOENT") continue;
        log("warn", "history index not read", { reason: "unreadable", code, file: name });
        busy = true;
        continue;
      }
      found = true;
      let index: StoredIndex;
      try {
        const plain = await gunzipAsync(unseal(this.key!, aad(INDEX_FORMAT, "", "index"), sealed));
        index = parseIndex(plain.toString("utf8"));
      } catch {
        log("warn", "history index ignored", { reason: "decrypt_failed", file: name });
        continue;
      }
      if (busy) {
        if (write) throw new HistoryLockedError(FILE_BUSY);
        return index;
      }
      this.index = index;
      if (name !== "index.bin") {
        // The good copy replaces the unreadable index, so the next write
        // keeps it as the backup.
        log("warn", "history index restored from backup");
        await writeAtomic(this.file("index.bin"), sealed);
      }
      break;
    }
    if (!this.index) {
      // A copy that could not be read may be the good one.
      if (busy) throw new HistoryLockedError(FILE_BUSY);
      if (found) {
        this.damaged = "index";
        throw new HistoryUnavailableError(UNAVAILABLE_REASONS.index);
      }
      this.index = emptyIndex();
    }
    await this.sweep(this.index);
    return this.index;
  }

  // The index being replaced is kept as index.bin.bak first, except when a
  // rollback restores the index the backup already holds.
  private async writeIndex(index: StoredIndex, rotate = true): Promise<void> {
    const plain = await gzipAsync(Buffer.from(JSON.stringify(index), "utf8"));
    const previous = rotate ? await fs.readFile(this.file("index.bin")).catch(() => null) : null;
    if (previous) await writeAtomic(this.file("index.bin.bak"), previous);
    await writeAtomic(this.file("index.bin"), seal(this.key!, aad(INDEX_FORMAT, "", "index"), plain));
    this.index = index;
  }

  // Removes temp files left by an interrupted write and snapshot files the
  // index does not list. Once per process.
  private async sweep(index: StoredIndex): Promise<void> {
    if (this.swept) return;
    this.swept = true;
    const known = new Map<string, Set<string>>();
    for (const [tenant, value] of Object.entries(index.tenants)) {
      known.set(
        path.basename(this.tenantDir(tenant)),
        new Set(value.snapshots.map((entry) => `${entry.id}.snap`)),
      );
    }
    const root = await fs.readdir(this.dir(), { withFileTypes: true }).catch(() => []);
    for (const entry of root) {
      const full = path.join(this.dir(), entry.name);
      if (entry.isFile() && entry.name.endsWith(".tmp")) {
        await fs.rm(full, { force: true });
      } else if (entry.isDirectory() && /^[0-9a-f]{32}$/.test(entry.name)) {
        const files = known.get(entry.name);
        for (const name of await fs.readdir(full).catch(() => [] as string[])) {
          if (!files?.has(name)) await fs.rm(path.join(full, name), { force: true });
        }
        if (!files?.size) await fs.rm(full, { recursive: true, force: true });
      }
    }
  }

  // Index and key, or nothing when no history was ever saved. Snapshots
  // past the age limit are removed first, also while no new snapshot is
  // saved; the count and size limits only change with a save. Write is set
  // for callers that change the index.
  private async open(write = false): Promise<StoredIndex | null> {
    this.requireAvailable();
    if (!(await this.loadKey(false))) return null;
    const index = await this.loadIndex(write);
    const next = structuredClone(index);
    const removed = this.expire(next, this.now());
    // A backup read while the index is busy is not written back.
    if (!removed.length || this.index !== index) return removed.length ? next : index;
    await this.writeIndex(next);
    for (const old of removed) {
      await fs.rm(this.snapshotFile(old.tenant, old.id), { force: true });
    }
    return next;
  }

  async list(tenantId: string): Promise<HistoryEntry[]> {
    const tenant = normalizeTenant(tenantId);
    return this.serial(async () => {
      const index = await this.open();
      return [...(index?.tenants[tenant]?.snapshots ?? [])]
        .sort(byCollected)
        .reverse()
        .map(publicEntry);
    });
  }

  // Snapshots are read for the signed in tenant only: the index is
  // partitioned by tenant and the tenant id is authenticated with the data.
  async read(tenantId: string, id: string): Promise<SnapshotProjection> {
    const tenant = normalizeTenant(tenantId);
    if (!SNAPSHOT_ID_PATTERN.test(id)) throw new Error("Unknown snapshot.");
    return this.serial(async () => {
      const index = await this.open();
      if (!index?.tenants[tenant]?.snapshots.some((entry) => entry.id === id)) {
        throw new Error("This snapshot is not in the history of the signed in tenant.");
      }
      return this.decrypt(tenant, id);
    });
  }

  private async decrypt(tenant: string, id: string): Promise<SnapshotProjection> {
    let projection: SnapshotProjection;
    try {
      const sealed = await fs.readFile(this.snapshotFile(tenant, id));
      const plain = await gunzipAsync(unseal(this.key!, aad(SNAPSHOT_FORMAT, tenant, id), sealed));
      projection = JSON.parse(plain.toString("utf8")) as SnapshotProjection;
    } catch {
      log("warn", "snapshot unreadable", { reason: "decrypt_failed" });
      throw new Error("This snapshot could not be read. Delete it and collect again.");
    }
    if (projection?.format !== SNAPSHOT_FORMAT) {
      throw new Error("This snapshot has an unknown format.");
    }
    return withAssessedFrameworks(projection);
  }

  // Rewrites one stored snapshot with data added after it was saved, such as
  // benchmark runs. The id, the collection and the index entry stay; only
  // the size and the benchmark run keys follow the new content. False when
  // the guard says the account changed while the change was queued, or when
  // the snapshot is gone.
  async update(
    tenantId: string,
    id: string,
    change: (projection: SnapshotProjection) => SnapshotProjection,
    isCurrent: MutationGuard,
  ): Promise<boolean> {
    const tenant = normalizeTenant(tenantId);
    if (!SNAPSHOT_ID_PATTERN.test(id)) throw new Error("Unknown snapshot.");
    return this.serial(async () => {
      if (!isCurrent()) return false;
      const index = await this.open(true);
      if (!index?.tenants[tenant]?.snapshots.some((entry) => entry.id === id)) return false;
      const before = await this.decrypt(tenant, id);
      const next = change(before);
      if (next.format !== SNAPSHOT_FORMAT || next.collectedAt !== before.collectedAt) {
        throw new Error("A snapshot update must keep its collection.");
      }
      const plain = await gzipAsync(Buffer.from(JSON.stringify(next), "utf8"));
      const sealed = seal(this.key!, aad(SNAPSHOT_FORMAT, tenant, id), plain);
      if (!isCurrent()) return false;
      await writeAtomic(this.snapshotFile(tenant, id), sealed);
      const updated = structuredClone(index);
      const bucket = updated.tenants[tenant]!;
      bucket.snapshots = bucket.snapshots.map((entry) =>
        entry.id === id ? withRunKeys({ ...entry, bytes: sealed.length }, next.benchmarks) : entry,
      );
      await this.writeIndex(updated);
      return true;
    });
  }

  // Snapshots holding benchmark runs, of one tenant or of all, from the
  // index only: no snapshot is decrypted.
  async benchmarkRunSnapshots(tenantId?: string): Promise<BenchmarkRunSnapshot[]> {
    const only = tenantId === undefined ? null : normalizeTenant(tenantId);
    return this.serial(async () => {
      const index = await this.open();
      return Object.entries(index?.tenants ?? {})
        .filter(([tenant]) => only === null || tenant === only)
        .flatMap(([tenant, bucket]) =>
          bucket.snapshots
            .filter((entry) => entry.benchmarks?.length)
            .map((entry) => ({
              tenantId: tenant,
              id: entry.id,
              collectedAt: entry.collectedAt,
              runs: structuredClone(entry.benchmarks!),
            })),
        );
    });
  }

  // Null when the guard says the account changed or a reset happened.
  async save(
    tenantId: string,
    projection: SnapshotProjection,
    guard: SaveGuard,
  ): Promise<HistoryEntry | null> {
    const tenant = normalizeTenant(tenantId);
    const current = () => guard.generation === this.generation && guard.isCurrent();
    return this.serial(async () => {
      if (!current()) return null;
      this.requireAvailable();
      await this.loadKey(true);
      const before = await this.loadIndex(true);
      const index = structuredClone(before);
      const now = this.now();
      const id = newSnapshotId(now);
      const plain = await gzipAsync(Buffer.from(JSON.stringify(projection), "utf8"));
      const sealed = seal(this.key!, aad(SNAPSHOT_FORMAT, tenant, id), plain);
      const file = this.snapshotFile(tenant, id);
      await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
      await writeAtomic(file, sealed);
      if (!current()) {
        await fs.rm(file, { force: true });
        return null;
      }
      const entry: IndexEntry = withRunKeys({
        id,
        collectedAt: projection.collectedAt,
        savedAt: new Date(now).toISOString(),
        items: projection.sections.reduce((sum, section) => sum + section.items.length, 0),
        partial: projection.partial,
        rulesetVersion: projection.rulesetVersion,
        bytes: sealed.length,
        frameworks: projection.assessment.frameworks.map((framework) => ({
          id: framework.id,
          name: framework.name,
          totalControls: framework.summary.totalControls,
          withEvidence: framework.summary.withEvidence,
          partial: framework.summary.partial,
          applicableControls: framework.summary.applicableControls,
        })),
      }, projection.benchmarks);
      const bucket = (index.tenants[tenant] ??= { snapshots: [] });
      bucket.snapshots.push(entry);
      const removed = this.applyRetention(index, now, entry.id);
      await this.writeIndex(index);
      // A sign out or reset during the index write: the save is undone.
      if (!current()) {
        // index.bin.bak already holds the index from before this save.
        await this.writeIndex(before, false);
        await fs.rm(file, { force: true });
        return null;
      }
      for (const old of removed) {
        await fs.rm(this.snapshotFile(old.tenant, old.id), { force: true });
      }
      return publicEntry(entry);
    });
  }

  // Snapshots older than the age limit, removed from the index.
  private expire(index: StoredIndex, now: number): Array<{ tenant: string; id: string }> {
    const cutoff = now - this.limits.maxAgeDays * DAY_MS;
    const removed: Array<{ tenant: string; id: string }> = [];
    for (const [tenant, bucket] of Object.entries(index.tenants)) {
      const kept = bucket.snapshots.filter((entry) => Date.parse(entry.collectedAt) >= cutoff);
      if (kept.length === bucket.snapshots.length) continue;
      for (const entry of bucket.snapshots) {
        if (!kept.includes(entry)) removed.push({ tenant, id: entry.id });
      }
      bucket.snapshots = kept;
      if (!kept.length && !bucket.label) delete index.tenants[tenant];
    }
    return removed;
  }

  // Oldest first: over the per tenant count, older than the age limit, then
  // over the total size. The snapshot just saved always stays.
  private applyRetention(
    index: StoredIndex,
    now: number,
    keep: string,
  ): Array<{ tenant: string; id: string }> {
    const removed: Array<{ tenant: string; id: string }> = [];
    const drop = (tenant: string, id: string) => {
      const bucket = index.tenants[tenant]!;
      bucket.snapshots = bucket.snapshots.filter((entry) => entry.id !== id);
      removed.push({ tenant, id });
    };
    const cutoff = now - this.limits.maxAgeDays * DAY_MS;
    for (const [tenant, bucket] of Object.entries(index.tenants)) {
      const sorted = [...bucket.snapshots].sort(byCollected);
      for (const entry of sorted) {
        if (entry.id === keep) continue;
        const tooMany = bucket.snapshots.length > this.limits.perTenant;
        if (tooMany || Date.parse(entry.collectedAt) < cutoff) drop(tenant, entry.id);
      }
    }
    const all = () =>
      Object.entries(index.tenants).flatMap(([tenant, bucket]) =>
        bucket.snapshots.map((entry) => ({ tenant, entry })),
      );
    let total = all().reduce((sum, { entry }) => sum + entry.bytes, 0);
    for (const { tenant, entry } of all().sort((a, b) => byCollected(a.entry, b.entry))) {
      if (total <= this.limits.maxBytes) break;
      if (entry.id === keep) continue;
      drop(tenant, entry.id);
      total -= entry.bytes;
    }
    for (const [tenant, bucket] of Object.entries(index.tenants)) {
      if (!bucket.snapshots.length && !bucket.label) delete index.tenants[tenant];
    }
    return removed;
  }

  // Every tenant with history, from the index only: no snapshot is
  // decrypted.
  async tenants(): Promise<StoredTenant[]> {
    return this.serial(async () => {
      const index = await this.open();
      return Object.entries(index?.tenants ?? {}).map(([tenantId, bucket]) => {
        const latest = [...bucket.snapshots].sort(byCollected).at(-1);
        return {
          tenantId,
          label: bucket.label ?? null,
          snapshots: bucket.snapshots.length,
          latest: latest
            ? { ...publicEntry(latest), frameworks: structuredClone(latest.frameworks) }
            : null,
        };
      });
    });
  }

  // The name shown for a stored tenant; an empty label removes it. False
  // when the guard says the account changed while the change was queued.
  // The guard is checked before open, which can already expire and write,
  // and again before the write.
  async setLabel(tenantId: string, label: string, isCurrent: MutationGuard): Promise<boolean> {
    const tenant = normalizeTenant(tenantId);
    const clean = label.trim();
    if (clean.length > MAX_TENANT_LABEL) throw new Error("The tenant name is too long.");
    return this.serial(async () => {
      if (!isCurrent()) return false;
      const index = await this.open(true);
      if (!index?.tenants[tenant]) throw new Error("This tenant has no history on this computer.");
      if (!isCurrent()) return false;
      const next = structuredClone(index);
      if (clean) next.tenants[tenant]!.label = clean;
      else delete next.tenants[tenant]!.label;
      await this.writeIndex(next);
      return true;
    });
  }

  async delete(tenantId: string, id: string, isCurrent: MutationGuard): Promise<boolean> {
    const tenant = normalizeTenant(tenantId);
    if (!SNAPSHOT_ID_PATTERN.test(id)) throw new Error("Unknown snapshot.");
    return this.serial(async () => {
      if (!isCurrent()) return false;
      const index = await this.open(true);
      if (!isCurrent()) return false;
      const bucket = index?.tenants[tenant];
      if (!index || !bucket?.snapshots.some((entry) => entry.id === id)) return true;
      const next = structuredClone(index);
      next.tenants[tenant]!.snapshots = bucket.snapshots.filter((entry) => entry.id !== id);
      // A tenant label stays with the tenant until all its history is deleted.
      if (!next.tenants[tenant]!.snapshots.length && !bucket.label) delete next.tenants[tenant];
      await this.writeIndex(next);
      await fs.rm(this.snapshotFile(tenant, id), { force: true });
      return true;
    });
  }

  // Every snapshot of one tenant. When the key or index is damaged, nothing
  // is readable for any tenant, so the whole history is reset. A key or
  // index that is only locked or busy right now is never a reason to reset.
  async deleteTenant(tenantId: string, isCurrent: MutationGuard): Promise<boolean> {
    const tenant = normalizeTenant(tenantId);
    if (this.damaged) return this.clear(isCurrent);
    return this.serial(async () => {
      if (!isCurrent()) return false;
      const index = await this.open(true);
      if (!isCurrent()) return false;
      if (!index?.tenants[tenant]) return true;
      const next = structuredClone(index);
      delete next.tenants[tenant];
      await this.writeIndex(next);
      await fs.rm(this.tenantDir(tenant), { recursive: true, force: true });
      return true;
    });
  }

  // Whether any history is stored, without decrypting it.
  async hasData(): Promise<boolean> {
    const names = await fs.readdir(this.dir()).catch(() => [] as string[]);
    return names.length > 0;
  }

  // Removes snapshots, the wrapped key and the index. Waits for writes
  // queued before it, and drops saves that began before it, so nothing is
  // written after it. With a guard, nothing is removed (false) when the
  // account changed while the reset was queued.
  async clear(isCurrent?: MutationGuard): Promise<boolean> {
    return this.serial(async () => {
      if (isCurrent && !isCurrent()) return false;
      this.invalidate();
      await fs.rm(this.dir(), { recursive: true, force: true, ...RM_RETRY });
      this.key = null;
      this.index = null;
      this.damaged = null;
      this.swept = false;
      return true;
    });
  }

  // Fingerprints for content a snapshot does not store, such as secrets and
  // script bodies: HMAC-SHA256 of the content digest with a key derived from
  // the master key, so fingerprints compare across this install's snapshots
  // but a guessable secret cannot be found by hashing guesses. Null when no
  // history key exists and create is not set, or when a key would be made
  // for a save that a reset since begin() has already dropped.
  async fingerprinter(create: boolean, generation?: number): Promise<SnapshotFingerprint | null> {
    return this.serial(async () => {
      this.requireAvailable();
      if (generation !== undefined && generation !== this.generation) return null;
      if (!(await this.loadKey(create))) return null;
      const key = this.key!;
      if (this.fingerprint?.key !== key) {
        const derived = createHmac("sha256", key).update("intunedoc.snapshot/fingerprint").digest();
        this.fingerprint = {
          key,
          digest: (digest) => createHmac("sha256", derived).update(digest).digest("hex").slice(0, 32),
        };
      }
      return this.fingerprint.digest;
    });
  }
}
