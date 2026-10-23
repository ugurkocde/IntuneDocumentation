import { createGraphClient, type TokenProvider } from "./graph-client";
import {
  graphStatus,
  isTransientGraphError,
  retryAfterMs,
  waitForGraph,
} from "./graph-request";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  assignmentGroupIds,
  normalizeTargetType,
  targetGroupId,
  unreadableAssignment,
} from "./compliance/graph-rows";
import { UNREADABLE_ASSIGNMENT } from "./configuration-parser";
import { exclusionScopeSuffix, removalPrefix } from "./compliance/assignments";

export class GroupResolver {
  private client: Client;
  private warnings: string[] = [];
  getWarnings() {
    return [...this.warnings];
  }
  private groupCache = new Map<string, string>();
  private signal?: AbortSignal;

  constructor(accessToken: TokenProvider, signal?: AbortSignal) {
    this.client = createGraphClient(accessToken, { signal });
    this.signal = signal;
  }

  // Fetch a single group name by ID
  async getGroupName(groupId: string): Promise<string> {
    // Check cache first
    if (this.groupCache.has(groupId)) {
      return this.groupCache.get(groupId)!;
    }

    try {
      const group = await this.client
        .api(`/groups/${encodeURIComponent(groupId)}`)
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
                url: `/groups/${encodeURIComponent(groupId)}?$select=id,displayName`,
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
        if (pending.length) await waitForGraph(delay, this.signal);
      }
    }
    return result;
  }

  // Parse assignments and resolve group names
  async resolveAssignments(assignments: unknown): Promise<string[]> {
    // Assignments Graph returned as no list, or as a value that is not one,
    // may hold any assignment, so they are unreadable, never not assigned.
    if (!Array.isArray(assignments)) return [UNREADABLE_ASSIGNMENT];
    if (assignments.length === 0) {
      return ["Not assigned"];
    }

    // An assignment of a type Graph does not document, or without what its
    // type targets, may target anyone (compliance/graph-rows.ts).
    const groupNames = await this.getGroupNames(
      assignments.flatMap((assignment) => {
        const id = unreadableAssignment(assignment)
          ? undefined
          : targetGroupId((assignment as { target: unknown }).target);
        return id ? [id] : [];
      }),
    );
    const resolvedTargets = assignments.map((assignment) => {
      if (unreadableAssignment(assignment)) return UNREADABLE_ASSIGNMENT;
      const target = (assignment as { target: Record<string, any> }).target;
      const type = normalizeTargetType(target["@odata.type"]);
      const group = () => groupNames.get(target.groupId) || target.groupId;
      if (type === "exclusiongroupassignmenttarget")
        return `Excluded: ${group()}${exclusionScopeSuffix((assignment as { intent?: unknown }).intent)}`;
      // A removal intent targets nobody, so it is labelled with it
      // (compliance/assignments.ts removalPrefix).
      const prefix = removalPrefix((assignment as { intent?: unknown }).intent);
      if (type === "alldevicesassignmenttarget") return `${prefix}All Devices`;
      if (type === "alllicensedusersassignmenttarget")
        return `${prefix}All Users`;
      if (type === "groupassignmenttarget") return `${prefix}${group()}`;
      return `${prefix}Custom Assignment`;
    });

    return resolvedTargets;
  }

  // Get all unique groups from a set of configurations
  async getAllGroupsFromConfigurations(
    configurations: any[],
  ): Promise<Map<string, string>> {
    const allGroupIds = new Set<string>();

    for (const config of configurations) {
      for (const groupId of assignmentGroupIds(config))
        allGroupIds.add(groupId);
    }

    return this.getGroupNames(Array.from(allGroupIds));
  }
}
