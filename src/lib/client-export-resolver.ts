import { Client } from "@microsoft/microsoft-graph-client";
import { GroupResolver } from "./group-resolver";
import { collectAllPages } from "./graph-paging";
import type { ConfigurationSectionData } from "./configuration-sections";

export interface ExportResolverProgress {
  stage: "groups" | "devices";
  message: string;
}

interface SelectedData {
  sections: ConfigurationSectionData[];
  fetchErrors?: Array<{
    policyId: string;
    policyName: string;
    policyType: string;
    familyKey?: string;
    error: string;
    statusCode?: number;
    endpoint?: string;
    permissionHint?: string;
    partial?: boolean;
  }>;
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  securityBaselines: any[];
  compliancePolicies: any[];
  appProtectionPolicies: any[];
  scripts: { windows: any[]; macOS: any[] };
  appConfigurations: any[];
  windowsUpdatePolicies: any[];
  enrollmentConfigurations: any[];
  conditionalAccessPolicies: any[];
  branding?: any;
}

export interface ResolvedExportData extends SelectedData {
  groupNames: Map<string, string>;
  deviceCounts: Record<string, number>;
}

/**
 * Resolves group names and device counts for export data.
 * Runs entirely in the browser using the user's access token.
 */
export async function resolveExportData(
  data: SelectedData,
  accessToken: string,
  onProgress?: (progress: ExportResolverProgress) => void,
): Promise<ResolvedExportData> {
  // Resolve group names
  let groupNames = new Map<string, string>();
  try {
    onProgress?.({ stage: "groups", message: "Resolving group names..." });

    const groupResolver = new GroupResolver(accessToken);
    const allGroupIds = new Set<string>();

    const allConfigs = data.sections?.length
      ? data.sections.flatMap((section) => section.items)
      : [
          ...(data.settingsCatalog || []),
          ...(data.deviceConfigurations || []),
          ...(data.administrativeTemplates || []),
          ...(data.compliancePolicies || []),
          ...(data.appProtectionPolicies || []),
          ...(data.securityBaselines || []),
          ...(data.scripts?.windows || []),
          ...(data.scripts?.macOS || []),
          ...(data.appConfigurations || []),
          ...(data.windowsUpdatePolicies || []),
          ...(data.enrollmentConfigurations || []),
          ...(data.conditionalAccessPolicies || []),
        ];

    allConfigs.forEach((config) => {
      if (config.assignments) {
        config.assignments.forEach((assignment: any) => {
          if (assignment.target?.groupId) {
            allGroupIds.add(assignment.target.groupId);
          }
        });
      }
      // Extract group IDs from CA policy conditions
      if (config.conditions?.users) {
        const users = config.conditions.users;
        const add = (arr?: string[]) =>
          Array.isArray(arr) && arr.forEach((id) => allGroupIds.add(id));
        add(users.includeGroups);
        add(users.excludeGroups);
      }
      if (config.registryKey === "roleAssignments") {
        [...(config.members || []), ...(config.scopeMembers || [])].forEach(
          (id: unknown) => {
            if (typeof id === "string") allGroupIds.add(id);
          },
        );
      }
    });

    if (allGroupIds.size > 0) {
      groupNames = await groupResolver.getGroupNames(Array.from(allGroupIds));

      data.sections
        ?.find((section) => section.key === "roleAssignments")
        ?.items.forEach((assignment) => {
          assignment.resolvedMembers = (assignment.members || []).map(
            (id: string) => groupNames.get(id) || id,
          );
          assignment.resolvedScopeMembers = (assignment.scopeMembers || []).map(
            (id: string) => groupNames.get(id) || id,
          );
        });
    }
  } catch (error) {
    console.error("Error resolving group names:", error);
  }

  // Fetch device counts by platform
  const deviceCounts: Record<string, number> = {};
  try {
    onProgress?.({ stage: "devices", message: "Fetching device counts..." });

    const client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });

    const devicesResponse = await client
      .api("/deviceManagement/managedDevices")
      .version("beta")
      .select("id,operatingSystem")
      .top(999)
      .get();
    const allDevices = await collectAllPages<any>(client, devicesResponse);

    if (allDevices) {
      allDevices.forEach((device: any) => {
        const os = (device.operatingSystem as string) || "Unknown";
        deviceCounts[os] = (deviceCounts[os] || 0) + 1;
      });
    }
  } catch (error) {
    console.error("Error fetching device counts:", error);
  }

  return {
    ...data,
    groupNames,
    deviceCounts,
  };
}
