import { app } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { ScheduleHours } from "../shared/ipc-types";
import { DEFAULT_TENANT } from "./config";
import { isScheduleHours } from "./scheduler";

export interface AppSettings {
  clientId: string;
  tenantId: string;
  // Off unless the user turns it on, including installs from before the
  // setting existed.
  autoUpdate: boolean;
  // On unless the user turns it off, including installs from before the
  // setting existed. Off means no background update requests.
  checkForUpdates: boolean;
  // "Keep history on this computer". Off unless the user turns it on.
  keepHistory: boolean;
  // Scheduled collection interval in hours, 0 when off (the default).
  scheduleHours: ScheduleHours;
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
  return {
    clientId,
    tenantId,
    autoUpdate: input.autoUpdate === true,
    checkForUpdates: input.checkForUpdates !== false,
    keepHistory: input.keepHistory === true,
    scheduleHours: isScheduleHours(input.scheduleHours) ? input.scheduleHours : 0,
  };
}

export async function readSettings(): Promise<AppSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return normalize(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return normalize({});
  }
}

// Fields left out of the input keep their saved value.
export async function writeSettings(
  input: Partial<AppSettings>,
): Promise<AppSettings> {
  const clean = normalize({ ...(await readSettings()), ...input });
  await fs.writeFile(settingsPath(), JSON.stringify(clean, null, 2), "utf8");
  return clean;
}
