import { app, screen, type BrowserWindow, type Rectangle } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const DEFAULT_BOUNDS = { width: 1280, height: 840 };
export const MIN_SIZE = { width: 960, height: 640 };

interface WindowState {
  bounds: Rectangle;
  maximized: boolean;
}

function stateFile(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function visible(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(({ workArea }) => {
    const overlapX =
      Math.min(bounds.x + bounds.width, workArea.x + workArea.width) -
      Math.max(bounds.x, workArea.x);
    const overlapY =
      Math.min(bounds.y + bounds.height, workArea.y + workArea.height) -
      Math.max(bounds.y, workArea.y);
    return overlapX >= 120 && overlapY >= 80;
  });
}

export function loadWindowState(): WindowState | null {
  try {
    const parsed = JSON.parse(readFileSync(stateFile(), "utf8")) as WindowState;
    const { bounds } = parsed;
    if (
      !bounds ||
      ![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite)
    ) {
      return null;
    }
    bounds.width = Math.max(bounds.width, MIN_SIZE.width);
    bounds.height = Math.max(bounds.height, MIN_SIZE.height);
    return visible(bounds) ? { bounds, maximized: !!parsed.maximized } : null;
  } catch {
    return null;
  }
}

export function trackWindowState(window: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;
  const save = () => {
    if (window.isDestroyed() || window.isMinimized()) return;
    const state: WindowState = {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized(),
    };
    try {
      writeFileSync(stateFile(), JSON.stringify(state), "utf8");
    } catch {
      // Not critical.
    }
  };
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 500);
  };
  window.on("resize", schedule);
  window.on("move", schedule);
  window.on("close", () => {
    if (timer) clearTimeout(timer);
    save();
  });
}
