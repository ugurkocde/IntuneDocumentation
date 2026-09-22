import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("intunedoc", {
  authStatus: () => ipcRenderer.invoke("auth:status"),
  signInInteractive: () => ipcRenderer.invoke("auth:interactive"),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
  collectAll: () => ipcRenderer.invoke("collect:all"),
  prepareExport: () => ipcRenderer.invoke("export:prepare"),
  saveFile: (defaultName: string, bytes: Uint8Array) =>
    ipcRenderer.invoke("file:save", defaultName, bytes),
});
