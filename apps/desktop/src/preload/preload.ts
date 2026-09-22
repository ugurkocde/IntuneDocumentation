import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("intunedoc", {
  settingsGet: () => ipcRenderer.invoke("settings:get"),
  settingsSave: (settings: { clientId: string; tenantId: string }) =>
    ipcRenderer.invoke("settings:save", settings),
  authStatus: () => ipcRenderer.invoke("auth:status"),
  signInInteractive: () => ipcRenderer.invoke("auth:interactive"),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
  collectAll: () => ipcRenderer.invoke("collect:all"),
  collectCancel: () => ipcRenderer.invoke("collect:cancel"),
  prepareExport: () => ipcRenderer.invoke("export:prepare"),
  saveFile: (defaultName: string, bytes: Uint8Array) =>
    ipcRenderer.invoke("file:save", defaultName, bytes),
  onCollectProgress: (callback: (progress: unknown) => void) => {
    const listener = (_event: unknown, progress: unknown) => callback(progress);
    ipcRenderer.on("collect:progress", listener);
    return () => {
      ipcRenderer.removeListener("collect:progress", listener);
    };
  },
});
