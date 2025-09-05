import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generatePDF } from "~/lib/pdf-generator-jspdf";
import { extractTenantFromRequest } from "~/lib/auth-middleware";
import { supabase } from "~/lib/supabase";

export async function POST(request: NextRequest) {
  try {
    // Log tenant access
    extractTenantFromRequest(request);
    
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const data = await request.json();

    // Generate PDF
    const pdfBuffer = await generatePDF(data);

    // Increment export counter in Supabase
    if (supabase) {
      try {
        const { error } = await supabase.rpc("increment_export_count");
        if (error) {
          console.error("Failed to increment export count:", error);
        } else {
          console.log("Export count incremented successfully");
        }
      } catch (err) {
        console.error("Error calling increment function:", err);
      }
    }

    // Return PDF as response
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Intune-Documentation-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}