import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { extractTenantFromRequest } from "~/lib/auth-middleware";
import { supabase } from "~/lib/supabase";

// Hash function for privacy - user identifiers are hashed before storage
function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    // Extract and log tenant information server-side only
    const tenantInfo = extractTenantFromRequest(request);

    // Track user access for MAU if Supabase is configured
    if (
      supabase &&
      tenantInfo?.userPrincipalName &&
      tenantInfo?.tenantId &&
      tenantInfo.userPrincipalName !== "unknown" &&
      tenantInfo.tenantId !== "unknown"
    ) {
      const userHash = hashIdentifier(tenantInfo.userPrincipalName);
      const tenantHash = hashIdentifier(tenantInfo.tenantId);

      // Log user access (fire and forget - don't block response)
      void (async () => {
        try {
          const { error } = await supabase.rpc("log_user_access", {
            p_user_hash: userHash,
            p_tenant_hash: tenantHash,
          });
          if (error) {
            console.error("[MAU-TRACKER] Failed to log user access:", error);
          } else {
            console.log("[MAU-TRACKER] User access logged successfully");
          }
        } catch (err) {
          console.error("[MAU-TRACKER] Failed to log user access:", err);
        }
      })();
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error logging tenant access:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}