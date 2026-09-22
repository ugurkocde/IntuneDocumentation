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

  constructor(config: DesktopAuthConfig) {
    this.scopes = config.scopes;
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
      if (!result) {
        return null;
      }
      if (generation !== this.generation) {
        return null;
      }
      this.accept(result);
      return this.accessToken;
    } catch {
      return null;
    }
  }

  private accept(result: AuthenticationResult): SignInResult {
    this.accessToken = result.accessToken;
    this.account = result.account ?? null;
    this.expiresOn = result.expiresOn ?? null;
    return {
      account: this.account?.username ?? this.account?.name ?? "unknown",
      tenantId: this.account?.tenantId ?? null,
      expiresOn: this.expiresOn ? this.expiresOn.toISOString() : null,
    };
  }

  async signInInteractive(
    openBrowser: (url: string) => Promise<void>,
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
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end(
          "<p>Authentication finished. You can close this window.</p>",
        );
        const error = callbackUrl.searchParams.get("error");
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
    this.account = null;
    this.accessToken = null;
    this.expiresOn = null;
    await this.disposeCache();
  }
}
