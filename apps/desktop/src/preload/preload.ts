import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("intunedoc", {
  authStatus: () => ipcRenderer.invoke("auth:status"),
  signInInteractive: () => ipcRenderer.invoke("auth:interactive"),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
  collectDeviceConfigurations: () =>
    ipcRenderer.invoke("collect:deviceConfigurations"),
});
