import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateDetailedDOCX } from "~/lib/docx-generator-detailed";
import { GroupResolver } from "~/lib/group-resolver";
import { Client } from "@microsoft/microsoft-graph-client";
import { collectAllPages } from "~/lib/graph-paging";
import { supabase } from "~/lib/supabase";
import { del } from "@vercel/blob";

export const maxDuration = 120; // Increased from 60s to 120s for better reliability with large tenants
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let blobUrl: string | undefined;
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");
    const { blobUrl: url } = await request.json();
    blobUrl = url;
    if (!blobUrl) {
      return NextResponse.json({ error: "Missing blob URL" }, { status: 400 });
    }

    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error("Failed to fetch configuration from blob storage");
    }
    const data = await response.json();

    // Resolve group names
    let groupNames = new Map<string, string>();
    try {
      const groupResolver = new GroupResolver(accessToken);
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
        ...(data.conditionalAccessPolicies || []),
      ];
      allConfigs.forEach((config: any) => {
        if (config.assignments) {
          config.assignments.forEach((assignment: any) => {
            if (assignment.target?.groupId) {
              allGroupIds.add(assignment.target.groupId);
            }
          });
        }
        if (config.conditions && (config.conditions.users || config.conditions.users?.includeGroups || config.conditions.users?.excludeGroups)) {
          const users = config.conditions.users || {};
          const add = (arr?: string[]) => Array.isArray(arr) && arr.forEach((id) => allGroupIds.add(id));
          add(users.includeGroups);
          add(users.excludeGroups);
        }
      });
      if (allGroupIds.size > 0) {
        groupNames = await groupResolver.getGroupNames(Array.from(allGroupIds));
      }
    } catch (error) {
      console.error("Error resolving group names:", error);
    }

    // Optional device counts
    const deviceCounts: Record<string, number> = {};
    try {
      const client = Client.init({
        authProvider: (done) => {
          done(null, accessToken);
        },
      });
      const devicesResponse = await client
        .api("/deviceManagement/managedDevices")
        .select("id,operatingSystem")
        .top(999)
        .get();
      const allDevices = await collectAllPages<any>(client as any, devicesResponse);
      if (allDevices) {
        allDevices.forEach((device: any) => {
          const os = device.operatingSystem || "Unknown";
          deviceCounts[os] = (deviceCounts[os] || 0) + 1;
        });
      }
    } catch (error: any) {
      console.error("Error fetching device counts:", error);
    }

    const docxBuffer = await generateDetailedDOCX({
      ...data,
      groupNames,
      deviceCounts,
      branding: data.branding,
    });

    try {
      await del(blobUrl);
    } catch (error) {
      console.error("Error deleting blob:", error);
    }

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

    if (!docxBuffer || docxBuffer.length === 0) {
      throw new Error("Generated DOCX buffer is empty");
    }

    return new NextResponse(Buffer.from(docxBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="Intune-Configuration-${new Date().toISOString().split("T")[0]}.docx"`,
      },
    });
  } catch (error: any) {
    console.error("Error generating DOCX from blob:", error);
    if (blobUrl) {
      try {
        await del(blobUrl);
      } catch (delError) {
        console.error("Error deleting blob on failure:", delError);
      }
    }
    return NextResponse.json(
      { error: "Failed to generate DOCX", message: error?.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

