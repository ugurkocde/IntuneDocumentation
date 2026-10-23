import { INTUNE_POLICY_REGISTRY } from "../intune-policy-registry";
import { normalizeTargetType, unreadableAssignment } from "./graph-rows";
import type { AssignmentSummary } from "./types";

type FetchError = {
  endpoint?: string;
  error: string;
  policyId?: string;
  familyKey?: string;
};

/** A collection error that concerns an item's assignments. */
export const assignmentFetchFailed = (errors: readonly FetchError[]) =>
  errors.some((error) =>
    /assignments/i.test(`${error.endpoint ?? ""} ${error.error}`),
  );

/**
 * The collection errors of one item of a collection family: those of its
 * policy id that name its family or no family. Every assignment reader
 * matches errors this way (collectConfigurations, the documentation
 * exports, the analyzer and the desktop policy list).
 */
export const itemFetchErrors = <E extends FetchError>(
  errors: readonly E[] | undefined,
  item: Record<string, unknown>,
  family: unknown,
): E[] =>
  (errors ?? []).filter(
    (error) =>
      error.policyId === item.id &&
      (!error.familyKey || error.familyKey === family),
  );

/**
 * Registry resource types without an assignment relationship: no
 * assignments child collection, so their items carry no assignments to
 * collect, read or report.
 */
export const UNASSIGNABLE_REGISTRY_KEYS: ReadonlySet<string> = new Set(
  INTUNE_POLICY_REGISTRY.filter(
    (entry) =>
      !entry.childCollections?.some(
        (child) => child.property === "assignments",
      ),
  ).map((entry) => entry.key),
);

/**
 * Whether an item's resource type has an assignment relationship: not a
 * registry type without one and, when the family is known, not a
 * Conditional Access policy (it targets users in its conditions).
 */
export const assignable = (item: Record<string, unknown>, family?: unknown) =>
  family !== "conditionalAccessPolicies" &&
  !(
    typeof item.registryKey === "string" &&
    UNASSIGNABLE_REGISTRY_KEYS.has(item.registryKey)
  );

// Whether an item's assignments were not fully collected: its collection
// status says other than complete, its fetch failed before a status was
// recorded, or one of its collection errors concerns assignments.
function collectionIncomplete(
  item: Record<string, unknown>,
  errors: readonly FetchError[],
): boolean {
  const status = item.collectionStatus;
  return (
    (status && typeof status === "object"
      ? (status as Record<string, unknown>).assignments !== "complete"
      : Boolean(item.hasFetchError)) || assignmentFetchFailed(errors)
  );
}

/**
 * Whether an item's assignments are unknown: they were not fully collected
 * (collectionIncomplete), or Graph returned no list or a value that is not
 * one (an object, null, a string or a number), which may hold any
 * assignment whatever the collection status says. A valid empty list is
 * not assigned. An item of a type without an assignment relationship
 * (assignable, by the family when given or the engine's __evidenceFamily)
 * has none to miss. The engine (coverage.ts), the documentation exports,
 * the snapshot projection, the history diff and the desktop policy list
 * read it the same way.
 */
export function assignmentsIncomplete(
  item: Record<string, unknown>,
  errors: readonly FetchError[] = [],
  family: unknown = item.__evidenceFamily,
): boolean {
  if (!assignable(item, family)) return false;
  return !Array.isArray(item.assignments) || collectionIncomplete(item, errors);
}

/**
 * The collection status of an item's assignments (collectionIncomplete),
 * for parseAssignments, which reads the list itself: a value that is not a
 * list reads unknown there whatever this status says.
 */
export const assignmentStatus = (
  item: Record<string, unknown>,
  errors: readonly FetchError[] = [],
): "complete" | "incomplete" =>
  assignable(item) && collectionIncomplete(item, errors)
    ? "incomplete"
    : "complete";

export function summarizeAssignments(
  assignments: unknown,
  groupNames: ReadonlyMap<string, string> = new Map(),
  incomplete = false,
): AssignmentSummary {
  const summary: AssignmentSummary = {
    state: "unknown",
    targets: [],
    exclusions: [],
    filters: [],
    coverage: "unverified",
  };
  if (!Array.isArray(assignments)) return summary;
  let unknownTarget = false;
  for (const assignment of assignments) {
    // An assignment of a type Graph does not document, or without what its
    // type targets, its filter type or filter id, may target anyone
    // (graph-rows.ts).
    if (unreadableAssignment(assignment)) unknownTarget = true;
    const target = assignment?.target;
    if (!target || typeof target["@odata.type"] !== "string") continue;
    const type = normalizeTargetType(target["@odata.type"]);
    const field = (name: string) =>
      typeof target[name] === "string" ? target[name] : "";
    const group = (groupId: string) =>
      groupNames.get(groupId) ?? (target.groupName || groupId);
    let label: string;
    if (type === "alldevicesassignmenttarget") label = "All Devices";
    else if (type === "alllicensedusersassignmenttarget") label = "All Users";
    else if (
      ["groupassignmenttarget", "exclusiongroupassignmenttarget"].includes(
        type,
      ) &&
      field("groupId")
    )
      label = `Group: ${group(field("groupId"))}`;
    else if (
      type === "configurationmanagercollectionassignmenttarget" &&
      field("collectionId")
    )
      label = `Configuration Manager collection: ${field("collectionId")}`;
    else if (
      type === "organizationalunitassignmenttarget" &&
      field("organizationalUnitId")
    )
      label = `Organizational unit: ${field("organizationalUnitId")}`;
    else if (
      type === "scopetaggroupassignmenttarget" &&
      field("entraObjectId") &&
      ["user", "device"].includes(target.targetType)
    )
      label = `${target.targetType === "device" ? "Devices" : "Users"} in group: ${groupNames.get(field("entraObjectId")) ?? field("entraObjectId")}`;
    else {
      unknownTarget = true;
      continue;
    }
    if (type === "exclusiongroupassignmenttarget")
      summary.exclusions.push(label);
    else summary.targets.push(label);
    const id = target.deviceAndAppManagementAssignmentFilterId;
    const mode = target.deviceAndAppManagementAssignmentFilterType;
    if (typeof id === "string" && id && mode !== "none") {
      summary.filters.push({
        target: label,
        id,
        mode: typeof mode === "string" ? mode : "unknown",
      });
    } else if (mode !== undefined && mode !== null && mode !== "none") {
      // A filter type other than none without a filter id, or an empty one,
      // leaves the filter unknown.
      summary.filters.push({
        target: label,
        id: "unknown",
        mode: String(mode),
      });
    }
  }
  summary.state =
    incomplete || unknownTarget
      ? "unknown"
      : summary.targets.length
        ? "assigned"
        : "notAssigned";
  return summary;
}

export function assignmentDetails(assignment: AssignmentSummary): string[] {
  return [
    ...assignment.targets,
    ...assignment.exclusions.map((target) => `Excluded: ${target}`),
    ...assignment.filters.map(
      (filter) => `Filter ${filter.mode}: ${filter.id} (${filter.target})`,
    ),
    ...(assignment.state === "unknown"
      ? ["Assignment collection incomplete or unavailable"]
      : []),
  ];
}
