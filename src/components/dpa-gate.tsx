"use client";

import { useMsal } from "@azure/msal-react";
import { InteractionStatus, type AccountInfo } from "@azure/msal-browser";
import Link from "next/link";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "~/components/ui/button";
import { clearDashboardSession } from "~/lib/dashboard-session-cache";
import { getIdToken } from "~/lib/id-token";
import { DPA_VERSION, dpaAcceptanceStorageKey } from "~/lib/legal/dpa";

type GateState = "checking" | "prompt" | "accepted";

// Each result belongs to the account and tenant it was fetched for. A result
// for another key (an account switch, a late response) counts as "checking".
interface GateResult {
  key: string | null;
  value: GateState;
}

function readAccepted(key: string): boolean {
  try {
    return window.localStorage.getItem(key) !== null;
  } catch {
    return false;
  }
}

function rememberAccepted(key: string) {
  try {
    window.localStorage.setItem(key, new Date().toISOString());
  } catch {
    // Storage unavailable: the server record still answers the next check.
  }
}

// Asks a signed-in user of the hosted web app to accept the Terms of Use and
// the Data Processing Agreement for their organization before the dashboard
// mounts and starts collecting. Self-hosted deployments render children as is.
export function DpaGate({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const { instance, accounts, inProgress } = useMsal();
  const account = accounts[0];
  const storageKey = account
    ? dpaAcceptanceStorageKey(account.homeAccountId, account.tenantId)
    : null;
  const [result, setResult] = useState<GateResult>({
    key: null,
    value: "checking",
  });
  const state = result.key === storageKey ? result.value : "checking";
  // The key of the account that is active now; async handlers compare
  // against it so a response for a previous account changes nothing.
  const activeKey = useRef(storageKey);
  activeKey.current = storageKey;

  useEffect(() => {
    if (!enabled || !account || !storageKey) return;
    const key = storageKey;
    if (readAccepted(key)) {
      setResult({ key, value: "accepted" });
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const idToken = await getIdToken(instance, account);
        if (!idToken) throw new Error("No ID token");
        const response = await fetch("/api/dpa-acceptance", {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        const body = (await response.json()) as { accepted?: boolean };
        if (cancelled) return;
        if (response.ok && body.accepted) {
          rememberAccepted(key);
          setResult({ key, value: "accepted" });
        } else {
          setResult({ key, value: "prompt" });
        }
      } catch {
        if (!cancelled) setResult({ key, value: "prompt" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, account, storageKey, instance]);

  // No gate for self-hosted deployments, and none before MSAL knows the
  // account: the dashboard itself redirects signed-out visitors.
  if (!enabled) return children;
  if (!account || !storageKey) {
    return inProgress === InteractionStatus.None ? children : <Spinner />;
  }
  if (state === "accepted") return children;
  if (state === "checking") return <Spinner />;

  // Called with the key the prompt was opened for. A late call for an
  // account that is no longer active changes nothing.
  const onAccepted = (key: string) => {
    if (activeKey.current !== key) return;
    rememberAccepted(key);
    setResult({ key, value: "accepted" });
  };

  // Keyed by account and tenant: each organization gets a fresh prompt with
  // its own checkbox and submission state.
  return (
    <AcceptancePrompt
      key={storageKey}
      acceptanceKey={storageKey}
      account={account}
      onAccepted={onAccepted}
    />
  );
}

function AcceptancePrompt({
  acceptanceKey,
  account,
  onAccepted,
}: {
  acceptanceKey: string;
  account: AccountInfo;
  onAccepted: (key: string) => void;
}) {
  const { instance } = useMsal();
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [outdated, setOutdated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkboxId = useId();

  const accept = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const idToken = await getIdToken(instance, account);
      if (!idToken) throw new Error("No ID token");
      const response = await fetch("/api/dpa-acceptance", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ version: DPA_VERSION }),
      });
      if (response.status === 409) {
        // A newer agreement was deployed while this page was open.
        setOutdated(true);
        return;
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      onAccepted(acceptanceKey);
    } catch {
      setError(
        "We could not save your acceptance. Please try again in a moment.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const signOut = () => {
    clearDashboardSession();
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  return (
    <main className="bg-mint-50 flex min-h-screen items-center justify-center px-4 py-12">
      <div className="shadow-card w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
        <h1 className="text-petrol-950 text-2xl font-semibold">
          Before we read your tenant
        </h1>
        <p className="mt-4 leading-relaxed text-slate-700">
          The web app reads your Intune configuration through our server in
          Frankfurt. It is processed only while the request runs and is never
          stored. Because this happens on your organization&apos;s behalf, the{" "}
          <Link
            href="/terms"
            target="_blank"
            className="text-blue-700 underline"
          >
            Terms of Use
          </Link>{" "}
          include a{" "}
          <Link href="/dpa" target="_blank" className="text-blue-700 underline">
            Data Processing Agreement
          </Link>{" "}
          under Art. 28 GDPR.
        </p>

        <label
          htmlFor={checkboxId}
          className="mt-6 flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-4 text-sm leading-relaxed text-slate-800"
        >
          <input
            id={checkboxId}
            type="checkbox"
            checked={checked}
            onChange={(event) => setChecked(event.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-teal-700"
          />
          <span>
            I accept the Terms of Use and the Data Processing Agreement on
            behalf of my organization.
          </span>
        </label>

        {outdated && (
          <div
            role="alert"
            className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
          >
            <p>
              The agreement was updated while this page was open. Reload to
              review the current version before accepting.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-2 font-semibold underline"
            >
              Reload
            </button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            {error}
          </p>
        )}

        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={accept}
            disabled={!checked || submitting || outdated}
            className="disabled:opacity-40 disabled:shadow-none"
          >
            {submitting ? "Saving…" : "Accept and continue"}
          </Button>
          <Button type="button" variant="secondary" onClick={signOut}>
            Sign out
          </Button>
        </div>

        <p className="mt-6 border-t border-slate-200 pt-4 text-sm leading-relaxed text-slate-600">
          Need your tenant data to stay inside your organization? The{" "}
          <Link href="/desktop" className="text-blue-700 underline">
            desktop app
          </Link>{" "}
          reads Intune directly from your computer. Nothing reaches our servers,
          so no data processing agreement is needed.
        </p>
      </div>
    </main>
  );
}

function Spinner() {
  return (
    <main className="grid min-h-screen place-items-center" aria-busy="true">
      <span role="status" className="sr-only">
        Loading your workspace
      </span>
      <div
        aria-hidden="true"
        className="h-7 w-7 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700 motion-reduce:animate-none"
      />
    </main>
  );
}
