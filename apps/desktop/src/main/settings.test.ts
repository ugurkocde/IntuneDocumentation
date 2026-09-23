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
    });
  });

  it("keeps automatic updates when the app registration is saved", async () => {
    await writeSettings({ autoUpdate: true });
    await writeSettings({ clientId: "client", tenantId: "" });

    expect(await readSettings()).toEqual({
      clientId: "client",
      tenantId: "organizations",
      autoUpdate: true,
    });
  });

  it("keeps the app registration when automatic updates change", async () => {
    await writeSettings({ clientId: "client", tenantId: "contoso.com" });
    await writeSettings({ autoUpdate: true });

    expect(JSON.parse(readFileSync(file(), "utf8"))).toEqual({
      clientId: "client",
      tenantId: "contoso.com",
      autoUpdate: true,
    });
  });
});
