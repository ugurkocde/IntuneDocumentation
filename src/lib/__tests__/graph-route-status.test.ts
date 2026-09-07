import { describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@microsoft/microsoft-graph-client", () => ({
  Client: {
    init: () => ({
      api: (path: string) => {
        const q: any = {
          version: () => q,
          top: () => q,
          select: () => q,
          get: () => mocks.get(path),
        };
        return q;
      },
    }),
  },
}));
vi.mock("../auth-middleware", () => ({ extractTenantFromRequest: vi.fn() }));
vi.mock("../intune-detailed-client", () => ({
  DetailedIntuneService: class {
    callback: any;
    constructor(_token: string, callback: any) {
      this.callback = callback;
    }
    async getAllDetailedConfigurations() {
      this.callback({
        step: "Compliance Policies",
        type: "error",
        message: "Incomplete",
      });
      return {
        sections: [],
        fetchErrors: [{ error: "Graph failed" }],
        permissionErrors: [],
        summary: {},
      };
    }
  },
}));
import { GET as permissions } from "../../app/api/intune/check-permissions/route";
import { GET as stream } from "../../app/api/intune/detailed-configurations-stream/route";

describe("Graph route status", () => {
  it("separates denied permissions from transient probe failures", async () => {
    mocks.get.mockImplementation(async (path: string) => {
      if (path === "/groups")
        throw Object.assign(new Error("Forbidden"), { statusCode: 403 });
      if (path === "/deviceManagement/managedDevices")
        throw Object.assign(new Error("Unavailable"), { statusCode: 503 });
      return { value: [] };
    });
    const response = await permissions(
      new Request("http://localhost/api", {
        headers: { Authorization: "Bearer test" },
      }) as any,
    );
    const body = await response.json();
    expect(body.summary).toMatchObject({
      denied: 1,
      unavailable: 1,
      granted: 6,
    });
  });
  it("does not overwrite a failed stream step with success or claim a complete collection", async () => {
    const response = await stream(
      new Request("http://localhost/api", {
        headers: { Authorization: "Bearer test" },
      }) as any,
    );
    const body = await response.text();
    expect(body).toContain('"collectionStatus":"incomplete"');
    expect(body).toContain(
      '"step":"Compliance Policies","stepIndex":5,"status":"error"',
    );
    expect(body).not.toContain(
      '"step":"Compliance Policies","stepIndex":5,"status":"completed"',
    );
    expect(body).not.toContain("All configurations fetched successfully");
  });
});
