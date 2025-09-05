import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { configCache } from "~/lib/pdf-cache";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const data = await request.json();

    // Generate a unique session ID for this export
    const sessionId = uuidv4();

    // Store the configuration data with the token
    configCache.set(sessionId, {
      data,
      timestamp: Date.now(),
      token
    });

    // Return the session ID to the client
    return NextResponse.json({
      sessionId,
      message: "Configuration data prepared for PDF generation"
    });
  } catch (error: any) {
    console.error("Error preparing PDF data:", error);
    return NextResponse.json(
      { error: "Failed to prepare PDF data" },
      { status: 500 }
    );
  }
}

