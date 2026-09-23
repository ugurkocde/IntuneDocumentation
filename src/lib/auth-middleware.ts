import type { NextRequest } from "next/server";
import { createPublicKey, type JsonWebKey, type KeyObject } from "crypto";
import jwt from "jsonwebtoken";
import { logTenantAccess } from "~/lib/tenant-tracker";

interface TokenPayload {
  tid?: string;
  tenantId?: string;
  tenant_name?: string;
  preferred_username?: string;
  upn?: string;
  name?: string;
  unique_name?: string;
}

export interface ExtractedTenantInfo {
  tenantId: string;
  tenantName: string;
  userPrincipalName: string;
  userName?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

export function extractTenantFromRequest(request: NextRequest): ExtractedTenantInfo | null {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[TENANT-TRACKER] No bearer token found in request");
      return null;
    }

    const token = authHeader.substring(7);
    
    // Decode token without verification (since we're just logging, not authenticating)
    const decoded = jwt.decode(token) as TokenPayload | null;
    
    if (!decoded) {
      console.log("[TENANT-TRACKER] Failed to decode token");
      return null;
    }

    const tenantInfo = {
      tenantId: decoded.tid || decoded.tenantId || "unknown",
      tenantName: decoded.tenant_name || decoded.tid || "unknown",
      userPrincipalName: decoded.preferred_username || decoded.upn || decoded.unique_name || "unknown",
      userName: decoded.name,
      timestamp: new Date().toISOString(),
      ipAddress: request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 undefined,
      userAgent: request.headers.get('user-agent') || undefined
    };

    const pathname = new URL(request.url).pathname;
    logTenantAccess(tenantInfo, `API-${pathname}`);

    return tenantInfo;
  } catch (error) {
    console.error("[TENANT-TRACKER] Error extracting tenant from request:", error);
    return null;
  }
}

// Entra signing keys for v2.0 tokens. Only ID tokens issued to this app are
// verified here: Graph access tokens are not meant to be validated by anyone
// but Graph.
const ENTRA_JWKS_URL =
  "https://login.microsoftonline.com/common/discovery/v2.0/keys";
const JWKS_MAX_AGE_MS = 24 * 60 * 60 * 1000;
// An unknown kid triggers at most one refetch per cooldown, so forged kids
// cannot turn the route into a JWKS fetch loop.
const JWKS_REFETCH_COOLDOWN_MS = 5 * 60 * 1000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
      if (!response.ok) throw new Error(`JWKS fetch failed: ${response.status}`);
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

export interface VerifiedIdentity {
  tenantId: string;
  userPrincipalName: string;
  objectId?: string;
}

// Verifies the Entra ID token in the Authorization header: RS256 signature
// against the Entra JWKS, audience equal to this app's client ID, a v2.0
// issuer for the token's own tid, and expiry. Returns null on any failure.
export async function verifyIdTokenFromRequest(
  request: Request,
): Promise<VerifiedIdentity | null> {
  const clientId =
    process.env.AZURE_AD_CLIENT_ID ??
    process.env.NEXT_PUBLIC_AZURE_AD_CLIENT_ID;
  const authHeader = request.headers.get("authorization");
  if (!clientId || !authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.decode(token, { complete: true });
    const kid = decoded?.header.kid;
    if (!kid || decoded.header.alg !== "RS256") return null;

    const key = await signingKey(kid);
    if (!key) return null;

    const payload = jwt.verify(token, key, {
      algorithms: ["RS256"],
      audience: clientId,
      clockTolerance: 60,
    }) as jwt.JwtPayload & TokenPayload & { oid?: string };

    const tid = payload.tid;
    if (!tid || !GUID.test(tid) || !payload.exp) return null;
    if (payload.iss !== `https://login.microsoftonline.com/${tid}/v2.0`) {
      return null;
    }

    const userPrincipalName =
      payload.preferred_username || payload.upn || payload.unique_name;
    if (!userPrincipalName) return null;

    return { tenantId: tid, userPrincipalName, objectId: payload.oid };
  } catch {
    return null;
  }
}
