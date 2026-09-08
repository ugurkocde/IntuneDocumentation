import { describe, expect, it, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";
const endpoint = "/deviceManagement/deviceShellScripts/script-id";
function setup(read: (select?: string) => Promise<unknown>) {
  const calls = vi.fn(read);
  const service = new DetailedIntuneService("test") as any;
  service.client = {
    api: (path: string) => {
      expect(path).toBe(endpoint);
      let fields: string | undefined;
      const request = {
        version: () => request,
        select: (value: string) => {
          fields = value;
          return request;
        },
        get: () => calls(fields),
      };
      return request;
    },
  };
  return {
    service,
    calls,
    load: () =>
      service.readPolicyDetails(
        { id: "script-id", displayName: "Example script" },
        "scripts",
        endpoint,
        "scriptContent",
      ),
  };
}
const failure = (statusCode: number) =>
  Object.assign(new Error("Graph request failed"), { statusCode });
describe("script content compatibility read", () => {
  it("recovers a projected 404 with one full read of the same script", async () => {
    const { load, calls, service } = setup(async (fields) => {
      if (fields) throw failure(404);
      return { id: "script-id", scriptContent: "ZWNobyBva2F5" };
    });
    expect(await load()).toMatchObject({
      complete: true,
      item: { scriptContent: "ZWNobyBva2F5" },
    });
    expect(calls.mock.calls).toEqual([["scriptContent"], [undefined]]);
    expect(service.fetchErrors).toEqual([]);
  });
  it("keeps a genuine missing script visible as incomplete", async () => {
    const { load, calls, service } = setup(async () => {
      throw failure(404);
    });
    expect(await load()).toMatchObject({ complete: false });
    expect(calls).toHaveBeenCalledTimes(2);
    expect(service.fetchErrors).toEqual([
      expect.objectContaining({
        statusCode: 404,
        familyKey: "scripts",
        endpoint,
      }),
    ]);
  });
  it("does not try another request shape for denied permissions", async () => {
    const { load, calls } = setup(async () => {
      throw failure(403);
    });
    expect(await load()).toMatchObject({ complete: false });
    expect(calls).toHaveBeenCalledOnce();
  });
  it("does not claim success when the fallback omits content", async () => {
    const { load } = setup(async (fields) => {
      if (fields) throw failure(404);
      return { id: "script-id" };
    });
    expect(await load()).toMatchObject({
      complete: false,
      errorMessage: expect.stringContaining("without readable script content"),
    });
  });
});
