import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The encrypted per tenant exceptions store. Synthetic ids only; the owner
// and reason are invented admin text that must never be on disk in plain
// text or in the log.

const env = vi.hoisted(() => ({
  available: true,
  backend: "keychain",
  failDecrypt: false,
  logged: [] as unknown[][],
}));

// The wrapped key is not plaintext either, so a test can search the folder.
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => env.available,
    getSelectedStorageBackend: () => env.backend,
    encryptString: (text: string) => Buffer.from(`wrapped:${Buffer.from(text).toString("hex")}`),
    decryptString: (bytes: Buffer) => {
      if (env.failDecrypt) throw new Error("Keychain locked");
      return Buffer.from(bytes.toString().replace(/^wrapped:/, ""), "hex").toString();
    },
  },
}));

vi.mock("./logger", () => ({ log: (...args: unknown[]) => env.logged.push(args) }));

const {
  BenchmarkExceptionStore,
  EXCEPTIONS_ACCOUNT_CHANGED,
  EXCEPTIONS_FORMAT,
  EXCEPTIONS_FULL,
  EXCEPTIONS_LOCKED,
  EXCEPTIONS_UNAVAILABLE,
  EXCEPTIONS_UNREADABLE,
  answerExceptions,
} = await import("./benchmark-exceptions");
const { seal } = await import("./snapshots");
const { MAX_EXCEPTIONS } = await import("../../../../src/lib/benchmarks/exceptions");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const OWNER = "Synthetic Owner Person";
const REASON = "Synthetic accepted risk until the rollout";
const SETTING = "synthetic_setting_alpha";
const IDENTITY = { benchmark: "synthetic-bench", version: "9.9.9", level: 1 as const };
const always = () => true;

let dir = "";
let clock = new Date("2026-10-22T10:00:00.000Z");

function store() {
  return new BenchmarkExceptionStore({ dir: () => dir, now: () => clock });
}

function input(overrides: Record<string, unknown> = {}) {
  return { ...IDENTITY, settingId: SETTING, owner: OWNER, reason: REASON, expiresOn: "2027-01-31", ...overrides };
}

function files(): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function folderText(): string {
  return files()
    .map((name) => readFileSync(path.join(dir, name)).toString("latin1"))
    .join("\n");
}

function keyOf(): Buffer {
  const wrapped = readFileSync(path.join(dir, "key.bin")).toString();
  return Buffer.from(Buffer.from(wrapped.replace(/^wrapped:/, ""), "hex").toString(), "base64");
}

function tenantFile(): string {
  const name = files().find((entry) => entry !== "key.bin");
  expect(name).toMatch(/^[0-9a-f]{32}\.bin$/);
  return path.join(dir, name!);
}

beforeEach(() => {
  env.available = true;
  env.backend = "keychain";
  env.failDecrypt = false;
  env.logged.length = 0;
  clock = new Date("2026-10-22T10:00:00.000Z");
  dir = path.join(mkdtempSync(path.join(tmpdir(), "benchmark-exceptions-")), "store");
});

afterEach(() => {
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe("benchmark exceptions store", () => {
  it("keeps owner, reason and ids encrypted at rest, under opaque file names", async () => {
    const exceptions = store();
    const [saved] = await exceptions.set(TENANT, input(), always);
    expect(saved).toMatchObject({ ...input(), createdAt: clock.toISOString() });
    expect(saved!.id).toMatch(/^[0-9a-f-]{36}$/);
    const text = folderText();
    for (const secret of [OWNER, REASON, SETTING, "synthetic-bench", "9.9.9", TENANT, "2027-01-31"]) {
      expect(text).not.toContain(secret);
    }
    expect(files().some((name) => name.includes(TENANT))).toBe(false);
    // A fresh store reads it back with the wrapped key.
    expect(await store().list(TENANT)).toEqual([saved]);
  });

  it("never logs owner, reason or ids", async () => {
    const exceptions = store();
    await exceptions.set(TENANT, input(), always);
    await exceptions.remove(TENANT, { ...IDENTITY, settingId: SETTING }, always);
    writeFileSync(path.join(dir, "junk"), "x");
    const logged = JSON.stringify(env.logged);
    expect(env.logged.length).toBeGreaterThan(0);
    for (const secret of [OWNER, REASON, SETTING, "synthetic-bench", TENANT]) expect(logged).not.toContain(secret);
  });

  it("keeps tenants apart: a file moved to another tenant does not decrypt", async () => {
    const exceptions = store();
    await exceptions.set(TENANT, input(), always);
    expect(await exceptions.list(OTHER)).toEqual([]);
    await exceptions.set(OTHER, input({ settingId: "synthetic_setting_beta" }), always);
    const named = files().filter((name) => name !== "key.bin");
    expect(named).toHaveLength(2);
    // Swap the two files: the tenant id is authenticated with the data.
    const [a, b] = named.map((name) => path.join(dir, name));
    const first = readFileSync(a!);
    writeFileSync(a!, readFileSync(b!));
    writeFileSync(b!, first);
    const fresh = store();
    await expect(fresh.list(TENANT)).rejects.toThrow(EXCEPTIONS_UNREADABLE);
    await expect(fresh.list(OTHER)).rejects.toThrow(EXCEPTIONS_UNREADABLE);
  });

  it("changes the exception of the same setting instead of adding another, keeping its id and creation time", async () => {
    const exceptions = store();
    const [first] = await exceptions.set(TENANT, input(), always);
    clock = new Date("2026-11-01T10:00:00.000Z");
    const after = await exceptions.set(TENANT, input({ owner: "Synthetic Other Owner", expiresOn: "2027-03-31" }), always);
    expect(after).toEqual([{ ...first, owner: "Synthetic Other Owner", expiresOn: "2027-03-31" }]);
    const both = await exceptions.set(TENANT, input({ level: 2 }), always);
    expect(both.map((entry) => entry.level)).toEqual([1, 2]);
    const removed = await exceptions.remove(TENANT, { ...IDENTITY, settingId: SETTING }, always);
    expect(removed.map((entry) => entry.level)).toEqual([2]);
  });

  it("validates input with the engine's rules before anything is written", async () => {
    const exceptions = store();
    await expect(exceptions.set(TENANT, input({ owner: "x".repeat(101) }), always)).rejects.toThrow("at most 100");
    await expect(exceptions.set(TENANT, input({ expiresOn: "2027-02-30" }), always)).rejects.toThrow("YYYY-MM-DD");
    await expect(exceptions.set(TENANT, { ...input(), note: "Synthetic" } as never, always)).rejects.toThrow(
      "unknown field note",
    );
    await expect(exceptions.set("not-a-tenant", input(), always)).rejects.toThrow("Unknown tenant.");
    expect(files()).toEqual([]);
  });

  it(`keeps at most ${MAX_EXCEPTIONS} exceptions per tenant`, async () => {
    const exceptions = store();
    const [first] = await exceptions.set(TENANT, input({ settingId: "synthetic_setting_0" }), always);
    const full = Array.from({ length: MAX_EXCEPTIONS }, (_, index) => ({
      ...first!,
      id: `synthetic-id-${index}`,
      settingId: `synthetic_setting_${index}`,
    }));
    const aad = Buffer.from(`${EXCEPTIONS_FORMAT}\n${TENANT}`, "utf8");
    writeFileSync(tenantFile(), seal(keyOf(), aad, Buffer.from(JSON.stringify({ format: EXCEPTIONS_FORMAT, exceptions: full }))));
    await expect(exceptions.set(TENANT, input({ settingId: "synthetic_setting_more" }), always)).rejects.toThrow(
      EXCEPTIONS_FULL,
    );
    // Changing an existing one still works.
    await expect(exceptions.set(TENANT, input({ settingId: "synthetic_setting_0", owner: "B" }), always)).resolves.toHaveLength(
      MAX_EXCEPTIONS,
    );
  });

  it("rejects a stored file with extra fields, at the top level or in an exception", async () => {
    const exceptions = store();
    const [saved] = await exceptions.set(TENANT, input(), always);
    const file = tenantFile();
    const aad = Buffer.from(`${EXCEPTIONS_FORMAT}\n${TENANT}`, "utf8");
    const write = (value: unknown) => writeFileSync(file, seal(keyOf(), aad, Buffer.from(JSON.stringify(value))));
    write({ format: EXCEPTIONS_FORMAT, exceptions: [saved] });
    await expect(store().list(TENANT)).resolves.toEqual([saved]);
    write({ format: EXCEPTIONS_FORMAT, exceptions: [{ ...saved, title: "Synthetic title" }] });
    await expect(store().list(TENANT)).rejects.toThrow(EXCEPTIONS_UNREADABLE);
    write({ format: EXCEPTIONS_FORMAT, exceptions: [saved], titles: ["Synthetic title"] });
    await expect(store().list(TENANT)).rejects.toThrow(EXCEPTIONS_UNREADABLE);
    write({ format: "intunedoc.benchmark-exceptions/9", exceptions: [saved] });
    await expect(store().list(TENANT)).rejects.toThrow(EXCEPTIONS_UNREADABLE);
    // A damaged file is never overwritten.
    const damaged = readFileSync(file);
    await expect(store().set(TENANT, input({ settingId: "synthetic_setting_beta" }), always)).rejects.toThrow(
      EXCEPTIONS_UNREADABLE,
    );
    expect(readFileSync(file).equals(damaged)).toBe(true);
  });

  it("rejects a changed file", async () => {
    await store().set(TENANT, input(), always);
    const file = tenantFile();
    const bytes = readFileSync(file);
    bytes[bytes.length - 1] ^= 1;
    writeFileSync(file, bytes);
    await expect(store().list(TENANT)).rejects.toThrow(EXCEPTIONS_UNREADABLE);
  });

  it("stores nothing without secure storage, also on the Linux basic text backend", async () => {
    env.available = false;
    await expect(store().set(TENANT, input(), always)).rejects.toThrow(EXCEPTIONS_UNAVAILABLE);
    await expect(store().list(TENANT)).rejects.toThrow(EXCEPTIONS_UNAVAILABLE);
    env.available = true;
    if (process.platform === "linux") {
      env.backend = "basic_text";
      await expect(store().set(TENANT, input(), always)).rejects.toThrow(EXCEPTIONS_UNAVAILABLE);
    }
    expect(files()).toEqual([]);
  });

  it("says try again when the key cannot be unlocked right now, and keeps the file", async () => {
    await store().set(TENANT, input(), always);
    const before = folderText();
    env.failDecrypt = true;
    await expect(store().list(TENANT)).rejects.toThrow(EXCEPTIONS_LOCKED);
    await expect(store().set(TENANT, input(), always)).rejects.toThrow(EXCEPTIONS_LOCKED);
    expect(folderText()).toBe(before);
    env.failDecrypt = false;
    await expect(store().list(TENANT)).resolves.toHaveLength(1);
  });

  it("drops a write when the account changed while it was queued, or a reset (sign out) happened", async () => {
    const exceptions = store();
    let signedIn = true;
    await expect(
      exceptions.set(TENANT, input(), () => signedIn).then(() => undefined),
    ).resolves.toBeUndefined();
    signedIn = false;
    await expect(exceptions.set(TENANT, input({ settingId: "synthetic_setting_beta" }), () => signedIn)).rejects.toThrow(
      EXCEPTIONS_ACCOUNT_CHANGED,
    );
    signedIn = true;
    const queued = exceptions.set(TENANT, input({ settingId: "synthetic_setting_gamma" }), () => signedIn);
    exceptions.reset();
    await expect(queued).rejects.toThrow(EXCEPTIONS_ACCOUNT_CHANGED);
    expect((await exceptions.list(TENANT)).map((entry) => entry.settingId)).toEqual([SETTING]);
  });

  it("clear removes every file after a running write (clear local data)", async () => {
    const exceptions = store();
    await exceptions.set(TENANT, input(), always);
    const running = exceptions.set(OTHER, input(), always).catch((error: Error) => error.message);
    await exceptions.clear();
    await running;
    expect(existsSync(dir)).toBe(false);
    expect(await exceptions.list(TENANT)).toEqual([]);
  });
});

describe("benchmarks:exceptions requests", () => {
  // Comparing Level 2 applies the exceptions of Level 1 and Level 2, so the
  // answer holds every level of the benchmark and version; set and remove
  // change only the requested level.
  it("answers list, set and remove with the exceptions of the requested benchmark and version at every level", async () => {
    const exceptions = store();
    await exceptions.set(TENANT, input({ level: 2 }), always);
    await exceptions.set(TENANT, input({ version: "9.9.8" }), always);
    const set = await answerExceptions(exceptions, TENANT, { action: "set", ...input() }, always);
    expect(set.map((entry) => [entry.version, entry.level])).toEqual([
      ["9.9.9", 2],
      ["9.9.9", 1],
    ]);
    const list = await answerExceptions(exceptions, TENANT, { action: "list", ...IDENTITY, level: 2 }, always);
    expect(list.map((entry) => [entry.version, entry.level])).toEqual([
      ["9.9.9", 2],
      ["9.9.9", 1],
    ]);
    const removed = await answerExceptions(
      exceptions,
      TENANT,
      { action: "remove", ...IDENTITY, settingId: SETTING },
      always,
    );
    expect(removed.map((entry) => [entry.version, entry.level])).toEqual([["9.9.9", 2]]);
    const removedTwo = await answerExceptions(
      exceptions,
      TENANT,
      { action: "remove", ...IDENTITY, level: 2, settingId: SETTING },
      always,
    );
    expect(removedTwo).toEqual([]);
    expect((await exceptions.list(TENANT)).map((entry) => entry.version)).toEqual(["9.9.8"]);
  });
});
