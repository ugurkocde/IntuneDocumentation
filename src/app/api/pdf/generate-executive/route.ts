import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateExecutiveSummaryPDF } from "~/lib/pdf-generator-executive";
import { GroupResolver } from "~/lib/group-resolver";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const data = await request.json();

    // Resolve group names if requested
    let groupNames: Map<string, string> | undefined;
    
    if (request.headers.get("X-Resolve-Groups") === "true") {
      try {
        const groupResolver = new GroupResolver(accessToken);
        
        // Collect all unique group IDs from configurations
        const allGroupIds = new Set<string>();
        const allConfigs = [
          ...data.settingsCatalog,
          ...data.deviceConfigurations,
          ...data.administrativeTemplates,
          ...data.compliancePolicies,
          ...data.securityBaselines,
          ...data.scripts.windows,
          ...data.scripts.macOS,
          ...(data.appConfigurations || []),
          ...(data.windowsUpdatePolicies || []),
          ...(data.enrollmentConfigurations || [])
        ];
        
        allConfigs.forEach(config => {
          if (config.assignments) {
            config.assignments.forEach((assignment: any) => {
              if (assignment.target?.groupId) {
                allGroupIds.add(assignment.target.groupId);
              }
            });
          }
        });
        
        // Batch resolve group names
        groupNames = await groupResolver.getGroupNames(Array.from(allGroupIds));
      } catch (error) {
        console.error("Error resolving group names:", error);
        // Continue without group names if resolution fails
      }
    }

    // Generate executive summary PDF
    const pdfBuffer = await generateExecutiveSummaryPDF({
      ...data,
      groupNames
    });

    // Return PDF as response
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Intune-Executive-Summary-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Error generating executive summary PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate executive summary PDF" },
      { status: 500 }
    );
  }
}