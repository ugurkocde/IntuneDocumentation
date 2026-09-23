import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_TENANT } from "./config";

export interface AppSettings {
  clientId: string;
  tenantId: string;
}

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function normalize(input: Partial<AppSettings>): AppSettings {
  const clientId =
    typeof input.clientId === "string" ? input.clientId.trim() : "";
  const tenantId =
    typeof input.tenantId === "string" && input.tenantId.trim()
      ? input.tenantId.trim()
      : DEFAULT_TENANT;
  return { clientId, tenantId };
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return normalize(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return { clientId: "", tenantId: DEFAULT_TENANT };
  }
}

export async function writeSettings(
  input: Partial<AppSettings>,
): Promise<AppSettings> {
  const clean = normalize(input);
  await fs.writeFile(settingsPath(), JSON.stringify(clean, null, 2), "utf8");
  return clean;
}
