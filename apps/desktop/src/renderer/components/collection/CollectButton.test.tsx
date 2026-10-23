// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleStatus } from "../../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  scheduleStatus: vi.fn(),
  listener: { current: null as null | ((status: ScheduleStatus) => void) },
  cancel: vi.fn(async () => true),
  collect: vi.fn(async () => undefined),
}));

vi.mock("../../lib/ipc", () => ({
  ipc: {
    historyScheduleStatus: mocks.scheduleStatus,
    onScheduleStatus: (listener: (status: ScheduleStatus) => void) => {
      mocks.listener.current = listener;
      return () => {
        mocks.listener.current = null;
      };
    },
    collectCancel: mocks.cancel,
  },
  errorMessage: (error: unknown) => String(error),
}));

vi.mock("../../state/context", () => ({
  useApp: () => ({
    state: {
      auth: { signedIn: true },
      license: { entitled: true, hasKey: true },
      collection: { running: false, cancelling: false, loaded: 0, summary: null },
    },
    actions: { collect: mocks.collect, cancelCollect: vi.fn() },
  }),
}));

const { CollectButton } = await import("./CollectButton");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function status(state: ScheduleStatus["state"]): ScheduleStatus {
  return {
    hours: 6,
    state,
    reason: null,
    nextRunAt: null,
    lastRunAt: null,
    lastResult: null,
    lastError: null,
    lastSkippedAt: null,
    lastSkippedReason: null,
  };
}

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.scheduleStatus.mockReset();
  mocks.cancel.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function render() {
  await act(async () => {
    root.render(<CollectButton />);
  });
}

describe("CollectButton during a scheduled collection", () => {
  it("offers to cancel the scheduled run instead of starting a manual one", async () => {
    mocks.scheduleStatus.mockResolvedValue(status("running"));
    await render();
    expect(screen.getByText("Scheduled collection running")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Collect tenant data/ })).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Cancel scheduled collection/ }));
    });
    expect(mocks.cancel).toHaveBeenCalledTimes(1);
  });

  it("returns to Collect when the scheduled run ends", async () => {
    mocks.scheduleStatus.mockResolvedValue(status("running"));
    await render();
    await act(async () => mocks.listener.current?.(status("waiting")));
    expect(screen.getByRole("button", { name: /Collect tenant data/ })).toBeTruthy();
  });

  it("shows Collect when the schedule status cannot be read", async () => {
    mocks.scheduleStatus.mockRejectedValue(new Error("A license is required"));
    await render();
    expect(screen.getByRole("button", { name: /Collect tenant data/ })).toBeTruthy();
  });
});
