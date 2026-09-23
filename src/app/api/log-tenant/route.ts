import { type NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { verifyIdTokenFromRequest } from "~/lib/auth-middleware";
import { supabaseWriter as supabase } from "~/lib/supabase";

// Hash function for privacy - user identifiers are hashed before storage
function hashIdentifier(value: string): string {
  return createHash("sha256").update(value.toLowerCase()).digest("hex");
}

export async function POST(request: NextRequest) {
  if (!supabase) {
    return NextResponse.json({ success: true });
  }

  try {
    // Only a verified Entra ID token issued to this app counts as a user
    const identity = await verifyIdTokenFromRequest(request);
    if (!identity) {
      return NextResponse.json({ success: false }, { status: 401 });
    }

    const userHash = hashIdentifier(identity.userPrincipalName);
    const tenantHash = hashIdentifier(identity.tenantId);

    // Log user access (fire and forget, don't block response)
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

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error logging tenant access:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
