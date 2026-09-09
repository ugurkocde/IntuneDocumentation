import {
  PublicClientApplication,
  InteractionRequiredAuthError,
} from "@azure/msal-browser";
let session: Promise<PublicClientApplication> | undefined;
let scope = "";
export async function enterpriseSession() {
  return (session ??= (async () => {
    const response = await fetch("/api/enterprise/config", {
      cache: "no-store",
    });
    const config = (await response.json()) as {
      enabled: boolean;
      clientId: string | null;
      apiId: string | null;
    };
    if (!config.enabled || !config.clientId || !config.apiId)
      throw new Error(
        "Paid workspace sign-in is not configured on this installation yet. Hobby remains available.",
      );
    scope = `api://${config.apiId}/access_as_user`;
    const app = new PublicClientApplication({
      auth: {
        clientId: config.clientId,
        authority: "https://login.microsoftonline.com/organizations",
        redirectUri: `${location.origin}/enterprise`,
        postLogoutRedirectUri: `${location.origin}/enterprise`,
        navigateToLoginRequestUrl: false,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
    await app.initialize();
    const result = await app.handleRedirectPromise();
    if (result?.account) app.setActiveAccount(result.account);
    if (!app.getActiveAccount() && app.getAllAccounts()[0])
      app.setActiveAccount(app.getAllAccounts()[0]!);
    return app;
  })().catch((error) => {
    session = undefined;
    throw error;
  }));
}
export async function signIn(tenantId?: string) {
  const app = await enterpriseSession();
  await app.loginRedirect({
    scopes: [scope],
    prompt: "select_account",
    ...(tenantId
      ? { authority: `https://login.microsoftonline.com/${tenantId}` }
      : {}),
  });
}
export async function signOut() {
  const app = await enterpriseSession();
  sessionStorage.removeItem("enterprise.invitation");
  sessionStorage.removeItem("enterprise.connection");
  await app.logoutRedirect();
}
export async function api<T = any>(
  path: string,
  body?: unknown,
  download = false,
  forceRefresh = false,
): Promise<T> {
  const app = await enterpriseSession(),
    account = app.getActiveAccount();
  if (!account)
    throw new Error("Sign in with your Microsoft business account.");
  let token;
  try {
    token = await app.acquireTokenSilent({
      account,
      scopes: [scope],
      forceRefresh,
      authority: `https://login.microsoftonline.com/${account.tenantId}`,
    });
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      await app.acquireTokenRedirect({
        account,
        scopes: [scope],
        authority: `https://login.microsoftonline.com/${account.tenantId}`,
      });
      throw new Error("Continue Microsoft sign-in.");
    }
    throw error;
  }
  const response = await fetch(`/api/enterprise/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${token.accessToken}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (!response.ok) {
    const result = (await response.json()) as { error?: string };
    throw new Error(result.error ?? `Request failed (${response.status}).`);
  }
  return (download ? response.blob() : response.json()) as Promise<T>;
}
