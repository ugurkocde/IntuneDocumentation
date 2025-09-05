import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateDetailedPDF } from "~/lib/pdf-generator-detailed";
import { GroupResolver } from "~/lib/group-resolver";
import { Client } from "@microsoft/microsoft-graph-client";
import { collectAllPages } from "~/lib/graph-paging";
import { supabase } from "~/lib/supabase";
import { configCache } from "~/lib/pdf-cache";

// Increase function duration for PDF generation
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const sessionId = url.searchParams.get("sessionId");
    
    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing session ID" },
        { status: 400 }
      );
    }

    // Retrieve the cached configuration data
    const cachedData = configCache.get(sessionId);
    
    if (!cachedData) {
      return NextResponse.json(
        { error: "Session expired or invalid" },
        { status: 404 }
      );
    }

    const { data, token: accessToken } = cachedData;
    
    // Remove from cache after retrieval (one-time use)
    configCache.delete(sessionId);

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
      // Continue without device counts if fetch fails
    }

    // Generate detailed PDF with all settings, group names, device counts, and branding
    const pdfBuffer = await generateDetailedPDF({
      ...data,
      groupNames,
      deviceCounts,
      branding: data.branding
    });

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

    // Check for empty buffer
    if (!pdfBuffer || pdfBuffer.length === 0) {
      throw new Error("Generated PDF buffer is empty");
    }
    
    // Stream the PDF as response
    const headers = new Headers({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Intune-Configuration-${new Date().toISOString().split("T")[0]}.pdf"`,
      "Content-Length": pdfBuffer.length.toString(),
      "Cache-Control": "no-cache, no-store, must-revalidate"
    });

    return new Response(Buffer.from(pdfBuffer), {
      status: 200,
      headers
    });
  } catch (error: any) {
    console.error("Error generating PDF:", error);
    return NextResponse.json(
      { 
        error: "Failed to generate PDF",
        message: error?.message || "An unexpected error occurred"
      },
      { status: 500 }
    );
  }
}