import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("intunedoc", {
  authStatus: () => ipcRenderer.invoke("auth:status"),
  signInDeviceCode: () => ipcRenderer.invoke("auth:deviceCode"),
  signInInteractive: () => ipcRenderer.invoke("auth:interactive"),
  signOut: () => ipcRenderer.invoke("auth:signOut"),
  collectDeviceConfigurations: () =>
    ipcRenderer.invoke("collect:deviceConfigurations"),
  onDeviceCodePrompt: (callback: (prompt: unknown) => void) => {
    const listener = (_event: unknown, prompt: unknown) => callback(prompt);
    ipcRenderer.on("auth:deviceCodePrompt", listener);
    return () => {
      ipcRenderer.removeListener("auth:deviceCodePrompt", listener);
    };
  },
});
