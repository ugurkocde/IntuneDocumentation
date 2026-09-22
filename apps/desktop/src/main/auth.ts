import { PublicClientApplication } from "@azure/msal-node";
import type {
  AuthenticationResult,
  AuthorizationCodeRequest,
  AuthorizationUrlRequest,
  DeviceCodeRequest,
} from "@azure/msal-node";
import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import type { DesktopAuthConfig } from "./config";

export interface DeviceCodePrompt {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresInSeconds: number;
}

export interface AuthStatus {
  signedIn: boolean;
  account: string | null;
  expiresOn: string | null;
}

export interface SignInResult {
  account: string;
  expiresOn: string | null;
}

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

export class AuthService {
  private readonly pca: PublicClientApplication;
  private readonly scopes: string[];
  private accessToken: string | null = null;
  private accountName: string | null = null;
  private expiresOn: Date | null = null;

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
      account: this.accountName,
      expiresOn: this.expiresOn ? this.expiresOn.toISOString() : null,
    };
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  private accept(result: AuthenticationResult): SignInResult {
    this.accessToken = result.accessToken;
    this.accountName = result.account?.username ?? result.account?.name ?? null;
    this.expiresOn = result.expiresOn ?? null;
    return {
      account: this.accountName ?? "unknown",
      expiresOn: this.expiresOn ? this.expiresOn.toISOString() : null,
    };
  }

  async signInWithDeviceCode(
    onPrompt: (prompt: DeviceCodePrompt) => void,
  ): Promise<SignInResult> {
    const request: DeviceCodeRequest = {
      scopes: this.scopes,
      deviceCodeCallback: (response) => {
        onPrompt({
          userCode: response.userCode,
          verificationUri: response.verificationUri,
          message: response.message,
          expiresInSeconds: response.expiresIn,
        });
      },
    };
    const result = await this.pca.acquireTokenByDeviceCode(request);
    if (!result) {
      throw new Error("Device code sign-in did not return a token.");
    }
    return this.accept(result);
  }

  async signInInteractive(
    openBrowser: (url: string) => Promise<void>,
  ): Promise<SignInResult> {
    const server = createServer();
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    const address = server.address() as AddressInfo;
    const redirectUri = `http://localhost:${address.port}`;

    const codePromise = new Promise<string>((resolve, reject) => {
      server.on("request", (request, response) => {
        const callbackUrl = new URL(request.url ?? "/", redirectUri);
        const code = callbackUrl.searchParams.get("code");
        const error = callbackUrl.searchParams.get("error");
        response.writeHead(200, { "Content-Type": "text/html" });
        response.end("<p>Sign-in complete. You can close this window.</p>");
        if (error) {
          reject(
            new Error(callbackUrl.searchParams.get("error_description") ?? error),
          );
          return;
        }
        if (code) {
          resolve(code);
        }
      });
    });

    const { verifier, challenge } = createPkcePair();
    const urlRequest: AuthorizationUrlRequest = {
      scopes: this.scopes,
      redirectUri,
      codeChallenge: challenge,
      codeChallengeMethod: "S256",
    };
    const authUrl = await this.pca.getAuthCodeUrl(urlRequest);
    await openBrowser(authUrl);

    try {
      const code = await codePromise;
      const codeRequest: AuthorizationCodeRequest = {
        code,
        scopes: this.scopes,
        redirectUri,
        codeVerifier: verifier,
      };
      const result = await this.pca.acquireTokenByCode(codeRequest);
      return this.accept(result);
    } finally {
      server.close();
    }
  }

  signOut(): void {
    this.accessToken = null;
    this.accountName = null;
    this.expiresOn = null;
  }
}
