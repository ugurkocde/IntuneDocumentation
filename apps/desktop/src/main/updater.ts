import { app } from "electron";
import { autoUpdater } from "electron-updater";
import type { UpdateStatus } from "../shared/ipc-types";
import { errorText, log } from "./logger";

const FIRST_CHECK_MS = 10_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60_000;

let status: UpdateStatus = { state: "idle" };
let enabled = false;
let autoUpdate = false;
let checkAutomatically = true;
let firstCheck: ReturnType<typeof setTimeout> | undefined;
let interval: ReturnType<typeof setInterval> | undefined;
let notify: (status: UpdateStatus) => void = () => undefined;

function set(next: UpdateStatus): void {
  status = next;
  notify(status);
}

export function getUpdateStatus(): UpdateStatus {
  return status;
}

// Development builds only: an http(s) URL of a local test feed.
function testFeedUrl(): string | undefined {
  const value = app.isPackaged
    ? undefined
    : process.env.INTUNEDOC_UPDATE_TEST_FEED?.trim();
  if (!value) return undefined;
  try {
    return /^https?:$/.test(new URL(value).protocol) ? value : undefined;
  } catch {
    return undefined;
  }
}

// Packaged builds read the generic feed from app-update.yml, written by
// electron-builder, and ignore INTUNEDOC_UPDATE_TEST_FEED. That variable
// points a development build at a local feed for testing.
// With automatic updates off, an available update waits until the user
// chooses to download it. With automatic checks off, the app makes no
// update requests of its own; Check for updates still works. Automatic
// updates need automatic checks, so they only apply while both are on.
export function startUpdater(
  onStatus: (status: UpdateStatus) => void,
  automatic: boolean,
  checkAuto: boolean,
): void {
  notify = onStatus;
  autoUpdate = automatic;
  checkAutomatically = checkAuto;
  const testFeed = testFeedUrl();
  if (!app.isPackaged && !testFeed) {
    set({ state: "disabled", message: "Updates are checked in installed builds." });
    return;
  }
  enabled = true;
  if (testFeed) {
    autoUpdater.forceDevUpdateConfig = true;
    autoUpdater.setFeedURL({ provider: "generic", url: testFeed });
  }
  applyAutoDownload();
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
      message: autoUpdate && checkAutomatically
        ? "The update could not be downloaded. It will be retried later."
        : "The update could not be downloaded. Check for updates to try again.",
    });
  });

  if (checkAutomatically) scheduleChecks();
}

function applyAutoDownload(): void {
  const on = autoUpdate && checkAutomatically;
  autoUpdater.autoDownload = on;
  autoUpdater.autoInstallOnAppQuit = on;
}

// The first check runs shortly after start, then every four hours.
function scheduleChecks(): void {
  if (firstCheck || interval) return;
  firstCheck = setTimeout(() => {
    firstCheck = undefined;
    void checkForUpdates();
  }, FIRST_CHECK_MS);
  interval = setInterval(() => void checkForUpdates(), CHECK_INTERVAL_MS);
}

function clearChecks(): void {
  clearTimeout(firstCheck);
  clearInterval(interval);
  firstCheck = undefined;
  interval = undefined;
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

export async function downloadUpdate(): Promise<UpdateStatus> {
  if (!enabled || status.state !== "available") return status;
  log("info", "update download started", { version: status.version });
  set({ state: "downloading", version: status.version, percent: 0 });
  try {
    await autoUpdater.downloadUpdate();
  } catch (error) {
    // The error event reports the failure to the renderer.
    log("warn", "update download failed", { message: errorText(error) });
  }
  return status;
}

// Takes effect at once. Turning it on while an update waits starts the
// download.
export function setAutoUpdate(automatic: boolean): void {
  autoUpdate = automatic;
  if (!enabled) return;
  applyAutoDownload();
  if (autoUpdate && checkAutomatically) void downloadUpdate();
}

// Takes effect at once. Turning it off stops all background checks; turning
// it on schedules them again, and resumes automatic updates if they are on.
export function setCheckForUpdates(on: boolean): void {
  checkAutomatically = on;
  if (!enabled) return;
  applyAutoDownload();
  if (!on) {
    clearChecks();
    return;
  }
  scheduleChecks();
  if (autoUpdate) void downloadUpdate();
}

export function installUpdate(): boolean {
  if (status.state !== "ready") return false;
  log("info", "installing update", { version: status.version });
  // Silent on Windows: the assisted NSIS installer would otherwise show its
  // full wizard, license page included, for every update. Relaunch after.
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return true;
}
