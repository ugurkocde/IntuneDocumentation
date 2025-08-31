import type { NextRequest } from "next/server";
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

export function extractTenantFromRequest(request: NextRequest): void {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.log("[TENANT-TRACKER] No bearer token found in request");
      return;
    }

    const token = authHeader.substring(7);
    
    // Decode token without verification (since we're just logging, not authenticating)
    const decoded = jwt.decode(token) as TokenPayload | null;
    
    if (!decoded) {
      console.log("[TENANT-TRACKER] Failed to decode token");
      return;
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

    // Log the tenant access with API route context
    const pathname = new URL(request.url).pathname;
    
    // CRITICAL: Explicit API access logging
    console.log(`
[API-ACCESS-DETECTED] ${pathname}
TENANT_ID: ${tenantInfo.tenantId}
USER_UPN: ${tenantInfo.userPrincipalName}
USER_NAME: ${tenantInfo.userName || 'N/A'}
IP: ${tenantInfo.ipAddress || 'N/A'}
TIME: ${tenantInfo.timestamp}
    `);
    
    logTenantAccess(tenantInfo, `API-${pathname}`);

  } catch (error) {
    console.error("[TENANT-TRACKER] Error extracting tenant from request:", error);
  }
}