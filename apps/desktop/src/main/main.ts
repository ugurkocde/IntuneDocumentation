import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthService } from "./auth";
import { collectAll } from "./collect";
import { loadAuthConfig } from "./config";
import { prepareExport } from "./export";

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

async function requireAccessToken(): Promise<string> {
  const token = await getAuth().getAccessToken();
  if (!token) {
    throw new Error("Sign in before continuing.");
  }
  return token;
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

ipcMain.handle("collect:all", async (event) => {
  assertTrustedSender(event);
  return collectAll(await requireAccessToken());
});

ipcMain.handle("export:prepare", async (event) => {
  assertTrustedSender(event);
  return prepareExport(await requireAccessToken());
});

ipcMain.handle(
  "file:save",
  async (event, defaultName: string, bytes: Uint8Array) => {
    assertTrustedSender(event);
    const options = { defaultPath: defaultName };
    const result = mainWindow
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) {
      return null;
    }
    await fs.writeFile(result.filePath, Buffer.from(bytes));
    return result.filePath;
  },
);

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
