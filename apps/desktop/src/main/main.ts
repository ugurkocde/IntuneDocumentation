import { app, BrowserWindow, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthService } from "./auth";
import type { DeviceCodePrompt } from "./auth";
import { collectDeviceConfigurations } from "./collect";
import { loadAuthConfig } from "./config";

let auth: AuthService | null = null;
let mainWindow: BrowserWindow | null = null;

function rendererUrl(): string {
  return pathToFileURL(path.join(__dirname, "../renderer/index.html")).href;
}

function getAuth(): AuthService {
  if (!auth) {
    auth = new AuthService(loadAuthConfig());
  }
  return auth;
}

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  const frame = event.senderFrame;
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    !frame ||
    frame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error("Rejected IPC from an untrusted sender.");
  }
}

async function openAuthUrl(url: string): Promise<void> {
  const parsed = new URL(url);
  if (
    parsed.protocol !== "https:" ||
    parsed.hostname !== "login.microsoftonline.com"
  ) {
    throw new Error("Refused to open an unexpected sign-in URL.");
  }
  await shell.openExternal(url);
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

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== rendererUrl()) {
      event.preventDefault();
    }
  });
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );

  void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

ipcMain.handle("auth:status", (event) => {
  assertTrustedSender(event);
  return getAuth().getStatus();
});

ipcMain.handle("auth:deviceCode", (event) => {
  assertTrustedSender(event);
  const service = getAuth();
  return service.signInWithDeviceCode((prompt: DeviceCodePrompt) => {
    mainWindow?.webContents.send("auth:deviceCodePrompt", prompt);
  });
});

ipcMain.handle("auth:interactive", (event) => {
  assertTrustedSender(event);
  return getAuth().signInInteractive(openAuthUrl);
});

ipcMain.handle("auth:signOut", (event) => {
  assertTrustedSender(event);
  const service = getAuth();
  service.signOut();
  return service.getStatus();
});

ipcMain.handle("collect:deviceConfigurations", async (event) => {
  assertTrustedSender(event);
  const token = await getAuth().getAccessToken();
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
