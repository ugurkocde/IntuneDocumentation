import { Client } from "@microsoft/microsoft-graph-client";

export class GroupResolver {
  private client: Client;
  private groupCache = new Map<string, string>();

  constructor(accessToken: string) {
    this.client = Client.init({
      authProvider: (done) => {
        done(null, accessToken);
      },
    });
  }

  // Fetch a single group name by ID
  async getGroupName(groupId: string): Promise<string> {
    // Check cache first
    if (this.groupCache.has(groupId)) {
      return this.groupCache.get(groupId)!;
    }

    try {
      const group = await this.client
        .api(`/groups/${groupId}`)
        .version("beta")
        .select("id,displayName")
        .get();

      const displayName = group.displayName || `Group ${groupId}`;
      this.groupCache.set(groupId, displayName);
      return displayName;
    } catch (error) {
      console.error(`Error fetching group ${groupId}:`, error);
      return `Group ${groupId}`;
    }
  }

  // Batch fetch multiple group names
  async getGroupNames(groupIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uncachedIds: string[] = [];

    // Check cache first
    for (const id of groupIds) {
      if (this.groupCache.has(id)) {
        result.set(id, this.groupCache.get(id)!);
      } else {
        uncachedIds.push(id);
      }
    }

    // Batch fetch uncached groups
    if (uncachedIds.length > 0) {
      try {
        // Use $batch endpoint for efficient fetching
        const batchRequests = uncachedIds.map((id, index) => ({
          id: index.toString(),
          method: "GET",
          url: `/groups/${id}?$select=id,displayName`,
        }));

        // Process in batches of 20 (Graph API limit)
        const batchSize = 20;
        for (let i = 0; i < batchRequests.length; i += batchSize) {
          const batch = batchRequests.slice(i, i + batchSize);

          const batchResponse = await this.client
            .api("/$batch")
            .version("beta")
            .post({ requests: batch });

          for (const response of batchResponse.responses) {
            if (response.status === 200 && response.body) {
              const group = response.body;
              const displayName = group.displayName || `Group ${group.id}`;
              this.groupCache.set(group.id, displayName);
              result.set(group.id, displayName);
            }
          }
        }
      } catch (error) {
        console.error("Error batch fetching groups:", error);
        // Fallback to individual fetching
        for (const id of uncachedIds) {
          const name = await this.getGroupName(id);
          result.set(id, name);
        }
      }
    }

    return result;
  }

  // Parse assignments and resolve group names
  async resolveAssignments(assignments: any[]): Promise<string[]> {
    if (!assignments || assignments.length === 0) {
      return ["Not assigned"];
    }

    const resolvedTargets: string[] = [];
    const groupIds: string[] = [];

    // First pass: collect all group IDs
    for (const assignment of assignments) {
      const target = assignment.target;
      if (!target) continue;

      const type = target["@odata.type"];
      if (type?.includes("groupAssignmentTarget")) {
        groupIds.push(target.groupId);
      }
    }

    // Batch resolve group names
    const groupNames = await this.getGroupNames(groupIds);

    // Second pass: build resolved assignment list
    for (const assignment of assignments) {
      const target = assignment.target;
      if (!target) {
        resolvedTargets.push("Unknown");
        continue;
      }

      const type = target["@odata.type"];

      if (type?.includes("allDevicesAssignmentTarget")) {
        resolvedTargets.push("All Devices");
      } else if (type?.includes("allLicensedUsersAssignmentTarget")) {
        resolvedTargets.push("All Users");
      } else if (type?.includes("exclusionGroupAssignmentTarget")) {
        const groupName =
          groupNames.get(target.groupId) || `Group ${target.groupId}`;
        resolvedTargets.push(`Excluded: ${groupName}`);
      } else if (type?.includes("groupAssignmentTarget")) {
        const groupName =
          groupNames.get(target.groupId) || `Group ${target.groupId}`;
        resolvedTargets.push(groupName);
      } else {
        resolvedTargets.push("Custom Assignment");
      }
    }

    return resolvedTargets;
  }

  // Get all unique groups from a set of configurations
  async getAllGroupsFromConfigurations(
    configurations: any[],
  ): Promise<Map<string, string>> {
    const allGroupIds = new Set<string>();

    for (const config of configurations) {
      if (config.assignments) {
        for (const assignment of config.assignments) {
          const target = assignment.target;
          if (target?.groupId) {
            allGroupIds.add(target.groupId);
          }
        }
      }
    }

    return this.getGroupNames(Array.from(allGroupIds));
  }
}
