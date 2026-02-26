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