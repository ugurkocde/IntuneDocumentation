import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import { generateDetailedDOCX } from "../../../../src/lib/docx-generator-detailed";
import { generateDetailedPDF } from "../../../../src/lib/pdf-generator-detailed";

interface AppSettings {
  clientId: string;
  tenantId: string;
}

interface AuthStatus {
  signedIn: boolean;
  account: string | null;
  expiresOn: string | null;
}

interface SignInResult {
  account: string;
  expiresOn: string | null;
}

interface FullCollectionSummary {
  collectedAt: string;
  totalConfigurations: number;
  sectionCounts: Array<{ label: string; count: number }>;
  fetchErrors: number;
  permissionErrors: number;
}

interface CollectProgress {
  step: string;
  type: string;
  current?: number;
  total?: number;
  message?: string;
}

interface IntunedocApi {
  settingsGet(): Promise<AppSettings>;
  settingsSave(settings: AppSettings): Promise<AppSettings>;
  authStatus(): Promise<AuthStatus>;
  signInInteractive(): Promise<SignInResult>;
  signOut(): Promise<AuthStatus>;
  collectAll(): Promise<FullCollectionSummary>;
  prepareExport(): Promise<DetailedExportData>;
  saveFile(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  onCollectProgress(callback: (progress: CollectProgress) => void): () => void;
}

declare global {
  interface Window {
    intunedoc: IntunedocApi;
  }
}

const statusEl = document.getElementById("status") as HTMLParagraphElement;
const messageEl = document.getElementById("message") as HTMLParagraphElement;
const progressEl = document.getElementById("progress") as HTMLParagraphElement;
const resultEl = document.getElementById("result") as HTMLPreElement;
const settingsMessageEl = document.getElementById(
  "settings-message",
) as HTMLSpanElement;
const clientIdEl = document.getElementById("client-id") as HTMLInputElement;
const tenantIdEl = document.getElementById("tenant-id") as HTMLInputElement;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function loadSettings(): Promise<void> {
  try {
    const settings = await window.intunedoc.settingsGet();
    clientIdEl.value = settings.clientId;
    tenantIdEl.value = settings.tenantId;
  } catch (error) {
    settingsMessageEl.textContent = errorMessage(error);
  }
}

async function refreshStatus(): Promise<void> {
  try {
    const status = await window.intunedoc.authStatus();
    statusEl.textContent = status.signedIn
      ? `Signed in as ${status.account ?? "unknown"}`
      : "Not signed in";
  } catch (error) {
    statusEl.textContent = errorMessage(error);
  }
}

window.intunedoc.onCollectProgress((progress) => {
  const counts =
    progress.current !== undefined && progress.total !== undefined
      ? ` (${progress.current}/${progress.total})`
      : "";
  progressEl.textContent = progress.message
    ? `${progress.message}${counts}`
    : `${progress.step}${counts}`;
});

document.getElementById("save-settings")?.addEventListener("click", () => {
  settingsMessageEl.textContent = "Saving...";
  window.intunedoc
    .settingsSave({
      clientId: clientIdEl.value.trim(),
      tenantId: tenantIdEl.value.trim(),
    })
    .then(() => {
      settingsMessageEl.textContent = "Saved";
      return refreshStatus();
    })
    .catch((error) => {
      settingsMessageEl.textContent = `Save failed: ${errorMessage(error)}`;
    });
});

document.getElementById("sign-in-interactive")?.addEventListener("click", () => {
  messageEl.textContent = "Opening your browser...";
  window.intunedoc
    .signInInteractive()
    .then((result) => {
      messageEl.textContent = `Signed in as ${result.account}`;
      return refreshStatus();
    })
    .catch((error) => {
      messageEl.textContent = `Sign-in failed: ${errorMessage(error)}`;
    });
});

document.getElementById("sign-out")?.addEventListener("click", () => {
  window.intunedoc
    .signOut()
    .then(() => {
      messageEl.textContent = "Signed out";
      resultEl.textContent = "";
      resultEl.hidden = true;
      progressEl.textContent = "";
      return refreshStatus();
    })
    .catch((error) => {
      messageEl.textContent = `Sign-out failed: ${errorMessage(error)}`;
    });
});

document.getElementById("collect-all")?.addEventListener("click", () => {
  messageEl.textContent = "Collecting tenant configuration. This can take a while...";
  progressEl.textContent = "";
  window.intunedoc
    .collectAll()
    .then((summary) => {
      messageEl.textContent = `Collected ${summary.totalConfigurations} items across ${summary.sectionCounts.length} sections. ${summary.fetchErrors} warning(s).`;
      progressEl.textContent = "";
      resultEl.hidden = false;
      resultEl.textContent = summary.sectionCounts
        .map((section) => `${section.count}\t${section.label}`)
        .join("\n");
    })
    .catch((error) => {
      messageEl.textContent = `Collection failed: ${errorMessage(error)}`;
      progressEl.textContent = "";
    });
});

async function exportDocument(format: "docx" | "pdf"): Promise<void> {
  try {
    messageEl.textContent = "Resolving groups and device counts...";
    const resolved = await window.intunedoc.prepareExport();
    messageEl.textContent = "Generating document...";
    const date = new Date().toISOString().split("T")[0];
    if (format === "docx") {
      const result = await generateDetailedDOCX(resolved);
      const saved = await window.intunedoc.saveFile(
        `Intune-Configuration-Documentation-${date}.docx`,
        result.buffer,
      );
      messageEl.textContent = saved ? `Saved to ${saved}` : "Export canceled";
    } else {
      const result = await generateDetailedPDF(resolved);
      const saved = await window.intunedoc.saveFile(
        `Intune-Configuration-Documentation-${date}.pdf`,
        result.buffer,
      );
      messageEl.textContent = saved ? `Saved to ${saved}` : "Export canceled";
    }
  } catch (error) {
    messageEl.textContent = `Export failed: ${errorMessage(error)}`;
  }
}

document
  .getElementById("export-docx")
  ?.addEventListener("click", () => void exportDocument("docx"));
document
  .getElementById("export-pdf")
  ?.addEventListener("click", () => void exportDocument("pdf"));

void loadSettings();
void refreshStatus();

export {};
