import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
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
  // The name Graph returns for groupId.
  groupName: "Synthetic pilot group",
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
      return new Map(ids.map((id) => [id, id === state.groupId ? state.groupName : id]));
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
  state.groupName = "Synthetic pilot group";
});

/** Text of every page with whitespace collapsed, as the PDF tests read it. */
function pdfText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const pdf = raw.toString("latin1");
  const pages = [...pdf.matchAll(/(\d+) 0 obj\s*<<\s*\/Type \/Page\b(?!s)([\s\S]*?)endobj/g)];
  return pages
    .map((match) => {
      const contentId = /\/Contents (\d+) 0 R/.exec(match[2] ?? "")?.[1];
      const object = new RegExp(`(?:^|\\n)${contentId} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\n`).exec(pdf);
      if (!object) return "";
      const start = (object.index ?? 0) + object[0].length;
      const length = Number(/\/Length (\d+)/.exec(object[1] ?? "")?.[1]);
      const data = raw.subarray(start, start + length);
      const stream = (object[1]?.includes("/FlateDecode") ? inflateSync(data) : data).toString("latin1");
      return [...stream.matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)]
        .map((item) => (item[1] ?? "").replace(/\\(.)/g, "$1"))
        .join(" ");
    })
    .join(" ")
    .replace(/\s+/g, " ");
}

// The view main returns for a pack the tenant differs from, and its exports.
async function differingViewAndExports() {
  const benchmark = work();
  const packs = [pack([{ settings: [choice(ALPHA, "off")] }], undefined, 1)];
  const view = await benchmark.assessBenchmark({ owner: state.owner, tenantId: TENANT, packs, list: null });
  const exported = async (format: "pdf" | "csv") =>
    (await benchmark.exportBenchmark({ owner: state.owner, tenantId: TENANT, assessment: view, packs, format } as never))
      .bytes;
  return {
    view,
    pdf: pdfText(await exported("pdf")),
    csv: new TextDecoder().decode(await exported("csv")),
  };
}

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

  it("carries the resolved names from the collection through the view into the PDF and the CSV", async () => {
    const { view, pdf, csv } = await differingViewAndExports();
    expect(view.settings[0]!.observations[0]!.reach.targets).toEqual([
      "Group: Synthetic pilot group",
      `Group: ${state.otherId}`,
    ]);
    // Wrapped lines are joined by a space; an identifier may wrap after a hyphen.
    const joined = pdf.replace(/- /g, "-");
    expect(joined).toContain("Group: Synthetic pilot group");
    expect(joined).toContain(`Group: ${state.otherId}`);
    expect(csv).toContain(`Synthetic assigned baseline: assigned to Group: Synthetic pilot group, Group: ${state.otherId}`);
  });

  it("never cuts a long group name or an unresolved id in the PDF", async () => {
    state.groupName =
      "Synthetic pilot group with a deliberately long display name that has to wrap over several lines of the assignment column";
    const { pdf, csv } = await differingViewAndExports();
    const joined = pdf.replace(/- /g, "-");
    expect(joined).toContain(`Group: ${state.groupName}`);
    expect(joined).toContain(`Group: ${state.otherId}`);
    const cut = /Group: [^,]*?\.\.\./.exec(pdf);
    expect(cut ? pdf.slice(cut.index, cut.index + 200) : null).toBeNull();
    expect(csv).toContain(`Group: ${state.groupName}, Group: ${state.otherId}`);
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
