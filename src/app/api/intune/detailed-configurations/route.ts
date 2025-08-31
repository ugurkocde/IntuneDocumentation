import { type NextRequest, NextResponse } from "next/server";
import { DetailedIntuneService } from "~/lib/intune-detailed-client";
import { extractTenantFromRequest } from "~/lib/auth-middleware";

export async function GET(request: NextRequest) {
  try {
    // Log tenant access
    extractTenantFromRequest(request);
    
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const service = new DetailedIntuneService(accessToken);
    
    const configurations = await service.getAllDetailedConfigurations();

    return NextResponse.json(configurations);
  } catch (error) {
    console.error("Error fetching detailed Intune configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch detailed configurations", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}