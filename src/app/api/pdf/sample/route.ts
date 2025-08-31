import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";

export async function GET() {
  try {
    // Read the existing sample PDF file
    const filePath = path.join(process.cwd(), "IntuneDocumentation-Sample.pdf");
    const pdfBuffer = await readFile(filePath);
    
    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(pdfBuffer);
    
    // Create response with PDF
    return new NextResponse(uint8Array, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'attachment; filename="IntuneDocumentation-Sample.pdf"',
        "Cache-Control": "public, max-age=3600", // Cache for 1 hour
      },
    });
  } catch (error) {
    console.error("Error serving sample PDF:", error);
    return NextResponse.json(
      { error: "Failed to serve sample PDF" },
      { status: 500 }
    );
  }
}