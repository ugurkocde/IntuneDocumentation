import { NextRequest, NextResponse } from "next/server";
import { IntuneService } from "~/lib/graph-client";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");

    const intuneService = new IntuneService(accessToken);
    const configurations = await intuneService.getAllConfigurations();

    return NextResponse.json(configurations);
  } catch (error) {
    console.error("Error fetching Intune configurations:", error);
    return NextResponse.json(
      { error: "Failed to fetch configurations" },
      { status: 500 }
    );
  }
}