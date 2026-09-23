import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "../shared/ipc-types";
import { errorText, log } from "./logger";

const FIRST_CHECK_MS = 10_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;

let status: UpdateStatus = { state: "idle" };
let enabled = false;
let notify: (status: UpdateStatus) => void = () => undefined;

function set(next: UpdateStatus): void {
  status = next;
  notify(status);
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

// Packaged builds read the generic feed from app-update.yml, written by
// electron-builder. INTUNEDOC_UPDATE_TEST_FEED points a development build at
// a local feed for testing.
export function startUpdater(onStatus: (status: UpdateStatus) => void): void {
  notify = onStatus;
  const testFeed = process.env.INTUNEDOC_UPDATE_TEST_FEED;
  if (!app.isPackaged && !testFeed) {
    set({ state: "disabled", message: "Updates are checked in installed builds." });
    return;
  }
  enabled = true;
  if (testFeed) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: "generic", url: testFeed });
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  autoUpdater.on("checking-for-update", () => {
    log("info", "update check started");
    set({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    log("info", "update available", { version: info.version });
    set({ state: "available", version: info.version });
  });
  autoUpdater.on("update-not-available", () => {
    log("info", "no update available");
    set({ state: "none" });
  });
  autoUpdater.on("download-progress", (progress) => {
    set({
      state: "downloading",
      version: status.version,
      percent: Math.round(progress.percent),
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    log("info", "update downloaded", { version: info.version });
    set({ state: "ready", version: info.version });
  });
  autoUpdater.on("error", (error) => {
    log("warn", "update error", { message: errorText(error) });
    set({
      state: "error",
      version: status.version,
      message: "The update could not be downloaded. It will be retried later.",
    });
  });

  setTimeout(() => void checkForUpdates(), FIRST_CHECK_MS);
  setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
}

export async function checkForUpdates(): Promise<UpdateStatus> {
  if (!enabled) return status;
  // Keep a finished download instead of starting over.
  if (status.state === "ready" || status.state === "downloading") {
    return status;
  }
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    log("warn", "update check failed", { message: errorText(error) });
    set({
      state: "error",
      message: "Could not check for updates. Check your connection.",
    });
  }
  return status;
}

export function installUpdate(): boolean {
  if (status.state !== "ready") return false;
  log("info", "installing update", { version: status.version });
  // Silent on Windows: the assisted NSIS installer would otherwise show its
  // full wizard, license page included, for every update. Relaunch after.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}
