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

const { SearchSettingsScreen } = await import("./SearchSettingsScreen");

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

function appState(collected: boolean) {
  return {
    settingsSearch: { query: "", families: [], platforms: [] },
    collection: {
      running: false,
      loaded: 0,
      summary: collected
        ? {
            collectedAt: "2026-10-08T09:00:00Z",
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

    const policies = screen.getAllByRole("region");
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
    const card = screen.getByRole("region", {
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
});
