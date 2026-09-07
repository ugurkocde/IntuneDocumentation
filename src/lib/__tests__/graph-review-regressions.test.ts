import { analyzeConfigurations } from "../configuration-analyzer";
import { IntuneService } from "../graph-client";
import { describe, it, expect, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";
import { collectAllPagesWithStatus } from "../graph-paging";
import { summarizeAssignments } from "../compliance/assignments";
import { assessCapabilities } from "../compliance/engine";
import { INTUNE_POLICY_REGISTRY } from "../intune-policy-registry";
import { IntuneConfigurationService } from "../intune-graph-client";
import { GroupResolver } from "../group-resolver";
const forbidden = () =>
  Object.assign(new Error("Forbidden"), { statusCode: 403 });
const assigned = [
  { target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" } },
];
function client(read: (path: string, expand?: string) => any) {
  return {
    api(path: string) {
      let expand: string | undefined;
      const q: any = {
        get: () => Promise.resolve().then(() => read(path, expand)),
      };
      for (const key of ["version", "select", "filter", "top"])
        q[key] = () => q;
      q.expand = (value: string) => {
        expand = value;
        return q;
      };
      return q;
    },
  };
}
function service(read: (path: string, expand?: string) => any) {
  const s = new DetailedIntuneService("test") as any;
  s.client = client(read);
  s.retryWithBackoff = (fn: () => Promise<any>) => fn();
  return s;
}
describe("Graph review regressions", () => {
  it.each(["iOS", "Android", "Windows"])(
    "retains all platforms when %s app-protection paging fails",
    async (failed) => {
      const paths: Record<string, string> = {
        iOS: "ios",
        Android: "android",
        Windows: "windows",
      };
      const s = service((path) => {
        if (path.includes("next")) throw forbidden();
        if (path.endsWith("/assignments")) return { value: assigned };
        if (path.endsWith("/apps")) return { value: [] };
        const platform = Object.keys(paths).find((key) =>
          path.includes(`/${paths[key]}ManagedAppProtections`),
        )!;
        return {
          value: [{ id: platform }],
          ...(platform === failed
            ? { "@odata.nextLink": "https://graph.microsoft.com/beta/next" }
            : {}),
        };
      });
      const items = await s.getAppProtectionPoliciesDetailed();
      expect(items.map((p: any) => p.platform).sort()).toEqual([
        "Android",
        "Windows",
        "iOS",
      ]);
      expect(items.every((p: any) => p.assignments.length === 1)).toBe(true);
      expect(s.getFetchErrors()).toHaveLength(1);
      expect(s.getFetchErrors()[0].policyType).toBe(
        `${failed} App Protection Policies`,
      );
    },
  );
  it.each([[], assigned])(
    "marks partial registry assignments unknown for first page %j",
    async (first) => {
      const s = service((path) => {
        if (path === "/policies") return { value: [{ id: "p" }] };
        if (path.endsWith("/assignments"))
          return {
            value: first,
            "@odata.nextLink": "https://graph.microsoft.com/beta/next",
          };
        throw forbidden();
      });
      const section = await s.fetchRegistrySection({
        key: "test",
        path: "/policies",
        family: "applications",
        label: "Test",
        childCollections: [{ property: "assignments", path: "assignments" }],
      });
      const item = section.items[0];
      expect(section.error.partial).toBe(true);
      expect(item.collectionStatus.assignments).toBe("incomplete");
      expect(
        summarizeAssignments(
          item.assignments,
          new Map(),
          item.collectionStatus.assignments === "incomplete",
        ).state,
      ).toBe("unknown");
    },
  );
  it("uses baseline parent expansion after the live category route rejection", async () => {
    const s = service((path, expand) => {
      if (path === "/deviceManagement/intents") return { value: [{ id: "b" }] };
      if (path.endsWith("/categories"))
        throw Object.assign(new Error("No OData route exists"), {
          statusCode: 400,
        });
      if (expand === "categories") return { categories: [{ id: "category" }] };
      return { value: path.endsWith("/assignments") ? assigned : [] };
    });
    const [baseline] = await s.getSecurityBaselinesDetailed();
    expect(baseline.categories).toHaveLength(1);
    expect(baseline.collectionStatus.categories).toBe("complete");
    expect(s.getFetchErrors()).toEqual([]);
  });
  it("keeps failed baseline categories visible without invalidating unrelated capabilities", () => {
    const d: any = {
      settingsCatalog: [],
      deviceConfigurations: [],
      administrativeTemplates: [],
      compliancePolicies: [],
      securityBaselines: [
        {
          id: "b",
          settings: [],
          assignments: [],
          collectionStatus: {
            categories: "incomplete",
            settings: "complete",
            assignments: "complete",
          },
        },
      ],
      scripts: { windows: [], macOS: [] },
      fetchErrors: [
        {
          familyKey: "securityBaselines",
          endpoint: "/deviceManagement/intents/b?$expand=categories",
          error: "failed",
        },
      ],
    };
    expect(
      assessCapabilities(d).find((c) => c.capability.id === "windows-firewall")
        ?.status,
    ).toBe("noEvidence");
  });
  it("excludes non-assignable registry types without hiding unknown assignments on assignable types", () => {
    const input: any = {
      settingsCatalog: [],
      deviceConfigurations: [],
      administrativeTemplates: [],
      compliancePolicies: [],
      securityBaselines: [],
      scripts: { windows: [], macOS: [] },
      sections: [
        {
          key: "roleDefinitions",
          familyKey: "assignmentAndRbac",
          label: "Roles",
          items: [{ id: "role" }],
        },
        {
          key: "deviceManagementSettings",
          familyKey: "tenantAndService",
          label: "Tenant",
          items: [{ id: "tenant" }],
        },
        {
          key: "windowsFeatureUpdateProfiles",
          familyKey: "windowsUpdateProfiles",
          label: "Updates",
          items: [{ id: "update" }],
        },
        {
          key: "settingsCatalog",
          familyKey: "settingsCatalog",
          label: "Settings",
          items: [{ id: "assigned", assignments: assigned }],
        },
      ],
    };
    const result = analyzeConfigurations(input);
    expect(result).toMatchObject({
      assignedConfigs: 1,
      unknownAssignmentConfigs: 1,
      assignmentNotApplicableConfigs: 2,
      assignmentApplicableConfigs: 2,
    });
  });
  it("includes supported update and application assignment relations", () => {
    for (const key of [
      "windowsFeatureUpdateProfiles",
      "windowsQualityUpdateProfiles",
      "windowsQualityUpdatePolicies",
      "windowsDriverUpdateProfiles",
      "mobileApps",
      "policySets",
    ]) {
      expect(
        INTUNE_POLICY_REGISTRY.find(
          (e) => e.key === key,
        )?.childCollections?.some((c) => c.property === "assignments"),
      ).toBe(true);
    }
  });
  it.each([{}, { value: null }])(
    "does not mark malformed paging responses complete: %j",
    async (page) => {
      expect(
        (
          await collectAllPagesWithStatus(client(() => page) as any, {
            value: [{ id: "kept" }],
            "@odata.nextLink": "next",
          })
        ).complete,
      ).toBe(false);
    },
  );
  it("stops repeated links without issuing repeated requests", async () => {
    const read = vi.fn(() => ({
      value: [{ id: "one" }],
      "@odata.nextLink": "next",
    }));
    const r = await collectAllPagesWithStatus(client(read) as any, {
      value: [],
      "@odata.nextLink": "next",
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ complete: false, items: [{ id: "one" }] });
  });
  it("follows a valid empty page with a nextLink", async () => {
    expect(
      await collectAllPagesWithStatus(
        client(() => ({ value: [{ id: "next" }] })) as any,
        { value: [], "@odata.nextLink": "next" },
      ),
    ).toMatchObject({ complete: true, items: [{ id: "next" }] });
  });
  it("preserves the other platform in the legacy app-protection collector", async () => {
    const legacy = new IntuneService("test") as any;
    legacy.client = client((path) => {
      if (path.includes("next")) throw forbidden();
      if (path.includes("iosManagedAppProtections"))
        return { value: [{ id: "ios" }] };
      return {
        value: [{ id: "android" }],
        "@odata.nextLink": "https://graph.microsoft.com/beta/next",
      };
    });
    expect(
      (await legacy.getAppProtectionPolicies()).map((p: any) => p.id),
    ).toEqual(["ios", "android"]);
    expect(legacy.getFetchErrors()).toHaveLength(1);
  });
  it("exposes legacy collection failures instead of silently returning an empty inventory", async () => {
    const s = new IntuneConfigurationService("test") as any;
    s.client = client(() => {
      throw forbidden();
    });
    const result = await s.getAllDeviceConfigurations();
    expect(result.collectionStatus).toBe("incomplete");
    expect(result.fetchErrors.length).toBeGreaterThan(0);
  });
  it("retries throttled inner groups together after the longest Retry-After", async () => {
    vi.useFakeTimers();
    try {
      const resolver = new GroupResolver("test") as any;
      const post = vi
        .fn()
        .mockResolvedValueOnce({
          responses: [
            { id: "0", status: 429, headers: { "Retry-After": "1" } },
            { id: "1", status: 503, headers: { "Retry-After": "2" } },
          ],
        })
        .mockResolvedValueOnce({
          responses: [
            { id: "0", status: 200, body: { id: "a", displayName: "A" } },
            { id: "1", status: 200, body: { id: "b", displayName: "B" } },
          ],
        });
      resolver.client = {
        api: () => {
          const q: any = { version: () => q, post };
          return q;
        },
      };
      const pending = resolver.getGroupNames(["a", "b"]);
      await vi.advanceTimersByTimeAsync(1999);
      expect(post).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect([...(await pending).values()]).toEqual(["A", "B"]);
      expect(post).toHaveBeenCalledTimes(2);
      expect(post.mock.calls[1]?.[0].requests).toHaveLength(2);
      expect(resolver.getWarnings()).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
  it("retains collected update-ring assignments when its details fail", async () => {
    const s = service((path) => {
      if (path === "/deviceManagement/deviceConfigurations")
        return { value: [{ id: "ring", assignments: [] }] };
      if (path.endsWith("/assignments")) return { value: assigned };
      throw forbidden();
    });
    const [ring] = await s.getWindowsUpdatePoliciesDetailed();
    expect(ring).toMatchObject({
      hasFetchError: true,
      assignments: assigned,
      collectionStatus: { details: "incomplete", assignments: "complete" },
    });
    expect(ring.fetchErrorMessage).toContain("Forbidden");
  });
  it("preserves group IDs and warnings for denied inner batch requests", async () => {
    const resolver = new GroupResolver("test") as any;
    resolver.client = {
      api: () => {
        const q: any = {
          version: () => q,
          post: async () => ({ responses: [{ id: "0", status: 403 }] }),
        };
        return q;
      },
    };
    expect((await resolver.getGroupNames(["group-id"])).get("group-id")).toBe(
      "group-id",
    );
    expect(resolver.getWarnings()).toHaveLength(1);
  });
});
