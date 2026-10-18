// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleStatus } from "../../../shared/ipc-types";
import { createInitialState } from "../../state/reducer";

const mocks = vi.hoisted(() => ({
  scheduleStatus: vi.fn(),
  listener: { current: null as null | ((status: ScheduleStatus) => void) },
  syncCollection: vi.fn(async () => undefined),
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
  },
  isMac: false,
  errorMessage: (error: unknown) => String(error),
}));

const actions = { syncCollection: mocks.syncCollection };
vi.mock("../../state/context", () => ({
  useApp: () => ({ state: createInitialState(), actions }),
}));

const { Sidebar } = await import("./Sidebar");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function status(lastRunAt: string | null, lastResult: ScheduleStatus["lastResult"]): ScheduleStatus {
  return {
    hours: 6,
    state: "waiting",
    reason: null,
    nextRunAt: null,
    lastRunAt,
    lastResult,
    lastError: lastResult === "failed" ? "Snapshot not saved. The disk is full." : null,
    lastSkippedAt: null,
    lastSkippedReason: null,
  };
}

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  mocks.scheduleStatus.mockReset();
  mocks.syncCollection.mockClear();
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

describe("Sidebar after a scheduled collection", () => {
  it("syncs the collection after each later run, also one whose snapshot was not saved", async () => {
    mocks.scheduleStatus.mockResolvedValue(status("2026-10-18T06:00:00.000Z", "collected"));
    await act(async () => root.render(<Sidebar />));
    // The run before mount is the baseline.
    expect(mocks.syncCollection).not.toHaveBeenCalled();

    await act(async () => mocks.listener.current?.(status("2026-10-18T12:00:00.000Z", "collected")));
    expect(mocks.syncCollection).toHaveBeenCalledTimes(1);

    // Collected, then the snapshot save failed: main holds the new data.
    await act(async () => mocks.listener.current?.(status("2026-10-18T18:00:00.000Z", "failed")));
    expect(mocks.syncCollection).toHaveBeenCalledTimes(2);

    // Status updates without a new run, or after a reset, sync nothing.
    await act(async () => mocks.listener.current?.(status("2026-10-18T18:00:00.000Z", "failed")));
    await act(async () => mocks.listener.current?.(status(null, null)));
    expect(mocks.syncCollection).toHaveBeenCalledTimes(2);
  });
});
