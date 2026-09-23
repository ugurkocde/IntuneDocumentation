import type { IntunedocApi } from "../../shared/ipc-types";

declare global {
  interface Window {
    intunedoc: IntunedocApi;
  }
}

export const ipc: IntunedocApi = window.intunedoc;

// The preload already strips Electron's IPC prefix; this also covers errors
// raised inside the renderer (for example by the document generators).
export function errorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const clean = raw
    .replace(/^Error invoking remote method '[^']*':\s*/, "")
    .replace(/^(?:[A-Za-z]*Error:\s*)+/, "")
    .trim();
  return clean || "Something went wrong. Please try again.";
}

export const isMac = navigator.userAgent.includes("Mac OS X");
