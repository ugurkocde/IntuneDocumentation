// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  clearDashboardSession,
  DASHBOARD_SESSION_KEY,
  enforceDashboardSessionExpiry,
  observeDashboardSession,
  readDashboardSession,
  saveDashboardSession,
} from "../dashboard-session-cache";
import { sessionScope, sessionSnapshot } from "./fixtures/dashboard-session";
let cleanup = () => {
  /* No observer installed yet. */
};
beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:30:00Z"));
  vi.stubGlobal("CompressionStream", undefined);
  sessionStorage.clear();
  await readDashboardSession(sessionScope);
});
afterEach(() => {
  cleanup();
  clearDashboardSession(false);
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("purges at the original one-hour deadline even after subsequent saves", async () => {
  await saveDashboardSession(sessionScope, sessionSnapshot());
  await vi.advanceTimersByTimeAsync(20 * 60 * 1000);
  await saveDashboardSession(sessionScope, sessionSnapshot());
  await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
  expect(sessionStorage.getItem(DASHBOARD_SESSION_KEY)).toBeNull();
  expect(await readDashboardSession(sessionScope)).toBeNull();
});
it("rejects expired restored browser sessions before showing their data", async () => {
  await saveDashboardSession(sessionScope, sessionSnapshot());
  vi.setSystemTime(new Date("2026-09-07T14:00:00Z"));
  expect(await readDashboardSession(sessionScope)).toBeNull();
});
it("purges on resume when a suspended tab missed its expiry timer", async () => {
  cleanup = observeDashboardSession(vi.fn());
  await saveDashboardSession(sessionScope, sessionSnapshot());
  vi.setSystemTime(new Date("2026-09-07T14:00:00Z"));
  window.dispatchEvent(new Event("pageshow"));
  expect(sessionStorage.getItem(DASHBOARD_SESSION_KEY)).toBeNull();
});
it("sends only a clear signal and handles remote logout without echo or later writes", async () => {
  const channels: FakeChannel[] = [];
  class FakeChannel {
    onmessage: ((event: MessageEvent) => void) | null = null;
    postMessage = vi.fn();
    close = vi.fn();
    constructor(public name: string) {
      channels.push(this);
    }
  }
  vi.stubGlobal("BroadcastChannel", FakeChannel);
  const onLogout = vi.fn();
  cleanup = observeDashboardSession(onLogout);
  await saveDashboardSession(sessionScope, sessionSnapshot());
  channels[0]!.onmessage!(
    new MessageEvent("message", { data: { tenant: "ignored" } }),
  );
  expect(onLogout).not.toHaveBeenCalled();
  channels[0]!.onmessage!(new MessageEvent("message", { data: "clear" }));
  expect(onLogout).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem(DASHBOARD_SESSION_KEY)).toBeNull();
  expect(channels).toHaveLength(1);
  expect(await saveDashboardSession(sessionScope, sessionSnapshot())).toBe(
    "cancelled",
  );
  clearDashboardSession();
  expect(channels[1]!.postMessage).toHaveBeenCalledExactlyOnceWith("clear");
});
it("purges old schema data instead of retaining it indefinitely", () => {
  sessionStorage.setItem(DASHBOARD_SESSION_KEY, JSON.stringify({ version: 1 }));
  enforceDashboardSessionExpiry();
  expect(sessionStorage.getItem(DASHBOARD_SESSION_KEY)).toBeNull();
});
