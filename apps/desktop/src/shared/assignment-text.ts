import type { AssignmentTargets } from "./ipc-types";

export const NOT_ASSIGNED = "Not assigned";
export const ASSIGNMENT_UNREADABLE = "Assignment could not be read";
// A complete, readable list whose targeting conflicts cannot be resolved
// (compliance/assignments.ts TARGETING_UNRESOLVED_TEXT).
export const ASSIGNMENT_UNRESOLVED = "Effective targeting could not be resolved";

const count = (value: number, one: string, many: string) => `${value} ${value === 1 ? one : many}`;

/**
 * The assignment line of a policy, or null for a resource type without
 * assignments. Unknown targeting is said so, never shown as not assigned.
 */
export function assignmentText(targets: AssignmentTargets): string | null {
  if (targets.assignmentCount === null) return null;
  if (targets.assignmentUnknown) return targets.assignmentUnresolved ? ASSIGNMENT_UNRESOLVED : ASSIGNMENT_UNREADABLE;
  const parts: string[] = [];
  if (targets.assignedToAllUsers) parts.push("All users");
  if (targets.assignedToAllDevices) parts.push("All devices");
  if (targets.assignmentCount > 0) parts.push(count(targets.assignmentCount, "group", "groups"));
  if (targets.assignedToCollections > 0)
    parts.push(
      count(targets.assignedToCollections, "Configuration Manager collection", "Configuration Manager collections"),
    );
  if (targets.assignedToOrganizationalUnits > 0)
    parts.push(count(targets.assignedToOrganizationalUnits, "organizational unit", "organizational units"));
  return parts.length ? `Assigned to ${parts.join(" and ")}` : NOT_ASSIGNED;
}

/** Whether the assignment line needs the admin's attention. */
export const assignmentNeedsReview = (text: string | null) =>
  text === NOT_ASSIGNED || text === ASSIGNMENT_UNREADABLE || text === ASSIGNMENT_UNRESOLVED;
