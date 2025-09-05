import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generatePDF } from "~/lib/pdf-generator-jspdf";
import { extractTenantFromRequest } from "~/lib/auth-middleware";
import { supabase } from "~/lib/supabase";

export async function POST(request: NextRequest) {
  console.log("[PDF Generation Basic] Request received");
  
  try {
    // Log tenant access
    extractTenantFromRequest(request);
    
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[PDF Generation Basic] Missing or invalid authorization header");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let data;
    try {
      data = await request.json();
      console.log("[PDF Generation Basic] Request body parsed successfully");
    } catch (parseError) {
      console.error("[PDF Generation Basic] Failed to parse request body:", parseError);
      return NextResponse.json(
        { 
          error: "Invalid request data",
          message: "Failed to parse request body"
        },
        { status: 400 }
      );
    }

    // Generate PDF
    console.log("[PDF Generation Basic] Starting PDF generation");
    let pdfBuffer;
    try {
      pdfBuffer = await generatePDF(data);
      console.log("[PDF Generation Basic] PDF generated successfully, buffer size:", pdfBuffer?.length || 0);
    } catch (pdfError) {
      console.error("[PDF Generation Basic] Failed to generate PDF:", pdfError);
      throw pdfError;
    }

    // Increment export counter in Supabase
    if (supabase) {
      try {
        console.log("[PDF Generation Basic] Incrementing export counter in Supabase");
        const { error } = await supabase.rpc("increment_export_count");
        if (error) {
          console.error("[PDF Generation Basic] Failed to increment export count:", error);
        } else {
          console.log("[PDF Generation Basic] Export count incremented successfully");
        }
      } catch (err) {
        console.error("[PDF Generation Basic] Error calling increment function:", err);
      }
    } else {
      console.log("[PDF Generation Basic] Supabase client not configured, skipping export count");
    }

    // Return PDF as response
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Intune-Documentation-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("[PDF Generation Basic] Fatal error:", error);
    console.error("[PDF Generation Basic] Error type:", error?.constructor?.name);
    console.error("[PDF Generation Basic] Error message:", error?.message);
    console.error("[PDF Generation Basic] Error stack:", error?.stack);
    
    const errorResponse = {
      error: "Failed to generate PDF",
      message: error?.message || "An unexpected error occurred",
      type: error?.constructor?.name || "Unknown"
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}