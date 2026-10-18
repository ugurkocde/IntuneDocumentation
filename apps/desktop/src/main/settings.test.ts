import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dir = vi.hoisted(() => ({ current: "" }));

vi.mock("electron", () => ({
  app: { getPath: () => dir.current },
}));

vi.mock("./config", () => ({ DEFAULT_TENANT: "organizations" }));

const { readSettings, writeSettings } = await import("./settings");

function file(): string {
  return path.join(dir.current, "settings.json");
}

describe("settings", () => {
  beforeEach(() => {
    dir.current = mkdtempSync(path.join(tmpdir(), "intunedoc-settings-"));
  });

  afterEach(() => {
    rmSync(dir.current, { recursive: true, force: true });
  });

  it("turns automatic updates off without a settings file", async () => {
    expect((await readSettings()).autoUpdate).toBe(false);
  });

  it("turns automatic updates off for settings saved before the option existed", async () => {
    writeFileSync(
      file(),
      JSON.stringify({ clientId: "client", tenantId: "contoso.com" }),
    );

    expect(await readSettings()).toEqual({
      clientId: "client",
      tenantId: "contoso.com",
      autoUpdate: false,
      checkForUpdates: true,
      keepHistory: false,
      scheduleHours: 0,
    });
  });

  it("keeps automatic updates when the app registration is saved", async () => {
    await writeSettings({ autoUpdate: true });
    await writeSettings({ clientId: "client", tenantId: "" });

    expect(await readSettings()).toEqual({
      clientId: "client",
      tenantId: "organizations",
      autoUpdate: true,
      checkForUpdates: true,
      keepHistory: false,
      scheduleHours: 0,
    });
  });

  it("keeps the app registration when automatic updates change", async () => {
    await writeSettings({ clientId: "client", tenantId: "contoso.com" });
    await writeSettings({ autoUpdate: true });

    expect(JSON.parse(readFileSync(file(), "utf8"))).toEqual({
      clientId: "client",
      tenantId: "contoso.com",
      autoUpdate: true,
      checkForUpdates: true,
      keepHistory: false,
      scheduleHours: 0,
    });
  });

  it("checks for updates automatically without a settings file", async () => {
    expect((await readSettings()).checkForUpdates).toBe(true);
  });

  it("checks for updates automatically for settings saved before the option existed", async () => {
    writeFileSync(file(), JSON.stringify({ clientId: "client", autoUpdate: true }));

    expect((await readSettings()).checkForUpdates).toBe(true);
  });

  it("keeps automatic update checks off once turned off", async () => {
    await writeSettings({ checkForUpdates: false });
    await writeSettings({ clientId: "client", tenantId: "contoso.com" });
    await writeSettings({ autoUpdate: true });

    expect(await readSettings()).toEqual({
      clientId: "client",
      tenantId: "contoso.com",
      autoUpdate: true,
      checkForUpdates: false,
      keepHistory: false,
      scheduleHours: 0,
    });
  });

  it("keeps history off by default and keeps it when other settings change", async () => {
    expect((await readSettings()).keepHistory).toBe(false);
    writeFileSync(file(), JSON.stringify({ clientId: "client", keepHistory: "yes" }));
    expect((await readSettings()).keepHistory).toBe(false);
    await writeSettings({ keepHistory: true });
    await writeSettings({ clientId: "client", tenantId: "contoso.com" });
    await writeSettings({ autoUpdate: true });
    expect((await readSettings()).keepHistory).toBe(true);
  });

  it("keeps scheduled collection off by default and accepts only known intervals", async () => {
    expect((await readSettings()).scheduleHours).toBe(0);
    for (const value of [3, "6", -6, 6.5, null, true]) {
      writeFileSync(file(), JSON.stringify({ clientId: "client", scheduleHours: value }));
      expect((await readSettings()).scheduleHours).toBe(0);
    }
    for (const hours of [6, 12, 24] as const) {
      await writeSettings({ scheduleHours: hours });
      expect((await readSettings()).scheduleHours).toBe(hours);
    }
    await writeSettings({ clientId: "client", tenantId: "contoso.com" });
    expect((await readSettings()).scheduleHours).toBe(24);
    await writeSettings({ scheduleHours: 0 });
    expect((await readSettings()).scheduleHours).toBe(0);
  });
});
