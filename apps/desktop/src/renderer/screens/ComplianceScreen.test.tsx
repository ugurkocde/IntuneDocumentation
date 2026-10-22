// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assess: vi.fn(),
  navigate: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock("../lib/ipc", () => ({
  ipc: { complianceAssess: mocks.assess },
  errorMessage: (error: unknown) => String(error),
  isMac: false,
}));

vi.mock("../state/context", () => ({
  useApp: () => ({ state: mocks.state.current, dispatch: vi.fn(), actions: { navigate: mocks.navigate } }),
}));

const { ComplianceScreen } = await import("./ComplianceScreen");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function appState(benchmarks: "internal" | "comingSoon") {
  return {
    benchmarks,
    auth: { signedIn: true, tenantId: "tenant-1", account: "admin@synthetic.example" },
    license: { entitled: true, plan: "pro" },
    collection: { running: false, summary: { collectedAt: "2026-10-22T09:00:00.000Z" } },
    compliance: { scope: {}, report: { phase: "idle", frameworkId: null } },
  };
}

let root: Root | null = null;
let container: HTMLElement;

async function renderScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ComplianceScreen />));
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  window.localStorage.clear();
  mocks.assess.mockReset();
  mocks.navigate.mockReset();
  mocks.assess.mockResolvedValue({ disclaimer: "", frameworks: [], selected: null });
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("Compliance framework picker, CIS Benchmarks card", () => {
  it("is disabled and says coming soon only without the claim", async () => {
    mocks.state.current = appState("comingSoon");
    await renderScreen();
    const card = screen.getByRole("button", { name: "CIS Benchmarks, coming soon" }) as HTMLButtonElement;
    expect(card.disabled).toBe(true);
    expect(card.textContent).toContain("Coming soon");
    // No benchmark names, versions or dates.
    expect(card.textContent).not.toMatch(/\d|Level|Windows|macOS|Synthetic/);
    fireEvent.click(card);
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("opens the Benchmarks screen when internal", async () => {
    mocks.state.current = appState("internal");
    await renderScreen();
    const card = screen.getByRole("button", { name: "CIS Benchmarks" }) as HTMLButtonElement;
    expect(card.disabled).toBe(false);
    expect(card.textContent).not.toContain("Coming soon");
    await act(async () => fireEvent.click(card));
    expect(mocks.navigate).toHaveBeenCalledWith("benchmarks");
  });
});
