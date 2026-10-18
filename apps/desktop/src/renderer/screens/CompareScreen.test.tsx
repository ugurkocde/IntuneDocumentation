// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompareGroup, CompareRow, ComparisonCounts } from "../../../../../src/lib/snapshots/reference-types";
import type { CompareView, ReferenceSummary } from "../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  exportReference: vi.fn(),
  loadReference: vi.fn(),
  clearReference: vi.fn(),
  referenceStatus: vi.fn(),
  run: vi.fn(),
  tenants: vi.fn(),
  navigate: vi.fn(),
  auth: { listener: null as null | ((status: { signedIn: boolean }) => void) },
  state: { current: null as unknown },
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    compareExportReference: mocks.exportReference,
    compareLoadReference: mocks.loadReference,
    compareClearReference: mocks.clearReference,
    compareReferenceStatus: mocks.referenceStatus,
    compareRun: mocks.run,
    compareTenants: mocks.tenants,
    onAuthChanged: (listener: (status: { signedIn: boolean }) => void) => {
      mocks.auth.listener = listener;
      return () => undefined;
    },
    openLastFile: vi.fn(),
    showLastFileInFolder: vi.fn(),
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  isMac: false,
}));

vi.mock("../state/context", () => ({
  useApp: () => ({
    state: mocks.state.current,
    dispatch: vi.fn(),
    actions: { navigate: mocks.navigate },
  }),
}));

vi.mock("../components/collection/CollectButton", () => ({
  CollectButton: () => <button type="button">Collect</button>,
}));

const { CompareScreen, resetCompareSession } = await import("./CompareScreen");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const COLLECTED = "2026-10-18T10:00:00.000Z";

function appState({
  signedIn = true,
  entitled = true,
  plan = "pro" as "pro" | "msp" | null,
  collectedAt = COLLECTED as string | null,
} = {}) {
  return {
    auth: { signedIn, tenantId: signedIn ? "tenant-1" : null, account: "admin@contoso.com" },
    license: { entitled, plan },
    collection: { running: false, summary: collectedAt ? { collectedAt } : null },
  };
}

const REFERENCE: ReferenceSummary = {
  label: "contoso…a1b2",
  createdAt: "2026-10-01T08:00:00.000Z",
  rulesetVersion: "2026.10.2",
  settings: 1234,
  notCompared: 2,
};

function counts(overrides: Partial<ComparisonCounts> = {}): ComparisonCounts {
  return { different: 0, missing: 0, extra: 0, notComparable: 0, matching: 0, ...overrides };
}

function row(overrides: Partial<CompareRow>): CompareRow {
  return {
    status: "different",
    setting: "device_vendor_msft_bitlocker_requiredeviceencryption",
    name: "Require Device Encryption",
    path: [],
    expected: [{ value: "Enabled", policy: "WIN - Baseline - BitLocker" }],
    actual: [{ value: "Disabled", policy: "WIN - BitLocker" }],
    ...overrides,
  };
}

function group(overrides: Partial<CompareGroup>): CompareGroup {
  return {
    platform: "Windows",
    family: "settingsCatalog",
    familyLabel: "Settings Catalog",
    counts: counts(),
    rows: [],
    rowsTotal: 0,
    ...overrides,
  };
}

function view(overrides: Partial<CompareView> = {}): CompareView {
  const rows = [
    row({}),
    row({
      status: "missing",
      setting: "device_vendor_msft_policy_config_defender_allowcloudprotection",
      name: "Allow Cloud Protection",
      path: ["Defender"],
      expected: [{ value: "Allowed", policy: "WIN - Defender" }],
      actual: [],
    }),
    row({
      status: "notComparable",
      setting: "wifi / preSharedKey",
      name: "Pre-shared key",
      expected: [{ value: null, policy: "WIN - Wi-Fi" }],
      actual: [{ value: null, policy: "WIN - Wi-Fi" }],
    }),
    row({ status: "matching", setting: "x", name: "Matching setting", expected: [], actual: [] }),
  ];
  return {
    source: { kind: "reference", label: "contoso…a1b2", collectedAt: REFERENCE.createdAt, rulesetVersion: "2026.10.2" },
    current: { collectedAt: COLLECTED, rulesetVersion: "2026.10.3" },
    totals: counts({ different: 1, missing: 1, notComparable: 1, matching: 1, extra: 1 }),
    groups: [
      group({ counts: counts({ different: 1, missing: 1, notComparable: 1, matching: 1 }), rows, rowsTotal: 4 }),
      group({
        platform: "macOS",
        family: "macosCustom",
        familyLabel: "macOS custom profiles",
        counts: counts({ extra: 1 }),
        rows: [row({ status: "extra", setting: "com.apple.extra", name: "Extra setting", expected: [] })],
        rowsTotal: 1,
      }),
    ],
    notCompared: [{ family: "compliancePolicies", label: "Compliance policies", side: "reference" }],
    rulesetChanged: true,
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLElement;

async function renderScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<CompareScreen />));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function loadReference() {
  mocks.loadReference.mockResolvedValue({ ok: true, reference: REFERENCE });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load reference" })));
  await settle();
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) if (typeof mock === "function") mock.mockReset();
  mocks.state.current = appState();
  mocks.referenceStatus.mockResolvedValue(null);
  resetCompareSession();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("CompareScreen", () => {
  it("asks to sign in and for a license", async () => {
    mocks.state.current = appState({ signedIn: false });
    await renderScreen();
    expect(screen.getByText("Sign in to compare")).toBeTruthy();
    act(() => root?.unmount());
    mocks.state.current = appState({ entitled: false });
    root = createRoot(container);
    await act(async () => root!.render(<CompareScreen />));
    fireEvent.click(screen.getByRole("button", { name: "Open License and account" }));
    expect(mocks.navigate).toHaveBeenCalledWith("license");
  });

  it("asks for a collection first", async () => {
    mocks.state.current = appState({ collectedAt: null });
    await renderScreen();
    expect(screen.getByText("Collect tenant data first")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Collect" })).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("explains that comparing tenants needs the MSP plan", async () => {
    await renderScreen();
    const other = screen.getByRole("radio", { name: /Another tenant/ }) as HTMLButtonElement;
    expect(other.disabled).toBe(true);
    expect(other.textContent).toContain("Comparing tenants is part of the MSP plan.");
    expect(screen.getByRole("radio", { name: /Reference file/ }).getAttribute("aria-checked")).toBe("true");
    expect(mocks.tenants).not.toHaveBeenCalled();
    expect(screen.getByText(/detects damage to it, not who made it/)).toBeTruthy();
    expect(screen.getByText(/Assignments are not compared/)).toBeTruthy();
  });

  it("lists other tenants on the MSP plan", async () => {
    mocks.state.current = appState({ plan: "msp" });
    mocks.tenants.mockResolvedValue([
      { tenantId: "t2", label: "Fabrikam", collectedAt: "2026-10-17T10:00:00Z", partial: true },
    ]);
    mocks.run.mockResolvedValue(view({ source: { ...view().source, kind: "tenant", label: "Fabrikam" } }));
    await renderScreen();
    const reference = screen.getByRole("radio", { name: /Reference file/ });
    reference.focus();
    await act(async () => fireEvent.keyDown(reference, { key: "ArrowRight" }));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole("radio", { name: /Another tenant/ }));
    const select = screen.getByLabelText("Tenant to compare with") as HTMLSelectElement;
    expect(select.value).toBe("t2");
    expect(select.textContent).toContain("(partial)");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    expect(mocks.run).toHaveBeenCalledWith({ kind: "tenant", tenantId: "t2" });
    expect(screen.getByText(/incomplete in the other tenant's snapshot/)).toBeTruthy();
  });

  it("shows the reference main still holds and lets a later load win", async () => {
    mocks.referenceStatus.mockResolvedValue(REFERENCE);
    await renderScreen();
    await settle();
    expect((screen.getByRole("button", { name: "Run comparison" }) as HTMLButtonElement).disabled).toBe(false);
    act(() => root?.unmount());
    resetCompareSession();
    // The status answers after the user loaded a file: the load wins.
    let answer: (value: null) => void = () => undefined;
    mocks.referenceStatus.mockReturnValue(new Promise((resolve) => (answer = resolve)));
    root = createRoot(container);
    await act(async () => root!.render(<CompareScreen />));
    await loadReference();
    await act(async () => answer(null));
    expect((screen.getByRole("button", { name: "Run comparison" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows why a reference was rejected", async () => {
    await renderScreen();
    mocks.loadReference.mockResolvedValue({
      ok: false,
      message: "This reference was changed or damaged after it was saved.",
    });
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load reference" })));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("changed or damaged");
    expect((screen.getByRole("button", { name: "Run comparison" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("exports a reference and reports a cancelled save", async () => {
    await renderScreen();
    mocks.exportReference.mockResolvedValueOnce(null);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export reference" })));
    await settle();
    expect(screen.getByText("Save cancelled. Nothing was saved.")).toBeTruthy();
    mocks.exportReference.mockResolvedValueOnce("/Users/admin/Documents/intunedoc-reference-2026-10-18.json");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Export reference" })));
    await settle();
    expect(screen.getByText(/Reference saved: intunedoc-reference-2026-10-18.json/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open file" })).toBeTruthy();
  });

  it("runs a comparison and filters the rows", async () => {
    mocks.run.mockResolvedValue(view());
    await renderScreen();
    await loadReference();
    expect(screen.getByText("1,234")).toBeTruthy();
    expect(screen.getByText(/2 families, incomplete when the file was saved/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    expect(mocks.run).toHaveBeenCalledWith({ kind: "reference" });
    expect(screen.getByText(/Compared/).textContent).toContain("the reference of contoso…a1b2");
    expect(screen.getByText("The evidence rules differ")).toBeTruthy();
    expect(screen.getByText(/incomplete in the reference/)).toBeTruthy();

    const windows = screen.getByRole("article", { name: "Windows, Settings Catalog" });
    expect(within(windows).getByText("Require Device Encryption")).toBeTruthy();
    expect(within(windows).getByText("device_vendor_msft_bitlocker_requiredeviceencryption")).toBeTruthy();
    expect(within(windows).getByText("Enabled")).toBeTruthy();
    expect(within(windows).getByText("WIN - Baseline - BitLocker")).toBeTruthy();
    expect(within(windows).getAllByText("Not comparable", { selector: "p" }).length).toBe(2);
    expect(within(windows).getByText("Defender")).toBeTruthy();
    // Matching rows are not part of All differences.
    expect(within(windows).queryByText("Matching setting")).toBeNull();
    expect(screen.getByRole("article", { name: "macOS, macOS custom profiles" })).toBeTruthy();

    await act(async () => fireEvent.click(screen.getByRole("radio", { name: /^Matching/ })));
    expect(screen.getByText("Matching setting")).toBeTruthy();
    expect(screen.queryByText("Require Device Encryption")).toBeNull();
    expect(screen.queryByRole("article", { name: "macOS, macOS custom profiles" })).toBeNull();

    await act(async () => fireEvent.click(screen.getByRole("radio", { name: /^Missing/ })));
    expect(screen.getByText("Allow Cloud Protection")).toBeTruthy();
    expect(screen.getByText("Set in the reference, not in this tenant.")).toBeTruthy();
  });

  it("shows Entra tenant settings apart from the configuration counts", async () => {
    mocks.run.mockResolvedValue(
      view({
        identity: {
          totals: counts({ different: 1, notComparable: 1 }),
          groups: [
            group({
              platform: "Entra ID",
              family: "authenticationMethods",
              familyLabel: "Authentication methods policy",
              counts: counts({ different: 1, notComparable: 1 }),
              rows: [
                row({
                  setting: "method:sms:state",
                  name: "State",
                  path: ["SMS"],
                  expected: [{ value: "disabled", policy: "Authentication methods policy" }],
                  actual: [{ value: "enabled", policy: "Authentication methods policy" }],
                }),
                row({
                  status: "notComparable",
                  setting: "campaign:includeTargets",
                  name: "Include target",
                  path: ["Registration campaign"],
                  expected: [{ value: null, policy: "Authentication methods policy" }],
                  actual: [{ value: null, policy: "Authentication methods policy" }],
                }),
              ],
              rowsTotal: 2,
            }),
          ],
          notCompared: [{ family: "securityDefaults", label: "Security defaults", side: "current" }],
        },
      }),
    );
    await renderScreen();
    await loadReference();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    const section = screen.getByRole("region", { name: "Entra tenant settings" });
    const card = within(section).getByRole("article", { name: "Entra ID, Authentication methods policy" });
    expect(within(card).getByText("disabled")).toBeTruthy();
    expect(within(card).getByText("enabled")).toBeTruthy();
    expect(within(section).getByText(/not read in this tenant's collection/)).toBeTruthy();
    // The configuration summary keeps its own counts.
    const summary = screen.getByRole("group", { name: "Comparison summary" });
    expect(within(summary).getByText("1 different")).toBeTruthy();
  });

  it("marks a matching setting inside a changed group", async () => {
    mocks.run.mockResolvedValue(
      view({
        totals: counts({ matching: 1 }),
        groups: [
          group({
            counts: counts({ matching: 1 }),
            rows: [row({ status: "matching", name: "Rule name", instanceChanged: true, expected: [], actual: [] })],
            rowsTotal: 1,
          }),
        ],
      }),
    );
    await renderScreen();
    await loadReference();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("radio", { name: /^Matching/ })));
    expect(screen.getByText("Rule name")).toBeTruthy();
    expect(screen.getByText("The same values, in a group where another setting differs.")).toBeTruthy();
  });

  it("says when rows are capped", async () => {
    const rows = Array.from({ length: 3 }, (_, index) =>
      row({ setting: `setting-${index}`, name: `Setting ${index}` }),
    );
    mocks.run.mockResolvedValue(
      view({
        totals: counts({ different: 450 }),
        groups: [group({ counts: counts({ different: 450 }), rows, rowsTotal: 450 })],
        notCompared: [],
        rulesetChanged: false,
      }),
    );
    await renderScreen();
    await loadReference();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    expect(screen.getByText(/Showing 3 of 450 settings/)).toBeTruthy();
    expect(screen.queryByText("The evidence rules differ")).toBeNull();
  });

  it("says when nothing differs", async () => {
    mocks.run.mockResolvedValue(
      view({
        totals: counts({ matching: 12 }),
        groups: [group({ counts: counts({ matching: 12 }), rows: [row({ status: "matching" })], rowsTotal: 12 })],
        notCompared: [],
      }),
    );
    await renderScreen();
    await loadReference();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    expect(screen.getByText("No differences")).toBeTruthy();
    expect(screen.getByText("All 12 compared settings match the reference.")).toBeTruthy();
  });

  it("retries a failed run and notes a newer collection", async () => {
    mocks.run.mockRejectedValueOnce(new Error("Collect tenant data first."));
    mocks.run.mockResolvedValue(view());
    await renderScreen();
    await loadReference();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Collect tenant data first.");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    await settle();
    expect(screen.queryByText("The comparison could not be run")).toBeNull();

    mocks.state.current = appState({ collectedAt: "2026-10-18T12:00:00.000Z" });
    await act(async () => root!.render(<CompareScreen />));
    expect(screen.getByText("The collection changed after this comparison")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run again" })));
    await settle();
    expect(mocks.run).toHaveBeenCalledTimes(3);
  });

  it("keeps the loaded reference after switching screens", async () => {
    await renderScreen();
    await loadReference();
    // Main still holds it when the screen comes back.
    mocks.referenceStatus.mockResolvedValue(REFERENCE);
    act(() => root?.unmount());
    root = createRoot(container);
    await act(async () => root!.render(<CompareScreen />));
    await settle();
    expect(screen.getByText("1,234")).toBeTruthy();
    mocks.clearReference.mockResolvedValue(true);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Clear" })));
    await settle();
    expect(mocks.clearReference).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Load reference" })).toBeTruthy();
  });

  it("forgets the reference after a sign out and clears a stale error", async () => {
    mocks.run.mockRejectedValueOnce(new Error("Collect tenant data first."));
    await renderScreen();
    await loadReference();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Run comparison" })));
    await settle();
    expect(screen.getByText("The comparison could not be run")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Load another reference" })));
    await settle();
    expect(screen.queryByText("The comparison could not be run")).toBeNull();

    act(() => root?.unmount());
    act(() => mocks.auth.listener?.({ signedIn: false }));
    root = createRoot(container);
    await act(async () => root!.render(<CompareScreen />));
    expect(screen.getByRole("button", { name: "Load reference" })).toBeTruthy();
    expect(screen.queryByText("1,234")).toBeNull();
  });
});
