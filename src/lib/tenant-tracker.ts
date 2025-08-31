import type { AccountInfo } from "@azure/msal-browser";

interface TenantInfo {
  tenantId: string;
  tenantName?: string;
  userPrincipalName: string;
  userName?: string;
  timestamp: string;
  ipAddress?: string;
  userAgent?: string;
}

export function extractTenantInfo(account: AccountInfo | null, request?: Request): TenantInfo | null {
  if (!account) return null;

  const tenantInfo: TenantInfo = {
    tenantId: account.tenantId,
    tenantName: account.tenantId, // Can be replaced with actual tenant name if available
    userPrincipalName: account.username,
    userName: account.name || undefined,
    timestamp: new Date().toISOString(),
  };

  // Add request metadata if available (for API routes)
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

  // CRITICAL: Log tenant ID and UPN explicitly for Vercel logs
  console.log(`
================================================================================
[TENANT-LOGIN-DETECTED] ${context}
--------------------------------------------------------------------------------
TENANT_ID: ${tenantInfo.tenantId}
USER_UPN: ${tenantInfo.userPrincipalName}
USER_NAME: ${tenantInfo.userName || 'N/A'}
TIMESTAMP: ${tenantInfo.timestamp}
IP_ADDRESS: ${tenantInfo.ipAddress || 'N/A'}
================================================================================
  `);

  // Main tenant tracking log - This will appear in Vercel logs
  console.log(
    `[TENANT-ACCESS] ${JSON.stringify({
      context,
      tenantId: tenantInfo.tenantId,
      tenantName: tenantInfo.tenantName,
      user: tenantInfo.userPrincipalName,
      userName: tenantInfo.userName,
      timestamp: tenantInfo.timestamp,
      ip: tenantInfo.ipAddress,
      userAgent: tenantInfo.userAgent
    })}`
  );

  // Additional formatted log for readability
  console.log(`[TENANT-ACCESS] Tenant: ${tenantInfo.tenantId} | User: ${tenantInfo.userPrincipalName} | Context: ${context} | Time: ${tenantInfo.timestamp}`);
  
  // Extra explicit logging to ensure visibility
  console.warn(`TENANT_TRACKING: Customer from tenant ${tenantInfo.tenantId} (${tenantInfo.userPrincipalName}) accessed ${context} at ${tenantInfo.timestamp}`);
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