// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  screen: { current: "benchmarks" as string },
  crash: { current: true },
}));

vi.mock("./state/context", () => ({
  useApp: () => ({
    state: { screen: mocks.screen.current, activeFamilyKey: null },
    actions: { syncCollection: async () => undefined },
  }),
}));
vi.mock("./lib/ipc", () => ({ isMac: false }));
vi.mock("./components/layout/Sidebar", () => ({ Sidebar: () => <nav aria-label="Sidebar" /> }));
vi.mock("./components/collection/CollectionStatusToast", () => ({ CollectionStatusToast: () => null }));
vi.mock("./components/collection/SnapshotNotSavedNotice", () => ({ SnapshotNotSavedNotice: () => null }));
// A screen that fails to render while crash is set, as malformed data would.
vi.mock("./screens/BenchmarksScreen", () => ({
  BenchmarksScreen: () => {
    if (mocks.crash.current) throw new Error("Synthetic render failure");
    return <p>Benchmarks shown</p>;
  },
}));
for (const name of [
  "Compare",
  "Compliance",
  "Export",
  "History",
  "License",
  "Overview",
  "Portfolio",
  "SearchSettings",
  "SectionDetail",
  "Settings",
])
  vi.doMock(`./screens/${name}Screen`, () => ({ [`${name}Screen`]: () => <p>{name} shown</p> }));

const { DashboardShell } = await import("./DashboardShell");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  // jsdom has no scrolling; the shell scrolls to the top on each screen.
  HTMLElement.prototype.scrollTo = () => undefined;
  mocks.crash.current = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.mocked(console.error).mockRestore();
});

describe("DashboardShell error boundary", () => {
  it("names the screen that failed, keeps the sidebar and renders it again on Try again", async () => {
    await act(async () => root.render(<DashboardShell />));
    expect(screen.getByText("This screen could not be shown")).toBeTruthy();
    // The screen keeps its header above the fallback.
    expect(screen.getByRole("heading", { level: 1, name: "Benchmark readiness" })).toBeTruthy();
    expect(screen.getByText(/open another screen from the sidebar/)).toBeTruthy();
    expect(screen.getByRole("navigation", { name: "Sidebar" })).toBeTruthy();
    mocks.crash.current = false;
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(screen.getByText("Benchmarks shown")).toBeTruthy();
    expect(screen.queryByText("This screen could not be shown")).toBeNull();
  });
});
