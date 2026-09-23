import { PublicClientApplication } from "@azure/msal-node";
import type {
  AccountInfo,
  AuthenticationResult,
  AuthorizationCodeRequest,
  AuthorizationUrlRequest,
} from "@azure/msal-node";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { DesktopAuthConfig } from "./config";

export interface AuthStatus {
  signedIn: boolean;
  account: string | null;
  tenantId: string | null;
  expiresOn: string | null;
}

export interface SignInResult {
  account: string;
  tenantId: string | null;
  expiresOn: string | null;
}

const TOKEN_REFRESH_SKEW_MS = 60_000;

const callbackPage = (title: string, text: string) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Intune Documentation</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f1f5f3;color:#082f36;font-family:"Avenir Next","Segoe UI",system-ui,sans-serif}
main{max-width:420px;padding:32px;border-radius:16px;background:#fff;border:1px solid rgb(8 47 54 / 0.06);box-shadow:0 18px 50px -30px rgb(8 47 54 / 0.22);text-align:center}
h1{font-size:20px;margin:0 0 8px;letter-spacing:-0.02em}p{margin:0;color:#44747a;font-size:14px;line-height:1.5}</style></head>
<body><main><h1>${title}</h1><p>${text}</p></main></body></html>`;
const INTERACTIVE_TIMEOUT_MS = 5 * 60_000;

function base64Url(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function createPkcePair() {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export class AuthService {
  private readonly pca: PublicClientApplication;
  private readonly scopes: string[];
  private account: AccountInfo | null = null;
  private accessToken: string | null = null;
  private expiresOn: Date | null = null;
  private generation = 0;
  private activeCancel: (() => void) | null = null;
  private expiryTimer: ReturnType<typeof setTimeout> | null = null;
  private reported = "false||";
  private readonly onChange: (status: AuthStatus) => void;

  // onChange runs whenever the signed in state, account or tenant changes:
  // after sign-in, sign-out, and when a silent token refresh fails or
  // recovers.
  constructor(
    config: DesktopAuthConfig,
    onChange: (status: AuthStatus) => void = () => undefined,
  ) {
    this.scopes = config.scopes;
    this.onChange = onChange;
    this.pca = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: `https://login.microsoftonline.com/${config.tenantId}`,
      },
    });
  }

  getStatus(): AuthStatus {
    return {
      signedIn: this.accessToken !== null,
      account: this.account?.username ?? null,
      tenantId: this.account?.tenantId ?? null,
      expiresOn: this.expiresOn ? this.expiresOn.toISOString() : null,
    };
  }

  getOwnerKey(): string | null {
    if (!this.account) {
      return null;
    }
    return `${this.account.username ?? ""}|${this.account.tenantId ?? ""}`;
  }

  async getAccessToken(): Promise<string | null> {
    if (
      this.accessToken &&
      this.expiresOn &&
      this.expiresOn.getTime() - TOKEN_REFRESH_SKEW_MS > Date.now()
    ) {
      return this.accessToken;
    }
    if (!this.account) {
      return null;
    }
    const generation = this.generation;
    try {
      const result = await this.pca.acquireTokenSilent({
        account: this.account,
        scopes: this.scopes,
      });
      if (generation !== this.generation) {
        return null;
      }
      if (!result) {
        this.expire();
        return null;
      }
      this.accept(result);
      return this.accessToken;
    } catch {
      if (generation === this.generation) this.expire();
      return null;
    }
  }

  // The refresh failed: the session no longer has a usable token. The account
  // is kept so a later silent attempt can recover without a new sign-in.
  private expire(): void {
    this.clearExpiryTimer();
    this.accessToken = null;
    this.expiresOn = null;
    this.report();
  }

  private report(): void {
    const status = this.getStatus();
    const fingerprint = `${status.signedIn}|${status.account ?? ""}|${status.tenantId ?? ""}`;
    if (fingerprint === this.reported) return;
    this.reported = fingerprint;
    this.onChange(status);
  }

  private clearExpiryTimer(): void {
    if (this.expiryTimer) clearTimeout(this.expiryTimer);
    this.expiryTimer = null;
  }

  // Refreshes shortly before the token expires, so an expired or revoked
  // session is noticed even while nothing calls Graph.
  private scheduleRefresh(): void {
    this.clearExpiryTimer();
    if (!this.expiresOn) return;
    const delay = Math.max(
      0,
      this.expiresOn.getTime() - TOKEN_REFRESH_SKEW_MS - Date.now(),
    );
    this.expiryTimer = setTimeout(() => {
      this.expiryTimer = null;
      void this.getAccessToken();
    }, delay);
    this.expiryTimer.unref?.();
  }

  private accept(result: AuthenticationResult): SignInResult {
    this.accessToken = result.accessToken;
    this.account = result.account ?? null;
    this.expiresOn = result.expiresOn ?? null;
    this.scheduleRefresh();
    this.report();
    return {
      account: this.account?.username ?? this.account?.name ?? "unknown",
      tenantId: this.account?.tenantId ?? null,
      expiresOn: this.expiresOn ? this.expiresOn.toISOString() : null,
    };
  }

  // Delegated scopes granted in the current access token (the scp claim).
  async grantedScopes(): Promise<string[] | null> {
    const token = await this.getAccessToken();
    if (!token) return null;
    const payload = token.split(".")[1];
    if (!payload) return [];
    try {
      const claims = JSON.parse(
        Buffer.from(payload, "base64url").toString("utf8"),
      ) as { scp?: unknown };
      return typeof claims.scp === "string"
        ? claims.scp.split(" ").filter(Boolean)
        : [];
    } catch {
      return [];
    }
  }

  // With consent true, Microsoft shows the consent screen again; a Global
  // Administrator can then tick "Consent on behalf of your organization".
  // The redirect still lands on this app's own loopback listener.
  async signInInteractive(
    openBrowser: (url: string) => Promise<void>,
    options: { consent?: boolean } = {},
  ): Promise<SignInResult> {
    const generation = this.generation;
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const redirectUri = `http://localhost:${address.port}`;
    const { verifier, challenge } = createPkcePair();
    const state = base64Url(randomBytes(16));
    const controller = new AbortController();
    this.activeCancel = () => controller.abort();

    const codePromise = new Promise<string>((resolve, reject) => {
      controller.signal.addEventListener(
        "abort",
        () => reject(new Error("Sign-in was cancelled.")),
        { once: true },
      );
      server.on("request", (request, response) => {
        if (request.method !== "GET") {
          response.writeHead(405).end();
          return;
        }
        let callbackUrl: URL;
        try {
          callbackUrl = new URL(request.url ?? "/", redirectUri);
        } catch {
          response.writeHead(400).end();
          reject(new Error("Sign-in callback was malformed."));
          return;
        }
        if (callbackUrl.pathname !== "/") {
          response.writeHead(404).end();
          return;
        }
        if (callbackUrl.searchParams.get("state") !== state) {
          response.writeHead(400).end("State mismatch.");
          reject(new Error("Sign-in state mismatch."));
          return;
        }
        const error = callbackUrl.searchParams.get("error");
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end(
          callbackPage(
            error ? "Sign in did not finish" : "You are signed in",
            error
              ? "Return to Intune Documentation to see what happened and try again."
              : "Return to Intune Documentation. You can close this browser tab.",
          ),
        );
        if (error) {
          reject(
            new Error(callbackUrl.searchParams.get("error_description") ?? error),
          );
          return;
        }
        const code = callbackUrl.searchParams.get("code");
        if (code) {
          resolve(code);
        }
      });
    });

    try {
      const urlRequest: AuthorizationUrlRequest = {
        scopes: this.scopes,
        redirectUri,
        state,
        codeChallenge: challenge,
        codeChallengeMethod: "S256",
        ...(options.consent ? { prompt: "consent" } : {}),
      };
      const authUrl = await this.pca.getAuthCodeUrl(urlRequest);
      await openBrowser(authUrl);
      const code = await withTimeout(
        codePromise,
        INTERACTIVE_TIMEOUT_MS,
        "Sign-in timed out. Please try again.",
      );
      const codeRequest: AuthorizationCodeRequest = {
        code,
        scopes: this.scopes,
        redirectUri,
        codeVerifier: verifier,
      };
      const result = await this.pca.acquireTokenByCode(codeRequest);
      if (generation !== this.generation) {
        await this.disposeCache();
        throw new Error("Sign-in was cancelled.");
      }
      return this.accept(result);
    } finally {
      this.activeCancel = null;
      server.close();
    }
  }

  private async disposeCache(): Promise<void> {
    const cache = this.pca.getTokenCache();
    try {
      const accounts = await cache.getAllAccounts();
      await Promise.all(accounts.map((account) => cache.removeAccount(account)));
    } catch {
      return;
    }
  }

  async signOut(): Promise<void> {
    this.generation += 1;
    this.activeCancel?.();
    this.activeCancel = null;
    this.clearExpiryTimer();
    this.account = null;
    this.accessToken = null;
    this.expiresOn = null;
    this.report();
    await this.disposeCache();
  }
}
