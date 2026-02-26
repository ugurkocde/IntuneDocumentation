import type { AccountInfo } from "@azure/msal-browser";
import { createHash } from "crypto";

interface TenantInfo {
  tenantId: string;
  tenantName?: string;
  userPrincipalName: string;
  userName?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

function hashPii(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function extractTenantInfo(account: AccountInfo | null, request?: Request): TenantInfo | null {
  if (!account) return null;

  const tenantInfo: TenantInfo = {
    tenantId: account.tenantId,
    tenantName: account.tenantId,
    userPrincipalName: account.username,
    userName: account.name || undefined,
    timestamp: new Date().toISOString(),
  };

  if (request) {
    tenantInfo.ipAddress = request.headers.get('x-forwarded-for') ||
                           request.headers.get('x-real-ip') ||
                           undefined;
    tenantInfo.userAgent = request.headers.get('user-agent') || undefined;
  }

  return tenantInfo;
}

export function logTenantAccess(tenantInfo: TenantInfo | null, context: string = "Unknown") {
  if (!tenantInfo) {
    console.log(`[TENANT-TRACKER] No tenant info available for context: ${context}`);
    return;
  }

  console.log(
    `[TENANT-ACCESS] ${JSON.stringify({
      context,
      tenantId: tenantInfo.tenantId,
      userHash: hashPii(tenantInfo.userPrincipalName),
      timestamp: tenantInfo.timestamp,
    })}`
  );
}

// Helper function to get tenant info from ID token claims
export function extractTenantFromToken(idTokenClaims: any): Partial<TenantInfo> | null {
  if (!idTokenClaims) return null;

  return {
    tenantId: idTokenClaims.tid || idTokenClaims.tenantId,
    tenantName: idTokenClaims.tenant_name || idTokenClaims.tid,
    userPrincipalName: idTokenClaims.preferred_username || idTokenClaims.upn,
    userName: idTokenClaims.name,
    timestamp: new Date().toISOString(),
  };
}