import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthService } from "./auth";
import { collectAll } from "./collect";
import { DEFAULT_SCOPES } from "./config";
import { prepareExport } from "./export";
import { readSettings, writeSettings, type AppSettings } from "./settings";

let auth: AuthService | null = null;
let authKey = "";
let mainWindow: BrowserWindow | null = null;

function rendererUrl(): string {
  return pathToFileURL(path.join(__dirname, "../renderer/index.html")).href;
}

async function getAuth(): Promise<AuthService> {
  const settings = await readSettings();
  const clientId = settings.clientId || process.env.INTUNEDOC_CLIENT_ID || "";
  const tenantId =
    settings.tenantId || process.env.INTUNEDOC_TENANT_ID || "organizations";
  if (!clientId) {
    throw new Error(
      "Add your Entra app registration client id in Settings before signing in.",
    );
  }
  const key = `${clientId}|${tenantId}`;
  if (!auth || authKey !== key) {
    auth = new AuthService({ clientId, tenantId, scopes: [...DEFAULT_SCOPES] });
    authKey = key;
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
  const service = await getAuth();
  const token = await service.getAccessToken();
  if (!token) {
    throw new Error("Sign in before continuing.");
  }
  return token;
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
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

ipcMain.handle("settings:get", (event) => {
  assertTrustedSender(event);
  return readSettings();
});

ipcMain.handle("settings:save", async (event, input: Partial<AppSettings>) => {
  assertTrustedSender(event);
  const saved = await writeSettings(input);
  auth = null;
  authKey = "";
  return saved;
});

ipcMain.handle("auth:status", async (event) => {
  assertTrustedSender(event);
  return (await getAuth()).getStatus();
});

ipcMain.handle("auth:interactive", async (event) => {
  assertTrustedSender(event);
  return (await getAuth()).signInInteractive(openAuthUrl);
});

ipcMain.handle("auth:signOut", async (event) => {
  assertTrustedSender(event);
  const service = await getAuth();
  service.signOut();
  return service.getStatus();
});

ipcMain.handle("collect:all", async (event) => {
  assertTrustedSender(event);
  const token = await requireAccessToken();
  return collectAll(token, (progress) => {
    if (event.sender.isDestroyed()) return;
    event.sender.send("collect:progress", {
      step: progress.step,
      type: progress.type,
      current: progress.current,
      total: progress.total,
      message: progress.message,
    });
  });
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
