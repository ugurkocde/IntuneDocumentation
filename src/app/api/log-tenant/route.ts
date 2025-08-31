import { type NextRequest, NextResponse } from "next/server";
import { extractTenantFromRequest } from "~/lib/auth-middleware";

export async function POST(request: NextRequest) {
  try {
    // Extract and log tenant information server-side only
    extractTenantFromRequest(request);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error logging tenant access:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}