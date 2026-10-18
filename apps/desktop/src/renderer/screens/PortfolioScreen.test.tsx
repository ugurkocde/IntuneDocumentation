// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PortfolioTenant, PortfolioView } from "../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  setLabel: vi.fn(),
  deleteTenant: vi.fn(),
  navigate: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    portfolioList: mocks.list,
    portfolioSetLabel: mocks.setLabel,
    portfolioDeleteTenant: mocks.deleteTenant,
    onHistoryChanged: () => () => undefined,
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

const { PortfolioScreen, formatAge } = await import("./PortfolioScreen");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MSP_PLAN_REQUIRED =
  "Portfolio and comparing tenants are part of the MSP plan. The license of the signed in tenant is a Pro license.";

function appState({ signedIn = true, entitled = true, plan = "msp" as "pro" | "msp" | null } = {}) {
  return {
    auth: { signedIn, tenantId: signedIn ? "tenant-1" : null, account: "admin@contoso.com" },
    license: { entitled, plan },
    collection: { running: false, summary: null },
  };
}

function tenant(overrides: Partial<PortfolioTenant>): PortfolioTenant {
  return {
    tenantId: "11111111-1111-1111-1111-111111111111",
    label: null,
    shortLabel: "1111…1111",
    current: false,
    snapshots: 3,
    latest: { collectedAt: "2026-10-15T10:00:00Z", partial: false, rulesetVersion: "2026.10.3" },
    frameworks: [],
    ...overrides,
  };
}

const CONTOSO = tenant({
  tenantId: "aaaaaaaa-0000-0000-0000-000000000001",
  label: "Contoso",
  shortLabel: "aaaa…0001",
  current: true,
  snapshots: 12,
  frameworks: [
    { id: "iso-27001-2022", name: "ISO/IEC 27001", withEvidence: 10, partial: 2, applicableControls: 20, totalControls: 30 },
    { id: "nis2-2022-2555", name: "NIS2 Directive", withEvidence: 7, partial: 3, applicableControls: 15, totalControls: 15 },
  ],
});
const FABRIKAM = tenant({
  tenantId: "bbbbbbbb-0000-0000-0000-000000000002",
  shortLabel: "bbbb…0002",
  snapshots: 1,
  latest: { collectedAt: "2026-10-10T10:00:00Z", partial: true, rulesetVersion: "2026.10.2" },
  frameworks: [
    { id: "iso-27001-2022", name: "ISO/IEC 27001", withEvidence: 5, partial: 0, applicableControls: 20, totalControls: 30 },
  ],
});

function portfolio(tenants: PortfolioTenant[] = [CONTOSO, FABRIKAM]): PortfolioView {
  return { available: true, reason: null, tenants };
}

let root: Root | null = null;
let container: HTMLElement;

async function renderScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<PortfolioScreen />));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  for (const mock of [mocks.list, mocks.setLabel, mocks.deleteTenant, mocks.navigate]) mock.mockReset();
  mocks.state.current = appState();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("PortfolioScreen", () => {
  it("asks to sign in first", async () => {
    mocks.state.current = appState({ signedIn: false });
    await renderScreen();
    expect(screen.getByText("Sign in to see the portfolio")).toBeTruthy();
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("explains the MSP plan on a Pro license", async () => {
    mocks.state.current = appState({ plan: "pro" });
    await renderScreen();
    expect(screen.getByText("Portfolio is part of the MSP plan")).toBeTruthy();
    expect(screen.getByText(/The license of the signed in tenant is a Pro license/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open License and account" }));
    expect(mocks.navigate).toHaveBeenCalledWith("license");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("lists tenants with coverage for the selected framework", async () => {
    mocks.list.mockResolvedValue(portfolio());
    await renderScreen();
    await settle();
    const select = screen.getByLabelText("Coverage for") as HTMLSelectElement;
    // NIS2 is preferred when any tenant has it.
    expect(select.value).toBe("nis2-2022-2555");
    const contoso = screen.getByRole("listitem", { name: "Contoso" });
    expect(within(contoso).getByText("Signed in")).toBeTruthy();
    expect(within(contoso).getByText("aaaa…0001")).toBeTruthy();
    expect(within(contoso).getByText("12")).toBeTruthy();
    expect(within(contoso).getByText("66%")).toBeTruthy();
    expect(within(contoso).getByText("10 of 15 controls")).toBeTruthy();
    const fabrikam = screen.getByRole("listitem", { name: "bbbb…0002" });
    expect(within(fabrikam).getByText("Partial")).toBeTruthy();
    expect(within(fabrikam).getByText("Not assessed")).toBeTruthy();
    expect(screen.getByText(/use different rulesets \(2026.10.3, 2026.10.2\)/)).toBeTruthy();

    await act(async () => fireEvent.change(select, { target: { value: "iso-27001-2022" } }));
    expect(within(contoso).getByText("60%")).toBeTruthy();
    expect(within(fabrikam).getByText("25%")).toBeTruthy();
    expect(screen.getByText(/no snapshot is opened/)).toBeTruthy();
  });

  it("renames a tenant and cancels with Escape", async () => {
    mocks.list.mockResolvedValue(portfolio());
    mocks.setLabel.mockResolvedValue(portfolio([CONTOSO, { ...FABRIKAM, label: "Fabrikam" }]));
    await renderScreen();
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rename bbbb…0002" })));
    let input = screen.getByLabelText("Name of tenant bbbb…0002") as HTMLInputElement;
    expect(input.maxLength).toBe(60);
    expect(document.activeElement).toBe(input);
    await act(async () => fireEvent.keyDown(input, { key: "Escape" }));
    expect(screen.queryByLabelText("Name of tenant bbbb…0002")).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Rename bbbb…0002" }));
    expect(mocks.setLabel).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rename bbbb…0002" })));
    input = screen.getByLabelText("Name of tenant bbbb…0002") as HTMLInputElement;
    await act(async () => fireEvent.change(input, { target: { value: "Fabrikam" } }));
    await act(async () => fireEvent.submit(input.form!));
    await settle();
    expect(mocks.setLabel).toHaveBeenCalledWith(FABRIKAM.tenantId, "Fabrikam");
    expect(screen.getByRole("listitem", { name: "Fabrikam" })).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("shows a rename error from main", async () => {
    mocks.list.mockResolvedValue(portfolio());
    mocks.setLabel.mockRejectedValue(new Error("Use at most 60 characters for the tenant name."));
    await renderScreen();
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Rename Contoso" })));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Save" })));
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("Use at most 60 characters");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("deletes the history of a tenant after confirmation", async () => {
    mocks.list.mockResolvedValue(portfolio());
    mocks.deleteTenant.mockResolvedValue(portfolio([CONTOSO]));
    await renderScreen();
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete history of bbbb…0002" })));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Delete all history of bbbb…0002?");
    expect(dialog.textContent).toContain("This cannot be undone");
    expect(mocks.deleteTenant).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete history" })));
    await settle();
    expect(mocks.deleteTenant).toHaveBeenCalledWith(FABRIKAM.tenantId);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.queryByRole("listitem", { name: "bbbb…0002" })).toBeNull();
  });

  it("shows the rejection from main and retries", async () => {
    mocks.list.mockRejectedValueOnce(new Error(MSP_PLAN_REQUIRED));
    mocks.list.mockResolvedValue(portfolio([]));
    await renderScreen();
    await settle();
    expect(screen.getByText("The portfolio could not be loaded")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("part of the MSP plan");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    await settle();
    expect(screen.getByText("No tenant history on this computer yet")).toBeTruthy();
  });

  it("explains why history is unavailable", async () => {
    mocks.list.mockResolvedValue({ available: false, reason: "Secure storage is not available.", tenants: [] });
    await renderScreen();
    await settle();
    expect(screen.getByText("Secure storage is not available.")).toBeTruthy();
  });

  it("writes snapshot ages in words", () => {
    const now = Date.parse("2026-10-18T10:00:00Z");
    expect(formatAge("2026-10-18T09:59:30Z", now)).toBe("just now");
    expect(formatAge("2026-10-18T07:00:00Z", now)).toBe("3 hours ago");
    expect(formatAge("2026-10-15T10:00:00Z", now)).toBe("3 days ago");
    expect(formatAge("2026-08-01T10:00:00Z", now)).toBe("2 months ago");
    expect(formatAge("2024-10-01T10:00:00Z", now)).toBe("2 years ago");
  });
});
