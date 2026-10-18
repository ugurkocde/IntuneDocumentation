// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { screen } from "@testing-library/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PolicyDeviceStatusView } from "../../shared/ipc-types";

vi.mock("../lib/ipc", () => ({
  ipc: {},
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  isMac: false,
}));

vi.mock("../state/context", () => ({
  useApp: () => ({ state: {}, dispatch: vi.fn(), actions: {} }),
}));

const { DeviceStatusLine, DeviceStatusNote } = await import("./SectionDetailScreen");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let container: HTMLElement;

function render(node: ReactNode) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(node));
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
});

const view = (overrides: Partial<PolicyDeviceStatusView> = {}): PolicyDeviceStatusView => ({
  source: "configurationPolicies",
  sourceLabel: "Configuration report",
  state: "collected",
  error: null,
  collectedAt: "2026-10-18T10:00:00Z",
  rows: {},
  ...overrides,
});

describe("device status on the policy list", () => {
  it("shows every reported count and leaves out pending when Intune has none", () => {
    render(<DeviceStatusLine counts={{ succeeded: 1204, error: 3, conflict: 0, notApplicable: 12, pending: null }} />);
    expect(container.textContent).toBe("Device status1,204 succeeded3 error0 conflict12 not applicable");
    render(<DeviceStatusLine counts={{ succeeded: 1, error: 0, conflict: 0, notApplicable: 0, pending: 5 }} />);
    expect(container.textContent).toContain("5 pending");
  });

  it("says No status reported instead of zero for a policy without a row", () => {
    render(<DeviceStatusLine counts={undefined} />);
    expect(container.textContent).toBe("Device status: No status reported");
  });

  it("names the source, the read time and that the counts never feed evidence", () => {
    render(<DeviceStatusNote status={view()} />);
    expect(screen.getByText(/Device status from the Intune configuration report, read /)).toBeTruthy();
    expect(container.textContent).toContain(new Date("2026-10-18T10:00:00Z").toLocaleString());
    expect(container.textContent).toContain("Reported by Intune; not used for evidence status.");
  });

  it("explains a source that was not collected", () => {
    render(<DeviceStatusNote status={view({ state: "permissionDenied", error: "Missing permission.", collectedAt: null })} />);
    expect(container.textContent).toBe(
      "Device status from the Intune configuration report was not collected (access denied): Missing permission. Reported by Intune; not used for evidence status.",
    );
  });
});
