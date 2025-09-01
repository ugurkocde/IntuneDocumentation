import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateDetailedPDF } from "~/lib/pdf-generator-detailed";
import { GroupResolver } from "~/lib/group-resolver";
import { Client } from "@microsoft/microsoft-graph-client";
import { isTokenExpired, validateToken } from "~/lib/auth-utils";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    
    // Check if token is expired
    if (isTokenExpired(accessToken)) {
      return NextResponse.json(
        { 
          error: "Token expired",
          message: "Access token has expired. Please refresh your authentication.",
          code: "TOKEN_EXPIRED"
        },
        { status: 401 }
      );
    }
    
    // Validate token with a simple API call
    const tokenValidation = await validateToken(accessToken);
    if (!tokenValidation.isValid) {
      return NextResponse.json(
        {
          error: tokenValidation.error || "Authentication failed",
          message: tokenValidation.needsRefresh 
            ? "Token needs to be refreshed. Please re-authenticate."
            : "Invalid token or insufficient permissions.",
          code: tokenValidation.needsRefresh ? "TOKEN_REFRESH_NEEDED" : "AUTH_FAILED"
        },
        { status: 401 }
      );
    }
    
    const data = await request.json();
    
    // Debug log the branding data
    console.log('API Route - Branding data received:', {
      hasBranding: !!data.branding,
      companyName: data.branding?.companyName,
      department: data.branding?.department,
      hasLogo: !!data.branding?.logo?.dataUrl,
      logoPosition: data.branding?.logo?.position,
      colors: data.branding?.colors
    });

    // Resolve group names
    let groupNames = new Map<string, string>();
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
        ...data.scripts.macOS
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
      if (allGroupIds.size > 0) {
        groupNames = await groupResolver.getGroupNames(Array.from(allGroupIds));
      }
    } catch (error) {
      console.error("Error resolving group names:", error);
      // Continue without group names if resolution fails
    }

    // Fetch device counts by platform
    const deviceCounts: Record<string, number> = {};
    try {
      const client = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });

      // Fetch managed devices with platform information
      const devicesResponse = await client
        .api("/deviceManagement/managedDevices")
        .select("id,operatingSystem")
        .top(999)
        .get();

      // Count devices by platform
      if (devicesResponse.value) {
        devicesResponse.value.forEach((device: any) => {
          const os = device.operatingSystem || "Unknown";
          deviceCounts[os] = (deviceCounts[os] || 0) + 1;
        });
      }
    } catch (error: any) {
      console.error("Error fetching device counts:", error);
      
      // Check if it's an authentication error
      if (error?.statusCode === 401) {
        console.log("Device counts skipped - Token may be expired. Will continue without device counts.");
      } else if (error?.statusCode === 403) {
        console.log("Device counts skipped - Insufficient permissions. The app may lack DeviceManagementManagedDevices.Read.All permission.");
      }
      
      // Continue without device counts if fetch fails
      // This is optional data, so we don't fail the entire PDF generation
    }

    // Generate detailed PDF with all settings, group names, device counts, and branding
    const pdfBuffer = await generateDetailedPDF({
      ...data,
      groupNames,
      deviceCounts,
      branding: data.branding
    });

    // Return PDF as response (convert Uint8Array to Buffer for NextResponse)
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Intune-Detailed-Configuration-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating detailed PDF:", error);
    
    // Check if it's a JSON parse error (might indicate token issues)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          error: "Invalid request data",
          message: "Failed to parse request body"
        },
        { status: 400 }
      );
    }
    
    return NextResponse.json(
      { 
        error: "Failed to generate detailed PDF",
        message: error?.message || "An unexpected error occurred"
      },
      { status: 500 }
    );
  }
}