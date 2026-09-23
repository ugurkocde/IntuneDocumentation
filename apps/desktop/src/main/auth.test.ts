import { createServer, request } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { AuthService, listenLoopback, readCallback } from "./auth";

// A stand-in for MSAL: records the authorization request and answers the
// code exchange for whichever account the test chooses.
const msal = vi.hoisted(() => ({
  lastUrlRequest: null as null | { redirectUri: string; state?: string },
  nextAccount: { homeAccountId: "a", username: "a@contoso.com", tenantId: "t-a" },
  removed: [] as string[],
}));

vi.mock("@azure/msal-node", () => ({
  PublicClientApplication: class {
    getAuthCodeUrl(request: { redirectUri: string; state?: string }) {
      msal.lastUrlRequest = request;
      return Promise.resolve("https://login.microsoftonline.com/authorize");
    }
    acquireTokenByCode() {
      return Promise.resolve({
        accessToken: `token-${msal.nextAccount.homeAccountId}`,
        account: { ...msal.nextAccount },
        expiresOn: new Date(Date.now() + 3600_000),
      });
    }
    getTokenCache() {
      return {
        getAllAccounts: () => Promise.resolve([]),
        removeAccount: (account: { homeAccountId: string }) => {
          msal.removed.push(account.homeAccountId);
          return Promise.resolve();
        },
      };
    }
  },
}));

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
