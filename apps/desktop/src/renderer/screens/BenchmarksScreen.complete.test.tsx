// @vitest-environment jsdom
// The Benchmarks screen with views as main builds them: group names through
// the compliance lookup (main/compliance.ts collectionGroupNames) and the
// complete conditions of a step. Synthetic ids and names only; the Graph
// group lookup is a stub.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkCollection } from "../../../../../src/lib/benchmarks/tenant-settings";
import { assessBenchmark } from "../../../../../src/lib/benchmarks/assessment";
import { choice, collection, NOW, pack, tenantPolicy } from "../../../../../src/lib/benchmarks/__tests__/fixtures";
import type { BenchmarkAssessmentView } from "../../shared/ipc-types";
import { SYNTHETIC_CATALOG, withFixPlan } from "../__fixtures__/benchmarks";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  assess: vi.fn(),
  exceptions: vi.fn(),
  history: vi.fn(),
  portfolio: vi.fn(),
  state: { current: null as unknown },
  owner: "synthetic-owner",
  collection: null as unknown,
  groupId: "00000000-0000-0000-0000-0000000000c1",
  otherId: "00000000-0000-0000-0000-0000000000c2",
  groupName:
    "Synthetic pilot group with a deliberately long display name that has to wrap over several lines",
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    benchmarksCatalog: mocks.catalog,
    benchmarksAssess: mocks.assess,
    benchmarksExceptions: mocks.exceptions,
    benchmarksExport: vi.fn(),
    benchmarksPreviewDrafts: vi.fn(),
    openHelp: vi.fn(),
    benchmarksHistory: mocks.history,
    benchmarksPortfolio: mocks.portfolio,
    onHistoryChanged: () => () => undefined,
    copyText: async () => true,
    openLastFile: async () => true,
    showLastFileInFolder: async () => true,
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  isMac: false,
}));

vi.mock("../state/context", () => ({
  useApp: () => ({ state: mocks.state.current, dispatch: vi.fn(), actions: { navigate: vi.fn() } }),
}));

// Main's last collection and the Graph group lookup.
vi.mock("../../main/collect", () => ({
  getLastCollection: () => mocks.collection,
  getCollectionOwner: () => mocks.owner,
}));
vi.mock("../../../../../src/lib/group-resolver", () => ({
  GroupResolver: class {
    async getGroupNames(ids: string[]) {
      // A group Graph cannot name keeps its id, as GroupResolver does.
      return new Map(ids.map((id) => [id, id === mocks.groupId ? mocks.groupName : id]));
    }
  },
}));

const { BenchmarksScreen } = await import("./BenchmarksScreen");
const { benchmarkWork } = await import("../../main/benchmarks");
const { collectionGroupNames, resetGroupNames } = await import("../../main/compliance");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function until(check: () => void, timeout = 3000) {
  const start = Date.now();
  for (;;) {
    try {
      check();
      return;
    } catch (error) {
      if (Date.now() - start > timeout) throw error;
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

async function click(element: Element) {
  await act(async () => fireEvent.click(element));
  await settle();
}

async function showView(view: BenchmarkAssessmentView) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<BenchmarksScreen />));
  await settle();
  mocks.assess.mockResolvedValueOnce(view);
  await click(screen.getByRole("button", { name: "Compare with tenant" }));
  await until(() => expect(screen.getByRole("region", { name: "Accepted differences" })).toBeTruthy());
}

const list = () => screen.getByRole("list", { name: "Recommendations" });

beforeEach(() => {
  for (const mock of [mocks.catalog, mocks.assess, mocks.exceptions, mocks.history, mocks.portfolio]) mock.mockReset();
  mocks.history.mockResolvedValue({ enabled: true, available: true, reason: null, trend: [], drift: [], runs: [] });
  mocks.portfolio.mockResolvedValue({ available: true, reason: null, benchmarks: [], selected: null, rows: [] });
  mocks.catalog.mockResolvedValue(SYNTHETIC_CATALOG);
  mocks.exceptions.mockResolvedValue([]);
  mocks.state.current = {
    benchmarks: "internal",
    auth: { signedIn: true, tenantId: "tenant-1", account: "admin@synthetic.example" },
    license: { entitled: true, plan: "pro" },
    collection: { running: false, summary: { collectedAt: "2026-10-22T09:00:00.000Z" } },
  };
  resetGroupNames();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("BenchmarksScreen with the view main builds", () => {
  it("names the policy's groups from the collection's lookup in full, and an unresolved group by its id", async () => {
    const ALPHA = "synthetic_alpha";
    const group = (groupId: string) => ({
      id: `assignment-${groupId}`,
      target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
    });
    mocks.collection = collection({
      policies: [
        tenantPolicy({
          name: "Synthetic assigned baseline",
          settings: [choice(ALPHA, "on")],
          assignments: [group(mocks.groupId), group(mocks.otherId)],
        }),
      ],
    });
    const token = async () => "synthetic-token";
    const view = await benchmarkWork({
      collectionFor: (owner) => (owner === mocks.owner ? (mocks.collection as BenchmarkCollection) : null),
      groupNames: (data) => collectionGroupNames(data, token),
      exceptions: { list: vi.fn(async () => []), set: vi.fn(async () => []), remove: vi.fn(async () => []) },
      isCurrent: () => true,
      recordRuns: vi.fn(async () => false),
      history: { benchmarkHistory: vi.fn(), benchmarkPortfolio: vi.fn() },
      tenantLabel: () => undefined,
      log: vi.fn(),
    }).assessBenchmark({
      owner: mocks.owner,
      tenantId: "11111111-2222-3333-4444-555555555555",
      packs: [
        pack(
          [{ settings: [choice(ALPHA, "off")] }],
          [{ id: "1.1", title: "Synthetic recommendation alpha", level: 1, settings: [ALPHA] }],
          1,
        ),
      ],
      list: null,
    });
    await showView(view);
    await click(within(list()).getByRole("button", { name: /Synthetic recommendation alpha/, expanded: false }));
    const holders = within(list()).getByRole("list", { name: "Policies holding this setting" });
    expect(holders.textContent).toContain(
      `Synthetic assigned baseline, assigned to Group: ${mocks.groupName}, Group: ${mocks.otherId}`,
    );
  });

  it("lists every step before assigning a policy, not a shortened list", async () => {
    const WAITING = "synthetic_bench_r48_waiting";
    const HELD = Array.from({ length: 20 }, (_, index) => `synthetic_bench_r48_held_${index + 1}`);
    const CANDIDATE = "Synthetic candidate profile";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic assigned baseline", settings: HELD.map((id) => choice(id, "1")) }),
          tenantPolicy({
            name: CANDIDATE,
            settings: [choice(WAITING, "1"), ...HELD.map((id) => choice(id, "0"))],
            assignments: [],
          }),
        ],
      }),
      pack(
        [{ settings: [choice(WAITING, "1"), ...HELD.map((id) => choice(id, "1"))] }],
        [WAITING, ...HELD].map((id, index) => ({
          id: `1.${index + 1}`,
          title: `Synthetic recommendation ${index + 1}`,
          level: 1 as const,
          settings: [id],
        })),
      ),
      { now: NOW },
    );
    const view = withFixPlan(assessment);
    const number = view.fixPlan.actions.findIndex((action) => action.kind === "assignPolicy") + 1;
    await showView(view);
    const conditions = screen.getByRole("list", { name: `Before assigning the policy of step ${number}` });
    const items = within(conditions).getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual(HELD.map((id) => `Change ${id} in policy ${CANDIDATE} from 0 to 1 before assigning it.`));
  });

  // Round 49: a recommendation matched on two unassigned policies needs both
  // assigned, so no single step covers it and the plan has none.
  it("says no single step covers a result that needs review, with a filter to it", async () => {
    const A = "synthetic_bench_r49_together_a";
    const B = "synthetic_bench_r49_together_b";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic first half", settings: [choice(A, "1")], assignments: [] }),
          tenantPolicy({ name: "Synthetic second half", settings: [choice(B, "1")], assignments: [] }),
        ],
      }),
      pack(
        [{ settings: [choice(A, "1"), choice(B, "1")] }],
        [{ id: "1.1", title: "Synthetic recommendation together", level: 1, settings: [A, B] }],
      ),
      { now: NOW },
    );
    const view = withFixPlan(assessment);
    expect(view.fixPlan).toMatchObject({ actions: [], withoutAction: 1 });
    await showView(view);
    const plan = screen.getByRole("region", { name: "What to do next" });
    expect(plan.textContent).toContain("No single step covers this result; see each result for what to check.");
    expect(plan.textContent).not.toContain("Nothing to change");
    await click(within(plan).getByRole("button", { name: "Show 1 result" }));
    expect(within(list()).getByRole("button", { name: /Synthetic recommendation together/ })).toBeTruthy();
  });

  it("says nothing is to change only when no result differs or needs review", async () => {
    const ALPHA = "synthetic_bench_r49_alpha";
    const assessment = assessBenchmark(
      collection({ policies: [tenantPolicy({ name: "Synthetic assigned baseline", settings: [choice(ALPHA, "1")] })] }),
      pack([{ settings: [choice(ALPHA, "1")] }], [{ id: "1.1", title: "Synthetic recommendation alpha", level: 1, settings: [ALPHA] }]),
      { now: NOW },
    );
    const view = withFixPlan(assessment);
    expect(view.fixPlan).toMatchObject({ actions: [], withoutAction: 0 });
    await showView(view);
    const plan = screen.getByRole("region", { name: "What to do next" });
    expect(plan.textContent).toContain("Nothing to change: no result differs, is not configured or needs review.");
    expect(within(plan).queryByRole("button", { name: /^Show / })).toBeNull();
  });
});
