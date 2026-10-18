import { sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { IpcMainInvokeEvent } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CONTOSO_TENANT } from "../../../../src/lib/compliance/demo/contoso-tenant";
import { assessCompliance } from "../../../../src/lib/compliance/engine";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import type { ConfigurationSectionData } from "../../../../src/lib/configuration-sections";
import { projectSnapshot } from "../../../../src/lib/snapshots/projection";
import type {
  CompareView,
  ManagementChangesResult,
  PortfolioView,
  ReferenceLoadResult,
  ScheduleStatus,
} from "../shared/ipc-types";

// Handler level harness: the real handlers, the real snapshot store and the
// real license service with signed Pro and MSP entitlement fixtures. Only
// Electron, the licensing endpoint and the file dialogs are stubbed.

const keys = await vi.hoisted(async () => {
  const crypto = await import("node:crypto");
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  return {
    publicPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
    privatePem: privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    dir: { current: "" },
  };
});

vi.mock("electron", () => ({
  net: { fetch: (...args: Parameters<typeof fetch>) => fetch(...args) },
  app: { getPath: () => keys.dir.current, getVersion: () => "0.0.0-test" },
  safeStorage: {
    isEncryptionAvailable: () => true,
    getSelectedStorageBackend: () => "keychain",
    encryptString: (text: string) => Buffer.from(`wrapped:${Buffer.from(text).toString("hex")}`),
    decryptString: (bytes: Buffer) =>
      Buffer.from(bytes.toString().replace(/^wrapped:/, ""), "hex").toString(),
  },
}));

vi.mock("./config", () => ({
  LICENSE_API_BASE: "http://127.0.0.1:9",
  LICENSE_PUBLIC_KEY: keys.publicPem,
}));

vi.mock("./logger", () => ({ log: () => undefined, errorText: String }));

const { LicenseService, MSP_PLAN_REQUIRED } = await import("./license");
const { SnapshotStore } = await import("./snapshots");
const { registerHistoryIpc, NEEDS_REFERENCE, ACCOUNT_SWITCHED } = await import("./history-ipc");

const TENANT = "11111111-2222-3333-4444-555555555555";
const OTHER = "99999999-8888-7777-6666-555555555555";
const INSTALL = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OWNER = "owner-1";

type Plan = "none" | "pro" | "msp";

function token(plan: "pro" | "msp"): string {
  const iat = Math.floor(Date.now() / 1000);
  const body = Buffer.from(
    JSON.stringify({
      v: 1,
      sub: "sub",
      act: "act-1",
      plan,
      tenantId: TENANT,
      installId: INSTALL,
      tenants: plan === "msp" ? 25 : 1,
      status: "granted",
      iat,
      exp: iat + 14 * 86400,
    }),
  ).toString("base64url");
  return `${body}.${sign(null, Buffer.from(body), keys.privatePem).toString("base64url")}`;
}

function section(key: string, items: unknown[], label = key): ConfigurationSectionData {
  return { key, familyKey: key, label, selectionPrefix: key, items } as ConfigurationSectionData;
}

function contoso(collectedAt: string, edit?: (data: DetailedExportData) => void): DetailedExportData {
  const base = structuredClone({ ...CONTOSO_TENANT, groupNames: undefined }) as DetailedExportData;
  edit?.(base);
  return {
    ...base,
    collectedAt,
    sections: [
      section("settingsCatalog", base.settingsCatalog, "Settings Catalog"),
      section("deviceConfigurations", base.deviceConfigurations, "Device configurations"),
      section("compliancePolicies", base.compliancePolicies, "Compliance policies"),
    ],
    fetchErrors: [],
  };
}

function projectionOf(data: DetailedExportData) {
  return JSON.parse(JSON.stringify(projectSnapshot(data, assessCompliance(data), new Map())));
}

const scheduleStatus: ScheduleStatus = {
  hours: 0,
  state: "off",
  reason: null,
  nextRunAt: null,
  lastRunAt: null,
  lastResult: null,
  lastError: null,
  lastSkippedAt: null,
  lastSkippedReason: null,
};

function harness(plan: Plan, options: { current?: DetailedExportData | null } = {}) {
  if (plan !== "none") {
    const stored = JSON.stringify({
      key: "TEST-LICENSE-KEY",
      activations: { [TENANT]: { activationId: "act-1", token: token(plan) } },
    });
    // Wrapped like the safeStorage stub below does.
    writeFileSync(
      path.join(keys.dir.current, "license.bin"),
      `wrapped:${Buffer.from(stored).toString("hex")}`,
    );
  }
  const handlers = new Map<string, (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown>();
  const store = new SnapshotStore({ dir: () => path.join(keys.dir.current, "snapshots") });
  const settings = { keepHistory: true, scheduleHours: 0 as 0 | 6 | 12 | 24 };
  const saved: Array<{ name: string; bytes: Uint8Array }> = [];
  const env = {
    pick: null as string | null,
    current: options.current === undefined ? contoso("2026-10-18T10:00:00Z") : options.current,
    signedIn: TENANT as string | null,
    // Runs inside currentInputs and the file picker, to switch accounts.
    during: null as null | (() => void),
  };
  const scheduler = { status: vi.fn(() => scheduleStatus), refresh: vi.fn(async () => undefined) };
  const notified = vi.fn();
  const ipc = registerHistoryIpc({
    handle: (channel, listener) => handlers.set(channel, listener),
    requireOwner: async () => {
      if (!env.signedIn) throw new Error("Sign in before continuing.");
      return OWNER;
    },
    signedInTenant: () => env.signedIn,
    // Without a stored key the service asks the licensing endpoint for an
    // organization license, which the stub below refuses.
    license: new LicenseService(
      async () => "id.token.value",
      () => "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
    ),
    store,
    readSettings: async () => ({
      clientId: "client",
      tenantId: "organizations",
      autoUpdate: false,
      checkForUpdates: true,
      ...settings,
    }),
    writeSettings: async (input) => {
      Object.assign(settings, input);
      return {
        clientId: "client",
        tenantId: "organizations",
        autoUpdate: false,
        checkForUpdates: true,
        ...settings,
      };
    },
    currentInputs: async () => {
      env.during?.();
      if (!env.current) throw new Error("Collect tenant data first.");
      return {
        collection: env.current,
        assessment: assessCompliance(env.current),
        groupNames: new Map(),
      };
    },
    track: (work) => work(),
    saveFile: async (name, bytes) => {
      saved.push({ name, bytes });
      return `/saved/${name}`;
    },
    pickJsonFile: async () => {
      env.during?.();
      return env.pick;
    },
    scheduler,
    notifyHistoryChanged: notified,
    log: () => undefined,
  });
  const invoke = <T = unknown>(channel: string, ...args: unknown[]): Promise<T> => {
    const handler = handlers.get(channel);
    if (!handler) throw new Error(`No handler for ${channel}`);
    return Promise.resolve(handler({} as IpcMainInvokeEvent, ...args)) as Promise<T>;
  };
  const guard = () => ({ generation: store.begin(), isCurrent: () => true });
  return { handlers, invoke, store, settings, saved, env, scheduler, notified, ipc, guard };
}

beforeEach(() => {
  keys.dir.current = mkdtempSync(path.join(tmpdir(), "history-ipc-"));
  writeFileSync(path.join(keys.dir.current, "install-id"), INSTALL);
  // The licensing service is never reachable: no new activation can happen.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ reason: "tenant_not_licensed" }, { status: 403 })),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(keys.dir.current, { recursive: true, force: true });
});

const request = { frameworkId: "nis2-2022-2555", scope: {} };

// Every new channel with arguments that would pass validation.
const CALLS: Array<[string, ...unknown[]]> = [
  ["history:status"],
  ["history:setEnabled", true],
  ["history:list"],
  ["history:diff", {}],
  ["history:delete", "20261018T100000Z-aaaaaaaa"],
  ["history:deleteAll"],
  ["history:changes", request],
  ["history:scheduleStatus"],
  ["history:setSchedule", 6],
  ["compare:exportReference"],
  ["compare:loadReference"],
  ["compare:clearReference"],
  ["compare:referenceStatus"],
  ["compare:run", { kind: "reference" }],
  ["compare:run", { kind: "tenant", tenantId: OTHER }],
  ["compare:tenants"],
  ["portfolio:list"],
  ["portfolio:setLabel", OTHER, "Fabrikam"],
  ["portfolio:deleteTenant", OTHER],
];

const MSP_ONLY = new Set(["compare:tenants", "portfolio:list", "portfolio:setLabel", "portfolio:deleteTenant"]);

describe("history IPC licensing gates", () => {
  it("registers every channel the gates cover", () => {
    const { handlers } = harness("msp");
    expect([...handlers.keys()].sort()).toEqual([...new Set(CALLS.map(([channel]) => channel))].sort());
  });

  it("rejects every history, compare and portfolio handler without a license", async () => {
    const { invoke, store, saved, settings } = harness("none");
    for (const [channel, ...args] of CALLS) {
      await expect(invoke(channel, ...args), channel).rejects.toThrow("A license is required");
    }
    expect(saved).toEqual([]);
    expect(settings).toEqual({ keepHistory: true, scheduleHours: 0 });
    expect(await store.tenants()).toEqual([]);
  });

  it("rejects every handler when nobody is signed in", async () => {
    const { invoke, env } = harness("msp");
    env.signedIn = null;
    for (const [channel, ...args] of CALLS) {
      await expect(invoke(channel, ...args), channel).rejects.toThrow("Sign in before continuing.");
    }
  });

  it("rejects Portfolio and cross tenant compare on a Pro license, accepts the rest", async () => {
    const { invoke, store, guard } = harness("pro");
    await store.save(OTHER, projectionOf(contoso("2026-10-17T10:00:00Z")), guard());
    for (const [channel, ...args] of CALLS) {
      const tenantCompare = channel === "compare:run" && (args[0] as { kind: string }).kind === "tenant";
      if (MSP_ONLY.has(channel) || tenantCompare) {
        await expect(invoke(channel, ...args), channel).rejects.toThrow(MSP_PLAN_REQUIRED);
      }
    }
    // The other tenant's history is untouched.
    expect((await store.tenants()).map((entry) => [entry.tenantId, entry.label])).toEqual([[OTHER, null]]);
    await expect(invoke("history:list")).resolves.toEqual([]);
    await expect(invoke("compare:run", { kind: "reference" })).rejects.toThrow(NEEDS_REFERENCE);
  });

  it("accepts Portfolio and cross tenant compare on an MSP license", async () => {
    const { invoke, store, guard } = harness("msp");
    await store.save(OTHER, projectionOf(contoso("2026-10-17T10:00:00Z")), guard());
    const tenants = await invoke<Array<{ tenantId: string }>>("compare:tenants");
    expect(tenants.map((entry) => entry.tenantId)).toEqual([OTHER]);
    const view = await invoke<CompareView>("compare:run", { kind: "tenant", tenantId: OTHER });
    expect(view.source).toMatchObject({ kind: "tenant", label: "99999999..." });
    expect(view.totals.matching).toBeGreaterThan(0);
    expect(view.totals.different + view.totals.missing + view.totals.extra).toBe(0);
    const portfolio = await invoke<PortfolioView>("portfolio:setLabel", OTHER, "  Fabrikam  ");
    expect(portfolio.tenants).toEqual([
      expect.objectContaining({ tenantId: OTHER, label: "Fabrikam", current: false, snapshots: 1 }),
    ]);
    expect(portfolio.tenants[0]!.frameworks.length).toBeGreaterThan(0);
  });

  it("refuses to compare the signed in tenant with itself as another tenant", async () => {
    const { invoke, store, guard } = harness("msp");
    await store.save(TENANT, projectionOf(contoso("2026-10-17T10:00:00Z")), guard());
    await expect(invoke("compare:run", { kind: "tenant", tenantId: TENANT })).rejects.toThrow(
      "Choose another tenant",
    );
  });
});

describe("history IPC validation", () => {
  it("validates tenant labels strictly", async () => {
    const { invoke, store, guard } = harness("msp");
    await store.save(OTHER, projectionOf(contoso("2026-10-17T10:00:00Z")), guard());
    await expect(invoke("portfolio:setLabel", OTHER, "x".repeat(61))).rejects.toThrow("at most 60");
    await expect(invoke("portfolio:setLabel", OTHER, "Line\nbreak")).rejects.toThrow("not allowed");
    await expect(invoke("portfolio:setLabel", OTHER, "Bi\u2028di")).rejects.toThrow("not allowed");
    for (const hidden of ["\u202e", "\u2066", "\u200b", "\u200d", "\u2060", "\ufeff", "\u00ad", "\u061c"]) {
      await expect(invoke("portfolio:setLabel", OTHER, `Con${hidden}toso`), JSON.stringify(hidden)).rejects.toThrow(
        "not allowed",
      );
    }
    await expect(invoke<PortfolioView>("portfolio:setLabel", OTHER, "Contoso GmbH & Co. KG (Zürich)")).resolves.toMatchObject({
      tenants: [expect.objectContaining({ label: "Contoso GmbH & Co. KG (Zürich)" })],
    });
    await expect(invoke("portfolio:setLabel", OTHER, 42)).rejects.toThrow("Enter a name");
    await expect(invoke("portfolio:setLabel", "../x", "Name")).rejects.toThrow("Unknown tenant.");
    await expect(invoke("portfolio:deleteTenant", "not-a-guid")).rejects.toThrow("Unknown tenant.");
    const cleared = await invoke<PortfolioView>("portfolio:setLabel", OTHER, "   ");
    expect(cleared.tenants[0]!.label).toBeNull();
  });

  it("refuses unexpected comparison sources", async () => {
    const { invoke } = harness("msp");
    for (const source of [null, "reference", { kind: "file", path: "/etc/passwd" }, { kind: "reference", extra: 1 }, { kind: "tenant" }]) {
      await expect(invoke("compare:run", source)).rejects.toThrow();
    }
  });

  it("deletes another tenant's history and tells the renderer when it was the signed in tenant", async () => {
    const { invoke, store, guard, notified } = harness("msp");
    await store.save(OTHER, projectionOf(contoso("2026-10-17T10:00:00Z")), guard());
    await store.save(TENANT, projectionOf(contoso("2026-10-17T10:00:00Z")), guard());
    let view = await invoke<PortfolioView>("portfolio:deleteTenant", OTHER);
    expect(view.tenants.map((entry) => entry.tenantId)).toEqual([TENANT]);
    expect(notified).not.toHaveBeenCalled();
    view = await invoke<PortfolioView>("portfolio:deleteTenant", TENANT);
    expect(view.tenants).toEqual([]);
    expect(notified).toHaveBeenCalledTimes(1);
  });

  it("sets the schedule only with history on and known intervals", async () => {
    const { invoke, settings, scheduler } = harness("pro");
    await expect(invoke("history:setSchedule", 5)).rejects.toThrow("unexpected schedule");
    await expect(invoke("history:setSchedule", "6")).rejects.toThrow("unexpected schedule");
    settings.keepHistory = false;
    await expect(invoke("history:setSchedule", 12)).rejects.toThrow("Turn on Keep history");
    await invoke("history:setSchedule", 0);
    expect(settings.scheduleHours).toBe(0);
    settings.keepHistory = true;
    await invoke("history:setSchedule", 12);
    expect(settings.scheduleHours).toBe(12);
    expect(scheduler.refresh).toHaveBeenCalled();
  });
});

describe("compare with a reference file", () => {
  async function exported(h: ReturnType<typeof harness>): Promise<string> {
    const target = await h.invoke<string>("compare:exportReference");
    expect(target).toMatch(/^\/saved\/intunedoc-reference-\d{4}-\d{2}-\d{2}\.json$/);
    const file = path.join(keys.dir.current, "reference.json");
    writeFileSync(file, h.saved.at(-1)!.bytes);
    return file;
  }

  it("exports, loads and compares, with the source as a shortened label only", async () => {
    const h = harness("pro");
    const file = await exported(h);
    const text = readFileSync(file, "utf8");
    expect(text).not.toContain(TENANT);
    expect(JSON.parse(text).source).toEqual({ label: "11111111..." });
    h.env.pick = file;
    expect(await h.invoke("compare:referenceStatus")).toBeNull();
    const loaded = await h.invoke<ReferenceLoadResult>("compare:loadReference");
    expect(loaded).toMatchObject({ ok: true, reference: { label: "11111111..." } });
    expect(await h.invoke("compare:referenceStatus")).toEqual((loaded as { reference: unknown }).reference);
    // A later collection where one policy is gone and one setting differs.
    h.env.current = contoso("2026-10-19T10:00:00Z", (data) => {
      data.compliancePolicies = data.compliancePolicies.slice(1);
    });
    const view = await h.invoke<CompareView>("compare:run", { kind: "reference" });
    expect(view.source).toMatchObject({ kind: "reference", label: "11111111..." });
    expect(view.totals.missing).toBeGreaterThan(0);
    expect(view.totals.matching).toBeGreaterThan(0);
    await h.invoke("compare:clearReference");
    await expect(h.invoke("compare:run", { kind: "reference" })).rejects.toThrow(NEEDS_REFERENCE);
  });

  it("rejects a damaged, oversized or unknown file before using it", async () => {
    const h = harness("pro");
    const file = await exported(h);
    h.env.pick = file;
    const text = readFileSync(file, "utf8");
    writeFileSync(file, text.replace('"rulesetVersion":"', '"rulesetVersion":"x'));
    expect(await h.invoke("compare:loadReference")).toEqual({
      ok: false,
      message: "This reference was changed or damaged after it was saved.",
    });
    writeFileSync(file, Buffer.alloc(10 * 1024 * 1024 + 1, 32));
    expect(await h.invoke("compare:loadReference")).toEqual({
      ok: false,
      message: "The reference file is larger than 10 MB.",
    });
    writeFileSync(file, JSON.stringify({ schema: "intunedoc.baseline/1" }));
    expect(await h.invoke("compare:loadReference")).toMatchObject({ ok: false });
    h.env.pick = null;
    expect(await h.invoke("compare:loadReference")).toEqual({ canceled: true });
    await expect(h.invoke("compare:run", { kind: "reference" })).rejects.toThrow(NEEDS_REFERENCE);
  });

  it("drops a loaded reference on reset and when the file was picked before a reset", async () => {
    const h = harness("pro");
    const file = await exported(h);
    h.env.pick = file;
    await h.invoke("compare:loadReference");
    h.ipc.reset();
    expect(await h.invoke("compare:referenceStatus")).toBeNull();
    await expect(h.invoke("compare:run", { kind: "reference" })).rejects.toThrow(NEEDS_REFERENCE);
  });
});

describe("management change section", () => {
  it("needs an earlier snapshot of the tenant", async () => {
    const h = harness("pro");
    expect(await h.invoke("history:changes", request)).toEqual({ state: "none", reason: "noSnapshot" });
    // The snapshot of the current collection itself is not earlier.
    await h.store.save(TENANT, projectionOf(contoso("2026-10-18T10:00:00Z")), h.guard());
    expect(await h.invoke("history:changes", request)).toEqual({ state: "none", reason: "noSnapshot" });
  });

  it("counts policy changes and control status changes since the previous snapshot", async () => {
    const h = harness("pro");
    const earlier = contoso("2026-10-10T10:00:00Z", (data) => {
      data.compliancePolicies = data.compliancePolicies.slice(1);
    });
    await h.store.save(TENANT, projectionOf(earlier), h.guard());
    // Another tenant's history never feeds the section.
    await h.store.save(OTHER, projectionOf(contoso("2026-10-17T10:00:00Z")), h.guard());
    const result = await h.invoke<ManagementChangesResult>("history:changes", request);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") return;
    expect(result.changes).toMatchObject({
      since: "2026-10-10T10:00:00Z",
      until: "2026-10-18T10:00:00Z",
      rulesetChanged: false,
      partial: false,
    });
    expect(result.changes.policies.added).toBe(1);
    expect(result.changes.policies.removed).toBe(0);
    expect(JSON.stringify(result.changes)).not.toContain(CONTOSO_TENANT.compliancePolicies[0]!.displayName);
  });

  it("is not shown for a scope other than the stored full scope", async () => {
    const h = harness("pro");
    await h.store.save(TENANT, projectionOf(contoso("2026-10-10T10:00:00Z")), h.guard());
    expect(
      await h.invoke("history:changes", { frameworkId: "nis2-2022-2555", scope: { platforms: ["windows"] } }),
    ).toEqual({ state: "none", reason: "scope" });
  });

  it("feeds the management report through changesFor", async () => {
    const h = harness("pro");
    await h.store.save(TENANT, projectionOf(contoso("2026-10-10T10:00:00Z")), h.guard());
    const result = await h.ipc.changesFor(OWNER, TENANT, { frameworkId: "nis2-2022-2555", scope: {} });
    expect(result.state).toBe("ready");
  });
});

describe("account switches during history work", () => {
  it("drops a comparison when the account changes while it runs", async () => {
    const h = harness("msp");
    await h.store.save(OTHER, projectionOf(contoso("2026-10-17T10:00:00Z")), h.guard());
    h.env.during = () => {
      h.env.signedIn = "33333333-2222-3333-4444-555555555555";
    };
    await expect(h.invoke("compare:run", { kind: "tenant", tenantId: OTHER })).rejects.toThrow(ACCOUNT_SWITCHED);
  });

  it("drops a comparison when a reset happens while it runs", async () => {
    const h = harness("pro");
    h.env.during = () => h.ipc.reset();
    await expect(h.invoke("compare:exportReference")).rejects.toThrow(ACCOUNT_SWITCHED);
    expect(h.saved).toEqual([]);
  });

  it("does not keep a reference file picked while the account changed", async () => {
    const h = harness("pro");
    await h.invoke("compare:exportReference");
    const file = path.join(keys.dir.current, "reference.json");
    writeFileSync(file, h.saved.at(-1)!.bytes);
    h.env.pick = file;
    h.env.during = () => {
      h.env.signedIn = "33333333-2222-3333-4444-555555555555";
    };
    expect(await h.invoke("compare:loadReference")).toEqual({
      ok: false,
      message: "The signed in account changed while the file was opened. Open it again.",
    });
    h.env.during = null;
    h.env.signedIn = TENANT;
    await expect(h.invoke("compare:run", { kind: "reference" })).rejects.toThrow(NEEDS_REFERENCE);
  });
});

