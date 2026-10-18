import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assessCompliance } from "../../../../src/lib/compliance/engine";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import {
  projectSnapshot,
  type SnapshotProjection,
} from "../../../../src/lib/snapshots/projection";

const env = vi.hoisted(() => ({
  available: true,
  backend: "keychain",
  failDecrypt: false,
}));

// The wrapped key is not plaintext either, so a test can search the folder
// for tenant data.
vi.mock("electron", () => ({
  safeStorage: {
    isEncryptionAvailable: () => env.available,
    getSelectedStorageBackend: () => env.backend,
    encryptString: (text: string) =>
      Buffer.from(`wrapped:${Buffer.from(text).toString("hex")}`),
    decryptString: (bytes: Buffer) => {
      if (env.failDecrypt) throw new Error("Keychain changed");
      return Buffer.from(bytes.toString().replace(/^wrapped:/, ""), "hex").toString();
    },
  },
}));

vi.mock("./logger", () => ({ log: () => undefined }));

const { HistoryUnavailableError, KEY_LOCKED, SnapshotStore, UNAVAILABLE_REASONS, seal, unseal } =
  await import("./snapshots");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const DAY = 24 * 60 * 60_000;

let dir = "";
let clock = Date.UTC(2026, 9, 18, 10, 0, 0);

function store(limits = {}) {
  return new SnapshotStore({ dir: () => dir, limits, now: () => clock });
}

function projection(name = "WIN - Secret Policy Name", collectedAt?: string): SnapshotProjection {
  const data: DetailedExportData = {
    collectedAt: collectedAt ?? new Date(clock).toISOString(),
    settingsCatalog: [],
    deviceConfigurations: [],
    administrativeTemplates: [],
    compliancePolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    fetchErrors: [],
    sections: [
      {
        key: "settingsCatalog",
        familyKey: "settingsCatalog",
        label: "Settings Catalog",
        selectionPrefix: "catalog",
        items: [{ id: "policy-1", name }],
      },
    ],
  };
  return projectSnapshot(data, assessCompliance(data), new Map());
}

const guard = (target: InstanceType<typeof SnapshotStore>) => ({
  generation: target.begin(),
  isCurrent: () => true,
});

function allFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(root, entry.name);
    return entry.isDirectory() ? allFiles(full) : [full];
  });
}

function snapshotFiles(): string[] {
  return allFiles(dir).filter((file) => file.endsWith(".snap"));
}

beforeEach(() => {
  dir = path.join(mkdtempSync(path.join(tmpdir(), "intunedoc-history-")), "snapshots");
  env.available = true;
  env.backend = "keychain";
  env.failDecrypt = false;
  clock = Date.UTC(2026, 9, 18, 10, 0, 0);
});

afterEach(() => {
  rmSync(path.dirname(dir), { recursive: true, force: true });
});

describe("SnapshotStore", () => {
  it("round trips a snapshot without plaintext on disk", async () => {
    const history = store();
    const saved = projection();
    const entry = await history.save(TENANT.toUpperCase(), saved, guard(history));
    expect(entry).toMatchObject({ items: 1, partial: false, collectedAt: saved.collectedAt });
    expect(await history.list(TENANT)).toEqual([entry]);
    expect(await history.read(TENANT, entry!.id)).toEqual(JSON.parse(JSON.stringify(saved)));

    const files = allFiles(dir);
    expect(files.map((file) => path.basename(file)).sort()).toEqual(
      ["index.bin", "key.bin", `${entry!.id}.snap`].sort(),
    );
    for (const file of files) {
      const bytes = readFileSync(file);
      expect(bytes.includes("Secret Policy Name")).toBe(false);
      expect(bytes.includes(TENANT)).toBe(false);
      expect(file.includes(TENANT)).toBe(false);
      if (process.platform !== "win32") expect(statSync(file).mode & 0o077).toBe(0);
    }
    // A new process reads the same history with the stored key.
    expect(await store().read(TENANT, entry!.id)).toEqual(JSON.parse(JSON.stringify(saved)));
  });

  it("rejects a changed snapshot file", async () => {
    const history = store();
    const entry = await history.save(TENANT, projection(), guard(history));
    const [file] = snapshotFiles();
    const bytes = readFileSync(file!);
    bytes[bytes.length - 5] ^= 0xff;
    writeFileSync(file!, bytes);
    await expect(store().read(TENANT, entry!.id)).rejects.toThrow(
      "This snapshot could not be read",
    );
  });

  it("rejects data sealed for another tenant or snapshot id", () => {
    const key = Buffer.alloc(32, 7);
    const sealed = seal(key, Buffer.from(`f\n${TENANT}\nid`), Buffer.from("data"));
    expect(unseal(key, Buffer.from(`f\n${TENANT}\nid`), sealed).toString()).toBe("data");
    expect(() => unseal(key, Buffer.from(`f\n${OTHER}\nid`), sealed)).toThrow();
    expect(() => unseal(key, Buffer.from(`f\n${TENANT}\nother`), sealed)).toThrow();
    expect(() => unseal(Buffer.alloc(32, 8), Buffer.from(`f\n${TENANT}\nid`), sealed)).toThrow();
  });

  it("keeps tenants apart", async () => {
    const history = store();
    const entry = await history.save(TENANT, projection(), guard(history));
    await history.save(OTHER, projection("Other"), guard(history));
    expect(await history.list(OTHER)).toHaveLength(1);
    await expect(history.read(OTHER, entry!.id)).rejects.toThrow(
      "not in the history of the signed in tenant",
    );
    await expect(history.read("not-a-tenant", entry!.id)).rejects.toThrow("Unknown tenant");
    await expect(history.read(TENANT, "../index")).rejects.toThrow("Unknown snapshot");
    // A file moved into another tenant's folder does not decrypt there.
    const files = snapshotFiles();
    const own = files.find((file) => file.endsWith(`${entry!.id}.snap`))!;
    const other = files.find((file) => file !== own)!;
    const otherId = path.basename(other, ".snap");
    writeFileSync(other, readFileSync(own));
    await expect(store().read(OTHER, otherId)).rejects.toThrow("could not be read");
  });

  it("ignores and sweeps leftovers of an interrupted write", async () => {
    const history = store();
    const entry = await history.save(TENANT, projection(), guard(history));
    const [file] = snapshotFiles();
    writeFileSync(`${file}.abcdef.tmp`, "partial");
    writeFileSync(path.join(dir, "index.bin.123456.tmp"), "partial");
    // A complete file the index never listed, as after a crash before the
    // index write.
    writeFileSync(path.join(path.dirname(file!), "20261018T090000Z-deadbeef.snap"), "x");
    const fresh = store();
    expect(await fresh.list(TENANT)).toEqual([entry]);
    expect(allFiles(dir).filter((name) => name.endsWith(".tmp"))).toEqual([]);
    expect(snapshotFiles()).toEqual([file]);
  });

  it("stores nothing and says why when encryption is unavailable", async () => {
    env.available = false;
    const history = store();
    expect(history.unavailableReason()).toBe(UNAVAILABLE_REASONS.encryption);
    await expect(history.save(TENANT, projection(), guard(history))).rejects.toBeInstanceOf(
      HistoryUnavailableError,
    );
    await expect(history.list(TENANT)).rejects.toThrow(UNAVAILABLE_REASONS.encryption);
    expect(existsSync(dir)).toBe(false);
  });

  it("treats the Linux basic text backend as unavailable", () => {
    const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
    Object.defineProperty(process, "platform", { value: "linux" });
    env.backend = "basic_text";
    try {
      expect(store().unavailableReason()).toBe(UNAVAILABLE_REASONS.encryption);
    } finally {
      Object.defineProperty(process, "platform", platform);
    }
  });

  it("tries a key that did not unlock again on the next read", async () => {
    const history = store();
    const entry = await history.save(TENANT, projection(), guard(history));
    env.failDecrypt = true;
    const fresh = store();
    await expect(fresh.list(TENANT)).rejects.toThrow(KEY_LOCKED);
    // Not latched, and no advice to delete everything.
    expect(fresh.unavailableReason()).toBeNull();
    await expect(fresh.deleteTenant(TENANT)).rejects.toThrow(KEY_LOCKED);
    expect(snapshotFiles()).toHaveLength(1);
    env.failDecrypt = false;
    expect(await fresh.list(TENANT)).toEqual([entry]);
  });

  it("reports a damaged key and resets on delete all", async () => {
    const history = store();
    await history.save(TENANT, projection(), guard(history));
    // Unwraps, but is not a 256 bit key.
    writeFileSync(
      path.join(dir, "key.bin"),
      `wrapped:${Buffer.from(Buffer.alloc(5).toString("base64")).toString("hex")}`,
    );
    const fresh = store();
    await expect(fresh.list(TENANT)).rejects.toThrow(UNAVAILABLE_REASONS.key);
    expect(fresh.unavailableReason()).toBe(UNAVAILABLE_REASONS.key);
    await fresh.deleteTenant(TENANT);
    expect(existsSync(dir)).toBe(false);
    expect(fresh.unavailableReason()).toBeNull();
    expect(await fresh.list(TENANT)).toEqual([]);
  });

  it("reads the backup when the index is damaged, then keeps a good backup", async () => {
    const history = store();
    const first = await history.save(TENANT, projection(), guard(history));
    clock += 60_000;
    await history.save(TENANT, projection(), guard(history));
    const file = path.join(dir, "index.bin");
    const index = readFileSync(file);
    index[index.length - 1] ^= 0xff;
    writeFileSync(file, index);
    const fresh = store();
    expect(await fresh.list(TENANT)).toEqual([first]);
    expect(fresh.unavailableReason()).toBeNull();
    // The snapshot only the damaged index listed is swept.
    expect(snapshotFiles()).toHaveLength(1);
    clock += 60_000;
    const third = await fresh.save(TENANT, projection(), guard(fresh));
    expect(await store().list(TENANT)).toEqual([third, first]);
  });

  it("reports a changed index", async () => {
    const history = store();
    await history.save(TENANT, projection(), guard(history));
    const index = readFileSync(path.join(dir, "index.bin"));
    index[index.length - 1] ^= 0xff;
    writeFileSync(path.join(dir, "index.bin"), index);
    const fresh = store();
    await expect(fresh.list(TENANT)).rejects.toThrow(UNAVAILABLE_REASONS.index);
  });

  it("removes snapshots past the age limit when history is opened, not only on save", async () => {
    const history = store({ maxAgeDays: 30 });
    await history.save(TENANT, projection(), guard(history));
    clock += 31 * DAY;
    expect(await history.list(TENANT)).toEqual([]);
    expect(snapshotFiles()).toEqual([]);
    expect(await store().list(TENANT)).toEqual([]);
  });

  it("applies the count, age and size limits, oldest first", async () => {
    const history = store({ perTenant: 3 });
    const ids: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      clock += 60_000;
      ids.push((await history.save(TENANT, projection(), guard(history)))!.id);
    }
    expect((await history.list(TENANT)).map((entry) => entry.id)).toEqual(
      ids.slice(2).reverse(),
    );
    expect(snapshotFiles()).toHaveLength(3);

    const aged = store({ maxAgeDays: 30 });
    await aged.save(OTHER, projection("Old", new Date(clock - 40 * DAY).toISOString()), guard(aged));
    clock += 60_000;
    const kept = await aged.save(OTHER, projection(), guard(aged));
    expect(await aged.list(OTHER)).toEqual([kept]);

    const sized = store({ maxBytes: 1 });
    clock += 60_000;
    const latest = await sized.save(TENANT, projection(), guard(sized));
    // Every other snapshot of every tenant goes; the new one stays.
    expect(await sized.list(TENANT)).toEqual([latest]);
    expect(await sized.list(OTHER)).toEqual([]);
    expect(snapshotFiles()).toHaveLength(1);
  });

  it("drops a save after an account change", async () => {
    const history = store();
    const stale = history.begin();
    history.invalidate();
    expect(
      await history.save(TENANT, projection(), { generation: stale, isCurrent: () => true }),
    ).toBeNull();
    let calls = 0;
    // Signed out while the file was written.
    expect(
      await history.save(TENANT, projection(), {
        generation: history.begin(),
        isCurrent: () => (calls += 1) === 1,
      }),
    ).toBeNull();
    expect(snapshotFiles()).toEqual([]);
    expect(await history.list(TENANT)).toEqual([]);
  });

  it("undoes a save when the account changes during the index write", async () => {
    const history = store();
    const kept = await history.save(TENANT, projection(), guard(history));
    clock += 60_000;
    let calls = 0;
    // Current before and after the snapshot write, not after the index write.
    expect(
      await history.save(TENANT, projection(), {
        generation: history.begin(),
        isCurrent: () => (calls += 1) <= 2,
      }),
    ).toBeNull();
    expect(calls).toBe(3);
    expect(snapshotFiles()).toHaveLength(1);
    expect(await history.list(TENANT)).toEqual([kept]);
    expect(await store().list(TENANT)).toEqual([kept]);
  });

  it("flushes every file to disk before it is renamed into place", async () => {
    const { promises } = await import("node:fs");
    const open = promises.open.bind(promises);
    const rename = promises.rename.bind(promises);
    const name = (file: unknown) => path.basename(String(file)).split(".")[0];
    const order: string[] = [];
    const opened = vi.spyOn(promises, "open").mockImplementation(async (...args: Parameters<typeof open>) => {
      const handle = await open(...args);
      const sync = handle.sync.bind(handle);
      handle.sync = async () => {
        order.push(`sync ${name(args[0])}`);
        return sync();
      };
      return handle;
    });
    const renamed = vi.spyOn(promises, "rename").mockImplementation(async (from, to) => {
      order.push(`rename ${name(from)}`);
      return rename(from, to);
    });
    try {
      const history = store();
      await history.save(TENANT, projection(), guard(history));
    } finally {
      opened.mockRestore();
      renamed.mockRestore();
    }
    // Key, snapshot and index: each flushed, then renamed.
    expect(order).toHaveLength(6);
    for (let index = 0; index < order.length; index += 2) {
      expect(order[index]!.replace("sync", "rename")).toBe(order[index + 1]);
    }
  });

  it("has data to delete only once something was stored", async () => {
    const history = store();
    expect(await history.hasData()).toBe(false);
    await history.save(TENANT, projection(), guard(history));
    env.available = false;
    expect(await history.hasData()).toBe(true);
    await history.clear();
    expect(await history.hasData()).toBe(false);
  });

  it("deletes one snapshot and all snapshots of a tenant", async () => {
    const history = store();
    const first = await history.save(TENANT, projection(), guard(history));
    clock += 60_000;
    const second = await history.save(TENANT, projection(), guard(history));
    await history.save(OTHER, projection(), guard(history));
    await history.delete(TENANT, first!.id);
    expect(await history.list(TENANT)).toEqual([second]);
    await history.deleteTenant(TENANT);
    expect(await history.list(TENANT)).toEqual([]);
    expect(await history.list(OTHER)).toHaveLength(1);
    expect(snapshotFiles()).toHaveLength(1);
  });

  it("clears snapshots, key and index after a running write", async () => {
    const history = store();
    const pending = history.save(TENANT, projection(), guard(history));
    const cleared = history.clear();
    await pending;
    await cleared;
    expect(existsSync(dir)).toBe(false);
    expect(await history.list(TENANT)).toEqual([]);
  });
});

describe("SnapshotStore tenants and labels", () => {
  it("lists every stored tenant from the index without decrypting snapshots", async () => {
    const target = store();
    await target.save(TENANT, projection("A"), guard(target));
    clock += DAY;
    const latest = await target.save(TENANT, projection("B"), guard(target));
    await target.save(OTHER, projection("C"), guard(target));
    // A damaged snapshot file does not matter: only the index is read.
    for (const file of snapshotFiles()) writeFileSync(file, "damaged");
    const reopened = store();
    const tenants = await reopened.tenants();
    expect(tenants.map((entry) => entry.tenantId).sort()).toEqual([OTHER, TENANT].sort());
    const own = tenants.find((entry) => entry.tenantId === TENANT)!;
    expect(own).toMatchObject({ label: null, snapshots: 2 });
    expect(own.latest?.id).toBe(latest!.id);
    expect(own.latest?.frameworks.length).toBeGreaterThan(0);
    expect(own.latest?.frameworks[0]).toEqual(
      expect.objectContaining({
        id: expect.any(String),
        totalControls: expect.any(Number),
        withEvidence: expect.any(Number),
        applicableControls: expect.any(Number),
      }),
    );
    await expect(reopened.read(TENANT, latest!.id)).rejects.toThrow();
  });

  it("returns nothing before any history was saved", async () => {
    expect(await store().tenants()).toEqual([]);
  });

  it("stores a label in the encrypted index and removes it when empty", async () => {
    const target = store();
    await target.save(TENANT, projection(), guard(target));
    await target.setLabel(TENANT, "  Contoso Retail  ");
    expect((await store().tenants())[0]!.label).toBe("Contoso Retail");
    const text = allFiles(dir).map((file) => readFileSync(file).toString("latin1")).join("");
    expect(text).not.toContain("Contoso Retail");
    await target.setLabel(TENANT, "");
    expect((await store().tenants())[0]!.label).toBeNull();
  });

  it("refuses a label for a tenant without history or a label that is too long", async () => {
    const target = store();
    await target.save(TENANT, projection(), guard(target));
    await expect(target.setLabel(OTHER, "Fabrikam")).rejects.toThrow(
      "This tenant has no history on this computer.",
    );
    await expect(target.setLabel(TENANT, "x".repeat(61))).rejects.toThrow("too long");
    await expect(target.setLabel("not-a-tenant", "Fabrikam")).rejects.toThrow("Unknown tenant.");
  });

  it("keeps the label when the last snapshot is deleted and drops it with the tenant", async () => {
    const target = store();
    const entry = await target.save(TENANT, projection(), guard(target));
    await target.setLabel(TENANT, "Contoso");
    await target.delete(TENANT, entry!.id);
    expect(await target.tenants()).toEqual([
      { tenantId: TENANT, label: "Contoso", snapshots: 0, latest: null },
    ]);
    await target.deleteTenant(TENANT);
    expect(await target.tenants()).toEqual([]);
  });
});

