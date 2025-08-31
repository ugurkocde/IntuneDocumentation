import { NextRequest, NextResponse } from "next/server";
import { IntuneConfigurationService } from "~/lib/intune-graph-client";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const service = new IntuneConfigurationService(accessToken);
    
    // Get platform from query parameter if provided
    const { searchParams } = new URL(request.url);
    const platform = searchParams.get("platform");
    
    let configurations;
    if (platform && ['Windows', 'macOS', 'iOS', 'Android'].includes(platform)) {
      configurations = await service.getConfigurationsByPlatform(platform as any);
    } else {
      configurations = await service.getAllDeviceConfigurations();
    }

    return NextResponse.json(configurations);
  } catch (error) {
    console.error("Error fetching Intune configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch configurations", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}