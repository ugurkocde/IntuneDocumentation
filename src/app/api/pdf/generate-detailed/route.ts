import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateDetailedPDF } from "~/lib/pdf-generator-detailed";
import { GroupResolver } from "~/lib/group-resolver";
import { Client } from "@microsoft/microsoft-graph-client";
import { collectAllPages } from "~/lib/graph-paging";
import { isTokenExpired, validateToken } from "~/lib/auth-utils";
import { supabase } from "~/lib/supabase";

export async function POST(request: NextRequest) {
  console.log("[PDF Generation] Request received");
  
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      console.error("[PDF Generation] Missing or invalid authorization header");
      return NextResponse.json(
        { error: "Unauthorized", message: "Missing or invalid authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    
    // Check if token is expired
    if (isTokenExpired(accessToken)) {
      console.error("[PDF Generation] Token expired");
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
      console.error("[PDF Generation] Token validation failed:", tokenValidation.error);
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
    
    console.log("[PDF Generation] Token validated successfully");
    
    let data;
    try {
      data = await request.json();
      console.log("[PDF Generation] Request body parsed successfully");
    } catch (parseError) {
      console.error("[PDF Generation] Failed to parse request body:", parseError);
      return NextResponse.json(
        { 
          error: "Invalid request data",
          message: "Failed to parse request body"
        },
        { status: 400 }
      );
    }
    
    // Debug log the branding data
    console.log('API Route - Branding data received:', {
      hasBranding: !!data.branding,
      companyName: data.branding?.companyName,
      department: data.branding?.department,
      hasLogo: !!data.branding?.logo?.dataUrl,
      logoPosition: data.branding?.logo?.position,
      colors: data.branding?.colors
    });

    // Resolve group names (assignments and Conditional Access group conditions)
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
        ...data.scripts.macOS,
        ...(data.conditionalAccessPolicies || [])
      ];
      
      allConfigs.forEach(config => {
        if (config.assignments) {
          config.assignments.forEach((assignment: any) => {
            if (assignment.target?.groupId) {
              allGroupIds.add(assignment.target.groupId);
            }
          });
        }
        // Extract group IDs from CA policy conditions
        if (config.conditions && (config.conditions.users || config.conditions.users?.includeGroups || config.conditions.users?.excludeGroups)) {
          const users = config.conditions.users || {};
          const add = (arr?: string[]) => Array.isArray(arr) && arr.forEach((id) => allGroupIds.add(id));
          add(users.includeGroups);
          add(users.excludeGroups);
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
      const allDevices = await collectAllPages<any>(client as any, devicesResponse);

      // Count devices by platform
      if (allDevices) {
        allDevices.forEach((device: any) => {
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
    console.log("[PDF Generation] Starting PDF generation with data:", {
      settingsCatalogCount: data.settingsCatalog?.length || 0,
      deviceConfigCount: data.deviceConfigurations?.length || 0,
      adminTemplatesCount: data.administrativeTemplates?.length || 0,
      complianceCount: data.compliancePolicies?.length || 0,
      securityBaselinesCount: data.securityBaselines?.length || 0,
      windowsScriptsCount: data.scripts?.windows?.length || 0,
      macScriptsCount: data.scripts?.macOS?.length || 0,
      appConfigsCount: data.appConfigurations?.length || 0,
      windowsUpdateCount: data.windowsUpdatePolicies?.length || 0,
      enrollmentCount: data.enrollmentConfigurations?.length || 0,
      conditionalAccessCount: data.conditionalAccessPolicies?.length || 0
    });
    
    let pdfBuffer;
    try {
      pdfBuffer = await generateDetailedPDF({
        ...data,
        groupNames,
        deviceCounts,
        branding: data.branding
      });
      console.log("[PDF Generation] PDF generated successfully, buffer size:", pdfBuffer?.length || 0);
    } catch (pdfError) {
      console.error("[PDF Generation] Failed to generate PDF:", pdfError);
      console.error("[PDF Generation] Error stack:", pdfError instanceof Error ? pdfError.stack : "No stack trace");
      throw pdfError;
    }

    // Increment export counter in Supabase
    if (supabase) {
      try {
        console.log("[PDF Generation] Incrementing export counter in Supabase");
        const { error } = await supabase.rpc("increment_export_count");
        if (error) {
          console.error("[PDF Generation] Failed to increment export count:", error);
        } else {
          console.log("[PDF Generation] Export count incremented successfully");
        }
      } catch (err) {
        console.error("[PDF Generation] Error calling increment function:", err);
      }
    } else {
      console.log("[PDF Generation] Supabase client not configured, skipping export count");
    }

    // Return PDF as response (convert Uint8Array to Buffer for NextResponse)
    return new NextResponse(Buffer.from(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Intune-Detailed-Configuration-${new Date().toISOString().split("T")[0]}.pdf"`,
      },
    });
  } catch (error: any) {
    console.error("[PDF Generation] Fatal error:", error);
    console.error("[PDF Generation] Error type:", error?.constructor?.name);
    console.error("[PDF Generation] Error message:", error?.message);
    console.error("[PDF Generation] Error stack:", error?.stack);
    
    // Check if it's a JSON parse error (might indicate token issues)
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          error: "Invalid request data",
          message: "Failed to parse request body",
          details: error.message
        },
        { status: 400 }
      );
    }
    
    // More detailed error response
    const errorResponse = {
      error: "Failed to generate detailed PDF",
      message: error?.message || "An unexpected error occurred",
      type: error?.constructor?.name || "Unknown",
      details: process.env.NODE_ENV === "development" ? error?.stack : undefined
    };
    
    return NextResponse.json(errorResponse, { status: 500 });
  }
}
