import { createPublicKey, type JsonWebKey, type KeyObject } from "crypto";
import jwt from "jsonwebtoken";

// Entra signing keys for v2.0 tokens. Only ID tokens are verified with them:
// Graph access tokens are not meant to be validated by anyone but Graph.
const ENTRA_JWKS_URL =
  "https://login.microsoftonline.com/common/discovery/v2.0/keys";
const JWKS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// An unknown kid triggers at most one refetch per cooldown, so forged kids
// cannot turn a route into a JWKS fetch loop.
const JWKS_REFETCH_COOLDOWN_MS = 5 * 60 * 1000;
const CLOCK_TOLERANCE_SECONDS = 60;
export const GUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let signingKeys = new Map<string, KeyObject>();
let keysFetchedAt = 0;
let keysInFlight: Promise<void> | undefined;

async function refreshSigningKeys(): Promise<void> {
  keysInFlight ??= (async () => {
    try {
      const response = await fetch(ENTRA_JWKS_URL, {
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok)
        throw new Error(`JWKS fetch failed: ${response.status}`);
      const { keys } = (await response.json()) as {
        keys?: (JsonWebKey & { kid?: string; kty?: string })[];
      };
      const next = new Map<string, KeyObject>();
      for (const key of keys ?? []) {
        if (!key.kid || key.kty !== "RSA") continue;
        next.set(key.kid, createPublicKey({ key, format: "jwk" }));
      }
      signingKeys = next;
    } finally {
      keysFetchedAt = Date.now();
      keysInFlight = undefined;
    }
  })();
  return keysInFlight;
}

async function signingKey(kid: string): Promise<KeyObject | undefined> {
  const age = Date.now() - keysFetchedAt;
  if (
    age > JWKS_MAX_AGE_MS ||
    (!signingKeys.has(kid) && age > JWKS_REFETCH_COOLDOWN_MS)
  ) {
    await refreshSigningKeys();
  }
  return signingKeys.get(kid);
}

export type EntraIdClaims = jwt.JwtPayload & {
  tid: string;
  oid?: string;
  preferred_username?: string;
  upn?: string;
  unique_name?: string;
};

// Verifies an Entra v2.0 ID token: RS256 signature against the Entra JWKS,
// the audience, an issuer for the token's own tid (a GUID), and expiry. An
// access token (it carries scp or roles) is refused. With maxAgeSeconds the
// token must also have been issued within that window; with requireNonce it
// must carry a nonce, which only ID tokens from an /authorize request do.
// Returns the claims, or null on any failure.
export async function verifyEntraIdToken(
  token: string,
  options: {
    audience: string | RegExp;
    maxAgeSeconds?: number;
    requireNonce?: boolean;
  },
): Promise<EntraIdClaims | null> {
  try {
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header.kid;
    if (!kid || decoded.header.alg !== "RS256") return null;

    const key = await signingKey(kid);
    if (!key) return null;

    const payload = jwt.verify(token, key, {
      algorithms: ["RS256"],
      audience: options.audience,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
      ...(options.maxAgeSeconds ? { maxAge: options.maxAgeSeconds } : {}),
    }) as jwt.JwtPayload & {
      tid?: unknown;
      scp?: unknown;
      roles?: unknown;
      nonce?: unknown;
    };

    if (payload.scp !== undefined || payload.roles !== undefined) return null;
    if (
      options.requireNonce &&
      (typeof payload.nonce !== "string" || !payload.nonce)
    )
      return null;

    const tid = payload.tid;
    if (typeof tid !== "string" || !GUID.test(tid) || !payload.exp) return null;
    if (payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
      return null;
    }
    // jsonwebtoken bounds the age of iat but not a future iat.
    if (
      options.maxAgeSeconds &&
      (typeof payload.iat !== "number" ||
        payload.iat > Date.now() / 1000 + CLOCK_TOLERANCE_SECONDS)
    ) {
      return null;
    }
    return payload as EntraIdClaims;
  } catch {
    return null;
  }
}
