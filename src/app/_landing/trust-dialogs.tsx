import { Lock, Shield } from "lucide-react";
import type { ReactNode } from "react";
import { loginRequest } from "~/lib/msal-config";
import { CONSENT_ROLES, scopeDescriptions } from "./content";
import { Dialog } from "./dialog";

export const SECURITY_DIALOG_ID = "security-dialog";
export const PERMISSIONS_DIALOG_ID = "permissions-dialog";

function DialogHeader({
  id,
  icon,
  children,
}: {
  id: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-center gap-3">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
        {icon}
      </span>
      <h2 id={id} className="text-petrol-950 text-lg font-semibold">
        {children}
      </h2>
    </div>
  );
}

function DialogFooter({ children }: { children: ReactNode }) {
  return (
    <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
      {children}
      <form method="dialog">
        <button
          type="submit"
          className="bg-mint-50 text-petrol-800 hover:bg-mint-100 min-h-11 cursor-pointer rounded-full px-5 py-2 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          Close
        </button>
      </form>
    </div>
  );
}

export function SecurityDialog() {
  return (
    <Dialog
      id={SECURITY_DIALOG_ID}
      labelledBy="security-title"
      className="max-w-lg"
    >
      <DialogHeader id="security-title" icon={<Shield className="h-5 w-5" />}>
        How sign-in and security work
      </DialogHeader>
      <p className="text-petrol-600 mb-4 text-sm leading-6">
        You sign in with Microsoft; authentication is handled by Entra ID using
        OAuth 2.0/OpenID Connect. We never see your password and only request
        read-only, delegated permissions.
      </p>
      <ul className="text-petrol-700 list-disc space-y-2 pl-5 text-sm leading-6">
        <li>
          <span className="font-medium">Delegated access only:</span> the app
          acts on your behalf while you are signed in.{" "}
          <span className="font-medium">
            No application (app-only) permissions
          </span>{" "}
          are used.
        </li>
        <li>
          <span className="font-medium">One-time admin consent:</span> the
          Intune and group read scopes require tenant-wide consent from{" "}
          {CONSENT_ROLES} the first time your organization signs in.
        </li>
        <li>
          <span className="font-medium">Read-only scopes:</span> we request the
          minimal scopes needed to export configurations. Requested scopes:
          <code className="bg-mint-50 mt-1 block rounded px-2 py-1 text-xs break-words">
            {(loginRequest.scopes || []).join(", ")}
          </code>
        </li>
        <li>
          <span className="font-medium">
            No persistent configuration storage:
          </span>{" "}
          our application server processes Graph responses transiently for
          collection, normalization, and redaction, then discards them. PDF and
          DOCX generation happens in your browser, and generated files are not
          uploaded to us.
        </li>
        <li>
          <span className="font-medium">Sensitive-value redaction:</span> script
          bodies, passwords, tokens, payloads, QR codes, and encoded
          configuration files are replaced with [Redacted] before dashboard
          display or export.
        </li>
        <li>
          <span className="font-medium">
            Tokens are never stored server-side:
          </span>{" "}
          MSAL caches access tokens in your browser&apos;s session storage. Each
          collection request passes the token to our application server to call
          Microsoft Graph, and it is discarded when the request ends.
        </li>
        <li>
          <span className="font-medium">Revoke anytime:</span> delete the
          &ldquo;Intune Documentation&rdquo; app (publisher Ugurlabs) from Entra
          ID &gt; Enterprise Applications to remove consent for your tenant.
          Signing out only ends your session.
        </li>
      </ul>
      <DialogFooter>
        <a
          href="/privacy-policy"
          className="text-sm font-semibold text-teal-700 hover:underline"
        >
          Read the Privacy Policy
        </a>
      </DialogFooter>
    </Dialog>
  );
}

export function PermissionsDialog() {
  const scopes = Array.from(
    new Set([...(loginRequest.scopes || []), "Policy.Read.All"]),
  );

  return (
    <Dialog
      id={PERMISSIONS_DIALOG_ID}
      labelledBy="permissions-title"
      className="max-w-2xl"
    >
      <DialogHeader id="permissions-title" icon={<Lock className="h-5 w-5" />}>
        Required permissions and why
      </DialogHeader>
      <p className="text-petrol-600 mb-5 text-sm leading-6">
        We request a small set of delegated, read-only Microsoft Graph scopes to
        read your Intune configuration and build your report. No app-only
        permissions. Scopes marked as admin consent are approved once per tenant
        by {CONSENT_ROLES}.
      </p>
      <div className="space-y-3">
        {scopes.map((scope) => {
          const note =
            scope === "User.Read"
              ? "Delegated, user consent"
              : scope === "Policy.Read.All"
                ? "Optional; requested separately for Conditional Access. Delegated, read-only, admin consent"
                : "Delegated, read-only, admin consent";
          return (
            <div
              key={scope}
              className="border-petrol-950/8 grid grid-cols-1 gap-3 rounded-xl border p-3 sm:grid-cols-[14rem_1fr] md:grid-cols-[16rem_1fr]"
            >
              <div className="sm:pr-2">
                <code className="bg-mint-50 text-petrol-800 mt-0.5 block w-full rounded-lg px-2 py-1 text-xs break-words">
                  {scope}
                </code>
              </div>
              <div>
                <div className="text-petrol-800 text-sm">
                  {scopeDescriptions[scope] ??
                    "Read access used to generate documentation."}
                </div>
                <div className="text-petrol-600 mt-1 text-xs">{note}</div>
              </div>
            </div>
          );
        })}
      </div>
      <DialogFooter>
        <a
          href="https://learn.microsoft.com/graph/permissions-reference"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-semibold text-teal-700 hover:underline"
        >
          Microsoft Graph permissions reference
        </a>
      </DialogFooter>
    </Dialog>
  );
}
