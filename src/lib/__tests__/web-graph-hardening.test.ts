import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config, middleware } from "~/middleware";
import { collectAllPagesWithStatus } from "../graph-paging";
import { graphKey, MAX_RETRY_AFTER_MS, retryAfterMs } from "../graph-request";
import { GroupResolver } from "../group-resolver";
import { DetailedIntuneService } from "../intune-detailed-client";
import { githubReleases, resolveDesktopAsset } from "../desktop-update";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function recordingClient(read: (path: string) => any = () => ({ value: [] })) {
  const paths: string[] = [];
  const client = {
    api(path: string) {
      paths.push(path);
      const q: any = { get: async () => read(path) };
      for (const key of ["version", "select", "filter", "top", "expand"])
        q[key] = () => q;
      return q;
    },
  };
  return { client, paths };
}

describe("Graph continuation links", () => {
  it.each([
    "https://attacker.example/steal?page=2",
    "http://graph.microsoft.com/beta/x?page=2",
    "https://user:pass@graph.microsoft.com/beta/x",
    "https://graph.microsoft.com.attacker.example/beta/x",
    "https://graph.microsoft.com:8443/beta/x",
    "/beta/x?page=2",
  ])("refuses to send the token to %s", async (nextLink) => {
    const { client, paths } = recordingClient();
    const result = await collectAllPagesWithStatus(
      client as any,
      { value: [{ id: "first" }], "@odata.nextLink": nextLink },
      { maxRetries: 1 },
    );
    expect(result).toMatchObject({ complete: false, items: [{ id: "first" }] });
    expect(paths).toEqual([]);
  });

  it("follows links on the Graph host", async () => {
    const { client, paths } = recordingClient(() => ({ value: [{ id: "2" }] }));
    const next = "https://GRAPH.microsoft.com:443/beta/x?$skiptoken=a";
    const result = await collectAllPagesWithStatus(client as any, {
      value: [],
      "@odata.nextLink": next,
    });
    expect(result).toMatchObject({ complete: true, items: [{ id: "2" }] });
    expect(paths).toEqual([next]);
  });
});

describe("Retry-After", () => {
  it("caps long or distant retry hints", () => {
    expect(retryAfterMs({ headers: { "Retry-After": "86400" } })).toBe(
      MAX_RETRY_AFTER_MS,
    );
    expect(
      retryAfterMs(
        { headers: { "retry-after": "Wed, 01 Jan 2031 00:00:00 GMT" } },
        Date.parse("2025-01-01T00:00:00Z"),
      ),
    ).toBe(MAX_RETRY_AFTER_MS);
    expect(retryAfterMs({ headers: { "Retry-After": "5" } })).toBe(5000);
  });

  it("stops retry waits in the detailed collector when the run is cancelled", async () => {
    const controller = new AbortController();
    const service = new DetailedIntuneService(
      "test",
      undefined,
      controller.signal,
    ) as any;
    const action = vi.fn().mockRejectedValue(
      Object.assign(new Error("busy"), {
        statusCode: 429,
        headers: { "Retry-After": "30" },
      }),
    );
    const pending = service.retryWithBackoff(action);
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    controller.abort(new DOMException("Client disconnected", "AbortError"));
    await expect(pending).rejects.toThrow("Client disconnected");
    expect(action).toHaveBeenCalledTimes(1);
  });
});

describe("Graph id encoding", () => {
  const hostile = "x')/../../me?$select=id";

  it("keeps a Graph id inside one OData key segment", () => {
    expect(graphKey("0f1e-2d3c_ab")).toBe("0f1e-2d3c_ab");
    expect(graphKey(hostile)).toBe("x'')%2F..%2F..%2Fme%3F%24select%3Did");
  });

  it("encodes policy ids in detailed collector paths", async () => {
    const s = new DetailedIntuneService("test") as any;
    const { client, paths } = recordingClient((path) =>
      path === "/deviceManagement/deviceCompliancePolicies"
        ? { value: [{ id: hostile, displayName: "P" }] }
        : { value: [] },
    );
    s.client = client;
    s.retryWithBackoff = (fn: () => Promise<any>) => fn();
    await s.getCompliancePoliciesDetailed();
    expect(paths).toContain(
      `/deviceManagement/deviceCompliancePolicies('${graphKey(hostile)}')/assignments`,
    );
    expect(paths.some((path) => path.includes("/../"))).toBe(false);
  });

  it("encodes group ids in single and $batch requests", async () => {
    const resolver = new GroupResolver("test") as any;
    const paths: string[] = [];
    const post = vi.fn(async () => ({ responses: [{ id: "0", status: 404 }] }));
    resolver.client = {
      api: (path: string) => {
        paths.push(path);
        const q: any = {
          version: () => q,
          select: () => q,
          get: async () => ({ displayName: "G" }),
          post,
        };
        return q;
      },
    };
    await resolver.getGroupName("../users?x");
    await resolver.getGroupNames(["../users?y"]);
    expect(paths[0]).toBe("/groups/..%2Fusers%3Fx");
    expect((post.mock.calls[0] as any)[0].requests[0].url).toBe(
      "/groups/..%2Fusers%3Fy?$select=id,displayName",
    );
  });
});

describe("middleware coverage and early token rejection", () => {
  it.each([
    ["/foo.png", true],
    ["/dashboard/x.svg", true],
    ["/missing.woff2", true],
    ["/logo.png", false],
    ["/favicon.ico", false],
    ["/_next/static/chunks/app.js", false],
    ["/_next/image", false],
    ["/", true],
  ])("runs on %s: %s", (url, expected) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(expected);
  });

  const token = (exp: number) =>
    `e30.${btoa(JSON.stringify({ exp })).replace(/=+$/, "")}.sig`;
  const request = (bearer: string) =>
    new NextRequest(
      "https://app.example.test/api/intune/detailed-configurations-stream",
      { headers: { authorization: `Bearer ${bearer}` } },
    );

  it("rejects a bearer token that expired before Graph work starts", () => {
    const now = Math.floor(Date.now() / 1000);
    expect(middleware(request(token(now - 3600))).status).toBe(401);
    expect(middleware(request(token(now + 3600))).status).toBe(200);
    expect(middleware(request(token(now - 60))).status).toBe(200);
    expect(middleware(request("not-a-jwt")).status).toBe(200);
  });
});

describe("desktop update feed hardening", () => {
  const desktop = (tag: string) => ({
    tag_name: tag,
    draft: false,
    prerelease: false,
    assets: [
      {
        name: "latest.yml",
        browser_download_url: `https://github.com/o/r/releases/download/${tag}/latest.yml`,
      },
    ],
  });
  const web = (index: number) => ({ ...desktop(`v1.${index}.0`) });

  it("treats inherited object keys as unknown files", async () => {
    const fetchReleases = async () => [desktop("desktop-v1.0.0")];
    for (const file of ["__proto__", "constructor", "toString"])
      expect(await resolveDesktopAsset(file, fetchReleases)).toBeNull();
  });

  it("pages GitHub releases until a pinned older tag appears", async () => {
    const pages = [
      Array.from({ length: 100 }, (_, index) => web(index)),
      [desktop("desktop-v0.1.0")],
    ];
    const fetch = vi.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get("page"));
      return new Response(JSON.stringify(pages[page - 1] ?? []));
    });
    vi.stubGlobal("fetch", fetch);
    expect(
      await resolveDesktopAsset(
        "latest.yml",
        githubReleases(),
        "desktop-v0.1.0",
      ),
    ).toBe(
      "https://github.com/o/r/releases/download/desktop-v0.1.0/latest.yml",
    );
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("stops after the first page when it already has a desktop release", async () => {
    const fetch = vi.fn(
      async () =>
        new Response(
          JSON.stringify([
            desktop("desktop-v2.0.0"),
            ...Array.from({ length: 99 }, (_, index) => web(index)),
          ]),
        ),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await resolveDesktopAsset("latest.yml", githubReleases())).toMatch(
      /desktop-v2\.0\.0/,
    );
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
