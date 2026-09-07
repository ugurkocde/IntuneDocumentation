import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearDashboardSession,
  DASHBOARD_SESSION_KEY,
  readDashboardSession,
  saveDashboardSession,
} from "../dashboard-session-cache";
import { sessionScope, sessionSnapshot } from "./fixtures/dashboard-session";

describe("browser session snapshots", () => {
  let entries: Map<string, string>;
  let session: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    entries = new Map();
    session = {
      getItem: vi.fn((key: string) => entries.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        entries.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        entries.delete(key);
      }),
    };
    vi.stubGlobal("window", {
      sessionStorage: session,
      get localStorage() {
        throw new Error("Must not use localStorage");
      },
    });
    await readDashboardSession(sessionScope);
  });
  afterEach(() => {
    clearDashboardSession();
    vi.unstubAllGlobals();
  });

  it("round trips a compressed snapshot with original dates, warnings, groups and consent", async () => {
    const snapshot = sessionSnapshot();
    snapshot.caConsentStatus = "missing";
    expect(await saveDashboardSession(sessionScope, snapshot)).toBe("saved");
    expect(JSON.parse(entries.get(DASHBOARD_SESSION_KEY)!).encoding).toBe(
      "gzip",
    );
    expect(await readDashboardSession(sessionScope)).toEqual(snapshot);
  });

  it("uses sessionStorage JSON when compression is unavailable", async () => {
    vi.stubGlobal("CompressionStream", undefined);
    expect(await saveDashboardSession(sessionScope, sessionSnapshot())).toBe(
      "saved",
    );
    expect(await readDashboardSession(sessionScope)).toEqual(sessionSnapshot());
  });

  it.each([{ accountId: "other" }, { tenantId: "other" }, { includeCA: true }])(
    "rejects a snapshot from a different scope: %j",
    async (change) => {
      await saveDashboardSession(sessionScope, sessionSnapshot());
      expect(
        await readDashboardSession({ ...sessionScope, ...change }),
      ).toBeNull();
      expect(entries.size).toBe(0);
    },
  );

  it("discards corrupt or incompatible data", async () => {
    entries.set(DASHBOARD_SESSION_KEY, "broken json");
    expect(await readDashboardSession(sessionScope)).toBeNull();
    entries.set(
      DASHBOARD_SESSION_KEY,
      JSON.stringify({ version: 900, scope: sessionScope }),
    );
    expect(await readDashboardSession(sessionScope)).toBeNull();
    entries.set(
      DASHBOARD_SESSION_KEY,
      JSON.stringify({
        version: 1,
        scope: sessionScope,
        encoding: "json",
        payload: "{}",
      }),
    );
    expect(await readDashboardSession(sessionScope)).toBeNull();
    expect(entries.size).toBe(0);
  });

  it("keeps old timestamps usable without extending their freshness", async () => {
    const snapshot = sessionSnapshot();
    snapshot.lastFetched = "2020-01-01T00:00:00.000Z";
    await saveDashboardSession(sessionScope, snapshot);
    expect((await readDashboardSession(sessionScope))?.lastFetched).toBe(
      snapshot.lastFetched,
    );
  });

  it("handles quota failure without retaining an outdated snapshot", async () => {
    await saveDashboardSession(sessionScope, sessionSnapshot());
    session.setItem.mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    expect(await saveDashboardSession(sessionScope, sessionSnapshot())).toBe(
      "unavailable",
    );
    expect(entries.size).toBe(0);
  });

  it("handles blocked storage without any other persistence fallback", async () => {
    vi.stubGlobal("window", {
      get sessionStorage() {
        throw new Error("Blocked");
      },
    });
    expect(await readDashboardSession(sessionScope)).toBeNull();
    expect(await saveDashboardSession(sessionScope, sessionSnapshot())).toBe(
      "unavailable",
    );
    expect(() => clearDashboardSession()).not.toThrow();
  });

  it("prevents in-flight or subsequent writes from recreating data after sign-out", async () => {
    const pending = saveDashboardSession(sessionScope, sessionSnapshot());
    clearDashboardSession();
    expect(await pending).toBe("cancelled");
    expect(await saveDashboardSession(sessionScope, sessionSnapshot())).toBe(
      "cancelled",
    );
    expect(entries.size).toBe(0);
  });
});
