// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkAssessment } from "../../../../../src/lib/benchmarks/assessment";
import { assessBenchmark, combineLevelAssessments } from "../../../../../src/lib/benchmarks/assessment";
import { exceptionsForLevel, type BenchmarkException } from "../../../../../src/lib/benchmarks/exceptions";
import * as engine from "../../../../../src/lib/benchmarks/__tests__/fixtures";
import { unassignedAssessment } from "../../../../../src/lib/benchmarks/__tests__/export-fixtures";
import { LEVEL_2_NOTE, READINESS_DISCLAIMER, SETTINGS_BASIS_NOTE } from "../../../../../src/lib/benchmarks/display";
import type { BenchmarkAssessmentView } from "../../shared/ipc-types";
import { SYNTHETIC_CATALOG, syntheticAssessment, withExceptionUses, withFixPlan } from "../__fixtures__/benchmarks";
import { formatDay } from "../lib/benchmarks-view";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  assess: vi.fn(),
  exceptions: vi.fn(),
  exportFile: vi.fn(),
  previewDrafts: vi.fn(),
  openHelp: vi.fn(),
  history: vi.fn(),
  portfolio: vi.fn(),
  navigate: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    benchmarksCatalog: mocks.catalog,
    benchmarksAssess: mocks.assess,
    benchmarksExceptions: mocks.exceptions,
    benchmarksExport: mocks.exportFile,
    benchmarksPreviewDrafts: mocks.previewDrafts,
    openHelp: mocks.openHelp,
    benchmarksHistory: mocks.history,
    benchmarksPortfolio: mocks.portfolio,
    onHistoryChanged: () => () => undefined,
    copyText: async () => true,
    openLastFile: async () => true,
    showLastFileInFolder: async () => true,
  },
  // As in the app: Electron's prefix is stripped.
  errorMessage: (error: unknown) =>
    (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']*':\s*(?:Error:\s*)?/, ""),
  isMac: false,
}));

vi.mock("../state/context", () => ({
  useApp: () => ({ state: mocks.state.current, dispatch: vi.fn(), actions: { navigate: mocks.navigate } }),
}));

const { BenchmarksScreen } = await import("./BenchmarksScreen");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function appState({
  benchmarks = "internal" as "internal" | "comingSoon",
  plan = "pro" as "pro" | "msp",
  signedIn = true,
  entitled = true,
  collected = true,
  running = false,
} = {}) {
  return {
    benchmarks,
    auth: { signedIn, tenantId: "tenant-1", account: "admin@synthetic.example" },
    license: { entitled, plan },
    collection: { running, summary: collected ? { collectedAt: "2026-10-22T09:00:00.000Z" } : null },
  };
}

let root: Root | null = null;
let container: HTMLElement;

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

// Polls until the check passes, so debounces and chained promises never
// depend on a fixed delay.
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

async function renderScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<BenchmarksScreen />));
  await settle();
}

async function click(element: Element) {
  await act(async () => fireEvent.click(element));
  await settle();
}

// Main returns the assessment with its fix plan; engine assessments get theirs here.
const view = (assessment: BenchmarkAssessment | BenchmarkAssessmentView): BenchmarkAssessmentView =>
  "fixPlan" in assessment ? assessment : withFixPlan(assessment);

async function compare(assessment: BenchmarkAssessment | BenchmarkAssessmentView = syntheticAssessment()) {
  mocks.assess.mockResolvedValueOnce(view(assessment));
  await click(screen.getByRole("button", { name: "Compare with tenant" }));
  await until(() => expect(screen.getByRole("region", { name: "Accepted differences" })).toBeTruthy());
  await until(() => expect(screen.queryByText("Loading exceptions")).toBeNull());
}

const HISTORY = { enabled: true, available: true, reason: null, trend: [], drift: [], runs: [] };

const list = () => screen.getByRole("list", { name: "Recommendations" });
const row = (title: string) =>
  within(list()).getByRole("button", { name: new RegExp(`${title}(?!\\d)`), expanded: false });
const rowTitles = () =>
  within(list())
    .getAllByRole("button", { expanded: false })
    .map((button) => button.textContent ?? "");

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
  mocks.history.mockResolvedValue(HISTORY);
  mocks.portfolio.mockResolvedValue({ available: true, reason: null, benchmarks: [], selected: null, rows: [] });
  mocks.catalog.mockResolvedValue(SYNTHETIC_CATALOG);
  mocks.exceptions.mockResolvedValue([]);
  mocks.state.current = appState();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("BenchmarksScreen without the claim", () => {
  it("names no CIS Benchmarks and calls no benchmark channel", async () => {
    mocks.state.current = appState({ benchmarks: "comingSoon" });
    await renderScreen();
    expect(screen.getByText("This view is not available")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/CIS|Benchmark|coming soon/i);
    expect(screen.queryByText(/Synthetic/)).toBeNull();
    expect(mocks.catalog).not.toHaveBeenCalled();
    await click(screen.getByRole("button", { name: "Open Compliance Evidence" }));
    expect(mocks.navigate).toHaveBeenCalledWith("compliance");
  });
});

describe("BenchmarksScreen load step", () => {
  it("asks to sign in before loading the catalog", async () => {
    mocks.state.current = appState({ signedIn: false });
    await renderScreen();
    expect(screen.getByText("Sign in to compare with a benchmark")).toBeTruthy();
    expect(mocks.catalog).not.toHaveBeenCalled();
  });

  it("picks benchmark, newest version and Level from the catalog", async () => {
    await renderScreen();
    expect(screen.getByText("Delivered from the licensed content service")).toBeTruthy();
    const benchmark = screen.getByLabelText("Benchmark") as HTMLSelectElement;
    const version = screen.getByLabelText("Version") as HTMLSelectElement;
    expect(benchmark.value).toBe("synthetic-bench");
    expect([...version.options].map((option) => option.value)).toEqual(["2.0.0", "1.0.0"]);
    expect(screen.getByRole("radio", { name: "Level 2" })).toBeTruthy();

    await act(async () => fireEvent.change(version, { target: { value: "1.0.0" } }));
    // Version 1.0.0 has Level 1 only.
    expect(screen.queryByRole("radio", { name: "Level 2" })).toBeNull();
    await compare();
    expect(mocks.assess).toHaveBeenCalledWith({ benchmark: "synthetic-bench", version: "1.0.0", level: 1 });
  });

  it("shows the empty catalog and checks again", async () => {
    mocks.catalog.mockResolvedValueOnce({ benchmarks: [] });
    await renderScreen();
    expect(screen.getByText("No benchmark is available yet")).toBeTruthy();
    const compareButton = screen.getByRole("button", { name: "Compare with tenant" }) as HTMLButtonElement;
    expect(compareButton.disabled).toBe(true);
    await click(screen.getByRole("button", { name: "Check again" }));
    expect(mocks.catalog).toHaveBeenCalledTimes(2);
    expect(screen.getByLabelText("Benchmark")).toBeTruthy();
  });

  it("shows a catalog error with Try again", async () => {
    mocks.catalog.mockRejectedValueOnce(new Error("The CIS content service could not be reached."));
    await renderScreen();
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("The benchmark catalog could not be loaded")).toBeTruthy();
    expect(within(alert).getByText("The CIS content service could not be reached.")).toBeTruthy();
    await click(within(alert).getByRole("button", { name: "Try again" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText("Benchmark")).toBeTruthy();
  });

  it("shows an empty state with Collect on Overview before the first collection", async () => {
    mocks.state.current = appState({ collected: false });
    await renderScreen();
    expect(screen.getByText("Collect tenant data first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Compare with tenant" })).toBeNull();
    const collect = screen.getByRole("button", { name: "Collect on Overview" });
    // The primary action of the empty state.
    expect(collect.className).toContain("bg-petrol-950");
    await click(collect);
    expect(mocks.navigate).toHaveBeenCalledWith("overview");
    expect(mocks.assess).not.toHaveBeenCalled();
  });

  it("keeps the setup while a collection runs and says why Compare waits", async () => {
    mocks.state.current = appState({ collected: false, running: true });
    await renderScreen();
    expect(screen.getByText("Available when the collection finishes.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Compare with tenant" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("marks the selected Level with the accessible teal and a focus ring offset", async () => {
    await renderScreen();
    const selected = screen.getByRole("radio", { name: "Level 1" }).closest("label")!;
    expect(selected.className).toContain("bg-teal-700");
    expect(selected.className).toContain("has-[:focus-visible]:ring-offset-2");
    expect(screen.getByRole("radio", { name: "Level 2" }).closest("label")!.className).not.toContain("bg-teal-700");
  });
});

describe("BenchmarksScreen compare step", () => {
  it("moves through the steps and shows a loading state", async () => {
    await renderScreen();
    const current = () => screen.getByRole("list", { name: "Steps" }).querySelector('[aria-current="step"]')?.textContent;
    expect(current()).toContain("Compare with tenant");
    let resolve!: (value: BenchmarkAssessment) => void;
    mocks.assess.mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    await click(screen.getByRole("button", { name: "Compare with tenant" }));
    expect(screen.getByText("Comparing the benchmark with the last collection")).toBeTruthy();
    await act(async () => resolve(syntheticAssessment()));
    await settle();
    expect(current()).toContain("Review results");
  });

  it("shows the main refusal with its cause and next step, marks the step and keeps one retry action", async () => {
    await renderScreen();
    const cause =
      "No benchmark pack was delivered for this Level, so nothing could be compared. Load the benchmark again or choose another Level.";
    mocks.assess.mockRejectedValueOnce(new Error(`Error invoking remote method 'benchmarks:assess': Error: ${cause}`));
    await click(screen.getByRole("button", { name: "Compare with tenant" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("The comparison could not run")).toBeTruthy();
    expect(within(alert).getByText(cause)).toBeTruthy();
    expect(within(alert).getByText(/then compare again/)).toBeTruthy();
    // The Compare button below retries; the alert has no second action.
    expect(within(alert).queryByRole("button")).toBeNull();
    const failed = screen.getByRole("list", { name: "Steps" }).querySelector('[aria-current="step"]')!;
    expect(failed.textContent).toContain("Step 2, failed");
    expect(failed.className).toContain("bg-red-50");
    expect(screen.getByLabelText("Benchmark")).toBeTruthy();
    mocks.assess.mockResolvedValueOnce(syntheticAssessment());
    await click(screen.getByRole("button", { name: "Compare again" }));
    expect(screen.getByRole("list", { name: "Recommendations" })).toBeTruthy();
  });

  it("refuses a malformed pack result as a failed comparison instead of a blank screen", async () => {
    await renderScreen();
    const broken = syntheticAssessment();
    (broken.recommendations[0] as unknown as { settings: unknown }).settings = null;
    mocks.assess.mockResolvedValueOnce(broken);
    await click(screen.getByRole("button", { name: "Compare with tenant" }));
    expect(screen.getByText("The comparison result could not be read. Try again.")).toBeTruthy();
    expect(screen.getByLabelText("Benchmark")).toBeTruthy();
  });

  it("refuses a result without the assessment lists", async () => {
    await renderScreen();
    mocks.assess.mockResolvedValueOnce({ benchmark: "synthetic-bench", version: "2.0.0", level: 1, assessedAt: "x" });
    await click(screen.getByRole("button", { name: "Compare with tenant" }));
    expect(screen.getByText("The comparison result could not be read. Try again.")).toBeTruthy();
    expect(screen.queryByRole("list", { name: "Recommendations" })).toBeNull();
  });
});

describe("BenchmarksScreen review step", () => {
  it("shows each Level's headline with per state counts, the rate with its base and the reasons outside it", async () => {
    await renderScreen();
    const assessment = syntheticAssessment({ count: 30, levels: [1, 2] });
    await compare(assessment);
    const level1 = screen.getByRole("region", { name: "Level 1" });
    // Ten of fifteen assessed: the rate may lead, always with its base.
    expect(within(level1).getByText("50%")).toBeTruthy();
    expect(within(level1).getByText("of 10 assessed, 0 need review")).toBeTruthy();
    // All five states, a zero as a plain count rather than a button.
    const counts = within(level1).getByRole("list", { name: "Results of Level 1" });
    expect(within(counts).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Matches5",
      "Differs0",
      "Not configured5",
      "Needs review0",
      "Not assessed5",
    ]);
    expect(within(counts).getAllByRole("button").map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Matches: 5. Show in the list",
      "Not configured: 5. Show in the list",
      "Not assessed: 5. Show in the list",
    ]);
    // Level 2 has no missing setting and still shows its Not configured count.
    const level2Counts = within(screen.getByRole("region", { name: "Level 2" })).getByRole("list", { name: "Results of Level 2" });
    expect(within(level2Counts).getAllByRole("listitem")).toHaveLength(5);
    expect(within(level2Counts).getByText("Not configured")).toBeTruthy();
    expect(within(level1).getByText(/outside the pack, so it is not assessed here/)).toBeTruthy();
    expect(within(level1).getByText(/coverage of the full benchmark will be shown once its list is published/)).toBeTruthy();
    const level2 = screen.getByRole("region", { name: "Level 2" });
    expect(within(level2).getByText("The matching value is only on policies that are not assigned.")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bcompliant\b|\bscore\b|\bcertified\b/i);
  });

  it("says the readiness line once, in the summary, not in each Level card", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 30, levels: [1, 2], level: 2 }));
    expect(screen.getAllByText(`${READINESS_DISCLAIMER}.`)).toHaveLength(1);
    expect(document.body.textContent!.split(READINESS_DISCLAIMER)).toHaveLength(2);
    const summary = screen.getByRole("region", { name: "Comparison" });
    expect(within(summary).getByText(`${READINESS_DISCLAIMER}.`)).toBeTruthy();
  });

  it("lets the counts lead when too few results were assessed, and keeps the rate with its base", async () => {
    await renderScreen();
    // Eight assessed: below the bar for a hero percentage.
    await compare(syntheticAssessment({ count: 12 }));
    const level1 = screen.getByRole("region", { name: "Level 1" });
    expect(within(level1).getByText("50% of 8 assessed, 2 need review")).toBeTruthy();
    expect(within(level1).getByText(/Too few results could be assessed for the rate to lead/)).toBeTruthy();
    expect(within(level1).queryByText("50%")).toBeNull();
  });

  it("opens the list on Differs from the headline count", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 12 }));
    await click(screen.getByRole("button", { name: "Differs: 2. Show in the list" }));
    expect(screen.getByRole("button", { name: "Differs, 2", pressed: true })).toBeTruthy();
    expect(rowTitles()).toHaveLength(2);
    expect(rowTitles().every((title) => title.includes("Differs"))).toBe(true);
  });

  it("shows both Levels with the Level 2 note when Level 2 was compared", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 30, levels: [1, 2], level: 2 }));
    expect(screen.getByRole("region", { name: "Level 1" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Level 2" })).toBeTruthy();
    expect(screen.getByText(LEVEL_2_NOTE)).toBeTruthy();
    expect(screen.queryByText(SETTINGS_BASIS_NOTE)).toBeNull();
  });

  it("explains a pack judged by settings", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 12, basis: "settings" }));
    expect(screen.getByText(SETTINGS_BASIS_NOTE)).toBeTruthy();
    expect(screen.queryByText(LEVEL_2_NOTE)).toBeNull();
    // Rows are titled by the setting's display name with the id under it.
    const settings = screen.getByRole("list", { name: "Settings" });
    const first = within(settings).getAllByRole("button", { expanded: false })[0]!;
    expect(first.textContent).toContain("Synthetic setting 2");
    expect(first.textContent).toContain("device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2");
  });

  it("names the Levels the results show in the review header", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 30, levels: [1, 2], level: 2 }));
    expect(screen.getByText(/^Version 2\.0\.0, Levels 1 and 2 for Synthetic Contoso Lab\. Compared/)).toBeTruthy();
    expect(screen.queryByText(/^Version 2\.0\.0, Level 2 /)).toBeNull();
    mocks.assess.mockResolvedValueOnce(syntheticAssessment({ levels: [1] }));
    await click(screen.getByRole("button", { name: "Compare again" }));
    await until(() => expect(screen.getByText(/^Version 2\.0\.0, Level 1 for Synthetic Contoso Lab\. Compared/)).toBeTruthy());
  });

  it("shows n/a when nothing could be assessed", async () => {
    const assessment = syntheticAssessment({ count: 1 });
    assessment.levels[0]!.headline = { ...assessment.levels[0]!.headline, rate: null };
    await renderScreen();
    await compare(assessment);
    expect(screen.getByText("No rate")).toBeTruthy();
    expect(screen.getByText("Matching recommendations: nothing could be assessed as Matches or Differs.")).toBeTruthy();
  });

  it("filters by state and Level, searches, and shows the filtered empty state", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 12, levels: [1, 2] }));
    expect(rowTitles()).toHaveLength(12);

    await click(screen.getByRole("button", { name: "Not configured, 2" }));
    expect(rowTitles()).toHaveLength(2);
    expect(rowTitles().every((title) => title.includes("Not configured"))).toBe(true);
    await click(screen.getByRole("button", { name: "Differs, 2" }));
    expect(rowTitles().every((title) => title.includes("Differs"))).toBe(true);
    await click(screen.getByRole("button", { name: "Level 2" }));
    expect(rowTitles()).toHaveLength(2);

    // Result counts follow the Level filter.
    await click(screen.getByRole("button", { name: "All, 6" }));
    await click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "All, 12" })).toBeTruthy();
    const search = screen.getByLabelText("Search by name or id") as HTMLInputElement;
    // The placeholder uses the full petrol-600 for contrast.
    expect(search.className).toContain("placeholder:text-petrol-600 ");
    await act(async () => fireEvent.change(search, { target: { value: "synthetic_setting_7" } }));
    await until(() => expect(rowTitles()).toEqual([expect.stringContaining("Synthetic recommendation 7")]));

    await act(async () => fireEvent.change(search, { target: { value: "nothing like this" } }));
    await until(() => expect(screen.getByText("No recommendation matches the filters")).toBeTruthy());
    await click(screen.getByRole("button", { name: "Clear filters" }));
    await until(() => expect(rowTitles()).toHaveLength(12));
  });

  it("caps a large list and shows more on request", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 250 }));
    expect(rowTitles()).toHaveLength(100);
    expect(screen.getByText("Showing 100 of 250")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Show 100 more" }));
    await click(screen.getByRole("button", { name: "Show 50 more" }));
    expect(rowTitles()).toHaveLength(250);
  });

  it("shows readable names with the id under them, most severe first, with an id sort", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 12 }));
    const first = rowTitles()[0]!;
    expect(first.indexOf("Synthetic recommendation 2")).toBeLessThan(first.indexOf("2.1.2"));
    // Differs, then Not configured.
    expect(rowTitles().map((title) => title.match(/\d+\.\d+\.\d+/)![0]).slice(0, 4)).toEqual([
      "2.1.2",
      "8.1.8",
      "3.1.3",
      "9.1.9",
    ]);
    await act(async () => fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "id" } }));
    expect(rowTitles().map((title) => title.match(/\d+\.\d+\.\d+/)![0]).slice(0, 4)).toEqual([
      "1.1.1",
      "1.2.10",
      "2.1.2",
      "2.2.11",
    ]);
  });

  it("opens a row with current and recommended values, the holding policy's reach, raw JSON and the next step", async () => {
    await renderScreen();
    await compare();
    await click(row("Synthetic recommendation 2"));
    const detail = within(list()).getByRole("list", { name: "Settings" });
    expect(within(detail).getByText("Synthetic setting 2")).toBeTruthy();
    expect(within(detail).getByText("device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2")).toBeTruthy();
    expect(within(detail).getByText("Current")).toBeTruthy();
    expect(within(detail).getByText("Recommended")).toBeTruthy();
    expect(within(detail).getByText("Disabled")).toBeTruthy();
    expect(within(detail).getByText("Enabled")).toBeTruthy();
    const holders = within(detail).getByRole("list", { name: "Policies holding this setting" });
    expect(holders.textContent).toContain("Synthetic security policy A, assigned to Group: Synthetic pilot devices");
    // The raw instances stay behind a disclosure.
    expect(within(detail).getByText("Raw values (JSON)").closest("details")!.open).toBe(false);
    expect(
      within(list()).getByText(
        "Change Synthetic setting 2 in policy Synthetic security policy A from Disabled to Enabled.",
      ),
    ).toBeTruthy();
    expect(within(list()).getByText("Next step:")).toBeTruthy();
  });

  it("names a missing setting Not configured, on the row and as its current value", async () => {
    await renderScreen();
    await compare();
    const missing = row("Synthetic recommendation 3");
    expect(within(missing).getByText("Not configured")).toBeTruthy();
    await click(missing);
    const detail = within(list()).getByRole("list", { name: "Settings" });
    // The current value; the row chip already says the state, so the setting has no second chip.
    expect(within(detail).getAllByText("Not configured")).toHaveLength(1);
  });

  it("judges each policy on the displayed nested setting, not on its whole root (finding 2)", async () => {
    const { choice, collection, groupCollection, pack, tenantPolicy } = engine;
    const group = "synthetic_bench_group";
    const childA = "synthetic_bench_group_a";
    const childB = "synthetic_bench_group_b";
    const nested = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic grouped tenant policy",
            settings: [groupCollection(group, [[choice(childA, "1"), choice(childB, "2")]])],
          }),
        ],
      }),
      {
        ...pack(
          [{ settings: [groupCollection(group, [[choice(childA, "1"), choice(childB, "1")]])] }],
          [
            { id: "1.1", title: "Synthetic nested match", level: 1, settings: [childA] },
            { id: "1.2", title: "Synthetic nested difference", level: 1, settings: [childB] },
          ],
        ),
        version: "2.0.0",
      },
      { now: engine.NOW },
    );
    // The root differs (childB), so the whole root comparison says differ.
    expect(nested.settings[0]!.observations[0]!.comparison).toBe("differ");
    await renderScreen();
    await compare(nested);
    await click(row("Synthetic nested match"));
    let detail = within(list()).getByRole("list", { name: "Policies holding this setting" });
    expect(within(detail).getByText("Synthetic grouped tenant policy")).toBeTruthy();
    // The child's own value: it matches, so neither the value nor a Differs label shows a difference.
    expect(within(detail).getByText("1")).toBeTruthy();
    expect(within(detail).queryByText("Differs")).toBeNull();
    expect(within(row("Synthetic nested difference")).getByText("Differs")).toBeTruthy();
    await click(within(list()).getByRole("button", { name: /Synthetic nested match/, expanded: true }));
    await click(row("Synthetic nested difference"));
    detail = within(list()).getByRole("list", { name: "Policies holding this setting" });
    expect(within(detail).getByText("2")).toBeTruthy();
  });

  it("names the differing setting below a root whose own value matches, with both values", async () => {
    const { choice, collection, pack, simpleInteger, tenantPolicy } = engine;
    const parent = "synthetic_bench_screen_root";
    const childA = "synthetic_bench_screen_a";
    const childB = "synthetic_bench_screen_b";
    const names = {
      [parent]: { name: "Synthetic screen root", options: { [`${parent}_1`]: "Enabled" } },
      [childA]: { name: "Synthetic screen child", options: { [`${childA}_1`]: "On", [`${childA}_0`]: "Off" } },
    };
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({
            name: "Synthetic screen policy",
            settings: [choice(parent, "1", [choice(childA, "0"), simpleInteger(childB, 5)])],
          }),
        ],
      }),
      {
        ...pack(
          [{ settings: [choice(parent, "1", [choice(childA, "1"), simpleInteger(childB, 5)])] }],
          [{ id: "1.1", title: "Synthetic child difference", level: 1, settings: [parent] }],
        ),
        version: "2.0.0",
      },
      { now: engine.NOW, names },
    );
    await renderScreen();
    await compare(assessment);
    await click(row("Synthetic child difference"));
    const detail = within(list()).getByRole("list", { name: "Policies holding this setting" });
    // The own value matches, so the value says a setting below differs instead of repeating "Enabled".
    expect(within(detail).getByText("Enabled (a setting below differs)")).toBeTruthy();
    expect(within(detail).queryByText("Enabled")).toBeNull();
    const below = within(detail).getByRole("list", { name: "Settings below that differ" });
    expect(below.textContent).toBe("Synthetic screen child: Off, recommended On");
  });

  it("says why a matching setting needs review beside its badge", async () => {
    const { choice, collection, pack, tenantPolicy } = engine;
    const setting = "synthetic_bench_unassigned_match";
    const unassigned = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic unassigned policy", settings: [choice(setting, "1")], assignments: [] }),
        ],
      }),
      {
        ...pack([{ settings: [choice(setting, "1")] }], [
          { id: "1.1", title: "Synthetic unassigned match", level: 1, settings: [setting] },
        ]),
        version: "2.0.0",
      },
      { now: engine.NOW },
    );
    await renderScreen();
    await compare(unassigned);
    await click(row("Synthetic unassigned match"));
    const detail = within(list()).getByRole("list", { name: "Settings" });
    expect(within(detail).getByText("Matches, on an unassigned policy")).toBeTruthy();
  });

  // Round 39: another value on an unassigned policy never reads as a matching value.
  it("names matching, differing and mixed values on unassigned policies with their own reason", async () => {
    await renderScreen();
    await compare({ ...unassignedAssessment(), version: "2.0.0" });
    const reasonOf = (title: string) => within(row(title)).getByText(/policies that are not assigned/).textContent;
    expect(reasonOf("Synthetic alpha is on")).toBe("The matching value is only on policies that are not assigned.");
    expect(reasonOf("Synthetic length is 14")).toBe(
      "Only policies that are not assigned hold this setting, and none of them matches the recommended value.",
    );
    expect(reasonOf("Synthetic gamma is on")).toBe(
      "Only policies that are not assigned hold this setting: some match the recommended value and some hold another value.",
    );
  });

  it("warns about an incomplete collection and offers no drafts", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ complete: false }));
    expect(screen.getByText("The collection is incomplete")).toBeTruthy();
    expect(screen.getByText("Synthetic policy 3: settings were not read completely.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Drafts (.zip)" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the manual items with the notice and its link", async () => {
    await renderScreen();
    await compare();
    const manual = screen.getByRole("region", { name: "Recommendations to check by hand" });
    expect(within(manual).getByText(/Not all recommendations from the CIS Benchmarks are included/)).toBeTruthy();
    expect(within(manual).getByText("https://www.cisecurity.org/cis-benchmarks")).toBeTruthy();
    // Opened by its allowlisted key, never by the address the view carries.
    await click(within(manual).getByRole("button", { name: "Open link" }));
    expect(mocks.openHelp).toHaveBeenCalledExactlyOnceWith("cisBenchmarks");
    expect(within(manual).getByText("Synthetic manual recommendation 1")).toBeTruthy();
    expect(within(manual).getByText(/checks 10 recommendations of this pack automatically/)).toBeTruthy();
  });

  it("shows an empty comparison", async () => {
    const empty = syntheticAssessment({ count: 0 });
    await renderScreen();
    await compare(empty);
    expect(screen.getByText("No recommendations in this comparison")).toBeTruthy();
  });
});

describe("BenchmarksScreen exceptions", () => {
  const identity = { benchmark: "synthetic-bench", version: "2.0.0", level: 1 };
  const stored = {
    id: "exception-1",
    ...identity,
    settingId: "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2",
    owner: "Synthetic Owner",
    reason: "Synthetic reason",
    expiresOn: "2999-12-31",
    createdAt: "2026-10-22T09:00:00.000Z",
  };

  // The engine names the exception each result used (assessBenchmark).
  const used = (view = syntheticAssessment()) => withExceptionUses(view, { [stored.settingId]: { id: stored.id, applies: true } });

  it("lists, adds from a result and removes exceptions", async () => {
    mocks.exceptions.mockResolvedValueOnce([stored]);
    await renderScreen();
    await compare(used());
    expect(mocks.exceptions).toHaveBeenCalledWith({ action: "list", ...identity });
    const panel = screen.getByRole("region", { name: "Accepted differences" });
    const recorded = within(panel).getByRole("list", { name: "Exceptions" });
    expect(within(recorded).getByText("Synthetic reason")).toBeTruthy();
    expect(within(recorded).getByText(`Until ${formatDay("2999-12-31")}`)).toBeTruthy();

    // The stored exception shows on its row.
    expect(within(row("Synthetic recommendation 2")).getByText(`Accepted until ${formatDay("2999-12-31")}`)).toBeTruthy();

    await click(screen.getByRole("button", { name: "Differs, 2" }));
    await click(row("Synthetic recommendation 8"));
    const settingId = "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_8";
    await click(screen.getByRole("button", { name: "Add an exception for Synthetic setting 8" }));
    const select = within(panel).getByLabelText("Setting") as HTMLSelectElement;
    expect(select.value).toBe(settingId);
    // Options carry the recommendation id and the readable name; the id is on a second line.
    expect(select.selectedOptions[0]!.textContent).toBe("8.1.8 Synthetic recommendation 8");
    expect(select.selectedOptions[0]!.title).toBe(settingId);
    expect(within(panel).getByText(`Setting: Synthetic setting 8 (${settingId})`)).toBeTruthy();
    expect(document.activeElement).toBe(within(panel).getByLabelText("Owner"));

    // Every field is required before anything is sent; all errors show at once, each on its field.
    await click(within(panel).getByRole("button", { name: "Add exception" }));
    const ownerError = within(panel).getByText("Enter an owner.");
    const ownerInput = within(panel).getByLabelText("Owner");
    expect(ownerInput.getAttribute("aria-invalid")).toBe("true");
    expect(ownerInput.getAttribute("aria-describedby")).toBe(ownerError.id);
    expect(ownerInput.className).toContain("border-red-600");
    expect(within(panel).getByText("Enter a reason.").id).toBe(
      within(panel).getByLabelText("Reason").getAttribute("aria-describedby"),
    );
    expect(within(panel).getByText("Enter an expiry date.")).toBeTruthy();
    // The first field with a problem gets the focus.
    expect(document.activeElement).toBe(ownerInput);
    await act(async () => fireEvent.change(within(panel).getByLabelText("Owner"), { target: { value: "Synthetic Owner" } }));
    await act(async () => fireEvent.change(within(panel).getByLabelText("Reason"), { target: { value: "Synthetic" } }));
    await act(async () =>
      fireEvent.change(within(panel).getByLabelText("Expires on"), { target: { value: "2020-01-01" } }),
    );
    await click(within(panel).getByRole("button", { name: "Add exception" }));
    expect(within(panel).getByText("The expiry date must be today or later.")).toBeTruthy();
    expect(within(panel).getByLabelText("Expires on").getAttribute("aria-invalid")).toBe("true");
    expect(within(panel).getByLabelText("Owner").getAttribute("aria-invalid")).toBeNull();
    expect(document.activeElement).toBe(within(panel).getByLabelText("Expires on"));
    expect(mocks.exceptions).toHaveBeenCalledTimes(1);

    const added = { ...stored, id: "exception-2", settingId, reason: "Synthetic" };
    mocks.exceptions.mockResolvedValueOnce([stored, added]);
    // Main applies the exceptions when the benchmark is compared again.
    const adjusted = withExceptionUses(used(), { [settingId]: { id: "exception-2", applies: true } });
    adjusted.levels[0]!.headline = { ...adjusted.levels[0]!.headline, adjusted: 0.6, exceptionIds: ["exception-2"] };
    mocks.assess.mockResolvedValueOnce(adjusted);
    await act(async () =>
      fireEvent.change(within(panel).getByLabelText("Expires on"), { target: { value: "2999-01-31" } }),
    );
    await click(within(panel).getByRole("button", { name: "Add exception" }));
    expect(mocks.exceptions).toHaveBeenLastCalledWith({
      action: "set",
      ...identity,
      settingId,
      owner: "Synthetic Owner",
      reason: "Synthetic",
      expiresOn: "2999-01-31",
    });
    await until(() => expect(screen.getByText("60% with 1 exclusion")).toBeTruthy());
    expect(mocks.assess).toHaveBeenCalledTimes(2);
    expect(mocks.assess).toHaveBeenLastCalledWith(identity);

    mocks.exceptions.mockResolvedValueOnce([added]);
    mocks.assess.mockResolvedValueOnce(withExceptionUses(syntheticAssessment(), { [settingId]: { id: "exception-2", applies: true } }));
    await click(within(panel).getByRole("button", { name: "Remove the exception for Synthetic setting 2" }));
    expect(mocks.exceptions).toHaveBeenLastCalledWith({ action: "remove", ...identity, settingId: stored.settingId });
    expect(within(within(panel).getByRole("list", { name: "Exceptions" })).queryByText("Synthetic reason")).toBeNull();
    await until(() => expect(screen.queryByText("60% with 1 exclusion")).toBeNull());
    expect(mocks.assess).toHaveBeenCalledTimes(3);
  });

  it("says when saving replaces an existing exception", async () => {
    mocks.exceptions.mockResolvedValueOnce([stored]);
    await renderScreen();
    await compare();
    const panel = screen.getByRole("region", { name: "Accepted differences" });
    await act(async () =>
      fireEvent.change(within(panel).getByLabelText("Setting"), {
        target: { value: "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_8" },
      }),
    );
    // Errors of an earlier attempt go when another setting is chosen.
    await click(within(panel).getByRole("button", { name: "Add exception" }));
    expect(within(panel).getByText("Enter an owner.")).toBeTruthy();
    await act(async () => fireEvent.change(within(panel).getByLabelText("Setting"), { target: { value: stored.settingId } }));
    expect(within(panel).getByText(/This setting already has an exception, accepted until .*\. Saving replaces it\./)).toBeTruthy();
    expect(within(panel).getByRole("button", { name: "Replace exception" })).toBeTruthy();
    expect(within(panel).queryByText("Enter an owner.")).toBeNull();
    // The form holds the exception to change.
    expect((within(panel).getByLabelText("Owner") as HTMLInputElement).value).toBe("Synthetic Owner");
    expect((within(panel).getByLabelText("Reason") as HTMLTextAreaElement).value).toBe("Synthetic reason");
    expect((within(panel).getByLabelText("Expires on") as HTMLInputElement).value).toBe("2999-12-31");
    await act(async () =>
      fireEvent.change(within(panel).getByLabelText("Setting"), {
        target: { value: "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_8" },
      }),
    );
    expect(within(panel).queryByText(/Saving replaces it/)).toBeNull();
    expect(within(panel).getByRole("button", { name: "Add exception" })).toBeTruthy();
    expect((within(panel).getByLabelText("Owner") as HTMLInputElement).value).toBe("");
  });

  it("shows an exceptions error without the form", async () => {
    mocks.exceptions.mockRejectedValueOnce(new Error("Not available yet."));
    await renderScreen();
    await compare();
    const panel = screen.getByRole("region", { name: "Accepted differences" });
    expect(within(panel).getByText("The exceptions could not be loaded")).toBeTruthy();
    expect(within(panel).queryByRole("button", { name: "Add exception" })).toBeNull();
    await click(within(panel).getByRole("button", { name: "Try again" }));
    expect(within(panel).getByRole("button", { name: "Add exception" })).toBeTruthy();
  });
});

// Comparing Level 2 assesses the Level 1 and Level 2 packs. A Level's own
// exception wins; a Level 2 one applies to the Level 1 result only when Level 1
// has none (expired or not). Rows show what the engine credited, by id.
describe("BenchmarksScreen exceptions of a Level 1 with Level 2 comparison", () => {
  const SHARED = "synthetic_bench_shared";
  const EXPIRED = { expiresOn: "2026-10-01", createdAt: "2026-09-01T09:00:00.000Z" };
  const exception = (id: string, level: 1 | 2, extra: Partial<BenchmarkException> = {}): BenchmarkException => ({
    id,
    benchmark: "synthetic-bench",
    version: "2.0.0",
    level,
    settingId: SHARED,
    owner: `Synthetic Owner ${id}`,
    reason: "Synthetic reason",
    expiresOn: "2999-12-31",
    createdAt: "2026-10-01T09:00:00.000Z",
    ...extra,
  });
  // What main returns: both packs assessed with the Level precedence (exceptionsForLevel).
  function comparedWith(stored: BenchmarkException[]) {
    const { choice, collection, pack, tenantPolicy } = engine;
    const tenant = collection({
      policies: [tenantPolicy({ name: "Synthetic tenant policy", settings: [choice(SHARED, "0")] })],
    });
    return combineLevelAssessments(
      ([1, 2] as const).map((level) =>
        assessBenchmark(
          tenant,
          {
            ...pack(
              [{ settings: [choice(SHARED, "1")] }],
              [{ id: `${level}.1`, title: `Synthetic shared at Level ${level}`, level, settings: [SHARED] }],
              level,
            ),
            version: "2.0.0",
          },
          { now: engine.NOW, exceptions: exceptionsForLevel(stored, level, 2) },
        ),
      ),
    );
  }
  async function show(stored: BenchmarkException[]) {
    // Main answers with every Level of the benchmark and version.
    mocks.exceptions.mockResolvedValue(stored);
    mocks.assess.mockResolvedValue(view(comparedWith(stored)));
    await renderScreen();
    await compare(comparedWith(stored));
  }
  const ONE = "Synthetic shared at Level 1";
  const TWO = "Synthetic shared at Level 2";
  const accepted = (date: string) => `Accepted until ${formatDay(date)}`;
  const panel = () => screen.getByRole("region", { name: "Accepted differences" });
  const expand = async (title: string) => {
    await click(row(title));
    return within(list()).getByRole("list", { name: "Settings" });
  };

  it("(a) shows the expired Level 1 exception on Level 1 without credit, and the Level 2 one on Level 2", async () => {
    await show([exception("one", 1, EXPIRED), exception("two", 2)]);
    expect(within(row(ONE)).getByText(`Exception expired ${formatDay("2026-10-01")}`)).toBeTruthy();
    expect(within(row(ONE)).queryByText(/Accepted until/)).toBeNull();
    expect(within(row(TWO)).getByText(accepted("2999-12-31"))).toBeTruthy();

    // Changing it from the Level 1 row changes the Level 1 exception.
    const detail = await expand(ONE);
    expect(within(detail).queryByText(/Recorded at Level/)).toBeNull();
    await click(within(detail).getByRole("button", { name: `Change the exception for ${SHARED}` }));
    expect((within(panel()).getByLabelText("Level") as HTMLSelectElement).value).toBe("1");
    expect((within(panel()).getByLabelText("Owner") as HTMLInputElement).value).toBe("Synthetic Owner one");
    expect(
      within(panel()).getByText(
        `This setting already has an exception at Level 1, expired on ${formatDay("2026-10-01")}. Saving replaces it.`,
      ),
    ).toBeTruthy();
    await act(async () =>
      fireEvent.change(within(panel()).getByLabelText("Expires on"), { target: { value: "2999-06-30" } }),
    );
    await click(within(panel()).getByRole("button", { name: "Replace exception" }));
    expect(mocks.exceptions).toHaveBeenLastCalledWith({
      action: "set",
      benchmark: "synthetic-bench",
      version: "2.0.0",
      level: 1,
      settingId: SHARED,
      owner: "Synthetic Owner one",
      reason: "Synthetic reason",
      expiresOn: "2999-06-30",
    });

    // Each stored exception is listed with its Level and removed at it.
    const recorded = within(panel()).getByRole("list", { name: "Exceptions" });
    expect(within(recorded).getByText("Level 1")).toBeTruthy();
    expect(within(recorded).getByText("Level 2")).toBeTruthy();
    await click(within(panel()).getByRole("button", { name: `Remove the exception for ${SHARED}, Level 1` }));
    expect(mocks.exceptions).toHaveBeenLastCalledWith({
      action: "remove",
      benchmark: "synthetic-bench",
      version: "2.0.0",
      level: 1,
      settingId: SHARED,
    });
  });

  it("(b) shows each Level its own exception when both have one", async () => {
    await show([exception("one", 1, { expiresOn: "2999-06-30" }), exception("two", 2)]);
    expect(within(row(ONE)).getByText(accepted("2999-06-30"))).toBeTruthy();
    expect(within(row(TWO)).getByText(accepted("2999-12-31"))).toBeTruthy();
  });

  it("(c) shows the Level 2 exception on both rows when Level 1 has none, and changes it at Level 2", async () => {
    await show([exception("two", 2)]);
    expect(within(row(ONE)).getByText(accepted("2999-12-31"))).toBeTruthy();
    expect(within(row(TWO)).getByText(accepted("2999-12-31"))).toBeTruthy();
    const detail = await expand(ONE);
    expect(within(detail).getByText("Recorded at Level 2")).toBeTruthy();
    await click(within(detail).getByRole("button", { name: `Change the exception for ${SHARED}` }));
    expect((within(panel()).getByLabelText("Level") as HTMLSelectElement).value).toBe("2");
    expect((within(panel()).getByLabelText("Owner") as HTMLInputElement).value).toBe("Synthetic Owner two");
  });

  it("(d) shows a Level 1 exception on Level 1 only, and adds from the Level 2 row at Level 2", async () => {
    await show([exception("one", 1)]);
    expect(within(row(ONE)).getByText(accepted("2999-12-31"))).toBeTruthy();
    expect(within(row(TWO)).queryByText(/Accepted until|Exception/)).toBeNull();
    const detail = await expand(TWO);
    await click(within(detail).getByRole("button", { name: `Add an exception for ${SHARED}` }));
    expect((within(panel()).getByLabelText("Level") as HTMLSelectElement).value).toBe("2");
    expect(within(panel()).queryByText(/Saving replaces it/)).toBeNull();
    expect(within(panel()).getByRole("button", { name: "Add exception" })).toBeTruthy();
  });

  it("adds from a Level 1 row without an exception at Level 1", async () => {
    await show([]);
    const detail = await expand(ONE);
    await click(within(detail).getByRole("button", { name: `Add an exception for ${SHARED}` }));
    expect((within(panel()).getByLabelText("Level") as HTMLSelectElement).value).toBe("1");
    expect(within(panel()).getByText(/One at Level 2 also applies to the Level 1 result of the same setting/)).toBeTruthy();
  });
});

describe("BenchmarksScreen exports", () => {
  it("saves PDF, CSV and JSON of the last comparison", async () => {
    await renderScreen();
    await compare();
    mocks.exportFile.mockResolvedValueOnce("/synthetic/readiness.pdf");
    await click(screen.getByRole("button", { name: "PDF (.pdf)" }));
    expect(mocks.exportFile).toHaveBeenLastCalledWith({ format: "pdf" });
    expect(screen.getByText("Readiness PDF saved: readiness.pdf")).toBeTruthy();
    mocks.exportFile.mockResolvedValueOnce(null);
    await click(screen.getByRole("button", { name: "CSV (.csv)" }));
    expect(mocks.exportFile).toHaveBeenLastCalledWith({ format: "csv" });
    expect(screen.getByText("Save cancelled. Nothing was saved.")).toBeTruthy();
    mocks.exportFile.mockRejectedValueOnce(new Error("Not available yet."));
    await click(screen.getByRole("button", { name: "JSON (.json)" }));
    expect(mocks.exportFile).toHaveBeenLastCalledWith({ format: "json" });
    expect(screen.getByText("The export could not be saved")).toBeTruthy();
  });

  const PREVIEW = {
    draftPolicies: 2,
    draftSettings: 3,
    notGenerated: [
      {
        settingId: "synthetic_bench_setting_9",
        recommendationIds: ["1.9"],
        reason: "Synthetic reason why no draft is generated.",
      },
    ],
  };

  it("asks for confirmation before saving drafts", async () => {
    mocks.previewDrafts.mockResolvedValue(PREVIEW);
    await renderScreen();
    await compare();
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    expect(mocks.previewDrafts).toHaveBeenCalledTimes(1);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Save the draft policies?")).toBeTruthy();
    // The exact count main generates, not the number of missing settings.
    expect(
      within(dialog).getByText(
        "2 draft policies for 3 missing settings. Read these points before you import any of them.",
      ),
    ).toBeTruthy();
    expect(within(dialog).getByText("Not generated (1)")).toBeTruthy();
    expect(within(dialog).getByText("Synthetic reason why no draft is generated.")).toBeTruthy();
    expect(within(dialog).getByText(/Every policy is a draft and unassigned/)).toBeTruthy();
    expect(mocks.exportFile).not.toHaveBeenCalled();
    await click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.exportFile).not.toHaveBeenCalled();

    mocks.previewDrafts.mockResolvedValueOnce({ ...PREVIEW, draftPolicies: 1, draftSettings: 1 });
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    expect(
      within(screen.getByRole("alertdialog")).getByText(
        "1 draft policy for 1 missing setting. Read these points before you import any of them.",
      ),
    ).toBeTruthy();
    await click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Cancel" }));

    mocks.exportFile.mockResolvedValueOnce("/synthetic/drafts.zip");
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    await click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save drafts" }));
    expect(mocks.exportFile).toHaveBeenCalledWith({ format: "drafts", confirmed: true });
    expect(screen.getByText("Draft policies saved: drafts.zip")).toBeTruthy();
  });

  it("saves nothing and says why when no draft policy can be generated", async () => {
    mocks.previewDrafts.mockResolvedValueOnce({ ...PREVIEW, draftPolicies: 0, draftSettings: 0 });
    await renderScreen();
    await compare();
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/No draft policy can be generated for the missing settings/)).toBeTruthy();
    expect(screen.getByText("Synthetic reason why no draft is generated.")).toBeTruthy();
    mocks.previewDrafts.mockRejectedValueOnce(new Error("Compare with a benchmark first."));
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("The draft policies could not be prepared")).toBeTruthy();
    expect(screen.getByText("Compare with a benchmark first.")).toBeTruthy();
    expect(mocks.exportFile).not.toHaveBeenCalled();
  });

  it("offers no drafts when no setting is missing", async () => {
    const assessment = syntheticAssessment();
    for (const finding of assessment.settings) if (finding.status === "Missing") finding.status = "Different";
    await renderScreen();
    await compare(assessment);
    expect((screen.getByRole("button", { name: "Drafts (.zip)" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("BenchmarksScreen history", () => {
  const identity = { benchmark: "synthetic-bench", version: "2.0.0", level: 1 as const };
  const point = (assessedAt: string, rate: number, comparison: "first" | "compared", change: number | null) => ({
    ...identity,
    assessedAt,
    basis: "recommendations" as const,
    rate,
    counts: { pass: Math.round(rate * 20), fail: 20 - Math.round(rate * 20), review: 1, notAssessed: 0 },
    comparison,
    change,
  });

  it("shows the trend and drift of the compared benchmark only", async () => {
    mocks.history.mockResolvedValue({
      ...HISTORY,
      trend: [
        point("2026-10-01T09:00:00.000Z", 0.95, "first", null),
        point("2026-10-22T09:30:00.000Z", 0.5, "compared", -0.45),
        { ...point("2026-10-22T09:30:00.000Z", 0.1, "first", null), benchmark: "synthetic-bench-mobile" },
      ],
      drift: [
        {
          ...identity,
          previousRate: 0.95,
          currentRate: 0.5,
          previousCounts: { pass: 19, fail: 1, review: 2, notAssessed: 0 },
          currentCounts: { pass: 10, fail: 10, review: 3, notAssessed: 0 },
          previousAssessedAt: "2026-10-01T09:00:00.000Z",
          assessedAt: "2026-10-22T09:30:00.000Z",
          kind: "below-bar",
        },
      ],
    });
    await renderScreen();
    await compare();
    expect(mocks.history).toHaveBeenCalledWith(identity);
    const panel = screen.getByRole("region", { name: "Trend of this benchmark, version and Level" });
    await until(() => expect(within(panel).getByRole("table", { name: "Stored comparisons" })).toBeTruthy());
    const table = within(panel).getByRole("table", { name: "Stored comparisons" });
    expect(within(table).getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual([
      "Compared",
      "Headline",
      "Assessed",
      "Review",
      "Change",
    ]);
    const points = within(table)
      .getAllByRole("row")
      .slice(1)
      .map((item) => within(item).getAllByRole("cell").map((cell) => cell.textContent));
    expect(points).toHaveLength(2);
    // A true minus sign, and the base in its own columns.
    expect(points[0]!.slice(1)).toEqual(["50%", "20", "1", "\u221245.0 pp"]);
    expect(points[1]!.at(-1)).toBe("First comparison");
    // The base is said once, as the caption.
    expect(
      within(table).getByText(
        /Headline is Matches out of the assessed results \(Matches, Differs and Not configured\)\. Needs review and Not assessed are not counted\./,
      ),
    ).toBeTruthy();
    // The drift alert says what happened without repeating the table.
    const drift = within(panel).getByText(/The latest comparison is below 90%, down from the comparison of/);
    expect(drift.textContent).not.toMatch(/assessed|95%|50%/);
    expect(within(panel).getByRole("img")).toBeTruthy();
  });

  it("explains when history is off or unavailable", async () => {
    mocks.history.mockResolvedValueOnce({ ...HISTORY, enabled: false });
    await renderScreen();
    await compare();
    const panel = screen.getByRole("region", { name: "Trend of this benchmark, version and Level" });
    await until(() => expect(within(panel).getByText("Keep history is off")).toBeTruthy());
    await click(within(panel).getByRole("button", { name: "Open History" }));
    expect(mocks.navigate).toHaveBeenCalledWith("history");

    mocks.history.mockResolvedValueOnce({ ...HISTORY, available: false, reason: "Synthetic: the history store is locked." });
    mocks.assess.mockResolvedValueOnce({ ...syntheticAssessment(), assessedAt: "2026-10-22T10:00:00.000Z" });
    await click(screen.getByRole("button", { name: "Compare again" }));
    await until(() => expect(within(panel).getByText("Synthetic: the history store is locked.")).toBeTruthy());
  });

  it("shows one trend per Level card for a pack with Level 1 and Level 2 recommendations (finding 1)", async () => {
    mocks.history.mockResolvedValue({
      ...HISTORY,
      trend: [
        point("2026-10-22T09:30:00.000Z", 0.5, "first", null),
        { ...point("2026-10-22T09:30:00.000Z", 1, "first", null), level: 2 as const },
      ],
    });
    await renderScreen();
    await compare(syntheticAssessment({ levels: [1, 2] }));
    const panel = screen.getByRole("region", { name: "Trend of this benchmark and version per Level" });
    await until(() => expect(within(panel).getByRole("table", { name: "Stored comparisons, Level 2" })).toBeTruthy());
    const one = within(panel).getByRole("table", { name: "Stored comparisons, Level 1" });
    const two = within(panel).getByRole("table", { name: "Stored comparisons, Level 2" });
    expect(one.textContent).toContain("50%");
    expect(two.textContent).toContain("100%");
  });

  it("says when this comparison was not stored and why (finding 6)", async () => {
    await renderScreen();
    await compare({
      ...syntheticAssessment(),
      history: { recorded: false, reason: "Synthetic: the stored benchmark run holds more than 5000 results." },
    });
    const panel = screen.getByRole("region", { name: "Trend of this benchmark, version and Level" });
    await until(() => expect(within(panel).getByText("This comparison was not stored")).toBeTruthy());
    expect(within(panel).getByText(/holds more than 5000 results/)).toBeTruthy();
  });

  it("shows a history error with Try again", async () => {
    mocks.history.mockRejectedValueOnce(new Error("Not available yet."));
    await renderScreen();
    await compare();
    const panel = screen.getByRole("region", { name: "Trend of this benchmark, version and Level" });
    await until(() => expect(within(panel).getByText("The history could not be loaded")).toBeTruthy());
    await click(within(panel).getByRole("button", { name: "Try again" }));
    await until(() => expect(within(panel).getByText(/No comparison of this benchmark/)).toBeTruthy());
  });
});

describe("BenchmarksScreen portfolio", () => {
  const view = {
    available: true,
    reason: null,
    benchmarks: [
      { benchmark: "synthetic-bench", version: "2.0.0", tenants: 2 },
      { benchmark: "synthetic-bench", version: "1.0.0", tenants: 1 },
    ],
    selected: { benchmark: "synthetic-bench", version: "2.0.0" },
    rows: [
      {
        tenantId: "tenant-1",
        tenantName: "Synthetic Tenant One",
        benchmark: "synthetic-bench",
        version: "2.0.0",
        assessedAt: "2026-10-22T09:30:00.000Z",
        current: true,
        levels: [
          {
            level: 1,
            basis: "recommendations",
            rate: 0.75,
            counts: { pass: 3, fail: 1, review: 0, notAssessed: 0 },
            assessedAt: "2026-10-22T09:30:00.000Z",
          },
        ],
      },
      {
        tenantId: "tenant-2",
        tenantName: null,
        benchmark: null,
        version: null,
        assessedAt: null,
        current: false,
        otherBenchmark: true,
        levels: [],
      },
    ],
  };

  it("is not requested on the Pro plan", async () => {
    await renderScreen();
    expect(screen.queryByRole("region", { name: "Tenants on this computer" })).toBeNull();
    expect(mocks.portfolio).not.toHaveBeenCalled();
  });

  it("lists the newest headline per tenant for MSP and switches benchmark", async () => {
    mocks.state.current = appState({ plan: "msp" });
    mocks.portfolio.mockResolvedValue(view);
    await renderScreen();
    const panel = screen.getByRole("region", { name: "Tenants on this computer" });
    await until(() => expect(within(panel).getByRole("listitem", { name: "Synthetic Tenant One" })).toBeTruthy());
    const one = within(panel).getByRole("listitem", { name: "Synthetic Tenant One" });
    expect(within(one).getByText("Signed in")).toBeTruthy();
    expect(within(one).getByText("75%")).toBeTruthy();
    expect(within(one).getByText("of 4 assessed, 0 need review")).toBeTruthy();
    // A tenant without a stored name says so, with its id as the secondary line.
    const other = within(panel).getByRole("listitem", { name: "Name unknown" });
    expect(within(other).getByText("tenant-2")).toBeTruthy();
    expect(within(other).getByText("Stored comparisons of other benchmarks only")).toBeTruthy();
    // Numeric columns have one width on every row.
    expect(within(one).getByText("75%").parentElement!.className).toContain("w-40");
    // No rate reads quieter than a rate.
    expect(within(other).getByText("Not run").className).toContain("text-petrol-600");
    expect(within(one).getByText("75%").className).toContain("text-petrol-950");
    // Without a comparison on this screen the portfolio carries the readiness line.
    expect(within(panel).getByText(/Readiness comparison, not a certification/)).toBeTruthy();
    expect(mocks.portfolio).toHaveBeenCalledWith(undefined);

    await act(async () =>
      fireEvent.change(within(panel).getByLabelText("Benchmark"), {
        target: { value: JSON.stringify(["synthetic-bench", "1.0.0"]) },
      }),
    );
    await until(() => expect(mocks.portfolio).toHaveBeenLastCalledWith({ benchmark: "synthetic-bench", version: "1.0.0" }));
  });

  it("shows why the portfolio is unavailable", async () => {
    mocks.state.current = appState({ plan: "msp" });
    mocks.portfolio.mockResolvedValue({ ...view, available: false, reason: "Synthetic: history is off.", rows: [] });
    await renderScreen();
    await until(() => expect(screen.getByText("Synthetic: history is off.")).toBeTruthy());
  });
});

describe("BenchmarksScreen fix plan", () => {
  // Round 47: assigning a policy as it is would break a match; the step says what to change first.
  it("shows what to change before assigning a policy, and the row's next step warns", async () => {
    const { choice, collection, pack, tenantPolicy } = engine;
    const a = "synthetic_bench_waits_a";
    const b = "synthetic_bench_waits_b";
    const assessment = assessBenchmark(
      collection({
        policies: [
          tenantPolicy({ name: "Synthetic assigned match", settings: [choice(b, "1")] }),
          tenantPolicy({ name: "Synthetic candidate", settings: [choice(a, "1"), choice(b, "0")], assignments: [] }),
        ],
      }),
      {
        ...pack([{ settings: [choice(a, "1"), choice(b, "1")] }], [
          { id: "1.1", title: "Synthetic waiting recommendation", level: 1, settings: [a] },
          { id: "1.2", title: "Synthetic matching recommendation", level: 1, settings: [b] },
        ]),
        version: "2.0.0",
      },
      { now: engine.NOW },
    );
    await renderScreen();
    await compare(assessment);
    const plan = screen.getByRole("region", { name: "What to do next" });
    const before = within(plan).getByRole("list", { name: "Before assigning the policy of step 1" });
    expect(before.textContent).toBe(`Change ${b} in policy Synthetic candidate from 0 to 1 before assigning it.`);
    await click(row("Synthetic waiting recommendation"));
    expect(list().textContent).toContain(
      "Assigned as it is, policy Synthetic candidate would make 1 result that matches now no longer match.",
    );
  });

  it("lists the engine's steps in order with policy names and counts", async () => {
    await renderScreen();
    const assessment = syntheticAssessment({ count: 12 });
    await compare(assessment);
    const plan = screen.getByRole("region", { name: "What to do next" });
    const steps = within(plan).getAllByRole("listitem").filter((item) => item.parentElement?.getAttribute("aria-label") === "Fix plan steps");
    expect(steps.map((step) => within(step).getByText(assessment.fixPlan.actions[steps.indexOf(step)]!.text))).toHaveLength(
      assessment.fixPlan.actions.length,
    );
    expect(assessment.fixPlan.actions.map((action) => action.kind)).toEqual([
      "changeValue",
      "changeValue",
      "assignPolicy",
      "checkValue",
      "addSetting",
    ]);
    expect(steps[2]!.textContent).toContain("Assign a policy");
    expect(steps[2]!.textContent).toContain(
      "Assign policy Synthetic pilot policy, which would let 1 result be judged: 1 would match.",
    );
    expect(steps[0]!.textContent).toContain("Synthetic security policy A");
  });

  it("narrows the list to the results of a step and back", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 12 }));
    const plan = screen.getByRole("region", { name: "What to do next" });
    await click(within(plan).getByRole("button", { name: "Show the 2 results of step 5 in the list" }));
    expect(rowTitles()).toHaveLength(2);
    expect(rowTitles().every((title) => title.includes("Not configured"))).toBe(true);
    expect(screen.getByText("Fix plan, Step 5: Add missing settings.")).toBeTruthy();
    expect(within(plan).getByRole("button", { name: "Show the 2 results of step 5 in the list", pressed: true })).toBeTruthy();
    await click(within(list().parentElement!).getByRole("button", { name: "Show all" }));
    expect(rowTitles()).toHaveLength(12);
    expect(within(plan).getByRole("button", { name: "Show the 2 results of step 5 in the list", pressed: false })).toBeTruthy();
  });

  it("says when there is nothing to change", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 1 }));
    expect(screen.getByText("Nothing to change: no result differs, is not configured or needs review.")).toBeTruthy();
  });

  it("shows the first steps of a long plan and all on request", async () => {
    await renderScreen();
    const long = syntheticAssessment({ count: 12 });
    const [first] = long.fixPlan.actions;
    long.fixPlan = {
      ...long.fixPlan,
      actions: Array.from({ length: 8 }, (_, index) => ({ ...first!, id: `${first!.id}:${index}` })),
    };
    await compare(long);
    const plan = screen.getByRole("region", { name: "What to do next" });
    const count = () => within(within(plan).getByRole("list", { name: "Fix plan steps" })).getAllByRole("listitem", { name: undefined }).filter((item) => item.parentElement?.getAttribute("aria-label") === "Fix plan steps").length;
    expect(count()).toBe(5);
    await click(within(plan).getByRole("button", { name: "Show all 8 steps" }));
    expect(count()).toBe(8);
    await click(within(plan).getByRole("button", { name: "Show the first 5 steps" }));
    expect(count()).toBe(5);
  });
});

describe("BenchmarksScreen page", () => {
  it("orders summary, fix plan, headlines, list, exceptions, history, manual section and exports", async () => {
    await renderScreen();
    await compare();
    const order = [
      screen.getByRole("region", { name: "Comparison" }),
      screen.getByRole("region", { name: "What to do next" }),
      screen.getByRole("region", { name: "Headline per Level" }),
      document.getElementById("benchmark-list-title")!,
      screen.getByRole("region", { name: "Accepted differences" }),
      screen.getByRole("region", { name: "Trend of this benchmark, version and Level" }),
      screen.getByRole("region", { name: "Recommendations to check by hand" }),
      screen.getByRole("region", { name: "Readiness files and draft policies" }),
    ];
    for (let index = 1; index < order.length; index += 1)
      expect(order[index - 1]!.compareDocumentPosition(order[index]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("exports the PDF from the summary, next to Compare again", async () => {
    await renderScreen();
    await compare();
    const summary = screen.getByRole("region", { name: "Comparison" });
    const buttons = within(summary).getAllByRole("button").map((button) => button.textContent);
    expect(buttons).toEqual(["Change benchmark", "Compare again", "Export PDF"]);
    mocks.exportFile.mockResolvedValueOnce("/synthetic/readiness.pdf");
    await click(within(summary).getByRole("button", { name: "Export PDF" }));
    expect(mocks.exportFile).toHaveBeenCalledWith({ format: "pdf" });
    expect(within(summary).getByText("Readiness PDF saved: readiness.pdf")).toBeTruthy();
  });

  it("makes only the PDF primary among the exports, and the file actions secondary or ghost", async () => {
    await renderScreen();
    await compare();
    const exports = screen.getByRole("region", { name: "Readiness files and draft policies" });
    const primary = within(exports)
      .getAllByRole("button")
      .filter((button) => /\bbg-petrol-950\b/.test(button.className))
      .map((button) => button.textContent);
    expect(primary).toEqual(["PDF (.pdf)"]);
    mocks.exportFile.mockResolvedValueOnce("/synthetic/readiness.csv");
    await click(within(exports).getByRole("button", { name: "CSV (.csv)" }));
    expect(within(exports).getByRole("button", { name: "Open file" }).className).toContain("border-petrol-950/12");
    expect(within(exports).getByRole("button", { name: "Show in folder" }).className).not.toMatch(/\bbg-petrol-950\b|border-petrol-950\/12/);
  });

  it("shows the manual notice in the info tone, unchanged", async () => {
    await renderScreen();
    await compare();
    const manual = screen.getByRole("region", { name: "Recommendations to check by hand" });
    const notice = within(manual).getByText(/Not all recommendations from the CIS Benchmarks are included/);
    const box = notice.closest("div.rounded-xl")!;
    expect(box.className).toContain("bg-teal-50");
    expect(box.className).not.toContain("amber");
  });

  it("keeps result chip text at 11 px", async () => {
    await renderScreen();
    await compare();
    const chip = within(row("Synthetic recommendation 2")).getByText("Differs");
    expect(chip.className).toContain("text-[11px]");
  });
});

describe("BenchmarksScreen error boundaries", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.mocked(console.error).mockRestore();
  });

  it("keeps the screen when the history is malformed and offers Try again", async () => {
    mocks.history.mockResolvedValueOnce({ ...HISTORY, trend: "broken" });
    await renderScreen();
    await compare();
    await until(() => expect(screen.getByText("The history could not be shown")).toBeTruthy());
    const fallback = screen.getByText("The history could not be shown").closest('[role="alert"]')!;
    expect(screen.getByRole("list", { name: "Recommendations" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "What to do next" })).toBeTruthy();
    await click(within(fallback as HTMLElement).getByRole("button", { name: "Try again" }));
    await until(() => expect(screen.getByRole("region", { name: "Trend of this benchmark, version and Level" })).toBeTruthy());
  });

  it("keeps the screen when a Level summary is malformed", async () => {
    const broken = syntheticAssessment();
    (broken.levels[0]!.headline as unknown as { states: unknown }).states = null;
    await renderScreen();
    await compare(broken);
    expect(screen.getByText("The headline could not be shown")).toBeTruthy();
    expect(screen.getByRole("list", { name: "Recommendations" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Readiness files and draft policies" })).toBeTruthy();
  });

  it("keeps the screen when the fix plan is malformed", async () => {
    const broken = syntheticAssessment();
    (broken.fixPlan.actions[0] as unknown as { results: unknown }).results = null;
    await renderScreen();
    await compare(broken);
    expect(screen.getByText("The fix plan could not be shown")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Headline per Level" })).toBeTruthy();
  });
});

describe("BenchmarksScreen review round", () => {
  it("brings a failed panel back with the next comparison", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const broken = syntheticAssessment();
    (broken.levels[0]!.headline as unknown as { states: unknown }).states = null;
    await renderScreen();
    await compare(broken);
    expect(screen.getByText("The headline could not be shown")).toBeTruthy();
    mocks.assess.mockResolvedValueOnce({ ...syntheticAssessment(), assessedAt: "2026-10-22T10:00:00.000Z" });
    await click(screen.getByRole("button", { name: "Compare again" }));
    await until(() => expect(screen.queryByText("The headline could not be shown")).toBeNull());
    expect(screen.getByRole("region", { name: "Level 1" })).toBeTruthy();
    vi.mocked(console.error).mockRestore();
  });

  it("marks the catalog step failed and leaves every step ahead before the first collection", async () => {
    mocks.catalog.mockRejectedValueOnce(new Error("The content service could not be reached."));
    await renderScreen();
    const current = screen.getByRole("list", { name: "Steps" }).querySelector('[aria-current="step"]')!;
    expect(current.textContent).toContain("Step 1, failed");
    act(() => root?.unmount());
    root = null;
    mocks.state.current = appState({ collected: false });
    await renderScreen();
    const steps = screen.getByRole("list", { name: "Steps" });
    expect(steps.querySelectorAll("svg").length).toBe(0);
    expect(steps.textContent).not.toMatch(/done|failed/);
  });

  it("keeps Compare again and Export PDF in one group that wraps together", async () => {
    await renderScreen();
    await compare();
    const summary = screen.getByRole("region", { name: "Comparison" });
    const group = within(summary).getByRole("button", { name: "Export PDF" }).parentElement!;
    expect(group.className).toContain("flex-nowrap");
    expect(within(group).getByRole("button", { name: "Compare again" })).toBeTruthy();
    expect(within(group).queryByRole("button", { name: "Change benchmark" })).toBeNull();
  });

  it("narrows the list to the results without a step from the fix plan note", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 24, complete: false }));
    const plan = screen.getByRole("region", { name: "What to do next" });
    const show = within(plan).getByRole("button", { name: /^Show \d+ results?$/ });
    await click(show);
    expect(screen.getByText("Fix plan, results without a step.")).toBeTruthy();
    expect(screen.getByText("Showing the results that no step covers.")).toBeTruthy();
    expect(rowTitles().length).toBeGreaterThan(0);
    expect(rowTitles().every((title) => title.includes("Needs review") || title.includes("Differs"))).toBe(true);
  });

  it("says Not configured in the incomplete collection alert", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ complete: false }));
    expect(screen.getByText(/never Differs or Not configured/)).toBeTruthy();
  });

  it("gives the search and form fields a solid focus ring with an offset", async () => {
    await renderScreen();
    await compare();
    const search = screen.getByLabelText("Search by name or id");
    expect(search.className).toContain("focus-visible:ring-teal-600 ");
    expect(search.className).toContain("focus-visible:ring-offset-2");
    expect(search.className).not.toMatch(/ring-teal-600\/\d+/);
    const owner = within(screen.getByRole("region", { name: "Accepted differences" })).getByLabelText("Owner");
    expect(owner.className).toContain("focus-visible:ring-offset-2");
  });

  it("names manual recommendations before their id, as the result list does", async () => {
    await renderScreen();
    await compare();
    const manual = within(screen.getByRole("region", { name: "Recommendations to check by hand" })).getByRole("list", {
      name: "Manual recommendations, Level 1",
    });
    const first = within(manual).getAllByRole("listitem")[0]!.textContent!;
    expect(first.indexOf("Synthetic manual recommendation 1")).toBeLessThan(first.indexOf("9.1.1"));
  });

  it("labels the sparkline with its dates and the 90% line", async () => {
    mocks.history.mockResolvedValue({
      ...HISTORY,
      trend: [
        { benchmark: "synthetic-bench", version: "2.0.0", level: 1, assessedAt: "2026-10-01T09:00:00.000Z", basis: "recommendations", rate: 0.9, counts: { pass: 9, fail: 1, review: 0, notAssessed: 0 }, comparison: "first", change: null },
        { benchmark: "synthetic-bench", version: "2.0.0", level: 1, assessedAt: "2026-10-22T09:30:00.000Z", basis: "recommendations", rate: 0.8, counts: { pass: 8, fail: 2, review: 0, notAssessed: 0 }, comparison: "compared", change: -0.1 },
      ],
    });
    await renderScreen();
    await compare();
    const panel = screen.getByRole("region", { name: "Trend of this benchmark, version and Level" });
    await until(() => expect(within(panel).getByRole("img")).toBeTruthy());
    expect(within(panel).getByRole("img").getAttribute("aria-label")).toMatch(/from .+ to .+, oldest first\. The dashed line marks 90%\./);
    expect(within(panel).getByText("Dashed line: 90%")).toBeTruthy();
    expect(within(panel).getByRole("img").getAttribute("height")).toBe("64");
  });

  it("keeps no text of the screen below 11 px", async () => {
    mocks.exceptions.mockResolvedValueOnce([
      { id: "e", benchmark: "synthetic-bench", version: "2.0.0", level: 1, settingId: "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2", owner: "Synthetic Owner", reason: "Synthetic", expiresOn: "2999-12-31", createdAt: "2026-10-22T09:00:00.000Z" },
    ]);
    await renderScreen();
    await compare(
      withExceptionUses(syntheticAssessment({ count: 12, levels: [1, 2] }), {
        device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2: { id: "e", applies: true },
      }),
    );
    await click(row("Synthetic recommendation 2"));
    // The shared Badge base is 10 px; every use here overrides it with 11 px,
    // which the stylesheet emits later. The page header eyebrow is shared by all screens.
    const small = [...container.querySelectorAll<HTMLElement>("[class*='text-[9px]'], [class*='text-[10px]']")].filter(
      (element) => !element.closest("header") && !element.className.includes("text-[11px]"),
    );
    expect(small.map((element) => element.textContent)).toEqual([]);
  });
});
