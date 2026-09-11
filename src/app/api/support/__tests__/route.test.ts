import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "../route";
const origin = "https://intunedocumentation.com";
const payload = {
  name: "Visitor",
  email: "visitor@example.com",
  subject: "Help",
  message: "My export failed",
  website: "",
  token: "challenge-token",
};
const request = (data: unknown = payload, source = origin, host = origin) =>
  new Request(`${host}/api/support`, {
    method: "POST",
    headers: { origin: source, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
const fetchMock = vi.fn();
const verified = () =>
  Response.json({
    success: true,
    hostname: "intunedocumentation.com",
    action: "support",
  });
beforeEach(() => {
  vi.stubEnv("PUBLIC_SITE_ORIGIN", origin);
  vi.stubEnv("APP_SITE_ORIGIN", "https://app.intunedocumentation.com");
  vi.stubEnv("RESEND_API_KEY", "test-key");
  vi.stubEnv("SUPPORT_FROM_EMAIL", "Support <support@ugurlabs.com>");
  vi.stubEnv("SUPPORT_TURNSTILE_SECRET_KEY", "test-secret");
  vi.stubEnv("SUPPORT_TURNSTILE_SITE_KEY", "test-site");
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});
describe("support submissions", () => {
  it("sends only after verification with a fixed recipient and visitor Reply-To", async () => {
    fetchMock
      .mockResolvedValueOnce(verified())
      .mockResolvedValueOnce(Response.json({ id: "email-id" }));
    const response = await POST(request());
    expect(await response.json()).toEqual({ success: true });
    const options = fetchMock.mock.calls[1]![1] as RequestInit;
    expect(JSON.parse(options.body as string)).toMatchObject({
      to: ["support@ugurlabs.com"],
      reply_to: payload.email,
      from: "Support <support@ugurlabs.com>",
    });
  });
  it.each([
    { website: "spam" },
    { email: "invalid" },
    { subject: "Hi\r\nBcc: bad@example.com" },
    { message: " " },
    { token: "" },
  ])(
    "rejects invalid input %j without contacting providers",
    async (invalid) => {
      expect((await POST(request({ ...payload, ...invalid }))).status).toBe(
        400,
      );
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("rejects cross-origin and app-origin requests", async () => {
    expect((await POST(request(payload, "https://evil.example"))).status).toBe(
      403,
    );
    expect(
      (
        await POST(
          request(
            payload,
            "https://app.intunedocumentation.com",
            "https://app.intunedocumentation.com",
          ),
        )
      ).status,
    ).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("fails closed when configuration is missing", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    expect((await POST(request())).status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("bounds request bodies even without Content-Length", async () => {
    expect(
      (await POST(request({ ...payload, message: "x".repeat(66000) }))).status,
    ).toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it.each([
    { success: false },
    { success: true, hostname: "evil.example", action: "support" },
    { success: true, hostname: "intunedocumentation.com", action: "login" },
  ])(
    "rejects failed, replayed, or mismatched verification %j",
    async (verdict) => {
      fetchMock.mockResolvedValueOnce(Response.json(verdict));
      expect((await POST(request())).status).toBe(400);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
  it.each([
    Response.json({ error: "rejected" }, { status: 429 }),
    Response.json({}),
  ])("does not claim success without Resend acceptance", async (result) => {
    fetchMock.mockResolvedValueOnce(verified()).mockResolvedValueOnce(result);
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.json()).not.toHaveProperty("success");
  });
  it("handles provider timeouts without exposing internals", async () => {
    fetchMock.mockRejectedValueOnce(new Error("secret provider details"));
    const response = await POST(request());
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("secret provider details");
  });
});
