import { describe, expect, it, vi } from "vitest";
import { settingName } from "../../../../src/lib/benchmarks/values";
import { DEFINITION_READS_AT_ONCE, benchmarkGraph } from "./benchmark-graph";

// A stub of the shared Graph client: records the paths asked for and
// answers like Graph, with synthetic ids only.
function stubGraph(answer: (path: string, version: string) => unknown) {
  const calls: Array<{ path: string; version: string }> = [];
  let running = 0;
  let peak = 0;
  const client = () => ({
    api: (path: string) => ({
      version: (version: string) => ({
        get: async () => {
          calls.push({ path, version });
          running += 1;
          peak = Math.max(peak, running);
          await new Promise((resolve) => setTimeout(resolve, 1));
          running -= 1;
          const value = answer(path, version);
          if (value instanceof Error) throw value;
          return value;
        },
      }),
    }),
  });
  return { calls, client: client as never, peak: () => peak };
}

const notFound = () => Object.assign(new Error("Not found"), { statusCode: 404 });

describe("benchmark Graph reads", () => {
  it("reads setting definitions by id with GET, a few at a time, and keeps only the ids asked for", async () => {
    const ids = Array.from({ length: 14 }, (_, index) => `synthetic_graph_setting_${index}`);
    const graph = stubGraph((path) => {
      const id = decodeURIComponent(path.split("/").at(-1)!);
      if (id.endsWith("_3")) return notFound();
      if (id.endsWith("_4")) return new Error("Synthetic outage");
      if (id.endsWith("_5")) return { id: "synthetic_graph_other", displayName: "Synthetic other" };
      if (id.endsWith("_6")) return { id: id.toUpperCase(), displayName: "Synthetic upper case" };
      return {
        id,
        displayName: `Synthetic name ${id.slice(-2)}`,
        options: [{ itemId: `${id}_1`, displayName: "Synthetic enabled" }],
      };
    });
    const log = vi.fn();
    const names = await benchmarkGraph({ token: "synthetic-token", log, client: graph.client }).settingNames([...ids, ids[0]!]);
    expect(graph.calls).toHaveLength(14);
    expect(graph.calls.every((call) => call.version === "beta")).toBe(true);
    expect(graph.calls[0]!.path).toBe("/deviceManagement/configurationSettings/synthetic_graph_setting_0");
    expect(graph.peak()).toBeLessThanOrEqual(DEFINITION_READS_AT_ONCE);
    expect(Object.keys(names).sort()).toEqual(ids.filter((id) => !/_(3|4|5)$/.test(id)).sort());
    expect(names[ids[6]!]!.name).toBe("Synthetic upper case");
    expect(names[ids[0]!]).toEqual({
      name: "Synthetic name _0",
      options: { [`${ids[0]}_1`]: "Synthetic enabled" },
    });
    // Counts only, never names.
    expect(log).toHaveBeenCalledWith("warn", "benchmark setting names", { asked: 14, named: 11, unknown: 1, failed: 1 });
    expect(JSON.stringify(log.mock.calls)).not.toContain("Synthetic name");
  });

  it("names a definition below another that has no display name within its root (shape verified with Lokka)", async () => {
    const root = "synthetic_graph_admx_root";
    const child = "synthetic_graph_admx_root_value";
    // GET /beta/deviceManagement/configurationSettings/{id} of a setting below
    // an administrative template setting: displayName is empty, name and
    // rootDefinitionId are set.
    const graph = stubGraph((path) => {
      const id = decodeURIComponent(path.split("/").at(-1)!);
      return id === root
        ? { id, displayName: "Synthetic warning settings (User)", name: "L_SyntheticWarning", rootDefinitionId: root }
        : {
            id,
            displayName: "",
            name: "L_SyntheticWarningValue",
            rootDefinitionId: root,
            options: [{ itemId: `${child}_2`, displayName: "Synthetic block" }],
          };
    });
    const names = await benchmarkGraph({ token: "t", log: vi.fn(), client: graph.client }).settingNames([child, root]);
    expect(names[child]).toEqual({
      name: "L_SyntheticWarningValue",
      options: { [`${child}_2`]: "Synthetic block" },
      within: root,
    });
    expect(settingName(names, child)).toBe("Synthetic warning settings (User): L_SyntheticWarningValue");
  });

  it("encodes ids that hold spaces and other characters", async () => {
    const id = "com.synthetic.graph_display sleep timer$1";
    const graph = stubGraph(() => ({ id, displayName: "Synthetic sleep timer" }));
    const names = await benchmarkGraph({ token: "t", log: vi.fn(), client: graph.client }).settingNames([id]);
    expect(graph.calls[0]!.path).toBe(`/deviceManagement/configurationSettings/${encodeURIComponent(id)}`);
    expect(names[id]!.name).toBe("Synthetic sleep timer");
  });

  it("reads the tenant display name once per tenant until reset", async () => {
    const graph = stubGraph((path, version) =>
      path === "/organization?$select=displayName" && version === "v1.0"
        ? { value: [{ displayName: " Synthetic Tenant " }] }
        : notFound(),
    );
    const service = benchmarkGraph({ token: "t", log: vi.fn(), client: graph.client });
    await expect(service.tenantName("tenant-a")).resolves.toBe("Synthetic Tenant");
    await expect(service.tenantName("tenant-a")).resolves.toBe("Synthetic Tenant");
    expect(graph.calls).toHaveLength(1);
    service.reset();
    await service.tenantName("tenant-a");
    expect(graph.calls).toHaveLength(2);
  });

  it("falls back to no name when the organization cannot be read", async () => {
    const graph = stubGraph(() => new Error("Synthetic outage"));
    const log = vi.fn();
    await expect(benchmarkGraph({ token: "t", log, client: graph.client }).tenantName("tenant-b")).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledWith("warn", "tenant name not read");
  });
});
