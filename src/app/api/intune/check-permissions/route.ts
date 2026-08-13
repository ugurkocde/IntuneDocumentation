import { type NextRequest, NextResponse } from "next/server";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { extractTenantFromRequest } from "~/lib/auth-middleware";

interface PermissionCheck {
  permission: string;
  resource: string;
  hasAccess: boolean;
  error?: string;
}

export async function GET(request: NextRequest) {
  try {
    // Log tenant access
    extractTenantFromRequest(request);

    const authHeader = request.headers.get("Authorization");

    if (!authHeader?.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const accessToken = authHeader.replace("Bearer ", "");

    // Create Graph client
    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    // Define permissions to check
    const permissionChecks: PermissionCheck[] = [
      {
        permission: "DeviceManagementConfiguration.Read.All",
        resource: "Device Configurations",
        hasAccess: false,
      },
      {
        permission: "DeviceManagementScripts.Read.All",
        resource: "PowerShell/Shell Scripts",
        hasAccess: false,
      },
      {
        permission: "DeviceManagementApps.Read.All",
        resource: "App Configurations",
        hasAccess: false,
      },
      {
        permission: "DeviceManagementManagedDevices.Read.All",
        resource: "Managed Devices",
        hasAccess: false,
      },
      {
        permission: "DeviceManagementRBAC.Read.All",
        resource: "RBAC Settings",
        hasAccess: false,
      },
      {
        permission: "DeviceManagementServiceConfig.Read.All",
        resource: "Service Configuration",
        hasAccess: false,
      },
      {
        permission: "Group.Read.All",
        resource: "Group Information",
        hasAccess: false,
      },
      {
        permission: "Policy.Read.All",
        resource: "Conditional Access Policies",
        hasAccess: false,
      },
    ];

    // Test each permission by making a lightweight API call
    const checkPromises = permissionChecks.map(async (check) => {
      try {
        switch (check.permission) {
          case "DeviceManagementConfiguration.Read.All":
            await client
              .api("/deviceManagement/deviceConfigurations")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "DeviceManagementScripts.Read.All":
            await client
              .api("/deviceManagement/deviceManagementScripts")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "DeviceManagementApps.Read.All":
            await client
              .api("/deviceAppManagement/mobileApps")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "DeviceManagementManagedDevices.Read.All":
            await client
              .api("/deviceManagement/managedDevices")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "DeviceManagementRBAC.Read.All":
            await client
              .api("/deviceManagement/roleDefinitions")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "DeviceManagementServiceConfig.Read.All":
            await client
              .api("/deviceManagement")
              .version("beta")
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "Group.Read.All":
            await client
              .api("/groups")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;

          case "Policy.Read.All":
            await client
              .api("/identity/conditionalAccess/policies")
              .version("beta")
              .top(1)
              .select("id")
              .get();
            check.hasAccess = true;
            break;
        }
      } catch (error: any) {
        if (error?.statusCode === 403 || error?.code === "Forbidden") {
          check.hasAccess = false;
          check.error = "Insufficient permissions";
        } else {
          // Other errors might be transient
          check.error = error?.message || "Unknown error";
        }
      }

      return check;
    });

    const results = await Promise.all(checkPromises);

    // Calculate summary
    const summary = {
      totalPermissions: results.length,
      granted: results.filter((r) => r.hasAccess).length,
      denied: results.filter((r) => !r.hasAccess).length,
      requiredForFullAccess: [
        "DeviceManagementConfiguration.Read.All",
        "DeviceManagementScripts.Read.All",
        "DeviceManagementApps.Read.All",
        "DeviceManagementManagedDevices.Read.All",
        "DeviceManagementRBAC.Read.All",
        "DeviceManagementServiceConfig.Read.All",
        "Group.Read.All",
      ],
      optionalPermissions: ["Policy.Read.All"],
    };

    return NextResponse.json({
      permissions: results,
      summary,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Error checking permissions:", error);
    return NextResponse.json(
      {
        error: "Failed to check permissions",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
