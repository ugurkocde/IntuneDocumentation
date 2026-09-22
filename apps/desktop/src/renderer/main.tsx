import { useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
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
  tenantId: string | null;
  expiresOn: string | null;
}

interface SignInResult {
  account: string;
  tenantId: string | null;
  expiresOn: string | null;
}

interface SectionCount {
  key: string;
  label: string;
  count: number;
}

interface FullCollectionSummary {
  collectedAt: string;
  totalConfigurations: number;
  sectionCounts: SectionCount[];
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
  collectCancel(): Promise<boolean>;
  prepareExport(): Promise<DetailedExportData>;
  saveFile(defaultName: string, bytes: Uint8Array): Promise<string | null>;
  onCollectProgress(callback: (progress: CollectProgress) => void): () => void;
}

declare global {
  interface Window {
    intunedoc: IntunedocApi;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-mint-100 bg-white p-5 shadow-card ${className}`}
    >
      {children}
    </div>
  );
}

function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className="rounded-lg border border-petrol-600/30 px-4 py-2 text-sm font-semibold text-petrol-900 transition hover:border-teal-600 hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

function App() {
  const [clientId, setClientId] = useState("");
  const [tenantId, setTenantId] = useState("organizations");
  const [settingsMessage, setSettingsMessage] = useState("");
  const [status, setStatus] = useState<AuthStatus | null>(null);
  const [collecting, setCollecting] = useState(false);
  const [progress, setProgress] = useState<CollectProgress | null>(null);
  const [summary, setSummary] = useState<FullCollectionSummary | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshStatus = useCallback(async () => {
    try {
      setStatus(await window.intunedoc.authStatus());
    } catch (error) {
      setStatus(null);
      setMessage(errorMessage(error));
    }
  }, []);

  useEffect(() => {
    void window.intunedoc.settingsGet().then((settings) => {
      setClientId(settings.clientId);
      setTenantId(settings.tenantId);
    });
    void refreshStatus();
    return window.intunedoc.onCollectProgress((event) =>
      setProgress(event),
    );
  }, [refreshStatus]);

  async function saveSettings() {
    setSettingsMessage("Saving...");
    try {
      const saved = await window.intunedoc.settingsSave({
        clientId: clientId.trim(),
        tenantId: tenantId.trim(),
      });
      setClientId(saved.clientId);
      setTenantId(saved.tenantId);
      setSettingsMessage("Saved");
      setSummary(null);
      await refreshStatus();
    } catch (error) {
      setSettingsMessage(errorMessage(error));
    }
  }

  async function signIn() {
    setBusy(true);
    setMessage("Opening your browser to sign in...");
    try {
      const result = await window.intunedoc.signInInteractive();
      setMessage(`Signed in as ${result.account}`);
      await refreshStatus();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    setBusy(true);
    try {
      await window.intunedoc.signOut();
      setSummary(null);
      setProgress(null);
      setMessage("Signed out");
      await refreshStatus();
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function collect() {
    setCollecting(true);
    setProgress(null);
    setMessage("Collecting your tenant configuration...");
    try {
      const result = await window.intunedoc.collectAll();
      setSummary(result);
      const warnings = result.fetchErrors + result.permissionErrors;
      setMessage(
        `Collected ${result.totalConfigurations} items across ${result.sectionCounts.length} sections.` +
          (warnings > 0
            ? ` ${warnings} warning(s) may affect completeness; review the document notes.`
            : ""),
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setCollecting(false);
      setProgress(null);
    }
  }

  async function cancelCollect() {
    await window.intunedoc.collectCancel();
    setMessage("Cancelling collection...");
  }

  async function exportDocument(format: "docx" | "pdf") {
    setBusy(true);
    try {
      setMessage("Resolving groups and device counts...");
      const resolved = await window.intunedoc.prepareExport();
      setMessage("Generating document...");
      const date = new Date().toISOString().split("T")[0];
      const result =
        format === "docx"
          ? await generateDetailedDOCX(resolved)
          : await generateDetailedPDF(resolved);
      const name = `Intune-Configuration-Documentation-${date}.${format}`;
      const saved = await window.intunedoc.saveFile(name, result.buffer);
      if (!saved) {
        setMessage("Export canceled");
        return;
      }
      const resolvedWarnings = resolved as DetailedExportData & {
        resolutionWarnings?: string[];
        fetchErrors?: unknown[];
      };
      const warnings =
        result.errors.length +
        (resolvedWarnings.resolutionWarnings?.length ?? 0) +
        (resolvedWarnings.fetchErrors?.length ?? 0);
      setMessage(
        warnings > 0
          ? `Saved to ${saved}. ${warnings} warning(s) may affect completeness; review the document notes.`
          : `Saved to ${saved}`,
      );
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const progressPercent =
    progress?.current && progress?.total
      ? Math.round((progress.current / progress.total) * 100)
      : null;

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-16 items-center justify-between border-b border-mint-100 bg-white px-6">
        <div className="flex items-center gap-3">
          <img src="./logo.png" alt="" className="h-9 w-9" />
          <div>
            <div className="text-base font-semibold text-petrol-900">
              Intune Documentation
            </div>
            <div className="text-xs text-petrol-600">
              Local tenant documentation
            </div>
          </div>
        </div>
        <div className="text-right text-xs text-petrol-600">
          {status?.signedIn ? (
            <>
              <div className="font-semibold text-petrol-900">{status.account}</div>
              <div>{status.tenantId}</div>
            </>
          ) : (
            "Not signed in"
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-72 shrink-0 overflow-auto border-r border-mint-100 bg-white/70 p-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-petrol-600">
            Sections
          </div>
          {summary ? (
            <ul className="space-y-1">
              {summary.sectionCounts.map((section) => (
                <li
                  key={section.key}
                  className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-teal-50"
                >
                  <span className="truncate text-petrol-800">{section.label}</span>
                  <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
                    {section.count}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-petrol-600">
              Collect your tenant to list its sections here.
            </p>
          )}
        </aside>

        <main className="flex-1 space-y-6 overflow-auto p-6">
          <Card>
            <h2 className="mb-1 text-sm font-semibold text-petrol-900">
              Your app registration
            </h2>
            <p className="mb-4 text-xs text-petrol-600">
              Use your own Entra app registration. Add its client ID and tenant,
              then sign in.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs font-medium text-petrol-700">
                Client ID
                <input
                  value={clientId}
                  onChange={(event) => setClientId(event.target.value)}
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-petrol-600/30 bg-surface px-3 py-2 text-sm text-petrol-900 outline-none focus:border-teal-600"
                  placeholder="Entra app registration client id"
                />
              </label>
              <label className="text-xs font-medium text-petrol-700">
                Tenant ID
                <input
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-petrol-600/30 bg-surface px-3 py-2 text-sm text-petrol-900 outline-none focus:border-teal-600"
                  placeholder="organizations or your tenant id"
                />
              </label>
            </div>
            <div className="mt-4 flex items-center gap-3">
              <SecondaryButton onClick={() => void saveSettings()}>
                Save settings
              </SecondaryButton>
              {settingsMessage && (
                <span className="text-xs text-petrol-600">{settingsMessage}</span>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex flex-wrap items-center gap-3">
              {status?.signedIn ? (
                <SecondaryButton disabled={busy} onClick={() => void signOut()}>
                  Sign out
                </SecondaryButton>
              ) : (
                <PrimaryButton disabled={busy} onClick={() => void signIn()}>
                  Sign in with browser
                </PrimaryButton>
              )}
              {collecting ? (
                <SecondaryButton onClick={() => void cancelCollect()}>
                  Cancel collection
                </SecondaryButton>
              ) : (
                <PrimaryButton
                  disabled={!status?.signedIn || busy}
                  onClick={() => void collect()}
                >
                  Collect tenant data
                </PrimaryButton>
              )}
              <SecondaryButton
                disabled={!summary || busy}
                onClick={() => void exportDocument("docx")}
              >
                Export Word
              </SecondaryButton>
              <SecondaryButton
                disabled={!summary || busy}
                onClick={() => void exportDocument("pdf")}
              >
                Export PDF
              </SecondaryButton>
            </div>
            {message && (
              <p className="mt-4 text-sm text-petrol-800">{message}</p>
            )}
            {collecting && (
              <div className="mt-4">
                <div className="h-2 w-full overflow-hidden rounded-full bg-mint-100">
                  <div
                    className="h-full rounded-full bg-teal-600 transition-all"
                    style={{ width: `${progressPercent ?? 15}%` }}
                  />
                </div>
                <p className="mt-2 text-xs text-petrol-600">
                  {progress?.message ?? progress?.step ?? "Starting..."}
                </p>
              </div>
            )}
          </Card>

          {summary && (
            <>
              <div className="grid gap-4 sm:grid-cols-4">
                {[
                  { label: "Configurations", value: summary.totalConfigurations },
                  { label: "Sections", value: summary.sectionCounts.length },
                  { label: "Warnings", value: summary.fetchErrors },
                  { label: "Permission gaps", value: summary.permissionErrors },
                ].map((kpi) => (
                  <Card key={kpi.label} className="text-center">
                    <div className="text-2xl font-semibold text-petrol-900">
                      {kpi.value}
                    </div>
                    <div className="mt-1 text-xs uppercase tracking-wide text-petrol-600">
                      {kpi.label}
                    </div>
                  </Card>
                ))}
              </div>
              <p className="text-xs text-petrol-600">
                Collected {new Date(summary.collectedAt).toLocaleString()}
              </p>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

const container = document.getElementById("root");
if (container) {
  createRoot(container).render(<App />);
}
