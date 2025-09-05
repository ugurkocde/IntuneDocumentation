import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { put } from "@vercel/blob";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const data = await request.json();
    
    // Create a unique filename for this export session
    const timestamp = Date.now();
    const filename = `pdf-config-${timestamp}.json`;
    
    // Upload the configuration data to Vercel Blob
    // The blob will be automatically deleted after 1 hour
    const blob = await put(filename, JSON.stringify(data), {
      access: 'public',
      addRandomSuffix: true,
      // Set a short TTL since this is temporary data
      cacheControlMaxAge: 3600, // 1 hour
    });
    
    // Return the blob URL to the client
    return NextResponse.json({
      url: blob.url,
      message: "Configuration uploaded successfully"
    });
  } catch (error: any) {
    console.error("Error uploading configuration:", error);
    return NextResponse.json(
      { error: "Failed to upload configuration", message: error?.message },
      { status: 500 }
    );
  }
}