import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateDetailedPDF } from "~/lib/pdf-generator-detailed";
import { GroupResolver } from "~/lib/group-resolver";
import { Client } from "@microsoft/microsoft-graph-client";
import { collectAllPages } from "~/lib/graph-paging";
import { supabase } from "~/lib/supabase";
import { del } from "@vercel/blob";

// Increase limits for Vercel
export const maxDuration = 120; // Increased from 60s to 120s for better reliability with large tenants
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let blobUrl: string | undefined;
  
  try {
    const authHeader = request.headers.get("Authorization");
    
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.replace("Bearer ", "");
    
    // Get the blob URL from the request
    const { blobUrl: url } = await request.json();
    blobUrl = url;
    
    if (!blobUrl) {
      return NextResponse.json(
        { error: "Missing blob URL" },
        { status: 400 }
      );
    }
    
    // Fetch the configuration data from Vercel Blob
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch configuration from blob storage");
    }
    
    const data = await response.json();
    
    // Resolve group names (assignments and Conditional Access group conditions)
    let groupNames = new Map<string, string>();
    try {
      const groupResolver = new GroupResolver(accessToken);
      
      // Collect all unique group IDs from configurations
      const allGroupIds = new Set<string>();
      const allConfigs = [
        ...(data.settingsCatalog || []),
        ...(data.deviceConfigurations || []),
        ...(data.administrativeTemplates || []),
        ...(data.compliancePolicies || []),
        ...(data.appProtectionPolicies || []),
        ...(data.securityBaselines || []),
        ...(data.scripts?.windows || []),
        ...(data.scripts?.macOS || []),
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
      // Continue without device counts if fetch fails
    }

    // Generate detailed PDF with all settings, group names, device counts, and branding
    const pdfResult = await generateDetailedPDF({
      ...data,
      groupNames,
      deviceCounts,
      branding: data.branding
    });

    // Clean up the blob after use (optional - it will auto-expire)
    try {
      await del(blobUrl);
    } catch (error) {
      console.error("Error deleting blob:", error);
      // Not critical if deletion fails
    }

    // Increment export counter in Supabase
    if (supabase) {
      try {
        const { error } = await supabase.rpc("increment_export_count");
        if (error) {
          console.error("Failed to increment export count:", error);
        }
      } catch (err) {
        console.error("Error calling increment function:", err);
      }
    }

    // Return PDF as response with error details in headers
    if (!pdfResult.buffer || pdfResult.buffer.length === 0) {
      throw new Error("Generated PDF buffer is empty");
    }

    const headers: HeadersInit = {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Intune-Configuration-${new Date().toISOString().split("T")[0]}.pdf"`,
    };

    // Add export stats to headers for client to read
    if (pdfResult.errors.length > 0) {
      headers["X-Export-Errors"] = JSON.stringify(pdfResult.errors);
      headers["X-Export-Total"] = pdfResult.totalPolicies.toString();
      headers["X-Export-Success"] = pdfResult.successfulPolicies.toString();
    }

    return new NextResponse(Buffer.from(pdfResult.buffer), {
      status: 200,
      headers,
    });
  } catch (error: any) {
    console.error("Error generating PDF from blob:", error);
    
    // Try to clean up the blob if it exists
    if (blobUrl) {
      try {
        await del(blobUrl);
      } catch (delError) {
        console.error("Error deleting blob on failure:", delError);
      }
    }
    
    return NextResponse.json(
      { 
        error: "Failed to generate PDF",
        message: error?.message || "An unexpected error occurred"
      },
      { status: 500 }
    );
  }
}