import { describe, it, expect, vi, afterEach } from "vitest";
import {
  createGraphLimiter,
  retryGraphRequest,
  retryAfterMs,
} from "../graph-request";
import { createGraphClient } from "../graph-client";
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("Graph request policy", () => {
  it.each([400, 401, 403, 404])(
    "does not retry permanent HTTP %s",
    async (statusCode) => {
      const action = vi
        .fn()
        .mockRejectedValue(Object.assign(new Error("failed"), { statusCode }));
      await expect(retryGraphRequest(action)).rejects.toThrow("failed");
      expect(action).toHaveBeenCalledTimes(1);
    },
  );
  it("retries SDK-wrapped network failures but not wrapped aborts", async () => {
    vi.useFakeTimers();
    const action = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("fetch failed"), {
          statusCode: -1,
          code: "TypeError",
        }),
      )
      .mockResolvedValueOnce("recovered");
    const pending = retryGraphRequest(action);
    await vi.runAllTimersAsync();
    expect(await pending).toBe("recovered");
    const aborted = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("aborted"), {
          statusCode: -1,
          code: "AbortError",
        }),
      );
    await expect(retryGraphRequest(aborted)).rejects.toThrow("aborted");
    expect(aborted).toHaveBeenCalledTimes(1);
  });
  it("retries an all-GET batch envelope through the real SDK", async () => {
    vi.useFakeTimers();
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: { code: "TooManyRequests", message: "busy" },
          }),
          {
            status: 429,
            headers: { "Retry-After": "2", "Content-Type": "application/json" },
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            responses: [{ id: "1", status: 200, body: { id: "a" } }],
          }),
          { headers: { "Content-Type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetch);
    const pending = createGraphClient("test")
      .api("/$batch")
      .post({ requests: [{ id: "1", method: "GET", url: "/groups/a" }] });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect((await pending).responses[0].status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("does not retry writes or batches containing inner writes", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            error: { code: "ServiceUnavailable", message: "busy" },
          }),
          { status: 503, headers: { "Content-Type": "application/json" } },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    await expect(
      createGraphClient("test")
        .api("/$batch")
        .post({
          requests: [{ id: "1", method: "POST", url: "/groups", body: {} }],
        }),
    ).rejects.toMatchObject({ statusCode: 503 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it("honors Retry-After and does not sleep after the final attempt", async () => {
    vi.useFakeTimers();
    const action = vi.fn().mockRejectedValue(
      Object.assign(new Error("busy"), {
        statusCode: 429,
        headers: new Headers({ "Retry-After": "2" }),
      }),
    );
    const assertion = expect(
      retryGraphRequest(action, { maxAttempts: 2 }),
    ).rejects.toThrow("busy");
    await vi.advanceTimersByTimeAsync(1999);
    expect(action).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await assertion;
    expect(action).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("accepts mixed-case headers and HTTP dates", () => {
    expect(retryAfterMs({ headers: { "Retry-After": "3" } })).toBe(3000);
    expect(
      retryAfterMs(
        { headers: { "retry-after": "Wed, 01 Jan 2025 00:00:05 GMT" } },
        Date.parse("2025-01-01T00:00:00Z"),
      ),
    ).toBe(5000);
    expect(
      retryAfterMs({ headers: { "retry-after": "garbage" } }),
    ).toBeUndefined();
  });
  it("does not multiply exhausted retries through nested callers", async () => {
    const action = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("busy"), { statusCode: 503 }));
    await expect(
      retryGraphRequest(() => retryGraphRequest(action, { maxAttempts: 1 })),
    ).rejects.toThrow("busy");
    expect(action).toHaveBeenCalledTimes(1);
  });
  it("cancels backoff immediately when the collection is aborted", async () => {
    vi.useFakeTimers();
    const abort = new AbortController();
    const action = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("busy"), { statusCode: 503, retryAfter: 90 }),
      );
    const assertion = expect(
      retryGraphRequest(action, { signal: abort.signal }),
    ).rejects.toThrow("cancelled");
    await vi.advanceTimersByTimeAsync(1);
    abort.abort(new Error("cancelled"));
    await assertion;
    expect(action).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("shares a concurrency limit and removes cancelled queued requests", async () => {
    const run = createGraphLimiter(1);
    let release!: () => void;
    const first = run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const abort = new AbortController();
    const queued = vi.fn(async () => 2);
    const assertion = expect(run(queued, abort.signal)).rejects.toThrow(
      "cancelled",
    );
    abort.abort(new Error("cancelled"));
    await assertion;
    release();
    await first;
    expect(queued).not.toHaveBeenCalled();
    expect(await run(async () => 3)).toBe(3);
  });
  it("prevents Graph calls after a collection is cancelled", async () => {
    const signal = AbortSignal.abort(new Error("cancelled"));
    const client = createGraphClient("test", { signal });
    await expect(client.api("/deviceManagement/intents").get()).rejects.toThrow(
      "cancelled",
    );
  });
});
