import { createGraphClient } from "./graph-client";
import {
  graphStatus,
  isTransientGraphError,
  retryAfterMs,
  waitForGraph,
} from "./graph-request";
import type { Client } from "@microsoft/microsoft-graph-client";

export class GroupResolver {
  private client: Client;
  private warnings: string[] = [];
  getWarnings() {
    return [...this.warnings];
  }
  private groupCache = new Map<string, string>();

  constructor(accessToken: string) {
    this.client = createGraphClient(accessToken);
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

      const displayName = group.displayName || groupId;
      this.groupCache.set(groupId, displayName);
      return displayName;
    } catch (error) {
      this.warnings.push(
        `Could not resolve group ${groupId}; retaining its identifier.`,
      );
      console.error(`Error fetching group ${groupId}:`, error);
      return groupId;
    }
  }

  // Batch fetch multiple group names
  async getGroupNames(groupIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    const uncached = [...new Set(groupIds)].filter((id) => {
      const cached = this.groupCache.get(id);
      if (cached) {
        result.set(id, cached);
        return false;
      }
      return true;
    });
    const unresolved = (id: string, status: unknown) => {
      result.set(id, id);
      this.warnings.push(
        `Could not resolve group ${id} (HTTP ${typeof status === "number" ? status : "unknown"}); retaining its identifier.`,
      );
    };
    for (let offset = 0; offset < uncached.length; offset += 20) {
      let pending = uncached
        .slice(offset, offset + 20)
        .map((groupId, index) => ({ id: String(index), groupId }));
      for (let attempt = 0; pending.length > 0; attempt++) {
        let response;
        try {
          response = await this.client
            .api("/$batch")
            .version("beta")
            .post({
              requests: pending.map(({ id, groupId }) => ({
                id,
                method: "GET",
                url: `/groups/${groupId}?$select=id,displayName`,
              })),
            });
        } catch (error: any) {
          pending.forEach(({ groupId }) =>
            unresolved(groupId, graphStatus(error)),
          );
          break;
        }
        const responses = new Map<string, any>(
          (Array.isArray(response?.responses) ? response.responses : []).map(
            (item: any) => [item.id, item],
          ),
        );
        const retry: typeof pending = [];
        let delay = 0;
        for (const item of pending) {
          const entry = responses.get(item.id);
          if (entry?.status === 200 && entry.body?.id === item.groupId) {
            const name = entry.body.displayName || item.groupId;
            this.groupCache.set(item.groupId, name);
            result.set(item.groupId, name);
            continue;
          }
          const error = {
            statusCode: entry?.status === 200 ? 502 : (entry?.status ?? 502),
            headers: entry?.headers,
          };
          if (attempt < 2 && isTransientGraphError(error)) {
            retry.push(item);
            delay = Math.max(delay, retryAfterMs(error) ?? 1000 * 2 ** attempt);
          } else unresolved(item.groupId, entry?.status);
        }
        pending = retry;
        if (pending.length) await waitForGraph(delay);
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
        const groupName = groupNames.get(target.groupId) || target.groupId;
        resolvedTargets.push(`Excluded: ${groupName}`);
      } else if (type?.includes("groupAssignmentTarget")) {
        const groupName = groupNames.get(target.groupId) || target.groupId;
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
