import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { UpdateStatus } from "../shared/ipc-types";

// A fake electron-updater: checkForUpdates emits update-available, and
// downloadUpdate only runs when called, as with autoDownload off. With
// autoDownload on, the check starts the download itself. vi.hoisted runs
// before the imports above, so it loads events itself.
const fake = await vi.hoisted(async () => {
  const { EventEmitter } = await import("node:events");
  const updater = Object.assign(new EventEmitter(), {
    autoDownload: true,
    autoInstallOnAppQuit: true,
    forceDevUpdateConfig: false,
    logger: undefined as unknown,
    setFeedURL: () => undefined,
    downloadUpdate: async () => [] as string[],
    checkForUpdates: async () => null as unknown,
    quitAndInstall: () => undefined,
  });
  return { updater };
});

vi.mock("electron", () => ({
  app: { isPackaged: true, getPath: () => "", getVersion: () => "0.1.0" },
}));

vi.mock("electron-updater", () => ({ autoUpdater: fake.updater }));

vi.mock("./logger", () => ({
  log: () => undefined,
  errorText: (error: unknown) => String(error),
}));

type Updater = typeof import("./updater");

async function load(automatic: boolean) {
  vi.resetModules();
  fake.updater.removeAllListeners();
  fake.updater.autoDownload = true;
  fake.updater.autoInstallOnAppQuit = true;
  const download = vi.fn(async () => {
    fake.updater.emit("download-progress", { percent: 50 });
    fake.updater.emit("update-downloaded", { version: "0.2.0" });
    return [];
  });
  fake.updater.downloadUpdate = download;
  fake.updater.checkForUpdates = vi.fn(async () => {
    fake.updater.emit("checking-for-update");
    fake.updater.emit("update-available", { version: "0.2.0" });
    if (fake.updater.autoDownload) await fake.updater.downloadUpdate();
    return null;
  });
  const updater: Updater = await import("./updater");
  const seen: UpdateStatus[] = [];
  updater.startUpdater((status) => seen.push(status), automatic);
  return { updater, download, seen };
}

describe("updater", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("offers an update without downloading it when automatic updates are off", async () => {
    const { updater, download } = await load(false);
    expect(fake.updater.autoDownload).toBe(false);
    expect(fake.updater.autoInstallOnAppQuit).toBe(false);

    await updater.checkForUpdates();

    expect(download).not.toHaveBeenCalled();
    expect(updater.getUpdateStatus()).toEqual({
      state: "available",
      version: "0.2.0",
    });
    expect(updater.installUpdate()).toBe(false);
  });

  it("downloads an offered update when the user asks for it", async () => {
    const { updater, download, seen } = await load(false);
    await updater.checkForUpdates();

    const result = await updater.downloadUpdate();

    expect(download).toHaveBeenCalledTimes(1);
    expect(seen.map((status) => status.state)).toContain("downloading");
    expect(result).toEqual({ state: "ready", version: "0.2.0" });
  });

  it("keeps a finished download instead of downloading again", async () => {
    const { updater, download } = await load(false);
    await updater.checkForUpdates();
    await updater.downloadUpdate();

    await updater.checkForUpdates();
    await updater.downloadUpdate();

    expect(download).toHaveBeenCalledTimes(1);
    expect(updater.getUpdateStatus().state).toBe("ready");
  });

  it("does nothing on a download request without an available update", async () => {
    const { updater, download } = await load(false);

    const result = await updater.downloadUpdate();

    expect(download).not.toHaveBeenCalled();
    expect(result.state).toBe("idle");
  });

  it("downloads automatically when automatic updates are on", async () => {
    const { updater, download } = await load(true);
    expect(fake.updater.autoDownload).toBe(true);
    expect(fake.updater.autoInstallOnAppQuit).toBe(true);

    await updater.checkForUpdates();

    expect(download).toHaveBeenCalledTimes(1);
    expect(updater.getUpdateStatus()).toEqual({
      state: "ready",
      version: "0.2.0",
    });
  });

  it("starts a waiting download when automatic updates are turned on", async () => {
    const { updater, download } = await load(false);
    await updater.checkForUpdates();
    expect(download).not.toHaveBeenCalled();

    updater.setAutoUpdate(true);
    await vi.advanceTimersByTimeAsync(0);

    expect(updater.getUpdateStatus().state).toBe("ready");
    expect(fake.updater.autoDownload).toBe(true);
    expect(fake.updater.autoInstallOnAppQuit).toBe(true);
    expect(download).toHaveBeenCalledTimes(1);
  });

  it("stops installing on quit when automatic updates are turned off", async () => {
    const { updater } = await load(true);

    updater.setAutoUpdate(false);

    expect(fake.updater.autoDownload).toBe(false);
    expect(fake.updater.autoInstallOnAppQuit).toBe(false);
  });

  it("runs the first check after 10 seconds", async () => {
    const { download } = await load(false);
    expect(fake.updater.checkForUpdates).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(10_000);

    expect(fake.updater.checkForUpdates).toHaveBeenCalledTimes(1);
    expect(download).not.toHaveBeenCalled();
  });
});
