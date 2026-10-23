import { createServer, request } from "node:http";
import { describe, expect, it, vi } from "vitest";
import {
  AuthService,
  listenLoopback,
  readCallback,
  SIGN_IN_UNREACHABLE,
  SignInUnreachableError,
} from "./auth";

// A stand-in for MSAL: records the authorization request and answers the
// code exchange for whichever account the test chooses. Like MSAL, each
// client caches the account of every code exchange until it is removed.
const msal = vi.hoisted(() => ({
  lastUrlRequest: null as null | { redirectUri: string; state?: string },
  nextAccount: { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" },
  removed: [] as string[],
  // Age (ms) of the cached ID token, and every forceRefresh flag seen.
  cachedIdTokenAge: 0,
  silent: [] as boolean[],
  // Lifetime of the next access token, and an error for silent requests.
  tokenLifetime: 3600_000,
  silentError: null as null | Record<string, unknown>,
  // Holds the next silent request until the test settles it.
  silentGate: null as null | Promise<void>,
  // Holds the code exchange of an interactive sign-in.
  codeGate: null as null | Promise<void>,
}));

const idTokenIssued = (ms: number) =>
  `h.${Buffer.from(JSON.stringify({ iat: Math.floor(ms / 1000) })).toString("base64url")}.s`;

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: class {
    cached = new Map<string, { homeAccountId: string }>();
    getAuthCodeUrl(request: { redirectUri: string; state?: string }) {
      msal.lastUrlRequest = request;
      return Promise.resolve("https://login.microsoftonline.com/authorize");
    }
    async acquireTokenByCode() {
      const account = { ...msal.nextAccount };
      if (msal.codeGate) await msal.codeGate;
      this.cached.set(account.homeAccountId, account);
      return {
        accessToken: `token-${account.homeAccountId}`,
        account,
        expiresOn: new Date(Date.now() + msal.tokenLifetime),
      };
    }
    async acquireTokenSilent(request: {
      forceRefresh?: boolean;
      account?: { homeAccountId: string; username: string; tenantId: string };
    }) {
      msal.silent.push(Boolean(request.forceRefresh));
      const account = { ...(request.account ?? msal.nextAccount) };
      const error = msal.silentError;
      if (msal.silentGate) await msal.silentGate;
      if (error) throw error;
      const age = request.forceRefresh ? 0 : msal.cachedIdTokenAge;
      return {
        accessToken: `token-${account.homeAccountId}`,
        idToken: idTokenIssued(Date.now() - age),
        account,
        expiresOn: new Date(Date.now() + msal.tokenLifetime),
      };
    }
    getTokenCache() {
      return {
        getAllAccounts: () => Promise.resolve([...this.cached.values()]),
        removeAccount: (account: { homeAccountId: string }) => {
          msal.removed.push(account.homeAccountId);
          this.cached.delete(account.homeAccountId);
          return Promise.resolve();
        },
      };
    }
  },
}));

// Errors the installed MSAL raises on a refresh token request, produced by
// the real PublicClientApplication with fetch answering each request in
// turn. "fresh" starts a new client, so no throttle carries over.
const answer = (status: number, body: unknown) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": typeof body === "string" ? "text/html" : "application/json" },
  });

type RefreshError = { name: string; errorCode: string; errorNo?: unknown };

async function realRefreshErrors(steps: Array<"fresh" | (() => Response)>) {
  const { PublicClientApplication } = await vi.importActual<typeof import("@azure/msal-node")>(
    "@azure/msal-node",
  );
  const tenant = "11111111-1111-1111-1111-111111111111";
  const login = `https://login.microsoftonline.com/${tenant}`;
  let next: () => Response = () => answer(500, {});
  vi.stubGlobal("fetch", async (url: string, init?: { method?: string }) => {
    if (init?.method === "POST") return next();
    if (String(url).includes("openid-configuration")) {
      return answer(200, {
        token_endpoint: `${login}/oauth2/v2.0/token`,
        authorization_endpoint: `${login}/oauth2/v2.0/authorize`,
        end_session_endpoint: `${login}/oauth2/v2.0/logout`,
        issuer: `${login}/v2.0`,
        jwks_uri: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
      });
    }
    return answer(200, {
      tenant_discovery_endpoint: `${login}/v2.0/.well-known/openid-configuration`,
      metadata: [
        {
          preferred_network: "login.microsoftonline.com",
          preferred_cache: "login.windows.net",
          aliases: ["login.microsoftonline.com", "login.windows.net"],
        },
      ],
    });
  });
  const errors: RefreshError[] = [];
  try {
    let clients = 0;
    const create = () => new PublicClientApplication({ auth: { clientId: `client-${clients++}`, authority: login } });
    let pca = create();
    for (const step of steps) {
      if (step === "fresh") {
        pca = create();
        continue;
      }
      next = step;
      const error = await pca
        .acquireTokenByRefreshToken({ refreshToken: "refresh-token", scopes: ["User.Read"] })
        .then(
          () => null,
          (thrown: RefreshError) => thrown,
        );
      if (!error) throw new Error("The refresh was expected to fail.");
      errors.push(error);
    }
  } finally {
    vi.unstubAllGlobals();
  }
  return errors;
}

const expected = { state: "expected-state", port: 51234 };
const host = "localhost:51234";

function callback(url: string, headers: Record<string, string> = { host }) {
  return readCallback({ method: "GET", url, headers }, expected);
}

describe("readCallback", () => {
  it("accepts the code when state and host match", () => {
    expect(callback("/?code=abc&state=expected-state")).toEqual({
      kind: "code",
      code: "abc",
    });
    for (const name of ["127.0.0.1:51234", "[::1]:51234", "LOCALHOST:51234"]) {
      expect(callback("/?code=abc&state=expected-state", { host: name }).kind).toBe(
        "code",
      );
    }
  });

  it("ignores a wrong or missing state instead of failing the sign-in", () => {
    expect(callback("/?code=abc&state=other")).toEqual({
      kind: "ignore",
      status: 400,
    });
    expect(callback("/?error=access_denied")).toEqual({
      kind: "ignore",
      status: 400,
    });
  });

  it("ignores requests for another host, path or method", () => {
    const valid = "/?code=abc&state=expected-state";
    expect(callback(valid, { host: "evil.example:51234" }).kind).toBe("ignore");
    expect(callback(valid, { host: "localhost:1" }).kind).toBe("ignore");
    expect(callback(valid, {}).kind).toBe("ignore");
    expect(callback("/other?code=abc&state=expected-state")).toEqual({
      kind: "ignore",
      status: 404,
    });
    expect(
      readCallback({ method: "POST", url: valid, headers: { host } }, expected),
    ).toEqual({ kind: "ignore", status: 405 });
  });

  it("reports an error only with the expected state", () => {
    expect(
      callback("/?error=access_denied&error_description=Denied&state=expected-state"),
    ).toEqual({ kind: "error", message: "Denied" });
  });

  it("ignores a matching state without a code", () => {
    expect(callback("/?state=expected-state")).toEqual({
      kind: "ignore",
      status: 400,
    });
  });
});

function get(
  address: string,
  port: number,
  path = "/",
): Promise<number | null> {
  return new Promise((resolve) => {
    const req = request(
      { host: address, port, path, headers: { host: `localhost:${port}` } },
      (res) => {
        res.resume();
        resolve(res.statusCode ?? null);
      },
    );
    req.on("error", () => resolve(null));
    req.end();
  });
}

function hasIpv6Loopback(): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.listen(0, "::1", () => probe.close(() => resolve(true)));
  });
}

describe("listenLoopback", () => {
  it("serves the same port on 127.0.0.1 and, when available, ::1", async () => {
    const listener = await listenLoopback((_req, res) => {
      res.writeHead(204).end();
    });
    try {
      expect(await get("127.0.0.1", listener.port)).toBe(204);
      if (await hasIpv6Loopback()) {
        expect(await get("::1", listener.port)).toBe(204);
      }
    } finally {
      listener.close();
    }
  });
});

function redirect(query: string): Promise<number | null> {
  const target = new URL(msal.lastUrlRequest?.redirectUri ?? "http://localhost:1");
  return get("127.0.0.1", Number(target.port), `/${query}`);
}

function signIn(service: AuthService, blockedBy: () => string | null = () => null) {
  return service.signInInteractive(
    async () => {
      const state = msal.lastUrlRequest?.state ?? "";
      // A forged callback first: it must not end the sign-in.
      expect(await redirect("?code=forged&state=wrong")).toBe(400);
      expect(await redirect(`?code=real&state=${state}`)).toBe(200);
    },
    { blockedBy },
  );
}

describe("AuthService.signInInteractive", () => {
  const config = { clientId: "c", tenantId: "organizations", scopes: ["User.Read"] };

  it("keeps waiting after a callback with the wrong state", async () => {
    const service = new AuthService(config);
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    const result = await signIn(service);
    expect(result.account).toBe("a@contoso.com");
    expect(msal.lastUrlRequest?.redirectUri).toMatch(/^http:\/\/localhost:\d+$/);
  });

  it("refuses to switch accounts while work is running", async () => {
    const service = new AuthService(config);
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    await signIn(service);
    msal.nextAccount = { homeAccountId: "b", username: "b@fabrikam.com", tenantId: "t-b" };
    msal.removed = [];
    await expect(signIn(service, () => "a collection is running")).rejects.toThrow(
      "a collection is running",
    );
    expect(service.getStatus()).toMatchObject({
      signedIn: true,
      account: "a@contoso.com",
      tenantId: "t-a",
    });
    expect(await service.getAccessToken()).toBe("token-a");
    expect(msal.removed).toEqual(["b"]);
  });
});

describe("AuthService overlapping sign-ins", () => {
  const config = { clientId: "c", tenantId: "organizations", scopes: ["User.Read"] };
  const a = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
  const b = { homeAccountId: "b", username: "b@fabrikam.com", tenantId: "t-b" };

  // Starts an interactive sign-in as account and returns it with a function
  // that sends the browser redirect once the test wants the code exchange.
  async function start(service: AuthService, account: typeof a) {
    let target: { redirectUri: string; state?: string } | null = null;
    const done = service.signInInteractive(async () => {
      target = msal.lastUrlRequest;
    });
    await vi.waitFor(() => expect(target).not.toBeNull());
    const redirect = async () => {
      msal.nextAccount = { ...account };
      const { redirectUri, state } = target!;
      expect(await get("127.0.0.1", Number(new URL(redirectUri).port), `/?code=real&state=${state}`)).toBe(200);
    };
    return { done, redirect };
  }

  it("discards a sign-in whose code exchange finishes after a sign-out", async () => {
    const service = new AuthService(config);
    let release!: () => void;
    msal.codeGate = new Promise<void>((resolve) => (release = resolve));
    try {
      const pending = await start(service, a);
      await pending.redirect();
      await service.signOut();
      release();
      await expect(pending.done).rejects.toThrow("Sign-in was cancelled.");
      expect(service.getStatus().signedIn).toBe(false);
    } finally {
      msal.codeGate = null;
    }
  });

  it("applies a sign-in that finishes after another one", async () => {
    const service = new AuthService(config);
    let release!: () => void;
    msal.codeGate = new Promise<void>((resolve) => (release = resolve));
    msal.removed = [];
    try {
      const first = await start(service, a);
      await first.redirect();
      msal.codeGate = null;
      const second = await start(service, b);
      await second.redirect();
      await expect(second.done).resolves.toMatchObject({ account: b.username });
      release();
      await expect(first.done).resolves.toMatchObject({ account: a.username });
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: a.username });
      expect(msal.removed).toEqual([]);
    } finally {
      msal.codeGate = null;
      await service.signOut();
    }
  });

  it.each([
    ["the same account", a],
    ["another account", b],
  ])(
    "keeps a newer sign-in as %s when an exchange that straddled a sign-out finishes later",
    async (_name, newer) => {
      const service = new AuthService(config);
      let release!: () => void;
      msal.codeGate = new Promise<void>((resolve) => (release = resolve));
      try {
        const stale = await start(service, a);
        await stale.redirect();
        await service.signOut();
        msal.codeGate = null;
        msal.removed = [];
        const fresh = await start(service, newer);
        await fresh.redirect();
        await expect(fresh.done).resolves.toMatchObject({ account: newer.username });
        release();
        await expect(stale.done).rejects.toThrow("Sign-in was cancelled.");
        // Only the stale exchange's own account goes, never the newer one.
        expect(msal.removed).toEqual(newer === a ? [] : [a.homeAccountId]);
        expect(service.getStatus()).toMatchObject({ signedIn: true, account: newer.username });
        expect(await service.getAccessToken()).toBe(`token-${newer.homeAccountId}`);
      } finally {
        msal.codeGate = null;
        await service.signOut();
      }
    },
  );

  it("cancels a sign-in waiting for the browser when another one starts", async () => {
    const service = new AuthService(config);
    const opened: string[] = [];
    // The first is replaced before its browser opens, so it opens none.
    const first = service.signInInteractive(async () => {
      opened.push("first");
    });
    const second = service.signInInteractive(async () => {
      opened.push("second");
    });
    await expect(first).rejects.toThrow("Sign-in was cancelled.");
    await vi.waitFor(() => expect(opened).toEqual(["second"]));
    const replaced = expect(second).rejects.toThrow("Sign-in was cancelled.");
    const third = await start(service, b);
    await replaced;
    await third.redirect();
    await expect(third.done).resolves.toMatchObject({ account: b.username });
    expect(opened).toEqual(["second"]);
    await service.signOut();
  });

  it("lets sign-out cancel a waiting sign-in after an earlier one finished", async () => {
    const service = new AuthService(config);
    let release!: () => void;
    msal.codeGate = new Promise<void>((resolve) => (release = resolve));
    try {
      const first = await start(service, a);
      await first.redirect();
      const second = await start(service, b);
      release();
      await expect(first.done).resolves.toMatchObject({ account: a.username });
      await service.signOut();
      await expect(second.done).rejects.toThrow("Sign-in was cancelled.");
      expect(service.getStatus().signedIn).toBe(false);
    } finally {
      msal.codeGate = null;
    }
  });
});

describe("AuthService.getAccessToken", () => {
  const config = { clientId: "c", tenantId: "organizations", scopes: ["User.Read"] };

  it("keeps the session when sign-in cannot be reached and ends it when it needs a new sign-in", async () => {
    const statuses: boolean[] = [];
    const service = new AuthService(config, (status) => statuses.push(status.signedIn));
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    // Already inside the refresh window, so every call asks MSAL.
    msal.tokenLifetime = 30_000;
    try {
      await signIn(service);
      expect(service.getStatus().signedIn).toBe(true);

      msal.silentError = { errorCode: "network_error", message: "Network request failed" };
      expect(await service.getAccessToken()).toBeNull();
      expect(service.signInUnreachable()).toBe(true);
      expect(service.getStatus().signedIn).toBe(true);

      // The network is back: the next call renews the token.
      msal.silentError = null;
      expect(await service.getAccessToken()).toBe("token-a");
      expect(service.signInUnreachable()).toBe(false);

      msal.silentError = { errorCode: "invalid_grant", name: "InteractionRequiredAuthError" };
      expect(await service.getAccessToken()).toBeNull();
      expect(service.signInUnreachable()).toBe(false);
      expect(service.getStatus().signedIn).toBe(false);
      expect(statuses.at(-1)).toBe(false);
    } finally {
      msal.tokenLifetime = 3600_000;
      msal.silentError = null;
      await service.signOut();
    }
  });
});

describe("AuthService unreachable sign-in", () => {
  const config = { clientId: "c", tenantId: "organizations", scopes: ["User.Read"] };

  it("retries with backoff after a network error and ends the session once the sign-in is revoked", async () => {
    const statuses: boolean[] = [];
    const service = new AuthService(config, (status) => statuses.push(status.signedIn));
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    await signIn(service);
    // The token is near its end; the refresh timer of the sign-in is native
    // and is cleared by the first retry.
    vi.useFakeTimers({ now: Date.now() + 3600_000, shouldClearNativeTimers: true });
    try {
      msal.silentError = { errorCode: "network_error", message: "Network request failed" };
      msal.silent = [];
      expect(await service.getAccessToken()).toBeNull();
      expect(service.signInUnreachable()).toBe(true);
      expect(msal.silent).toHaveLength(1);

      // Nothing calls Graph; the retry runs by itself after 30 seconds.
      await vi.advanceTimersByTimeAsync(29_999);
      expect(msal.silent).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(msal.silent).toHaveLength(2);
      expect(service.getStatus().signedIn).toBe(true);

      // Still unreachable: the next retry waits twice as long.
      await vi.advanceTimersByTimeAsync(59_999);
      expect(msal.silent).toHaveLength(2);
      msal.silentError = { errorCode: "invalid_grant", name: "InteractionRequiredAuthError" };
      await vi.advanceTimersByTimeAsync(1);
      expect(msal.silent).toHaveLength(3);
      expect(service.signInUnreachable()).toBe(false);
      expect(service.getStatus().signedIn).toBe(false);
      expect(statuses.at(-1)).toBe(false);

      // The session ended: no more retries.
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(msal.silent).toHaveLength(3);
    } finally {
      vi.useRealTimers();
      msal.silentError = null;
      await service.signOut();
    }
  });

  it("caps the backoff at five minutes and stops retrying after sign-out", async () => {
    const service = new AuthService(config);
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    await signIn(service);
    vi.useFakeTimers({ now: Date.now() + 3600_000, shouldClearNativeTimers: true });
    try {
      msal.silentError = { errorCode: "ENOTFOUND" };
      msal.silent = [];
      await service.getAccessToken();
      // 30 s, 60 s, 120 s, 240 s, then every 300 s.
      await vi.advanceTimersByTimeAsync(30_000 + 60_000 + 120_000 + 240_000);
      expect(msal.silent).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(299_999);
      expect(msal.silent).toHaveLength(5);
      await vi.advanceTimersByTimeAsync(1);
      expect(msal.silent).toHaveLength(6);
      await service.signOut();
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(msal.silent).toHaveLength(6);
    } finally {
      vi.useRealTimers();
      msal.silentError = null;
      await service.signOut();
    }
  });

  it("keeps the session for the errors real MSAL raises when Entra is down, ends it when the grant is refused", async () => {
    const outage = await realRefreshErrors([
      // A 5xx JSON answer, then MSAL's throttle replay of it.
      () => answer(503, { error: "server_error", error_description: "AADSTS90033", error_codes: [90033] }),
      () => answer(200, {}),
      // Without error codes the replay has an empty code.
      "fresh",
      () => answer(500, { error: "server_error", error_description: "busy" }),
      () => answer(200, {}),
      "fresh",
      () => answer(503, { error: "temporarily_unavailable", error_description: "later", error_codes: [50001] }),
      "fresh",
      () => answer(429, { error: "temporarily_unavailable", error_description: "slow down", error_codes: [50196] }),
      () => answer(200, {}),
      // A proxy error page that is not JSON.
      "fresh",
      () => answer(502, "<html>Bad gateway</html>"),
      "fresh",
      () => {
        throw new TypeError("fetch failed");
      },
    ]);
    expect(outage.map((error) => [error.name, error.errorCode])).toEqual([
      ["ServerError", "server_error"],
      ["ServerError", "90033"],
      ["ServerError", "server_error"],
      ["ServerError", ""],
      ["ServerError", "temporarily_unavailable"],
      ["ServerError", "temporarily_unavailable"],
      ["ServerError", "50196"],
      ["AuthError", "token_parsing_error"],
      ["AuthError", "network_error"],
    ]);
    // MSAL keeps no HTTP status on these.
    expect(outage.every((error) => (error as { status?: number }).status === undefined)).toBe(true);
    // A direct answer keeps its first error code as errorNo; the throttle
    // replays keep none.
    expect(outage.map((error) => error.errorNo)).toEqual([
      90033,
      undefined,
      undefined,
      undefined,
      50001,
      50196,
      undefined,
      undefined,
      undefined,
    ]);
    const verdicts = await realRefreshErrors([
      // A verdict without an error field: the code is empty as in a replay,
      // but errorNo keeps the error code.
      () => answer(400, { error_description: "AADSTS70008: The refresh token has expired.", error_codes: [70008] }),
      "fresh",
      () => answer(400, { error: "invalid_grant", error_description: "AADSTS70008", error_codes: [70008] }),
      "fresh",
      () =>
        answer(400, {
          error: "invalid_grant",
          error_description: "AADSTS700082",
          error_codes: [700082],
          suberror: "bad_token",
        }),
      "fresh",
      () => answer(400, { error: "interaction_required", error_description: "AADSTS50076", error_codes: [50076] }),
      "fresh",
      () => answer(400, { error: "invalid_client", error_description: "AADSTS7000218", error_codes: [7000218] }),
    ]);
    expect(verdicts.map((error) => [error.name, error.errorCode])).toEqual([
      ["ServerError", ""],
      ["ServerError", "invalid_grant"],
      ["InteractionRequiredAuthError", "invalid_grant"],
      ["InteractionRequiredAuthError", "interaction_required"],
      ["ServerError", "invalid_client"],
    ]);
    expect(verdicts[0]!.errorNo).toBe(70008);

    const service = new AuthService(config);
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    msal.tokenLifetime = 30_000;
    try {
      await signIn(service);
      for (const error of outage) {
        msal.silentError = error as unknown as Record<string, unknown>;
        expect(await service.getAccessToken()).toBeNull();
        expect(service.signInUnreachable()).toBe(true);
        expect(service.getStatus().signedIn).toBe(true);
      }
      for (const error of verdicts) {
        msal.silentError = null;
        expect(await service.getAccessToken()).toBe("token-a");
        msal.silentError = error as unknown as Record<string, unknown>;
        expect(await service.getAccessToken()).toBeNull();
        expect(service.signInUnreachable()).toBe(false);
        expect(service.getStatus().signedIn).toBe(false);
      }
    } finally {
      msal.tokenLifetime = 3600_000;
      msal.silentError = null;
      await service.signOut();
    }
  });

  it("explains a missing token by an unreachable sign-in, not by asking to sign in", async () => {
    const service = new AuthService(config);
    expect(service.noTokenError("Sign in before checking permissions.").message).toBe(
      "Sign in before checking permissions.",
    );
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    msal.tokenLifetime = 30_000;
    try {
      await signIn(service);
      msal.silentError = { errorCode: "network_error" };
      expect(await service.grantedScopes()).toBeNull();
      const error = service.noTokenError("Sign in before checking permissions.");
      expect(error).toBeInstanceOf(SignInUnreachableError);
      expect(error.message).toBe(SIGN_IN_UNREACHABLE);
      expect(service.noTokenError()).toBeInstanceOf(SignInUnreachableError);
    } finally {
      msal.tokenLifetime = 3600_000;
      msal.silentError = null;
      await service.signOut();
    }
  });
});

describe("AuthService account switch during a silent refresh", () => {
  const config = { clientId: "c", tenantId: "organizations", scopes: ["User.Read"] };
  const a = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
  const b = { homeAccountId: "b", username: "b@fabrikam.com", tenantId: "t-b" };

  // Holds a silent refresh of A while signing in interactively as each of
  // next in turn, then lets the refresh finish. A refreshed token would
  // last two hours, the interactive ones one hour.
  async function switchDuringRefresh(
    refresh: (service: AuthService) => Promise<string | null>,
    error: Record<string, unknown> | null = null,
    next: Array<typeof a> = [b],
  ) {
    const statuses: Array<string | null> = [];
    const service = new AuthService(config, (status) => statuses.push(status.account));
    msal.nextAccount = { ...a };
    // A's token is near its end, so the call goes to MSAL.
    msal.tokenLifetime = 30_000;
    await signIn(service);
    let release!: () => void;
    msal.silentGate = new Promise<void>((resolve) => (release = resolve));
    msal.silentError = error;
    const pending = refresh(service);
    msal.silentGate = null;
    msal.silentError = null;
    msal.tokenLifetime = 3600_000;
    for (const account of next) {
      msal.nextAccount = { ...account };
      await signIn(service);
    }
    msal.tokenLifetime = 2 * 3600_000;
    release();
    try {
      return { service, statuses, result: await pending };
    } finally {
      msal.tokenLifetime = 3600_000;
    }
  }

  // The session of the last interactive sign-in, not the refreshed one.
  const interactiveExpiry = (service: AuthService) =>
    Date.parse(service.getStatus().expiresOn ?? "") - Date.now();

  it("ignores a refreshed token of the previous account", async () => {
    const { service, statuses, result } = await switchDuringRefresh((service) => service.getAccessToken());
    try {
      expect(result).toBeNull();
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: b.username, tenantId: b.tenantId });
      expect(service.getOwnerKey()).toBe(`${b.username}|${b.tenantId}`);
      expect(await service.getAccessToken()).toBe("token-b");
      expect(statuses.at(-1)).toBe(b.username);
    } finally {
      await service.signOut();
    }
  });

  it("does not end the new session when the previous account's refresh fails", async () => {
    const { service, result } = await switchDuringRefresh(
      (service) => service.getAccessToken(),
      { name: "InteractionRequiredAuthError", errorCode: "invalid_grant" },
    );
    try {
      expect(result).toBeNull();
      expect(service.signInUnreachable()).toBe(false);
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: b.username });
      expect(await service.getAccessToken()).toBe("token-b");
    } finally {
      await service.signOut();
    }
  });

  it("ignores a refreshed token after a new interactive sign-in as the same account", async () => {
    const { service, result } = await switchDuringRefresh((service) => service.getAccessToken(), null, [a]);
    try {
      expect(result).toBeNull();
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: a.username });
      expect(interactiveExpiry(service)).toBeLessThanOrEqual(3600_000);
    } finally {
      await service.signOut();
    }
  });

  it("does not end a new session of the same account when the earlier refresh is refused", async () => {
    const { service, result } = await switchDuringRefresh(
      (service) => service.getAccessToken(),
      { name: "InteractionRequiredAuthError", errorCode: "invalid_grant" },
      [a],
    );
    try {
      expect(result).toBeNull();
      expect(service.signInUnreachable()).toBe(false);
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: a.username });
      expect(await service.getAccessToken()).toBe("token-a");
    } finally {
      await service.signOut();
    }
  });

  it("ignores a refresh of A that outlasts a sign-in as B and back to A", async () => {
    const { service, statuses, result } = await switchDuringRefresh(
      (service) => service.getAccessToken(),
      null,
      [b, a],
    );
    try {
      expect(result).toBeNull();
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: a.username });
      expect(interactiveExpiry(service)).toBeLessThanOrEqual(3600_000);
      expect(statuses.slice(-2)).toEqual([b.username, a.username]);
    } finally {
      await service.signOut();
    }
  });

  it("returns no ID token of the previous account", async () => {
    msal.cachedIdTokenAge = 0;
    const { service, result } = await switchDuringRefresh((service) => service.getIdToken());
    try {
      expect(result).toBeNull();
      expect(service.getStatus()).toMatchObject({ signedIn: true, account: b.username });
      expect(await service.getAccessToken()).toBe("token-b");
    } finally {
      await service.signOut();
    }
  });
});

describe("AuthService.getIdToken", () => {
  const config = { clientId: "c", tenantId: "organizations", scopes: ["User.Read"] };

  it("returns a recent cached ID token and renews an old one", async () => {
    const service = new AuthService(config);
    expect(await service.getIdToken()).toBeNull();
    msal.nextAccount = { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" };
    await signIn(service);

    msal.cachedIdTokenAge = 60_000;
    msal.silent = [];
    expect(await service.getIdToken()).toMatch(/^h\./);
    expect(msal.silent).toEqual([false]);

    // Entra backdates iat by five minutes: a token issued two minutes ago
    // reads as seven minutes old and must not be renewed again.
    msal.cachedIdTokenAge = 7 * 60_000;
    msal.silent = [];
    expect(await service.getIdToken()).toMatch(/^h\./);
    expect(msal.silent).toEqual([false]);

    msal.cachedIdTokenAge = 30 * 60_000;
    msal.silent = [];
    const token = await service.getIdToken();
    expect(msal.silent).toEqual([false, true]);
    const iat = JSON.parse(
      Buffer.from(token!.split(".")[1]!, "base64url").toString(),
    ) as { iat: number };
    expect(Date.now() / 1000 - iat.iat).toBeLessThan(5);
  });
});
