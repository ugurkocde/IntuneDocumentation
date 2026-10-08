// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SettingSearchHit,
  SettingsSearchRequest,
  SettingsSearchResult,
} from "../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  search: vi.fn(),
  dispatch: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock("../lib/ipc", () => ({
  ipc: { collectSearchSettings: mocks.search },
  errorMessage: (error: unknown) =>
    error instanceof Error ? error.message : String(error),
  isMac: false,
}));

vi.mock("../state/context", () => ({
  useApp: () => ({
    state: mocks.state.current,
    dispatch: mocks.dispatch,
    actions: {},
  }),
}));

const { SearchSettingsScreen, highlightPattern } = await import(
  "./SearchSettingsScreen"
);

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function appState(
  collected: boolean,
  collectedAt = "2026-10-08T09:00:00Z",
  search = { query: "", families: [] as string[], platforms: [] as string[] },
) {
  return {
    settingsSearch: search,
    collection: {
      running: false,
      loaded: 0,
      summary: collected
        ? {
            collectedAt,
            totalConfigurations: 3,
            sectionCounts: [],
          }
        : null,
    },
  };
}

function hit(overrides: Partial<SettingSearchHit>): SettingSearchHit {
  return {
    sectionKey: "settingsCatalog",
    sectionLabel: "Settings Catalog",
    familyKey: "settingsCatalog",
    policyId: "policy-1",
    policyName: "WIN - Baseline - BitLocker",
    platforms: ["Windows"],
    assignmentCount: 2,
    assignedToAllUsers: false,
    assignedToAllDevices: true,
    name: "Require Device Encryption",
    value: "Enabled",
    definitionId: "device_vendor_msft_bitlocker_requiredeviceencryption",
    path: [],
    category: null,
    ...overrides,
  };
}

function result(
  request: SettingsSearchRequest,
  hits: SettingSearchHit[],
  total = hits.length,
): SettingsSearchResult {
  return {
    query: request.query,
    total,
    hits,
    families: [
      { value: "settingsCatalog", count: total - 1 },
      { value: "compliancePolicies", count: 1 },
    ],
    platforms: [{ value: "Windows", count: total }],
    indexedSettings: 5000,
  };
}

let root: Root | null = null;
let container: HTMLElement;

function renderScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(<SearchSettingsScreen />));
}

// Renders again after the app state changed, as the provider would.
async function rerender(state: unknown) {
  mocks.state.current = state;
  await act(async () => root!.render(<SearchSettingsScreen />));
}

function searchInput(): HTMLInputElement {
  return screen.getByLabelText(
    "Search settings by name, value or technical id",
  ) as HTMLInputElement;
}

// A search that answers only when the test says so.
function deferred() {
  let resolve!: (value: SettingsSearchResult) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<SettingsSearchResult>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function liveText(): string {
  return container.querySelector("[aria-live=polite]")?.textContent ?? "";
}

// Lets the debounce and the stubbed IPC call finish inside act.
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 260));
  });
}

async function type(text: string) {
  const input = screen.getByLabelText(
    "Search settings by name, value or technical id",
  );
  await act(async () => {
    fireEvent.change(input, { target: { value: text } });
  });
}

beforeEach(() => {
  mocks.search.mockReset();
  mocks.dispatch.mockReset();
});

afterEach(async () => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

describe("SearchSettingsScreen", () => {
  it("asks for a collection first", () => {
    mocks.state.current = appState(false);
    renderScreen();
    expect(screen.getByText("Collect your tenant first")).toBeTruthy();
    expect(
      screen.queryByLabelText("Search settings by name, value or technical id"),
    ).toBeNull();
  });

  it("debounces the query, groups hits by policy and opens a policy", async () => {
    mocks.state.current = appState(true);
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [
        hit({}),
        hit({
          name: "Fixed drive encryption type",
          value: "Full encryption",
          definitionId:
            "device_vendor_msft_bitlocker_fixeddrivesencryptiontype",
          path: ["Fixed Data Drives"],
        }),
        hit({
          sectionKey: "compliancePolicies",
          familyKey: "compliancePolicies",
          policyId: "policy-2",
          policyName: "WIN - Compliance - Baseline",
          name: "Bit Locker Enabled",
          definitionId: "bitLockerEnabled",
          assignmentCount: 0,
          assignedToAllDevices: false,
        }),
      ]),
    );
    renderScreen();
    expect(screen.getByText("Search every collected setting")).toBeTruthy();
    await type("bitlocker");
    expect(mocks.search).not.toHaveBeenCalled();

    await settle();
    expect(screen.getByText("3 matches in 2 policies")).toBeTruthy();
    expect(mocks.search).toHaveBeenCalledTimes(1);
    expect(mocks.search).toHaveBeenCalledWith({
      query: "bitlocker",
      families: [],
      platforms: [],
      limit: 200,
    });

    const policies = screen.getAllByRole("article");
    expect(policies).toHaveLength(2);
    expect(screen.getByText("2 settings")).toBeTruthy();
    expect(screen.getByText("Fixed Data Drives")).toBeTruthy();
    expect(
      screen.getByText("Assigned to All devices and 2 groups"),
    ).toBeTruthy();
    expect(screen.getByText("Not assigned")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: /WIN - Compliance - Baseline/ }),
    );
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "navigate",
      screen: "section",
      familyKey: "compliancePolicies",
      query: "WIN - Compliance - Baseline",
    });
  });

  it("shows the cap and sends family filters", async () => {
    mocks.state.current = appState(true);
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [hit({})], 950),
    );
    renderScreen();
    await type("enabled");
    await settle();
    expect(screen.getByText("Showing 1 of 950 matches")).toBeTruthy();

    const chip = screen.getByRole("button", {
      name: /Compliance/,
      pressed: false,
    });
    await act(async () => fireEvent.click(chip));
    await settle();
    expect(mocks.search).toHaveBeenLastCalledWith({
      query: "enabled",
      families: ["compliancePolicies"],
      platforms: [],
      limit: 200,
    });
    expect(
      screen.getByRole("button", { name: /Compliance/, pressed: true }),
    ).toBeTruthy();
  });

  it("labels and opens a hit under its displayed family", async () => {
    mocks.state.current = appState(true);
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [
        hit({
          familyKey: "endpointSecurityPolicies",
          sectionKey: "settingsCatalog",
          sectionLabel: "Settings Catalog",
          policyName: "WIN - Firewall",
          name: "Enable Domain Network Firewall",
        }),
      ]),
    );
    renderScreen();
    await type("firewall");
    await settle();
    const card = screen.getByRole("article", {
      name: "WIN - Firewall, Endpoint security",
    });
    expect(card.textContent).toContain("Endpoint security");
    expect(card.textContent).not.toContain("Settings Catalog");
    fireEvent.click(screen.getByRole("button", { name: /WIN - Firewall/ }));
    expect(mocks.dispatch).toHaveBeenCalledWith({
      type: "navigate",
      screen: "section",
      familyKey: "endpointSecurityPolicies",
      query: "WIN - Firewall",
    });
  });

  it("explains an empty result", async () => {
    mocks.state.current = appState(true);
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [], 0),
    );
    renderScreen();
    await type("nothing here");
    await settle();
    expect(screen.getByText("No settings match your search")).toBeTruthy();
    expect(screen.getByText(/Searched 5,000 settings/)).toBeTruthy();
  });

  it("focuses the input when the screen opens", () => {
    mocks.state.current = appState(true);
    renderScreen();
    expect(document.activeElement).toBe(searchInput());
  });

  it("retries a failed search with a plain message", async () => {
    mocks.state.current = appState(true);
    mocks.search.mockRejectedValueOnce(
      new Error("Cannot read properties of undefined (reading 'rows')"),
    );
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [hit({})]),
    );
    renderScreen();
    await type("bitlocker");
    await settle();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Search failed. Try again.");
    expect(alert.textContent).not.toContain("Cannot read");
    expect(liveText()).toBe("");

    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Retry" })),
    );
    await settle();
    expect(mocks.search).toHaveBeenCalledTimes(2);
    expect(mocks.search).toHaveBeenLastCalledWith({
      query: "bitlocker",
      families: [],
      platforms: [],
      limit: 200,
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("1 match in 1 policy")).toBeTruthy();
  });

  it("offers a collection when main has none", async () => {
    mocks.state.current = appState(true);
    mocks.search.mockRejectedValue(new Error("Collect tenant data first."));
    renderScreen();
    await type("bitlocker");
    await settle();
    expect(
      screen.getByText("The collection is no longer available"),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Refresh data" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
  });

  it("searches again in place after a new collection", async () => {
    mocks.state.current = appState(true);
    renderScreen();
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [hit({})]),
    );
    await type("bitlocker");
    await settle();
    expect(screen.getByText("1 match in 1 policy")).toBeTruthy();
    const chip = screen.getByRole("button", {
      name: "Compliance, 1 match",
    });
    chip.focus();
    await act(async () => fireEvent.click(chip));
    await settle();
    expect(document.activeElement).toBe(chip);

    const next = deferred();
    mocks.search.mockReturnValueOnce(next.promise);
    await rerender(appState(true, "2026-10-08T10:00:00Z"));
    expect(mocks.search).toHaveBeenLastCalledWith({
      query: "bitlocker",
      families: ["compliancePolicies"],
      platforms: [],
      limit: 200,
    });
    // The old results stay, dimmed, and keep the query and filters.
    expect(searchInput().value).toBe("bitlocker");
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(container.querySelector("[aria-busy=true]")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: /Compliance/, pressed: true }),
    ).toBeTruthy();
    expect(liveText()).toBe("Searching");
    // Focus stays where the user left it.
    expect(document.activeElement).toBe(chip);

    await act(async () =>
      next.resolve(
        result({ query: "bitlocker" }, [hit({}), hit({ name: "Second" })]),
      ),
    );
    expect(liveText()).toBe("2 matches in 1 policy");
    expect(container.querySelector("[aria-busy=true]")).toBeNull();
  });

  it("drops the search when the collection is cleared", async () => {
    mocks.state.current = appState(true, undefined, {
      query: "bitlocker",
      families: ["compliancePolicies"],
      platforms: [],
    });
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [hit({})]),
    );
    renderScreen();
    await settle();
    expect(searchInput().value).toBe("bitlocker");

    // resetCollection clears the summary and the stored search.
    await rerender(appState(false));
    expect(screen.getByText("Collect your tenant first")).toBeTruthy();
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: "settingsSearch",
      search: { query: "", families: [], platforms: [] },
    });

    mocks.search.mockClear();
    await rerender(appState(true, "2026-10-08T11:00:00Z"));
    await settle();
    expect(searchInput().value).toBe("");
    expect(screen.getByText("Search every collected setting")).toBeTruthy();
    expect(screen.queryByRole("button", { pressed: true })).toBeNull();
    expect(mocks.search).not.toHaveBeenCalled();
    expect(mocks.dispatch).toHaveBeenLastCalledWith({
      type: "settingsSearch",
      search: { query: "", families: [], platforms: [] },
    });
  });

  it("keeps selected filters visible while searching and after an error", async () => {
    mocks.state.current = appState(true, undefined, {
      query: "bitlocker",
      families: ["compliancePolicies"],
      platforms: ["Windows"],
    });
    const first = deferred();
    mocks.search.mockReturnValueOnce(first.promise);
    renderScreen();
    expect(screen.getByRole("status").textContent).toContain(
      "Searching settings",
    );
    expect(liveText()).toBe("Searching");
    // Without a result the chips have no counts.
    expect(
      screen.getByRole("button", { name: "Compliance", pressed: true }),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Windows", pressed: true }),
    ).toBeTruthy();

    await act(async () => first.reject(new Error("boom")));
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Compliance", pressed: true }),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("offers to clear filters when they hide every match", async () => {
    mocks.state.current = appState(true, undefined, {
      query: "bitlocker",
      families: ["deviceConfigurations"],
      platforms: [],
    });
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      request.families?.length
        ? {
            ...result(request, [], 0),
            families: [
              { value: "settingsCatalog", count: 6 },
              { value: "compliancePolicies", count: 1 },
            ],
          }
        : result(request, [hit({})]),
    );
    renderScreen();
    await settle();
    expect(
      screen.getByText("No settings match your search and filters"),
    ).toBeTruthy();
    expect(screen.getByText("7 settings match without filters.")).toBeTruthy();
    const clear = screen.getAllByRole("button", { name: "Clear filters" });
    expect(clear).toHaveLength(2);
    await act(async () => fireEvent.click(clear[1]!));
    await settle();
    expect(mocks.search).toHaveBeenLastCalledWith({
      query: "bitlocker",
      families: [],
      platforms: [],
      limit: 200,
    });
    expect(screen.getByText("1 match in 1 policy")).toBeTruthy();
  });

  it("highlights words of two or more characters", () => {
    expect(highlightPattern("a b")).toBeNull();
    const pattern = highlightPattern("a bit x.y")!;
    expect("a bitlocker x.y".split(pattern)).toEqual([
      "a ",
      "bit",
      "locker ",
      "x.y",
      "",
    ]);
  });

  it("shows eight family chips until More is pressed", async () => {
    mocks.state.current = appState(true, undefined, {
      query: "enabled",
      families: ["family11"],
      platforms: [],
    });
    const families = Array.from({ length: 12 }, (_, index) => ({
      value: `family${index}`,
      count: 100 - index,
    }));
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) => ({
      ...result(request, [hit({})]),
      families,
    }));
    renderScreen();
    await settle();
    const family = () =>
      screen
        .getByText("Family")
        .parentElement!.querySelectorAll("button[aria-pressed]");
    // Eight by count plus the selected one.
    expect(family()).toHaveLength(9);
    expect(
      screen.getByRole("button", {
        name: "family11, 89 matches",
        pressed: true,
      }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: /family8,/ })).toBeNull();

    const more = screen.getByRole("button", { name: "More (3)" });
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await act(async () => fireEvent.click(more));
    expect(family()).toHaveLength(12);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Fewer" })),
    );
    expect(family()).toHaveLength(9);
  });

  it("shows a clamped value in full and copies it", async () => {
    const height = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.textContent?.startsWith("Long value") ? 400 : 0;
      });
    mocks.state.current = appState(true);
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [
        hit({ value: "Long value ".repeat(80) }),
        hit({ name: "Short", value: "Enabled" }),
      ]),
    );
    renderScreen();
    await type("bitlocker");
    await settle();
    const toggles = screen.getAllByRole("button", { name: "Show full value" });
    expect(toggles).toHaveLength(1);
    const value = document.getElementById(
      toggles[0]!.getAttribute("aria-controls")!,
    )!;
    expect(value.className).toContain("line-clamp-6");
    await act(async () => fireEvent.click(toggles[0]!));
    expect(value.className).not.toContain("line-clamp-6");
    expect(
      screen
        .getByRole("button", { name: "Show less" })
        .getAttribute("aria-expanded"),
    ).toBe("true");
    expect(screen.getAllByRole("button", { name: "Copy value" })).toHaveLength(
      2,
    );
    height.mockRestore();
  });

  it("collapses a reused row when a new collection changes its value", async () => {
    const height = vi
      .spyOn(HTMLElement.prototype, "scrollHeight", "get")
      .mockImplementation(function (this: HTMLElement) {
        return this.textContent?.startsWith("Long value") ? 400 : 0;
      });
    let value = "Long value ".repeat(80);
    mocks.state.current = appState(true);
    mocks.search.mockImplementation(async (request: SettingsSearchRequest) =>
      result(request, [hit({ value })]),
    );
    renderScreen();
    await type("bitlocker");
    await settle();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Show full value" })),
    );
    expect(screen.getByRole("button", { name: "Show less" })).toBeTruthy();

    value = "Enabled";
    await rerender(appState(true, "2026-10-08T10:00:00Z"));
    await settle();
    expect(screen.queryByRole("button", { name: "Show less" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Show full value" })).toBeNull();
    height.mockRestore();
  });
});
