import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  session,
  shell,
} from "electron";
import type {
  IpcMainInvokeEvent,
  MenuItemConstructorOptions,
} from "electron";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type {
  AppInfo,
  HelpKey,
  MenuCommand,
  UpdateStatus,
} from "../shared/ipc-types";
import { localDateStamp } from "../shared/dates";
import { parseExportScope } from "../shared/export-scope";
import { isGuid, isTenantIdentifier } from "../shared/validators";
import { AuthService } from "./auth";
import {
  clearCollection,
  collectAll,
  getLastCollection,
  getLastSummary,
  getSectionItems,
} from "./collect";
import {
  DEFAULT_SCOPES,
  HELP_URLS,
  LICENSE_BUY_URL,
  LICENSE_PORTAL_URL,
  WEBSITE_URL,
} from "./config";
import {
  complianceRecord,
  complianceReport,
  complianceView,
  frameworkSourceUrl,
  parseComplianceRequest,
} from "./compliance";
import { estimateScopedExport, prepareExport } from "./export";
import { LicenseService } from "./license";
import { errorText, log, tailLog } from "./logger";
import { readSettings, writeSettings, type AppSettings } from "./settings";
import {
  checkForUpdates,
  downloadUpdate,
  getUpdateStatus,
  installUpdate,
  setAutoUpdate,
  setCheckForUpdates,
  startUpdater,
} from "./updater";
import {
  DEFAULT_BOUNDS,
  loadWindowState,
  MIN_SIZE,
  trackWindowState,
} from "./window-state";

let auth: AuthService | null = null;
let authKey = "";
let mainWindow: BrowserWindow | null = null;
let activeCollection: AbortController | null = null;
let preparingExports = 0;
let writingReports = 0;
let assessingCompliance = 0;
let lastSavedExportPath: string | null = null;
// Every path this session saved; open and reveal accept nothing else.
const savedExportPaths = new Set<string>();

const MAX_SAVE_BYTES = 300 * 1024 * 1024;
const MAX_CLIPBOARD_CHARS = 4096;
const LICENSE_REFRESH_MS = 6 * 60 * 60_000;
// ID tokens and the app registration only for the signed in tenant: other
// cached tenants keep their organization license token until it expires.
const license = new LicenseService(
  async (tenantId) =>
    auth && signedInTenant()?.toLowerCase() === tenantId
      ? auth.getIdToken()
      : null,
  (tenantId) =>
    auth && signedInTenant()?.toLowerCase() === tenantId
      ? (authKey.split("|")[0] ?? null)
      : null,
);
const isMac = process.platform === "darwin";

function rendererUrl(): string {
  return pathToFileURL(path.join(__dirname, "../renderer/index.html")).href;
}

function iconPath(): string {
  return path.join(__dirname, "../icon.png");
}

function broadcast(channel: string, payload: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function sendMenuCommand(command: MenuCommand): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    mainWindow?.webContents.once("did-finish-load", () =>
      broadcast("menu:command", command),
    );
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
  broadcast("menu:command", command);
}

// Development builds may take the app registration from the environment.
// Installed builds use Settings only.
function devOverride(
  name: string,
  valid: (value: string) => boolean,
): string | undefined {
  const value = app.isPackaged ? undefined : process.env[name]?.trim();
  return value && valid(value) ? value : undefined;
}

async function getAuth(): Promise<AuthService> {
  const settings = await readSettings();
  const clientId =
    settings.clientId || devOverride("INTUNEDOC_CLIENT_ID", isGuid) || "";
  const tenantId =
    settings.tenantId ||
    devOverride("INTUNEDOC_TENANT_ID", isTenantIdentifier) ||
    "organizations";
  if (!clientId) {
    throw new Error(
      "Add your Entra app registration client ID in Settings before signing in.",
    );
  }
  const key = `${clientId}|${tenantId}`;
  if (!auth || authKey !== key) {
    const service: AuthService = new AuthService(
      { clientId, tenantId, scopes: [...DEFAULT_SCOPES] },
      (status) => {
        if (auth !== service) return;
        log("info", "auth changed", { signedIn: status.signedIn });
        broadcast("auth:changed", status);
        pushLicense();
      },
    );
    auth = service;
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

// Every handler checks the sender before doing anything else.
function handle(
  channel: string,
  listener: (event: IpcMainInvokeEvent, ...args: unknown[]) => unknown,
): void {
  ipcMain.handle(channel, (event, ...args: unknown[]) => {
    assertTrustedSender(event);
    return listener(event, ...args);
  });
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

// A sign-in could switch the account while work for the current one runs.
function runningWork(): string | null {
  if (activeCollection) return "a collection";
  if (preparingExports > 0) return "an export";
  if (writingReports > 0) return "an evidence report";
  if (assessingCompliance > 0) return "a compliance assessment";
  return null;
}

function cancelCollection(): void {
  activeCollection?.abort();
  activeCollection = null;
}

async function requireOwner(): Promise<string> {
  const service = await getAuth();
  const owner = service.getOwnerKey();
  if (!owner || !(await service.getAccessToken())) {
    throw new Error("Sign in before continuing.");
  }
  return owner;
}

function signedInTenant(): string | null {
  const status = auth?.getStatus();
  return status?.signedIn ? status.tenantId : null;
}

// Entitlement is checked here, in the privileged handlers, before an
// operation starts. A run that has started completes even if the license
// lapses meanwhile.
async function requireLicense(): Promise<void> {
  await license.requireEntitlement(signedInTenant());
}

async function tokenProvider(): Promise<string> {
  const service = await getAuth();
  const token = await service.getAccessToken();
  if (!token) {
    throw new Error("Sign in before continuing.");
  }
  return token;
}

function pushLicense(): void {
  void license
    .status(signedInTenant())
    .then((status) => broadcast("license:changed", status))
    .catch(() => undefined);
}

async function refreshLicenses(): Promise<void> {
  await license.refreshAll().catch(() => undefined);
  pushLicense();
}

// One filter per file type, so Windows lists "Word document (*.docx)" rather
// than "All Files (*.*)" and macOS appends the extension itself.
const SAVE_FORMATS = {
  docx: "Word document",
  pdf: "PDF",
  json: "JSON",
  txt: "Text",
} as const;
type SaveFormat = keyof typeof SAVE_FORMATS;
const KNOWN_DOCUMENT_EXTENSIONS = new Set<string>([
  ...Object.keys(SAVE_FORMATS),
  "doc",
  "rtf",
  "odt",
  "htm",
  "html",
  "csv",
  "xml",
]);

function saveFormatOf(fileName: string): SaveFormat | null {
  const ext = path.extname(fileName).slice(1).toLowerCase();
  return Object.hasOwn(SAVE_FORMATS, ext) ? (ext as SaveFormat) : null;
}

async function fileExists(target: string): Promise<boolean> {
  return fs.access(target).then(
    () => true,
    () => false,
  );
}

// Shows the save dialog and returns a path that always ends with the format's
// extension, also when the user removed it from the name. The dialog only
// asked about replacing the name as typed, so a completed name that already
// exists is confirmed here.
async function chooseSavePath(
  defaultName: string,
  folder: "documents" | "downloads",
): Promise<string | null> {
  const name = path.basename(defaultName);
  const format = saveFormatOf(name);
  if (!format) {
    throw new Error("Unsupported file type.");
  }
  const options = {
    defaultPath: path.join(app.getPath(folder), name),
    filters: [{ name: SAVE_FORMATS[format], extensions: [format] }],
  };
  const result = mainWindow
    ? await dialog.showSaveDialog(mainWindow, options)
    : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) {
    return null;
  }
  const extension = `.${format}`;
  if (path.extname(result.filePath).toLowerCase() === extension) {
    return result.filePath;
  }
  // A known document extension that does not match the chosen format is
  // replaced ("name.txt" becomes "name.pdf"); other dots stay in the name.
  const typed = result.filePath.replace(/\.+$/, "");
  const typedExt = path.extname(typed).slice(1).toLowerCase();
  const stem = KNOWN_DOCUMENT_EXTENSIONS.has(typedExt)
    ? typed.slice(0, -(typedExt.length + 1))
    : typed;
  const completed = `${stem}${extension}`;
  if (await fileExists(completed)) {
    const confirm = {
      type: "warning" as const,
      buttons: ["Replace", "Cancel"],
      defaultId: 1,
      cancelId: 1,
      message: `"${path.basename(completed)}" already exists. Do you want to replace it?`,
    };
    const answer = mainWindow
      ? await dialog.showMessageBox(mainWindow, confirm)
      : await dialog.showMessageBox(confirm);
    if (answer.response !== 0) return null;
  }
  return completed;
}

async function saveWithDialog(
  defaultName: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const target = await chooseSavePath(defaultName, "documents");
  if (!target) {
    return null;
  }
  await fs.writeFile(target, Buffer.from(bytes));
  lastSavedExportPath = target;
  savedExportPaths.add(target);
  log("info", "export saved", {
    format: path.extname(target).slice(1),
    bytes: bytes.byteLength,
  });
  return target;
}

function savedPath(requested: unknown): string | null {
  if (typeof requested === "string") {
    return savedExportPaths.has(requested) ? requested : null;
  }
  return lastSavedExportPath;
}

async function exportDiagnostics(): Promise<string | null> {
  const target = await chooseSavePath(
    `Intune-Documentation-diagnostics-${localDateStamp()}.txt`,
    "downloads",
  );
  if (!target) return null;

  const settings = await readSettings();
  const status = await license.status(signedInTenant());
  const collection = getLastCollection();
  const update = getUpdateStatus();
  const lines = [
    "Intune Documentation diagnostics",
    `Generated: ${new Date().toISOString()}`,
    "",
    `App version: ${app.getVersion()}`,
    `Packaged: ${app.isPackaged ? "yes" : "no"}`,
    `Electron: ${process.versions.electron}`,
    `Chrome: ${process.versions.chrome}`,
    `OS: ${process.platform} ${os.release()} (${os.version()})`,
    `Architecture: ${process.arch}`,
    "",
    `Client ID configured: ${settings.clientId ? "yes" : "no"}`,
    `Tenant ID setting: ${settings.tenantId}`,
    `Signed in: ${signedInTenant() ? "yes" : "no"}`,
    `Signed in tenant: ${signedInTenant() ?? "none"}`,
    "",
    `License key present: ${status.hasKey ? "yes" : "no"}`,
    `License stored securely: ${status.persisted ? "yes" : "no"}`,
    `License entitled: ${status.entitled ? "yes" : "no"}`,
    `License plan: ${status.plan ?? "none"}`,
    `License tenants allowed: ${status.tenants ?? "none"}`,
    `License verified until: ${status.expiresAt ?? "none"}`,
    `License message: ${status.message ?? "none"}`,
    "",
    `Update status: ${update.state}${update.version ? ` ${update.version}` : ""}`,
    `Automatic updates: ${settings.autoUpdate ? "on" : "off"}`,
    `Automatic update checks: ${settings.checkForUpdates ? "on" : "off"}`,
    "",
    `Last collection: ${collection ? collection.collectedAt : "none"}`,
    ...(collection
      ? [
          `Collected items: ${collection.summary.totalConfigurations}`,
          `Sections: ${collection.sections.length}`,
          `Fetch warnings: ${collection.fetchErrors.length}`,
          `Permission gaps: ${collection.permissionErrors.length}`,
        ]
      : []),
    "",
    "Log (last 500 lines)",
    "",
    tailLog(500),
    "",
  ];
  await fs.writeFile(target, lines.join("\n"), "utf8");
  log("info", "diagnostics exported");
  return target;
}

// Everything the app keeps in userData, apart from Chromium's own storage.
const LOCAL_DATA = [
  "settings.json",
  "license.bin",
  "install-id",
  "window-state.json",
  "logs",
];

async function clearLocalData(): Promise<void> {
  log("info", "clearing local data");
  cancelCollection();
  clearCollection();
  const released = await license.deactivate().then(
    () => true,
    (error: unknown) => {
      log("warn", "license deactivation during reset failed", {
        message: errorText(error),
      });
      return false;
    },
  );
  if (auth) await auth.signOut().catch(() => undefined);
  auth = null;
  authKey = "";
  const userData = app.getPath("userData");
  await Promise.all(
    LOCAL_DATA.map((name) =>
      fs.rm(path.join(userData, name), { recursive: true, force: true }),
    ),
  );
  await session.defaultSession.clearStorageData({ storages: ["localstorage"] });
  if (!released) await explainUnreleasedActivation();
  app.relaunch();
  app.exit(0);
}

// The local data is gone either way; the activation may still count against
// the license until it is released in the customer portal.
async function explainUnreleasedActivation(): Promise<void> {
  const notice = {
    type: "warning" as const,
    buttons: ["Open customer portal", "Continue"],
    defaultId: 1,
    cancelId: 1,
    message: "The license could not be deactivated",
    detail:
      "The licensing service did not confirm the deactivation, so this machine may still use one of your license's activations. You can release it in the customer portal.",
  };
  const answer = mainWindow
    ? await dialog.showMessageBox(mainWindow, notice)
    : await dialog.showMessageBox(notice);
  if (answer.response === 0 && new URL(LICENSE_PORTAL_URL).protocol === "https:") {
    await shell.openExternal(LICENSE_PORTAL_URL).catch(() => undefined);
  }
}

function buildMenu(): void {
  const checkUpdates = () => sendMenuCommand("check-updates");
  const openSettings = () => sendMenuCommand("open-settings");
  const diagnostics = () =>
    void exportDiagnostics().catch((error: unknown) =>
      log("error", "diagnostics export failed", { message: errorText(error) }),
    );
  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: "Intune Documentation",
            submenu: [
              { role: "about", label: "About Intune Documentation" },
              { label: "Check for Updates...", click: checkUpdates },
              { type: "separator" },
              {
                label: "Settings...",
                accelerator: "CmdOrCtrl+,",
                click: openSettings,
              },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide", label: "Hide Intune Documentation" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit", label: "Quit Intune Documentation" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]
      : [
          {
            label: "File",
            submenu: [
              {
                label: "Settings...",
                accelerator: "CmdOrCtrl+,",
                click: openSettings,
              },
              { label: "Check for Updates...", click: checkUpdates },
              { type: "separator" },
              { role: "quit", label: "Exit" },
            ],
          } satisfies MenuItemConstructorOptions,
        ]),
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        ...(app.isPackaged
          ? []
          : ([
              { role: "reload" },
              { role: "toggleDevTools" },
              { type: "separator" },
            ] satisfies MenuItemConstructorOptions[])),
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Getting started",
          click: () => void shell.openExternal(HELP_URLS.gettingStarted),
        },
        {
          label: "Support",
          click: () => void shell.openExternal(HELP_URLS.support),
        },
        { type: "separator" },
        { label: "Export diagnostics...", click: diagnostics },
        ...(isMac
          ? []
          : ([
              { type: "separator" },
              {
                label: "About Intune Documentation",
                click: () => app.showAboutPanel(),
              },
            ] satisfies MenuItemConstructorOptions[])),
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow(): void {
  const saved = loadWindowState();
  mainWindow = new BrowserWindow({
    ...(saved?.bounds ?? DEFAULT_BOUNDS),
    minWidth: MIN_SIZE.width,
    minHeight: MIN_SIZE.height,
    title: "Intune Documentation",
    backgroundColor: "#f1f5f3",
    show: false,
    ...(isMac
      ? {
          titleBarStyle: "hiddenInset" as const,
          trafficLightPosition: { x: 18, y: 18 },
        }
      : { icon: iconPath() }),
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  if (saved?.maximized) mainWindow.maximize();
  trackWindowState(mainWindow);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== rendererUrl()) {
      event.preventDefault();
    }
  });
  // Subframes never navigate, and nothing redirects.
  mainWindow.webContents.on("will-frame-navigate", (event) => {
    if (!event.isMainFrame) event.preventDefault();
  });
  mainWindow.webContents.on("will-redirect", (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);

  void mainWindow.loadFile(path.join(__dirname, "../renderer/index.html"));
}

function registerIpc(): void {
  handle("settings:get", () => readSettings());

  handle("settings:save", async (_event, input) => {
    const raw = (input ?? {}) as Partial<AppSettings>;
    const clientId = typeof raw.clientId === "string" ? raw.clientId.trim() : "";
    const tenantId = typeof raw.tenantId === "string" ? raw.tenantId.trim() : "";
    if (!isGuid(clientId)) {
      throw new Error(
        "The client ID must be the Application (client) ID of your app registration.",
      );
    }
    if (tenantId && !isTenantIdentifier(tenantId)) {
      throw new Error(
        "The tenant ID must be a Directory (tenant) ID or a verified domain.",
      );
    }
    const saved = await writeSettings({ clientId, tenantId });
    cancelCollection();
    clearCollection();
    if (auth) {
      await auth.signOut();
    }
    auth = null;
    authKey = "";
    log("info", "settings saved");
    return saved;
  });

  // A session whose refresh failed earlier recovers here when the silent
  // refresh works again, without a new interactive sign-in.
  handle("auth:status", async () => {
    const service = await getAuth();
    if (!service.getStatus().signedIn && service.getOwnerKey()) {
      await service.getAccessToken();
    }
    return service.getStatus();
  });

  handle("auth:interactive", async (_event, options) => {
    const work = runningWork();
    if (work) {
      throw new Error(`Sign in when ${work} has finished.`);
    }
    const consent =
      typeof options === "object" &&
      options !== null &&
      (options as { consent?: unknown }).consent === true;
    try {
      // Work may have started while the browser sign-in was open. It reads
      // tokens from the current account, so the account must not change now.
      const result = await (await getAuth()).signInInteractive(openAuthUrl, {
        consent,
        blockedBy: () => {
          const busy = runningWork();
          return busy
            ? `The sign-in was not applied because ${busy} started meanwhile. Sign in again when it has finished.`
            : null;
        },
      });
      log("info", "signed in", { consent });
      await license.activateForTenant(result.tenantId);
      return result;
    } catch (error) {
      log("warn", "sign in failed", { consent });
      throw error;
    } finally {
      pushLicense();
    }
  });

  handle("auth:signOut", async () => {
    const service = await getAuth();
    cancelCollection();
    clearCollection();
    await service.signOut();
    log("info", "signed out");
    pushLicense();
    return service.getStatus();
  });

  handle("auth:validatePermissions", async () => {
    const granted = await (await getAuth()).grantedScopes();
    if (!granted) {
      throw new Error("Sign in before checking permissions.");
    }
    const lower = new Set(granted.map((scope) => scope.toLowerCase()));
    return {
      granted: DEFAULT_SCOPES.filter((scope) => lower.has(scope.toLowerCase())),
      missing: DEFAULT_SCOPES.filter((scope) => !lower.has(scope.toLowerCase())),
    };
  });

  handle("collect:all", async (event) => {
    const owner = await requireOwner();
    await requireLicense();
    cancelCollection();
    const controller = new AbortController();
    activeCollection = controller;
    const started = Date.now();
    log("info", "collection started");
    try {
      const summary = await collectAll(
        tokenProvider,
        (progress, loaded) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send("collect:progress", {
            step: progress.step,
            type: progress.type,
            current: progress.current,
            total: progress.total,
            message: progress.message,
            loaded,
          });
        },
        { owner, signal: controller.signal, budgetMs: 30 * 60_000 },
      );
      log("info", "collection finished", {
        items: summary.totalConfigurations,
        sections: summary.sectionCounts.length,
        fetchErrors: summary.fetchErrors.length,
        permissionErrors: summary.permissionErrors.length,
        seconds: Math.round((Date.now() - started) / 1000),
      });
      return summary;
    } catch (error) {
      log("warn", "collection failed", { message: errorText(error) });
      throw error;
    } finally {
      if (activeCollection === controller) {
        activeCollection = null;
      }
      pushLicense();
    }
  });

  handle("collect:cancel", () => {
    cancelCollection();
    log("info", "collection cancelled");
    return true;
  });

  handle("collect:last", () => getLastSummary(auth?.getOwnerKey() ?? null));

  handle("collect:sectionItems", (_event, key) => {
    if (typeof key !== "string" || key.length > 200) {
      throw new Error("Unknown section.");
    }
    return getSectionItems(key, auth?.getOwnerKey() ?? null);
  });

  // Configuration exports never include compliance evidence, whatever the
  // renderer sends. A scope limits the export to items of the collection.
  handle("export:prepare", async (event, options) => {
    const scope = parseExportScope(
      typeof options === "object" && options !== null
        ? (options as { scope?: unknown }).scope
        : undefined,
    );
    preparingExports += 1;
    try {
      const owner = await requireOwner();
      await requireLicense();
      log("info", "export prepare started", {
        scoped: scope !== null,
        items: scope?.length ?? null,
      });
      return await prepareExport(
        tokenProvider,
        owner,
        scope,
        (progress) => {
          if (event.sender.isDestroyed()) return;
          event.sender.send("export:progress", {
            stage: progress.stage,
            message: progress.message,
          });
        },
      );
    } catch (error) {
      log("warn", "export prepare failed", { message: errorText(error) });
      throw error;
    } finally {
      preparingExports -= 1;
      pushLicense();
    }
  });

  handle("export:estimate", (_event, input) => {
    const scope = parseExportScope(input);
    if (!scope) throw new Error("Choose at least one configuration to export.");
    const owner = auth?.getOwnerKey() ?? null;
    if (!owner) throw new Error("Sign in before continuing.");
    return estimateScopedExport(owner, scope);
  });

  // The assessment feeds the evidence report, so it is licensed like an export.
  handle("compliance:assess", async (_event, input) => {
    const request = parseComplianceRequest(input, false);
    assessingCompliance += 1;
    try {
      const owner = await requireOwner();
      await requireLicense();
      return await complianceView(owner, tokenProvider, request);
    } finally {
      assessingCompliance -= 1;
    }
  });

  handle("compliance:saveReport", async (event, input) => {
    const request = parseComplianceRequest(input, true);
    const frameworkId = request.frameworkId;
    if (!frameworkId) throw new Error("Choose a compliance framework first.");
    writingReports += 1;
    try {
      const owner = await requireOwner();
      await requireLicense();
      log("info", "compliance report started", { frameworkId });
      const report = await complianceReport(
        owner,
        tokenProvider,
        { ...request, frameworkId },
        signedInTenant(),
        (progress) => {
          if (!event.sender.isDestroyed()) {
            event.sender.send("compliance:progress", progress);
          }
        },
      );
      if (!event.sender.isDestroyed()) {
        event.sender.send("compliance:progress", { stage: "saving" });
      }
      return await saveWithDialog(report.fileName, report.bytes);
    } catch (error) {
      log("warn", "compliance report failed", { message: errorText(error) });
      throw error;
    } finally {
      writingReports -= 1;
      pushLicense();
    }
  });

  handle("compliance:saveRecord", async (_event, input) => {
    const request = parseComplianceRequest(input, false);
    writingReports += 1;
    try {
      const owner = await requireOwner();
      await requireLicense();
      const record = await complianceRecord(owner, tokenProvider, request);
      return await saveWithDialog(record.fileName, record.bytes);
    } finally {
      writingReports -= 1;
    }
  });

  handle("compliance:openSource", async (_event, frameworkId) => {
    await shell.openExternal(frameworkSourceUrl(frameworkId));
    return true;
  });

  handle("license:status", () => license.status(signedInTenant()));

  handle("license:setKey", async (_event, key) => {
    if (typeof key !== "string" || key.length > 256) {
      throw new Error("Enter a valid license key.");
    }
    try {
      return await license.setKey(key, signedInTenant());
    } finally {
      pushLicense();
    }
  });

  // Retries activation for the signed in tenant after a failed attempt.
  handle("license:retry", async () => {
    try {
      await license.activateForTenant(signedInTenant());
      return await license.status(signedInTenant());
    } finally {
      pushLicense();
    }
  });

  handle("license:setShared", async (_event, shared) => {
    if (typeof shared !== "boolean") {
      throw new Error("Choose whether to share the license.");
    }
    try {
      return await license.setShared(signedInTenant(), shared);
    } finally {
      pushLicense();
    }
  });

  handle("license:deactivate", async () => {
    try {
      return await license.deactivate();
    } finally {
      pushLicense();
    }
  });

  handle("license:open", async (_event, target) => {
    const url =
      target === "buy"
        ? LICENSE_BUY_URL
        : target === "portal"
          ? LICENSE_PORTAL_URL
          : null;
    if (!url || new URL(url).protocol !== "https:") {
      throw new Error("Refused to open an unexpected link.");
    }
    await shell.openExternal(url);
    return true;
  });

  handle("file:save", async (_event, defaultName, bytes) => {
    if (typeof defaultName !== "string" || !defaultName.trim()) {
      throw new Error("Invalid file name.");
    }
    const format = saveFormatOf(defaultName);
    if (format !== "docx" && format !== "pdf") {
      throw new Error("Invalid file name.");
    }
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > MAX_SAVE_BYTES) {
      throw new Error("Invalid export payload.");
    }
    return saveWithDialog(defaultName, bytes);
  });

  handle("file:openLast", async (_event, requested) => {
    const target = savedPath(requested);
    if (!target) return false;
    const failure = await shell.openPath(target);
    if (failure) {
      throw new Error("The file could not be opened. It may have been moved.");
    }
    return true;
  });

  handle("file:showLastInFolder", (_event, requested) => {
    const target = savedPath(requested);
    if (!target) return false;
    shell.showItemInFolder(target);
    return true;
  });

  handle("system:copyText", (_event, text) => {
    if (typeof text !== "string") return false;
    clipboard.writeText(text.slice(0, MAX_CLIPBOARD_CHARS));
    return true;
  });

  handle(
    "app:info",
    (): AppInfo => ({
      version: app.getVersion(),
      electron: process.versions.electron ?? "",
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
    }),
  );

  handle("help:open", async (_event, key) => {
    if (typeof key !== "string" || !Object.hasOwn(HELP_URLS, key)) {
      throw new Error("Refused to open an unexpected link.");
    }
    await shell.openExternal(HELP_URLS[key as HelpKey]);
    return true;
  });

  handle("update:status", () => getUpdateStatus());
  handle("update:check", () => checkForUpdates());
  handle("update:download", () => downloadUpdate());
  handle("update:install", () => installUpdate());
  handle("update:setAuto", async (_event, enabled) => {
    if (typeof enabled !== "boolean") {
      throw new Error("Refused an unexpected update setting.");
    }
    const saved = await writeSettings({ autoUpdate: enabled });
    setAutoUpdate(saved.autoUpdate);
    log("info", "automatic updates changed", { enabled: saved.autoUpdate });
    return saved;
  });
  handle("update:setCheck", async (_event, enabled) => {
    if (typeof enabled !== "boolean") {
      throw new Error("Refused an unexpected update setting.");
    }
    const saved = await writeSettings({ checkForUpdates: enabled });
    setCheckForUpdates(saved.checkForUpdates);
    log("info", "automatic update checks changed", {
      enabled: saved.checkForUpdates,
    });
    return saved;
  });

  handle("diagnostics:export", () => exportDiagnostics());

  handle("data:clear", async () => {
    await clearLocalData();
    return true;
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });

  registerIpc();

  void app.whenReady().then(() => {
    log("info", "app started", {
      version: app.getVersion(),
      platform: process.platform,
      arch: process.arch,
      packaged: app.isPackaged,
    });
    app.setAboutPanelOptions({
      applicationName: "Intune Documentation",
      applicationVersion: app.getVersion(),
      version: "",
      copyright: `Copyright ${new Date().getFullYear()} Ugurlabs`,
      website: WEBSITE_URL,
      ...(isMac ? {} : { iconPath: iconPath() }),
    });
    if (isMac && !app.isPackaged) {
      app.dock?.setIcon(iconPath());
    }
    buildMenu();
    createWindow();
    void readSettings().then((settings) =>
      startUpdater(
        (status: UpdateStatus) => broadcast("update:status", status),
        settings.autoUpdate,
        settings.checkForUpdates,
      ),
    );
    void refreshLicenses();
    setInterval(() => void refreshLicenses(), LICENSE_REFRESH_MS);
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on("window-all-closed", () => {
    if (!isMac) {
      app.quit();
    }
  });
}
