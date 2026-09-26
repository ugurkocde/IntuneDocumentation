import {
  BookOpen,
  DownloadCloud,
  ExternalLink,
  FileDown,
  LifeBuoy,
  MessageCircle,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wand2,
} from "lucide-react";
import { useState } from "react";
import { Header } from "../components/layout/Header";
import { SettingsForm } from "../components/settings/SettingsForm";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { Card, CardHeader } from "../components/ui/Card";
import { Checkbox } from "../components/ui/Checkbox";
import { ConfirmDialog } from "../components/ui/ConfirmDialog";
import { ProgressBar } from "../components/ui/ProgressBar";
import { useAsyncAction } from "../hooks/use-async-action";
import { ipc } from "../lib/ipc";
import { useApp } from "../state/context";
import { busyBlocker } from "../state/selectors";
import { clearWizardState } from "../state/wizard-persistence";

function Row({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: typeof BookOpen;
  title: string;
  description: string;
  action: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-4 first:pt-0 last:pb-0">
      <span className="bg-mint-50 text-petrol-700 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 basis-52">
        <p className="text-petrol-950 text-sm font-semibold">{title}</p>
        <p className="text-petrol-600 mt-0.5 text-[13px] leading-5">{description}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

function UpdatesCard() {
  const { state, actions } = useApp();
  const { update, appInfo } = state;
  const checksOn = state.settings?.checkForUpdates !== false;
  // Automatic updates need automatic checks, as in the main process.
  const automatic = state.settings?.autoUpdate === true && checksOn;
  const check = useAsyncAction();
  const toggle = useAsyncAction();
  const statusText: Record<string, string> = {
    idle: "Not checked yet",
    checking: "Checking for updates",
    available: automatic
      ? `Version ${update.version ?? ""} is available and downloading`
      : `Version ${update.version ?? ""} is available`,
    downloading: `Downloading version ${update.version ?? ""}`,
    ready: `Version ${update.version ?? ""} is ready to install`,
    none: "You have the latest version",
    error: update.message ?? "The last update check failed",
    disabled: update.message ?? "Updates are checked in installed builds",
  };
  const disabled = update.state === "disabled";
  const offer = update.state === "available" && !automatic;
  const downloading = update.state === "downloading" || (update.state === "available" && automatic);
  return (
    <Card>
      <CardHeader
        icon={DownloadCloud}
        eyebrow="Updates"
        title={
          <span className="flex flex-wrap items-center gap-2">
            Intune Documentation {appInfo?.version ?? ""}
            {update.state === "ready" && <Badge variant="solid">Update ready</Badge>}
            {update.state === "none" && <Badge variant="info">Up to date</Badge>}
          </span>
        }
        description={
          automatic
            ? "Updates download in the background and install when you restart the app."
            : checksOn
              ? "The app checks for updates and tells you when one is available."
              : "The app checks for updates only when you select Check for updates."
        }
      />
      <div className="border-petrol-950/8 bg-surface mt-5 rounded-2xl border p-4" aria-live="polite">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-petrol-800 text-[13px] font-medium">{statusText[update.state]}</p>
          <div className="flex gap-2">
            {update.state === "ready" ? (
              <Button size="sm" icon={RotateCcw} onClick={() => void ipc.updateInstall()}>
                Restart to update
              </Button>
            ) : (
              <>
                {offer && (
                  <Button
                    size="sm"
                    icon={DownloadCloud}
                    loading={check.busy === "download"}
                    onClick={() => void check.run("download", () => actions.downloadUpdate())}
                  >
                    Download update
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={RefreshCw}
                  loading={check.busy === "check" || update.state === "checking"}
                  disabled={disabled || downloading || check.busy !== null}
                  disabledReason={
                    disabled
                      ? "Update checks run in the installed app."
                      : downloading
                        ? "An update is already downloading."
                        : null
                  }
                  onClick={() => void check.run("check", () => actions.checkForUpdates())}
                >
                  Check for updates
                </Button>
              </>
            )}
          </div>
        </div>
        {update.state === "downloading" && typeof update.percent === "number" && (
          <ProgressBar value={update.percent} label="Update download" size="sm" className="mt-3" />
        )}
        {check.error && (
          <Alert tone="danger" className="mt-3">
            {check.error}
          </Alert>
        )}
      </div>
      <div className="mt-4 space-y-1">
        <Checkbox
          checked={checksOn}
          onChange={(value) => void toggle.run("check", () => actions.setCheckForUpdates(value))}
        >
          <span className="min-w-0">
            <span className="text-petrol-950 block text-sm font-semibold">Check for updates automatically</span>
            <span className="text-petrol-600 mt-0.5 block text-[13px] leading-5">
              When off, the app makes no update requests unless you select Check for updates.
            </span>
          </span>
        </Checkbox>
        <Checkbox
          checked={automatic}
          disabled={!checksOn}
          onChange={(value) => void toggle.run("auto", () => actions.setAutoUpdate(value))}
        >
          <span className="min-w-0">
            <span className="text-petrol-950 block text-sm font-semibold">Install updates automatically</span>
            <span className="text-petrol-600 mt-0.5 block text-[13px] leading-5">
              {checksOn
                ? "When off, the app tells you when an update is available and you choose when to install it."
                : "Needs automatic update checks. Turn them on to install updates automatically."}
            </span>
          </span>
        </Checkbox>
        {toggle.error && (
          <Alert tone="danger" className="mt-3">
            {toggle.error}
          </Alert>
        )}
      </div>
    </Card>
  );
}

export function SettingsScreen() {
  const { state, actions } = useApp();
  const support = useAsyncAction();
  const [confirmClear, setConfirmClear] = useState(false);
  const clear = useAsyncAction();

  return (
    <div className="max-w-4xl space-y-5">
      <Header title="Settings" description="App registration, updates and support." />
      <SettingsForm />

      <Card>
        <CardHeader icon={LifeBuoy} eyebrow="Help" title="Setup and support" />
        <div className="divide-petrol-950/6 mt-5 divide-y">
          <Row
            icon={Wand2}
            title="Setup wizard"
            description="Walk through the app registration, permissions and license again."
            action={
              <Button
                size="sm"
                variant="secondary"
                icon={RotateCcw}
                disabled={Boolean(busyBlocker(state))}
                disabledReason={busyBlocker(state)}
                onClick={() => {
                  clearWizardState();
                  actions.openWizard();
                }}
              >
                Redo setup
              </Button>
            }
          />
          <Row
            icon={BookOpen}
            title="Getting started guide"
            description="Step by step instructions on intunedocumentation.com."
            action={
              <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => void ipc.openHelp("gettingStarted")}>
                Open guide
              </Button>
            }
          />
          <Row
            icon={MessageCircle}
            title="Support"
            description="Contact us when something does not work as expected."
            action={
              <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => void ipc.openHelp("support")}>
                Get support
              </Button>
            }
          />
          <Row
            icon={FileDown}
            title="Diagnostics"
            description="Save app version, system details and recent log lines for support. No license key, tokens or tenant configuration."
            action={
              <Button
                size="sm"
                variant="secondary"
                icon={FileDown}
                loading={support.busy === "diagnostics"}
                onClick={() =>
                  void support.run("diagnostics", () => ipc.exportDiagnostics(), (path) =>
                    path ? `Diagnostics saved to ${path}` : null,
                  )
                }
              >
                Export diagnostics
              </Button>
            }
          />
        </div>
        <div aria-live="polite" className="empty:hidden mt-4">
          {support.error && <Alert tone="danger">{support.error}</Alert>}
          {support.message && <Alert tone="success">{support.message}</Alert>}
        </div>
      </Card>

      <UpdatesCard />

      <Card className="border-red-200/70">
        <CardHeader
          icon={Trash2}
          tone="red"
          eyebrow="Reset"
          title="Clear local data"
          description="Deactivates the license on this machine when possible, signs out, and removes saved settings and setup progress. The app restarts afterwards."
          action={
            <Button
              variant="dangerOutline"
              size="sm"
              disabled={Boolean(busyBlocker(state))}
              disabledReason={busyBlocker(state)}
              onClick={() => setConfirmClear(true)}
            >
              Clear data
            </Button>
          }
        />
        {clear.error && (
          <Alert tone="danger" className="mt-4">
            {clear.error}
          </Alert>
        )}
      </Card>

      <ConfirmDialog
        open={confirmClear}
        tone="danger"
        title="Clear all local data?"
        description="The license is deactivated on this machine, you are signed out, and the app registration settings are removed. The app then restarts with the setup wizard."
        confirmLabel="Clear and restart"
        busy={clear.busy !== null}
        onConfirm={() =>
          void clear.run("clear", async () => {
            clearWizardState();
            await ipc.clearLocalData();
          })
        }
        onCancel={() => setConfirmClear(false)}
      />
    </div>
  );
}
