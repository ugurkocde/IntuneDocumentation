// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BenchmarkAssessment } from "../../../../../src/lib/benchmarks/assessment";
import { SYNTHETIC_CATALOG, syntheticAssessment } from "../__fixtures__/benchmarks";

const mocks = vi.hoisted(() => ({
  catalog: vi.fn(),
  assess: vi.fn(),
  exceptions: vi.fn(),
  exportFile: vi.fn(),
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

async function compare(assessment: BenchmarkAssessment = syntheticAssessment()) {
  mocks.assess.mockResolvedValueOnce(assessment);
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
  it("shows coming soon only and calls no benchmark channel", async () => {
    mocks.state.current = appState({ benchmarks: "comingSoon" });
    await renderScreen();
    expect(screen.getByText("CIS Benchmarks are coming soon")).toBeTruthy();
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

  it("asks for a collection before comparing", async () => {
    mocks.state.current = appState({ collected: false });
    await renderScreen();
    expect(screen.getByText("Collect tenant data first.")).toBeTruthy();
    await click(screen.getByRole("button", { name: "Go to Overview" }));
    expect(mocks.navigate).toHaveBeenCalledWith("overview");
    expect(mocks.assess).not.toHaveBeenCalled();
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

  it("shows the main refusal as an error and keeps the setup", async () => {
    await renderScreen();
    mocks.assess.mockRejectedValueOnce(new Error("Error invoking remote method 'benchmarks:assess': Error: Not available yet."));
    await click(screen.getByRole("button", { name: "Compare with tenant" }));
    const alert = screen.getByRole("alert");
    expect(within(alert).getByText("The comparison could not run")).toBeTruthy();
    expect(within(alert).getByText("Not available yet.")).toBeTruthy();
    expect(screen.getByLabelText("Benchmark")).toBeTruthy();
    mocks.assess.mockResolvedValueOnce(syntheticAssessment());
    await click(within(alert).getByRole("button", { name: "Try again" }));
    expect(screen.getByRole("list", { name: "Recommendations" })).toBeTruthy();
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
  it("shows each Level's headline with the readiness line and the counts outside the rate", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 30, levels: [1, 2] }));
    const level1 = screen.getByRole("region", { name: "Level 1" });
    expect(within(level1).getByText("50%")).toBeTruthy();
    expect(within(level1).getByText("5 Matches out of 10 results (Matches plus Differs)")).toBeTruthy();
    expect(within(level1).getByText("Readiness comparison, not a certification")).toBeTruthy();
    expect(within(level1).getByText(/outside the pack, so it is not assessed here/)).toBeTruthy();
    expect(within(level1).getByText(/Coverage of the full benchmark is not shown/)).toBeTruthy();
    const level2 = screen.getByRole("region", { name: "Level 2" });
    expect(within(level2).getByText("The matching value is on a policy that is not assigned.")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\bcompliant\b|\bscore\b|\bcertified\b/i);
  });

  it("shows n/a when nothing could be assessed", async () => {
    const assessment = syntheticAssessment({ count: 1 });
    assessment.levels[0]!.headline = { ...assessment.levels[0]!.headline, rate: null };
    await renderScreen();
    await compare(assessment);
    expect(screen.getByText("n/a")).toBeTruthy();
    expect(screen.getByText("Nothing could be assessed as Matches or Differs.")).toBeTruthy();
  });

  it("filters by result and Level, searches, and shows the filtered empty state", async () => {
    await renderScreen();
    await compare(syntheticAssessment({ count: 12, levels: [1, 2] }));
    expect(rowTitles()).toHaveLength(12);

    await click(screen.getByRole("button", { name: "Differs, 4" }));
    expect(rowTitles()).toHaveLength(4);
    expect(rowTitles().every((title) => title.includes("Differs"))).toBe(true);
    await click(screen.getByRole("button", { name: "Level 2" }));
    expect(rowTitles()).toHaveLength(2);

    // Result counts follow the Level filter.
    await click(screen.getByRole("button", { name: "All, 6" }));
    await click(screen.getByRole("button", { name: "All" }));
    expect(screen.getByRole("button", { name: "All, 12" })).toBeTruthy();
    await act(async () => fireEvent.change(screen.getByLabelText("Search by id, title or setting id"), {
      target: { value: "synthetic_setting_7" },
    }));
    await until(() => expect(rowTitles()).toEqual([expect.stringContaining("Synthetic recommendation 7")]));

    await act(async () => fireEvent.change(screen.getByLabelText("Search by id, title or setting id"), {
      target: { value: "nothing like this" },
    }));
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

  it("opens the setting detail with the policies that hold it", async () => {
    await renderScreen();
    await compare();
    await click(row("Synthetic recommendation 2"));
    const detail = within(list()).getByRole("list", { name: "Settings" });
    expect(within(detail).getByText("device_vendor_msft_policy_config_synthetic_area_synthetic_setting_2")).toBeTruthy();
    expect(within(detail).getByText("Synthetic tenant policy 2")).toBeTruthy();
    expect(within(detail).getByText("Recommended value")).toBeTruthy();
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

  it("lists, adds from a result and removes exceptions", async () => {
    mocks.exceptions.mockResolvedValueOnce([stored]);
    await renderScreen();
    await compare();
    expect(mocks.exceptions).toHaveBeenCalledWith({ action: "list", ...identity });
    const panel = screen.getByRole("region", { name: "Accepted differences" });
    expect(within(panel).getByText("Synthetic reason")).toBeTruthy();
    expect(within(panel).getByText("Until 2999-12-31")).toBeTruthy();

    await click(screen.getByRole("button", { name: "Differs, 4" }));
    await click(row("Synthetic recommendation 8"));
    const settingId = "device_vendor_msft_policy_config_synthetic_area_synthetic_setting_8";
    await click(screen.getByRole("button", { name: `Add an exception for ${settingId}` }));
    expect((within(panel).getByLabelText("Setting") as HTMLSelectElement).value).toBe(settingId);
    expect(document.activeElement).toBe(within(panel).getByLabelText("Owner"));

    // Every field is required before anything is sent.
    await click(within(panel).getByRole("button", { name: "Add exception" }));
    expect(within(panel).getByText("Enter an owner.")).toBeTruthy();
    await act(async () => fireEvent.change(within(panel).getByLabelText("Owner"), { target: { value: "Synthetic Owner" } }));
    await act(async () => fireEvent.change(within(panel).getByLabelText("Reason"), { target: { value: "Synthetic" } }));
    await act(async () =>
      fireEvent.change(within(panel).getByLabelText("Expires on"), { target: { value: "2020-01-01" } }),
    );
    await click(within(panel).getByRole("button", { name: "Add exception" }));
    expect(within(panel).getByText("The expiry date must be today or later.")).toBeTruthy();
    expect(mocks.exceptions).toHaveBeenCalledTimes(1);

    const added = { ...stored, id: "exception-2", settingId, reason: "Synthetic" };
    mocks.exceptions.mockResolvedValueOnce([stored, added]);
    // Main applies the exceptions when the benchmark is compared again.
    const adjusted = syntheticAssessment();
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
    mocks.assess.mockResolvedValueOnce(syntheticAssessment());
    await click(within(panel).getByRole("button", { name: `Remove the exception for ${stored.settingId}` }));
    expect(mocks.exceptions).toHaveBeenLastCalledWith({ action: "remove", ...identity, settingId: stored.settingId });
    expect(within(panel).queryByText("Synthetic reason")).toBeNull();
    await until(() => expect(screen.queryByText("60% with 1 exclusion")).toBeNull());
    expect(mocks.assess).toHaveBeenCalledTimes(3);
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

  it("asks for confirmation before saving drafts", async () => {
    await renderScreen();
    await compare();
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Save the draft policies?")).toBeTruthy();
    expect(within(dialog).getByText(/Every policy is a draft and unassigned/)).toBeTruthy();
    expect(mocks.exportFile).not.toHaveBeenCalled();
    await click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.exportFile).not.toHaveBeenCalled();

    mocks.exportFile.mockResolvedValueOnce("/synthetic/drafts.zip");
    await click(screen.getByRole("button", { name: "Drafts (.zip)" }));
    await click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save drafts" }));
    expect(mocks.exportFile).toHaveBeenCalledWith({ format: "drafts", confirmed: true });
    expect(screen.getByText("Draft policies saved: drafts.zip")).toBeTruthy();
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
    counts: { pass: 0, fail: 0, review: 0, notAssessed: 0 },
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
    await until(() => expect(within(panel).getByRole("list", { name: "Stored comparisons" })).toBeTruthy());
    const points = within(panel).getAllByRole("listitem").map((item) => item.textContent);
    expect(points).toHaveLength(2);
    expect(points[0]).toContain("-45.0 pp");
    expect(points[1]).toContain("First comparison");
    expect(within(panel).getByText(/fell below 90%, from 95% to 50%/)).toBeTruthy();
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
    expect(within(one).getByText("3 of 4")).toBeTruthy();
    const other = within(panel).getByRole("listitem", { name: "tenant-2" });
    expect(within(other).getByText("Stored comparisons of other benchmarks only")).toBeTruthy();
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
