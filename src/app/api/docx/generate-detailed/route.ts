import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { generateDetailedDOCX } from "~/lib/docx-generator-detailed";
import { GroupResolver } from "~/lib/group-resolver";
import { Client } from "@microsoft/microsoft-graph-client";
import { collectAllPages } from "~/lib/graph-paging";
import { isTokenExpired, validateToken } from "~/lib/auth-utils";
import { supabase } from "~/lib/supabase";

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

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

    if (isTokenExpired(accessToken)) {
      return NextResponse.json(
        {
          error: "Token expired",
          message: "Access token has expired. Please refresh your authentication.",
          code: "TOKEN_EXPIRED",
        },
        { status: 401 }
      );
    }

    const tokenValidation = await validateToken(accessToken);
    if (!tokenValidation.isValid) {
      return NextResponse.json(
        {
          error: tokenValidation.error || "Authentication failed",
          message: tokenValidation.needsRefresh
            ? "Token needs to be refreshed. Please re-authenticate."
            : "Invalid token or insufficient permissions.",
          code: tokenValidation.needsRefresh ? "TOKEN_REFRESH_NEEDED" : "AUTH_FAILED",
        },
        { status: 401 }
      );
    }

    const data = await request.json();

    // Resolve group names
    let groupNames = new Map<string, string>();
    try {
      const groupResolver = new GroupResolver(accessToken);
      const allGroupIds = new Set<string>();
      const allConfigs = [
        ...data.settingsCatalog,
        ...data.deviceConfigurations,
        ...data.administrativeTemplates,
        ...data.compliancePolicies,
        ...data.securityBaselines,
        ...data.scripts.windows,
        ...data.scripts.macOS,
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

    // Fetch device counts by platform (optional)
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
    console.error("Error generating detailed DOCX:", error);
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid request data", message: "Failed to parse request body" },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: "Failed to generate detailed DOCX", message: error?.message || "An unexpected error occurred" },
      { status: 500 }
    );
  }
}

