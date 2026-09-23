import { app } from "electron";
import {
  appendFileSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import path from "node:path";

// Small file logger. Never pass tokens, license keys or tenant configuration.
const MAX_BYTES = 1024 * 1024;

let size = -1;

function logDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

export function logFilePath(): string {
  return path.join(logDir(), "main.log");
}

function rotate(file: string): void {
  const old = path.join(logDir(), "main.old.log");
  rmSync(old, { force: true });
  renameSync(file, old);
  size = 0;
}

export function log(
  level: "info" | "warn" | "error",
  message: string,
  detail?: Record<string, string | number | boolean | null | undefined>,
): void {
  const suffix = detail
    ? " " +
      Object.entries(detail)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(" ")
    : "";
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${message}${suffix}\n`;
  try {
    const file = logFilePath();
    if (size < 0) {
      mkdirSync(logDir(), { recursive: true });
      size = (() => {
        try {
          return statSync(file).size;
        } catch {
          return 0;
        }
      })();
    }
    if (size + line.length > MAX_BYTES) {
      rotate(file);
    }
    appendFileSync(file, line, "utf8");
    size += Buffer.byteLength(line);
  } catch {
    // Logging must never break the app.
  }
}

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function tailLog(lines: number): string {
  const read = (file: string) => {
    try {
      return readFileSync(file, "utf8");
    } catch {
      return "";
    }
  };
  const combined =
    read(path.join(logDir(), "main.old.log")) + read(logFilePath());
  return combined.split("\n").filter(Boolean).slice(-lines).join("\n");
}
