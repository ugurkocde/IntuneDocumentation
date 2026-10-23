// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  listener: { current: null as null | ((message: string) => void) },
  navigate: vi.fn(),
}));

vi.mock("../../lib/ipc", () => ({
  ipc: {
    onSnapshotNotSaved: (listener: (message: string) => void) => {
      mocks.listener.current = listener;
      return () => {
        mocks.listener.current = null;
      };
    },
  },
}));

vi.mock("../../state/context", () => ({
  useApp: () => ({ actions: { navigate: mocks.navigate } }),
}));

const { SnapshotNotSavedNotice } = await import("./SnapshotNotSavedNotice");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root;
let host: HTMLElement;

beforeEach(() => {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<SnapshotNotSavedNotice />));
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  mocks.navigate.mockReset();
});

describe("SnapshotNotSavedNotice", () => {
  it("stays hidden until main reports a snapshot that was not saved", () => {
    expect(screen.queryByText("Snapshot not saved")).toBeNull();
    act(() => mocks.listener.current?.("No space left on the disk."));
    expect(screen.getByText("Snapshot not saved")).toBeTruthy();
    expect(screen.getByText(/No space left on the disk\./)).toBeTruthy();
  });

  it("opens History or is dismissed without blocking anything", () => {
    act(() => mocks.listener.current?.("No space left on the disk."));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Open History" })));
    expect(mocks.navigate).toHaveBeenCalledWith("history");
    expect(screen.queryByText("Snapshot not saved")).toBeNull();
    act(() => mocks.listener.current?.("Again."));
    act(() => fireEvent.click(screen.getByRole("button", { name: "Dismiss snapshot notice" })));
    expect(screen.queryByText("Snapshot not saved")).toBeNull();
  });
});
