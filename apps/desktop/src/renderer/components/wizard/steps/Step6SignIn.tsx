import { ArrowLeft, ArrowRight, Check, LogIn, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { PermissionValidation } from "../../../../shared/ipc-types";
import { DEFAULT_SCOPES, SCOPE_REASONS } from "../../../../shared/scopes";
import { useAsyncAction } from "../../../hooks/use-async-action";
import { ipc } from "../../../lib/ipc";
import { useApp } from "../../../state/context";
import { Alert } from "../../ui/Alert";
import { Button } from "../../ui/Button";
import { Spinner } from "../../ui/Spinner";
import { StepLayout, type StepProps } from "../StepLayout";

export function Step6SignIn({ step, goNext, goBack }: StepProps) {
  const { state, actions } = useApp();
  const signedIn = Boolean(state.auth?.signedIn);
  const [result, setResult] = useState<PermissionValidation | null>(null);
  const sign = useAsyncAction();
  const check = useAsyncAction();

  const validate = useCallback(async () => {
    const value = await check.run("check", () => ipc.validatePermissions());
    if (value) setResult(value);
  }, [check.run]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (signedIn) void validate();
    else setResult(null);
  }, [signedIn, validate]);

  const signIn = async (consent: boolean) => {
    const done = await sign.run(consent ? "consent" : "in", async () => {
      await actions.signIn({ consent });
      return true;
    });
    if (done) await validate();
  };

  const missing = result?.missing ?? [];
  const granted = new Set(result?.granted ?? []);

  return (
    <StepLayout
      step={step}
      title="Sign in and verify"
      description="Sign in with an account from your tenant. The app then checks that every permission was granted."
      footer={
        <>
          <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>
            Back
          </Button>
          <div className="flex items-center gap-3">
            {!signedIn && <span className="text-xs text-amber-800">Sign in to continue.</span>}
            <Button trailingIcon={ArrowRight} onClick={goNext} disabled={!signedIn} disabledReason="Sign in to continue.">
              Continue
            </Button>
          </div>
        </>
      }
    >
      <div className="border-petrol-950/6 shadow-card flex flex-wrap items-center gap-4 rounded-2xl border bg-white p-5">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${signedIn ? "bg-teal-50 text-teal-700" : "bg-mint-50 text-petrol-600"}`}
        >
          {signedIn ? <ShieldCheck className="h-5 w-5" aria-hidden="true" /> : <LogIn className="h-5 w-5" aria-hidden="true" />}
        </span>
        <div className="min-w-0 flex-1 basis-60" aria-live="polite">
          <p className="text-petrol-950 truncate text-sm font-semibold">
            {signedIn ? state.auth?.account : sign.busy ? "Waiting for your browser" : "Not signed in yet"}
          </p>
          <p className="text-petrol-600 mt-0.5 text-[13px]">
            {signedIn
              ? `Tenant ${state.auth?.tenantId ?? ""}`
              : sign.busy
                ? "Finish signing in in the browser window, then return here."
                : "Your default browser opens the Microsoft sign in page."}
          </p>
        </div>
        {signedIn ? (
          <Button size="sm" variant="secondary" icon={RefreshCw} loading={check.busy !== null} onClick={() => void validate()}>
            Check again
          </Button>
        ) : (
          <Button icon={LogIn} loading={sign.busy === "in"} disabled={sign.busy !== null} onClick={() => void signIn(false)}>
            Sign in with Microsoft
          </Button>
        )}
      </div>

      {sign.error && <Alert tone="danger">{sign.error}</Alert>}
      {check.error && <Alert tone="danger">{check.error}</Alert>}

      {signedIn && (
        <div className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
          <div className="border-petrol-950/6 flex items-center justify-between gap-3 border-b px-5 py-3">
            <p className="text-petrol-950 text-sm font-semibold">Permissions</p>
            {result ? (
              <span className={`text-xs font-semibold ${missing.length ? "text-amber-800" : "text-teal-700"}`}>
                {DEFAULT_SCOPES.length - missing.length} of {DEFAULT_SCOPES.length} granted
              </span>
            ) : (
              <Spinner label="Checking permissions" />
            )}
          </div>
          <ul className="divide-petrol-950/6 divide-y">
            {DEFAULT_SCOPES.map((scope) => {
              const ok = granted.has(scope);
              return (
                <li key={scope} className="flex items-center gap-3 px-5 py-2.5">
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
                      !result ? "bg-mint-100 text-petrol-600" : ok ? "bg-teal-600 text-white" : "bg-amber-100 text-amber-800"
                    }`}
                    aria-hidden="true"
                  >
                    {!result ? null : ok ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : <X className="h-3.5 w-3.5" strokeWidth={3} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <code className="text-petrol-950 block truncate font-mono text-[13px] font-semibold">{scope}</code>
                    <p className="text-petrol-600 truncate text-xs">{SCOPE_REASONS[scope]}</p>
                  </div>
                  {result && <span className="sr-only">{ok ? "granted" : "missing"}</span>}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {result && missing.length > 0 && (
        <Alert
          tone="warning"
          title={`${missing.length} ${missing.length === 1 ? "permission is" : "permissions are"} missing`}
          action={
            <>
              <Button size="sm" loading={sign.busy === "consent"} disabled={sign.busy !== null} onClick={() => void signIn(true)}>
                Sign in and consent for the organization
              </Button>
              <Button size="sm" variant="secondary" loading={sign.busy === "in"} disabled={sign.busy !== null} onClick={() => void signIn(false)}>
                Sign in again
              </Button>
            </>
          }
        >
          Grant admin consent on the API permissions page, then sign in again. A Global Administrator can instead sign in and tick <strong>Consent on behalf of your organization</strong>. Parts of the documentation stay empty until every permission is granted.
        </Alert>
      )}
      {result && missing.length === 0 && (
        <Alert tone="success" title="All permissions are granted">
          The app registration is ready. Continue to add your license.
        </Alert>
      )}
    </StepLayout>
  );
}
