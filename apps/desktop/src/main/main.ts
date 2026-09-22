import { app, BrowserWindow, ipcMain, shell } from "electron";
import path from "node:path";
import { AuthService } from "./auth";
import type { DeviceCodePrompt } from "./auth";
import { collectDeviceConfigurations } from "./collect";
import { loadAuthConfig } from "./config";

let auth: AuthService | null = null;
let mainWindow: BrowserWindow | null = null;

function getAuth(): AuthService {
  if (!auth) {
    auth = new AuthService(loadAuthConfig());
  }
  return auth;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 720,
    title: "Intune Documentation",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

ipcMain.handle("auth:status", () => getAuth().getStatus());

ipcMain.handle("auth:deviceCode", () => {
  const service = getAuth();
  return service.signInWithDeviceCode((prompt: DeviceCodePrompt) => {
    mainWindow?.webContents.send("auth:deviceCodePrompt", prompt);
  });
});

ipcMain.handle("auth:interactive", () => {
  const service = getAuth();
  return service.signInInteractive((url) => shell.openExternal(url));
});

ipcMain.handle("auth:signOut", () => {
  const service = getAuth();
  service.signOut();
  return service.getStatus();
});

ipcMain.handle("collect:deviceConfigurations", () => {
  const token = getAuth().getAccessToken();
  if (!token) {
    throw new Error("Sign in before collecting.");
  }
  return collectDeviceConfigurations(token);
});

void app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
