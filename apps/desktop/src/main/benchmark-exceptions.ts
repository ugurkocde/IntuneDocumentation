import { safeStorage } from "electron";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  MAX_EXCEPTIONS,
  exceptionKey,
  validateExceptions,
  validateNewException,
  type BenchmarkException,
  type NewBenchmarkException,
} from "../../../../src/lib/benchmarks/exceptions";
import type { BenchmarkExceptionsRequest } from "../shared/ipc-types";
import { isGuid } from "../shared/validators";
import { log } from "./logger";
import { RM_RETRY, seal, unseal, writeAtomic } from "./snapshots";

// Accepted benchmark exceptions, one encrypted file per tenant. Owner and
// reason are admin text, so they exist on disk only inside the encrypted
// file and are never logged. The same threat model and sealing as the
// history (snapshots.ts): AES-256-GCM with a random nonce under a random
// 256 bit key wrapped with safeStorage, the format and tenant id as
// additional authenticated data, and opaque file names.
//
// Layout under userData/benchmark-exceptions:
//   key.bin          the wrapped key
//   <tenant tag>.bin the exceptions of one tenant
// Nothing is stored without secure storage. Clear local data removes the
// folder; sign out drops the key held in memory.

export const EXCEPTIONS_FORMAT = "intunedoc.benchmark-exceptions/1";
const FILE_FIELDS = ["exceptions", "format"].join();

export const EXCEPTIONS_UNAVAILABLE =
  "Secure storage is not available on this computer, so exceptions cannot be stored.";
export const EXCEPTIONS_LOCKED =
  "The exceptions key could not be unlocked right now. Make sure your keychain or credential store is unlocked, then try again.";
export const EXCEPTIONS_UNREADABLE =
  "The stored exceptions of this tenant could not be read. Clear local data to start again.";
export const EXCEPTIONS_FULL = `A tenant can keep at most ${MAX_EXCEPTIONS} exceptions.`;
export const EXCEPTIONS_ACCOUNT_CHANGED = "The signed in account changed while this was running. Try again.";

function normalizeTenant(tenantId: string): string {
  const tenant = tenantId.trim().toLowerCase();
  if (!isGuid(tenant)) throw new Error("Unknown tenant.");
  return tenant;
}

function aad(tenant: string): Buffer {
  return Buffer.from(`${EXCEPTIONS_FORMAT}\n${tenant}`, "utf8");
}

// Strict: the file holds the format and the exceptions, nothing else, and
// every exception has exactly the stored fields (validateExceptions).
function parseFile(text: string): BenchmarkException[] {
  const value = JSON.parse(text) as Record<string, unknown> | null;
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).sort().join() !== FILE_FIELDS ||
    value.format !== EXCEPTIONS_FORMAT
  ) {
    throw new Error("Unknown exceptions format.");
  }
  return validateExceptions(value.exceptions);
}

export interface BenchmarkExceptionStoreOptions {
  dir: () => string;
  now?: () => Date;
}

// Still the account that asked, checked in the queue right before a write.
export type ExceptionGuard = () => boolean;

export class BenchmarkExceptionStore {
  private readonly dir: () => string;
  private readonly now: () => Date;
  private key: Buffer | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;

  constructor(options: BenchmarkExceptionStoreOptions) {
    this.dir = options.dir;
    this.now = options.now ?? (() => new Date());
  }

  unavailableReason(): string | null {
    if (!safeStorage.isEncryptionAvailable()) return EXCEPTIONS_UNAVAILABLE;
    // Linux without a keyring falls back to a fixed password: not encryption.
    if (process.platform === "linux" && safeStorage.getSelectedStorageBackend?.() === "basic_text") {
      return EXCEPTIONS_UNAVAILABLE;
    }
    return null;
  }

  private serial<T>(task: () => Promise<T>): Promise<T> {
    const run = this.queue.then(task, task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private file(name: string): string {
    return path.join(this.dir(), name);
  }

  private tenantFile(tenant: string): string {
    const tag = createHmac("sha256", this.key!).update(`tenant:${tenant}`).digest("hex").slice(0, 32);
    return this.file(`${tag}.bin`);
  }

  // Loads or, when create is set, makes the key. Only reasons are logged.
  private async loadKey(create: boolean): Promise<boolean> {
    if (this.key) return true;
    const reason = this.unavailableReason();
    if (reason) throw new Error(reason);
    let wrapped: Buffer;
    try {
      wrapped = await fs.readFile(this.file("key.bin"));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "ENOENT") {
        log("warn", "exceptions key not read", { reason: "unreadable", code });
        throw new Error(EXCEPTIONS_LOCKED);
      }
      if (!create) return false;
      const key = randomBytes(32);
      await fs.mkdir(this.dir(), { recursive: true, mode: 0o700 });
      await writeAtomic(this.file("key.bin"), safeStorage.encryptString(key.toString("base64")));
      this.key = key;
      return true;
    }
    let unwrapped: string;
    try {
      unwrapped = safeStorage.decryptString(wrapped);
    } catch {
      log("warn", "exceptions key not unlocked", { reason: "decrypt_failed" });
      throw new Error(EXCEPTIONS_LOCKED);
    }
    const key = Buffer.from(unwrapped, "base64");
    if (key.length !== 32) {
      log("warn", "exceptions key ignored", { reason: "invalid_length" });
      throw new Error(EXCEPTIONS_UNREADABLE);
    }
    this.key = key;
    return true;
  }

  private async read(tenant: string): Promise<BenchmarkException[]> {
    let sealed: Buffer;
    try {
      sealed = await fs.readFile(this.tenantFile(tenant));
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return [];
      log("warn", "exceptions not read", { reason: "unreadable", code });
      throw new Error(EXCEPTIONS_LOCKED);
    }
    try {
      return parseFile(unseal(this.key!, aad(tenant), sealed).toString("utf8"));
    } catch {
      log("warn", "exceptions unreadable", { reason: "invalid" });
      throw new Error(EXCEPTIONS_UNREADABLE);
    }
  }

  // Every exception of the tenant; none before any was stored.
  async list(tenantId: string): Promise<BenchmarkException[]> {
    const tenant = normalizeTenant(tenantId);
    return this.serial(async () => ((await this.loadKey(false)) ? this.read(tenant) : []));
  }

  // Validates the list again before it is sealed, so nothing but the
  // stored fields is ever written.
  private async change(
    tenantId: string,
    isCurrent: ExceptionGuard,
    edit: (current: BenchmarkException[]) => BenchmarkException[],
  ): Promise<BenchmarkException[]> {
    const tenant = normalizeTenant(tenantId);
    const started = this.generation;
    const current = () => started === this.generation && isCurrent();
    return this.serial(async () => {
      if (!current()) throw new Error(EXCEPTIONS_ACCOUNT_CHANGED);
      await this.loadKey(true);
      const next = validateExceptions(edit(await this.read(tenant)));
      const plain = Buffer.from(JSON.stringify({ format: EXCEPTIONS_FORMAT, exceptions: next }), "utf8");
      const sealed = seal(this.key!, aad(tenant), plain);
      if (!current()) throw new Error(EXCEPTIONS_ACCOUNT_CHANGED);
      await writeAtomic(this.tenantFile(tenant), sealed);
      log("info", "exceptions changed", { count: next.length });
      return next;
    });
  }

  // Adds an exception, or changes the one with the same benchmark, version,
  // level and setting id (its id and creation time stay).
  async set(tenantId: string, input: NewBenchmarkException, isCurrent: ExceptionGuard): Promise<BenchmarkException[]> {
    const fields = validateNewException(input);
    const key = exceptionKey(fields.benchmark, fields.version, fields.level, fields.settingId);
    return this.change(tenantId, isCurrent, (current) => {
      const found = current.find(
        (entry) => exceptionKey(entry.benchmark, entry.version, entry.level, entry.settingId) === key,
      );
      if (found) return current.map((entry) => (entry === found ? { ...found, ...fields } : entry));
      if (current.length >= MAX_EXCEPTIONS) throw new Error(EXCEPTIONS_FULL);
      return [...current, { id: randomUUID(), ...fields, createdAt: this.now().toISOString() }];
    });
  }

  remove(
    tenantId: string,
    target: Pick<BenchmarkException, "benchmark" | "version" | "level" | "settingId">,
    isCurrent: ExceptionGuard,
  ): Promise<BenchmarkException[]> {
    const key = exceptionKey(target.benchmark, target.version, target.level, target.settingId);
    return this.change(tenantId, isCurrent, (current) =>
      current.filter((entry) => exceptionKey(entry.benchmark, entry.version, entry.level, entry.settingId) !== key),
    );
  }

  // Sign out and account change: the key leaves memory and a change that
  // was queued for the previous account is dropped.
  reset(): void {
    this.generation += 1;
    this.key = null;
  }

  // Clear local data: waits for a running write, then removes every file.
  async clear(): Promise<void> {
    this.reset();
    await this.serial(async () => {
      this.reset();
      await fs.rm(this.dir(), { recursive: true, force: true, ...RM_RETRY });
    });
  }
}

// The benchmarks:exceptions request: list, set or remove, answered with the
// exceptions of the requested benchmark and version at every level, since a
// comparison of Level 2 applies those of Level 1 and Level 2.
export async function answerExceptions(
  store: Pick<BenchmarkExceptionStore, "list" | "set" | "remove">,
  tenantId: string,
  request: BenchmarkExceptionsRequest,
  isCurrent: ExceptionGuard,
): Promise<BenchmarkException[]> {
  const { benchmark, version, level } = request;
  const all =
    request.action === "list"
      ? await store.list(tenantId)
      : request.action === "set"
        ? await store.set(
            tenantId,
            {
              benchmark,
              version,
              level,
              settingId: request.settingId,
              owner: request.owner,
              reason: request.reason,
              expiresOn: request.expiresOn,
            },
            isCurrent,
          )
        : await store.remove(tenantId, { benchmark, version, level, settingId: request.settingId }, isCurrent);
  return all.filter((entry) => entry.benchmark === benchmark && entry.version === version);
}
