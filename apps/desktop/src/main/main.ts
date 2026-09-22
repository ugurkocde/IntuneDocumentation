import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { IpcMainInvokeEvent } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { AuthService } from "./auth";
import { clearCollection, collectAll } from "./collect";
import { DEFAULT_SCOPES } from "./config";
import { prepareExport } from "./export";
import { readSettings, writeSettings, type AppSettings } from "./settings";

let auth: AuthService | null = null;
let authKey = "";
let mainWindow: BrowserWindow | null = null;
let activeCollection: AbortController | null = null;

const MAX_SAVE_BYTES = 300 * 1024 * 1024;

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

function cancelCollection(): void {
  activeCollection?.abort();
  activeCollection = null;
}

async function requireSession(): Promise<{ token: string; owner: string }> {
  const service = await getAuth();
  const token = await service.getAccessToken();
  const owner = service.getOwnerKey();
  if (!token || !owner) {
    throw new Error("Sign in before continuing.");
  }
  return { token, owner };
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 800,
    minWidth: 900,
    minHeight: 640,
    title: "Intune Documentation",
    backgroundColor: "#f1f5f3",
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
  cancelCollection();
  clearCollection();
  if (auth) {
    await auth.signOut();
  }
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
  cancelCollection();
  clearCollection();
  await service.signOut();
  return service.getStatus();
});

ipcMain.handle("collect:all", async (event) => {
  assertTrustedSender(event);
  const { token, owner } = await requireSession();
  cancelCollection();
  const controller = new AbortController();
  activeCollection = controller;
  try {
    return await collectAll(
      token,
      (progress) => {
        if (event.sender.isDestroyed()) return;
        event.sender.send("collect:progress", {
          step: progress.step,
          type: progress.type,
          current: progress.current,
          total: progress.total,
          message: progress.message,
        });
      },
      { owner, signal: controller.signal, budgetMs: 30 * 60_000 },
    );
  } finally {
    if (activeCollection === controller) {
      activeCollection = null;
    }
  }
});

ipcMain.handle("collect:cancel", (event) => {
  assertTrustedSender(event);
  cancelCollection();
  return true;
});

ipcMain.handle("export:prepare", async (event) => {
  assertTrustedSender(event);
  const { token, owner } = await requireSession();
  return prepareExport(token, owner);
});

ipcMain.handle(
  "file:save",
  async (event, defaultName: string, bytes: Uint8Array) => {
    assertTrustedSender(event);
    if (typeof defaultName !== "string" || !defaultName.trim()) {
      throw new Error("Invalid file name.");
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_SAVE_BYTES) {
      throw new Error("Invalid export payload.");
    }
    const options = { defaultPath: path.basename(defaultName) };
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
