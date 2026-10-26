import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkCollection } from "../../../../src/lib/benchmarks/tenant-settings";
import { choice, collection, pack, tenantPolicy } from "../../../../src/lib/benchmarks/__tests__/fixtures";

// The CIS Benchmarks view names assignment groups through the lookup and
// cache of the compliance view. Synthetic ids and names only; the Graph
// group lookup is a stub that records what it was asked.

const state = vi.hoisted(() => ({
  owner: "synthetic-owner",
  groupId: "00000000-0000-0000-0000-0000000000c1",
  otherId: "00000000-0000-0000-0000-0000000000c2",
  collection: null as unknown,
  lookups: [] as string[][],
  fail: false,
}));

vi.mock("./collect", () => ({
  getLastCollection: () => state.collection,
  getCollectionOwner: () => state.owner,
}));

vi.mock("../../../../src/lib/group-resolver", () => ({
  GroupResolver: class {
    async getGroupNames(ids: string[]) {
      state.lookups.push([...ids]);
      if (state.fail) throw new Error("Synthetic outage");
      // A group Graph cannot name keeps its id, as GroupResolver does.
      return new Map(ids.map((id) => [id, id === state.groupId ? "Synthetic pilot group" : id]));
    }
  },
}));

const { benchmarkWork } = await import("./benchmarks");
const { collectionGroupNames, complianceAssessment, resetGroupNames } = await import("./compliance");

const TENANT = "11111111-2222-3333-4444-555555555555";
const ALPHA = "synthetic_alpha";
const token = async () => "synthetic-token";
const group = (groupId: string) => ({
  id: `assignment-${groupId}`,
  target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
});

function tenantCollection(): BenchmarkCollection {
  return collection({
    policies: [
      tenantPolicy({
        name: "Synthetic assigned baseline",
        settings: [choice(ALPHA, "on")],
        assignments: [group(state.groupId), group(state.otherId)],
      }),
    ],
  });
}

// As main.ts wires it.
function work(log = vi.fn()) {
  return benchmarkWork({
    collectionFor: (owner) => (owner === state.owner ? (state.collection as BenchmarkCollection) : null),
    groupNames: (data) => collectionGroupNames(data, token),
    exceptions: { list: vi.fn(async () => []), set: vi.fn(async () => []), remove: vi.fn(async () => []) },
    isCurrent: () => true,
    recordRuns: vi.fn(async () => false),
    history: {
      benchmarkHistory: vi.fn(async () => ({ enabled: true, available: true, reason: null, trend: [], drift: [], runs: [] })),
      benchmarkPortfolio: vi.fn(async () => ({ available: true, reason: null, benchmarks: [], selected: null, rows: [] })),
    },
    tenantLabel: () => undefined,
    log,
  });
}

async function reachTargets(log = vi.fn()) {
  const view = await work(log).assessBenchmark({
    owner: state.owner,
    tenantId: TENANT,
    packs: [pack([{ settings: [choice(ALPHA, "on")] }], undefined, 1)],
    list: null,
  });
  return view.settings.find((item) => item.settingId === ALPHA)!.observations[0]!.reach!.targets;
}

beforeEach(() => {
  resetGroupNames();
  state.collection = tenantCollection();
  state.lookups = [];
  state.fail = false;
});

describe("benchmark group names", () => {
  it("names the groups of the assessed collection and keeps the id of a group Graph cannot name", async () => {
    expect(await reachTargets()).toEqual(["Group: Synthetic pilot group", `Group: ${state.otherId}`]);
    expect(state.lookups).toEqual([[state.groupId, state.otherId]]);
  });

  it("shares the compliance lookup and cache, dropped by resetGroupNames", async () => {
    await reachTargets();
    await complianceAssessment(state.owner, token, {});
    await reachTargets();
    expect(state.lookups).toHaveLength(1);
    resetGroupNames();
    await reachTargets();
    expect(state.lookups).toHaveLength(2);
  });

  it("keeps the ids when the lookup fails, logs only the reason and retries next time", async () => {
    state.fail = true;
    const log = vi.fn();
    expect(await reachTargets(log)).toEqual([`Group: ${state.groupId}`, `Group: ${state.otherId}`]);
    expect(log).toHaveBeenCalledWith("warn", "benchmark group names not read");
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).not.toContain(state.groupId);
    expect(logged).not.toContain("Synthetic");
    state.fail = false;
    expect(await reachTargets()).toEqual(["Group: Synthetic pilot group", `Group: ${state.otherId}`]);
    expect(state.lookups).toHaveLength(2);
  });

  it("looks up only the last collection", async () => {
    const other = tenantCollection();
    expect(await collectionGroupNames(other, token)).toEqual({ names: new Map(), resolved: false });
    state.collection = null;
    expect(await collectionGroupNames(other, token)).toEqual({ names: new Map(), resolved: false });
    expect(state.lookups).toEqual([]);
  });

  it("is wired in main through the compliance lookup and dropped with the other Graph answers", () => {
    const source = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
    const registration = source.slice(source.indexOf("work: benchmarkWork({"), source.indexOf('handle("data:clear"'));
    expect(registration).toMatch(/groupNames: \(collection\) => collectionGroupNames\(collection, tokenProvider\),/);
    expect(registration).toMatch(/resetGraph: \(\) => \{\s+benchmarksGraph\.reset\(\);\s+resetGroupNames\(\);\s+\}/);
  });
});
