import { contextBridge, ipcRenderer } from "electron";
import type { IntunedocApi } from "../shared/ipc-types";

// Electron wraps handler errors as "Error invoking remote method 'x': Error:
// message". The renderer only ever sees the message.
function cleanMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(?:[A-Za-z]*Error:\s*)+/, "")
    .trim();
}

async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  try {
    return (await ipcRenderer.invoke(channel, ...args)) as T;
  } catch (error) {
    throw new Error(cleanMessage(error) || "Something went wrong.");
  }
}

function subscribe<T>(channel: string, callback: (payload: T) => void) {
  const listener = (_event: unknown, payload: T) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: IntunedocApi = {
  settingsGet: () => invoke("settings:get"),
  settingsSave: (settings) => invoke("settings:save", settings),
  authStatus: () => invoke("auth:status"),
  signInInteractive: (options) => invoke("auth:interactive", options ?? {}),
  signOut: () => invoke("auth:signOut"),
  validatePermissions: () => invoke("auth:validatePermissions"),
  collectAll: () => invoke("collect:all"),
  collectCancel: () => invoke("collect:cancel"),
  collectSectionItems: (key) => invoke("collect:sectionItems", key),
  collectLast: () => invoke("collect:last"),
  prepareExport: (options) => invoke("export:prepare", options),
  licenseStatus: () => invoke("license:status"),
  licenseSetKey: (key) => invoke("license:setKey", key),
  licenseDeactivate: () => invoke("license:deactivate"),
  licenseOpen: (target) => invoke("license:open", target),
  complianceAssess: (request) => invoke("compliance:assess", request),
  complianceSaveReport: (request) => invoke("compliance:saveReport", request),
  complianceSaveRecord: (request) => invoke("compliance:saveRecord", request),
  complianceOpenSource: (frameworkId) =>
    invoke("compliance:openSource", frameworkId),
  saveFile: (defaultName, bytes) => invoke("file:save", defaultName, bytes),
  openLastFile: (path) => invoke("file:openLast", path ?? null),
  showLastFileInFolder: (path) => invoke("file:showLastInFolder", path ?? null),
  copyText: (text) => invoke("system:copyText", text),
  appInfo: () => invoke("app:info"),
  openHelp: (key) => invoke("help:open", key),
  updateCheck: () => invoke("update:check"),
  updateInstall: () => invoke("update:install"),
  updateStatus: () => invoke("update:status"),
  exportDiagnostics: () => invoke("diagnostics:export"),
  clearLocalData: () => invoke("data:clear"),
  onCollectProgress: (callback) => subscribe("collect:progress", callback),
  onExportProgress: (callback) => subscribe("export:progress", callback),
  onComplianceProgress: (callback) =>
    subscribe("compliance:progress", callback),
  onLicenseChanged: (callback) => subscribe("license:changed", callback),
  onAuthChanged: (callback) => subscribe("auth:changed", callback),
  onUpdateStatus: (callback) => subscribe("update:status", callback),
  onMenuCommand: (callback) => subscribe("menu:command", callback),
};

contextBridge.exposeInMainWorld("intunedoc", api);
