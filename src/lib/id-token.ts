import type {
  AccountInfo,
  IPublicClientApplication,
} from "@azure/msal-browser";
import { graphScopes } from "~/lib/msal-config";

const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

// Returns the account's Entra ID token for the stats routes, which verify it
// server side. MSAL's silent flow does not renew an expired ID token while the
// access token is still cached, so an expiring one is refreshed with the
// refresh token. Never prompts: the metrics are best effort.
export async function getIdToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string | undefined> {
  const exp = account.idTokenClaims?.exp;
  if (account.idToken && exp && exp * 1000 - EXPIRY_MARGIN_MS > Date.now()) {
    return account.idToken;
  }
  try {
    const result = await instance.acquireTokenSilent({
      scopes: [...graphScopes.scopes],
      account,
      forceRefresh: true,
    });
    return result.idToken || undefined;
  } catch {
    return undefined;
  }
}
