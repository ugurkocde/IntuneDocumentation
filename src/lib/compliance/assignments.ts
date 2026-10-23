import { INTUNE_POLICY_REGISTRY } from "../intune-policy-registry";
import {
  ASSIGNMENT_TARGET_FIELDS,
  comparedTargetField,
  normalizeTargetType,
  targetGroupId,
  unreadableAssignment,
} from "./graph-rows";
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

/**
 * What an assignment does by its intent (Graph beta $metadata, 23 October
 * 2026; lab tenant: "apply" on device configurations, "required",
 * "available" and "uninstall" on apps). deviceConfigAssignmentIntent remove
 * ("ensure that the configuration profile is removed from devices that have
 * previously installed it", Microsoft Learn) and installIntent uninstall
 * take the policy or app away from what they target, so they target
 * nobody. apply, required, available and availableWithoutEnrollment apply
 * it, as does an assignment without an intent, which types without one
 * (Settings Catalog, compliance, intents) return. An intent Graph does not
 * document makes the assignment unreadable (graph-rows.ts).
 */
export type AssignmentRole = "apply" | "remove" | "uninstall";

export const assignmentRole = (intent: unknown): AssignmentRole =>
  intent === "remove"
    ? "remove"
    : intent === "uninstall"
      ? "uninstall"
      : "apply";

/**
 * The label prefix of an assignment with a removal intent, "Remove: " or
 * "Uninstall: ", so no reader shows it as a target; empty for one that
 * applies. The documentation exports, the group resolver and the engine
 * label removals this way.
 */
export const removalPrefix = (intent: unknown): string => {
  const role = assignmentRole(intent);
  return role === "apply" ? "" : role === "remove" ? "Remove: " : "Uninstall: ";
};

// The intents an uninstall assignment takes precedence over for the same
// target: Microsoft Learn (Assign apps to groups, How conflicts between app
// intents are resolved) resolves Available and Uninstall to Uninstall and
// Required and Uninstall to Required.
const UNINSTALL_OVERRIDES: ReadonlySet<unknown> = new Set([
  "available",
  "availableWithoutEnrollment",
]);

// The app intents an exclusion is scoped to. An app is assigned per intent
// (Required, Available, Available without enrollment, Uninstall), each with
// its own included and excluded groups (Microsoft Learn, Assign apps to
// groups), and Graph returns each exclusion as a mobileAppAssignment with
// an exclusionGroupAssignmentTarget and the intent it was made under (lab
// tenant, 23 October 2026: every app exclusion carried its intent), so it
// takes the app away only from inclusions of that intent. A configuration
// profile has one list of included and excluded groups (Microsoft Learn,
// Assign device profiles); Graph documents deviceConfigAssignmentIntent
// apply and remove without exclusions of their own, and returns no intent
// on other families, so any other exclusion applies to every assignment of
// the policy.
const INTENT_SCOPED_EXCLUSIONS: ReadonlySet<unknown> = new Set([
  "required",
  "available",
  "availableWithoutEnrollment",
  "uninstall",
]);

// What an exclusion and the assignments it cancels share: the scope of its
// intent (INTENT_SCOPED_EXCLUSIONS, otherwise the whole policy) and the
// group (targetKey).
const exclusionKey = (intent: unknown, key: string) =>
  `${INTENT_SCOPED_EXCLUSIONS.has(intent) ? String(intent) : "*"}|${key}`;

/**
 * The label suffix of an exclusion scoped to an app intent, " (uninstall)",
 * so no reader shows it as an exclusion from the whole app; empty for one
 * that applies to every assignment. The documentation exports, the group
 * resolver and the engine label exclusions this way; History labels every
 * assignment with its intent already.
 */
export const exclusionScopeSuffix = (intent: unknown): string =>
  INTENT_SCOPED_EXCLUSIONS.has(intent) ? ` (${String(intent)})` : "";

/** A target a policy applies to after its exclusions and removals. */
export interface EffectiveTarget {
  // The normalized target type (graph-rows.ts normalizeTargetType).
  type: string;
  // The group, collection or organizational unit id as Graph returned it,
  // the first spelling seen; none for all users and all devices.
  id?: string;
}

/** Assignments as every reader reads them (summarizeAssignments). */
export interface ResolvedAssignments extends AssignmentSummary {
  // One entry per distinct target the policy applies to, so the desktop
  // list, the analyzer and the engine count the same targets.
  effective: EffectiveTarget[];
}

// What two assignments must share to name the same target: the Entra group
// a group or scope tag target names (targetGroupId), in lower case as Entra
// object ids compare, otherwise the type and the fields that say what it
// targets (graph-rows.ts comparedTargetField).
function targetKey(type: string, target: Record<string, unknown>): string {
  const groupId = targetGroupId(target);
  if (groupId) return `group|${groupId.toLowerCase()}`;
  return [
    type,
    ...(ASSIGNMENT_TARGET_FIELDS[type] ?? []).map((field) =>
      String(comparedTargetField(field, target[field])),
    ),
  ].join("|");
}

// What a removal must share with an applying assignment to take it away:
// the target key, and for a scope tag target also whom in the group it
// names, so removing the users of a group leaves its devices. Exclusions
// match by the group alone (targetKey) within their scope (exclusionKey).
const removalKey = (
  type: string,
  target: Record<string, unknown>,
  key: string,
) =>
  type === "scopetaggroupassignmenttarget"
    ? `${key}|${String(target.targetType)}`
    : key;

// Targets that name every user or every device.
const BROAD_TARGETS: ReadonlySet<string> = new Set([
  "alldevicesassignmenttarget",
  "alllicensedusersassignmenttarget",
]);

/**
 * The assignments of a policy read once for every reader: what each one
 * targets (labels), excludes, removes and filters, and the targets the
 * policy applies to. An exclusion takes precedence over an inclusion of the
 * same group (Microsoft Learn, Include and exclude app assignments and
 * Assign policies), so a group that is both targets nobody; an app
 * exclusion does so only within its intent (exclusionKey), before intent
 * conflicts are resolved, so excluding a group from an Uninstall or
 * Available assignment leaves its Required one. A removal
 * assignment (assignmentRole) targets nobody either: a remove intent takes
 * the profile away from what it names, so it is read like an exclusion of
 * the same target (Graph documents no precedence between apply and remove,
 * so the profile is not claimed there), and an uninstall intent takes
 * precedence over available intents of the same target, never over a
 * required one (Microsoft Learn conflict table). A remove of all users or
 * all devices may take the profile from every member of any other target,
 * and an uninstall of them from every available one not excluded from the
 * uninstall, so those targets are unresolved and the state unknown;
 * required targets stay. Other targets
 * that differ, such as two groups with common members, are not resolved:
 * memberships are not read, so effective coverage stays unverified. An
 * unknown state says why (uncertainty): assignments not fully collected or
 * not readable, or a complete list whose targeting cannot be resolved.
 */
export function resolveAssignments(
  assignments: unknown,
  groupNames: ReadonlyMap<string, string> = new Map(),
  incomplete = false,
): ResolvedAssignments {
  const summary: ResolvedAssignments = {
    state: "unknown",
    targets: [],
    exclusions: [],
    filters: [],
    coverage: "unverified",
    effective: [],
  };
  if (!Array.isArray(assignments))
    return { ...summary, uncertainty: "incomplete" };
  let unknownTarget = false;
  const removals: string[] = [];
  const included: Array<{
    key: string;
    removal: string;
    type: string;
    id?: string;
    intent: unknown;
  }> = [];
  const removalEntries: Array<{
    key: string;
    removal: string;
    type: string;
    intent: unknown;
  }> = [];
  const excluded = new Set<string>();
  for (const assignment of assignments) {
    // An assignment of a type Graph does not document, or without what its
    // type targets, its filter type, filter id or intent, may target anyone
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
    let id: string | undefined;
    if (type === "alldevicesassignmenttarget") label = "All Devices";
    else if (type === "alllicensedusersassignmenttarget") label = "All Users";
    else if (
      ["groupassignmenttarget", "exclusiongroupassignmenttarget"].includes(
        type,
      ) &&
      field("groupId")
    ) {
      id = field("groupId");
      label = `Group: ${group(id)}`;
    } else if (
      type === "configurationmanagercollectionassignmenttarget" &&
      field("collectionId")
    ) {
      id = field("collectionId");
      label = `Configuration Manager collection: ${id}`;
    } else if (
      type === "organizationalunitassignmenttarget" &&
      field("organizationalUnitId")
    ) {
      id = field("organizationalUnitId");
      label = `Organizational unit: ${id}`;
    } else if (
      type === "scopetaggroupassignmenttarget" &&
      field("entraObjectId") &&
      ["user", "device"].includes(target.targetType)
    ) {
      id = field("entraObjectId");
      label = `${target.targetType === "device" ? "Devices" : "Users"} in group: ${groupNames.get(id) ?? id}`;
    } else {
      unknownTarget = true;
      continue;
    }
    const key = targetKey(type, target);
    const removal = removalKey(type, target, key);
    const role = assignmentRole(assignment.intent);
    if (type === "exclusiongroupassignmenttarget") {
      label = `${label}${exclusionScopeSuffix(assignment.intent)}`;
      summary.exclusions.push(label);
      excluded.add(exclusionKey(assignment.intent, key));
    } else if (role === "apply") {
      summary.targets.push(label);
      included.push({ key, removal, type, id, intent: assignment.intent });
    } else {
      label = `${removalPrefix(assignment.intent)}${label}`;
      removals.push(label);
      removalEntries.push({ key, removal, type, intent: assignment.intent });
    }
    const filterId = target.deviceAndAppManagementAssignmentFilterId;
    const mode = target.deviceAndAppManagementAssignmentFilterType;
    if (typeof filterId === "string" && filterId && mode !== "none") {
      summary.filters.push({
        target: label,
        id: filterId,
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
  if (removals.length) summary.removals = removals;
  // Exclusions first, each within its scope; then the removals that remain
  // resolve intent conflicts with the inclusions that remain.
  const isExcluded = (entry: { key: string; intent: unknown }) =>
    excluded.has(exclusionKey(undefined, entry.key)) ||
    excluded.has(exclusionKey(entry.intent, entry.key));
  const removed = new Set<string>();
  const uninstalled = new Set<string>();
  let broadRemove = false;
  let broadUninstall = false;
  for (const entry of removalEntries) {
    if (isExcluded(entry)) continue;
    const remove = assignmentRole(entry.intent) === "remove";
    (remove ? removed : uninstalled).add(entry.removal);
    if (BROAD_TARGETS.has(entry.type)) {
      if (remove) broadRemove = true;
      else broadUninstall = true;
    }
  }
  const seen = new Set<string>();
  let unresolved = false;
  for (const entry of included) {
    const overridden = UNINSTALL_OVERRIDES.has(entry.intent);
    if (
      isExcluded(entry) ||
      removed.has(entry.removal) ||
      (overridden && uninstalled.has(entry.removal))
    )
      continue;
    // An uninstall of all users or all devices leaves an available target
    // unresolved, unless the target is excluded from the uninstall: its
    // members then get only the available intent.
    if (
      broadRemove ||
      (broadUninstall &&
        overridden &&
        !excluded.has(exclusionKey("uninstall", entry.key)))
    ) {
      unresolved = true;
      continue;
    }
    if (seen.has(entry.key)) continue;
    seen.add(entry.key);
    summary.effective.push(
      entry.id === undefined
        ? { type: entry.type }
        : { type: entry.type, id: entry.id },
    );
  }
  summary.state =
    incomplete || unknownTarget || unresolved
      ? "unknown"
      : summary.effective.length
        ? "assigned"
        : "notAssigned";
  if (summary.state === "unknown")
    summary.uncertainty =
      incomplete || unknownTarget ? "incomplete" : "unresolved";
  return summary;
}

/** The assignment summary of a policy (resolveAssignments). */
export function summarizeAssignments(
  assignments: unknown,
  groupNames: ReadonlyMap<string, string> = new Map(),
  incomplete = false,
): AssignmentSummary {
  const {
    state,
    targets,
    exclusions,
    removals,
    filters,
    coverage,
    uncertainty,
  } = resolveAssignments(assignments, groupNames, incomplete);
  return {
    state,
    targets,
    exclusions,
    ...(removals ? { removals } : {}),
    filters,
    coverage,
    ...(uncertainty ? { uncertainty } : {}),
  };
}

/** Why assignments read unknown, as every reader words it. */
export const ASSIGNMENT_INCOMPLETE_TEXT =
  "Assignment collection incomplete or unavailable";
export const TARGETING_UNRESOLVED_TEXT =
  "Effective targeting could not be resolved";

/**
 * The text of an unknown assignment state by its uncertainty: a summary
 * without one (stored before it was recorded) reads as incomplete, as it
 * did then.
 */
export const assignmentUncertaintyText = (assignment: AssignmentSummary) =>
  assignment.uncertainty === "unresolved"
    ? TARGETING_UNRESOLVED_TEXT
    : ASSIGNMENT_INCOMPLETE_TEXT;

export function assignmentDetails(assignment: AssignmentSummary): string[] {
  return [
    ...assignment.targets,
    ...assignment.exclusions.map((target) => `Excluded: ${target}`),
    ...(assignment.removals ?? []),
    ...assignment.filters.map(
      (filter) => `Filter ${filter.mode}: ${filter.id} (${filter.target})`,
    ),
    ...(assignment.state === "unknown"
      ? [assignmentUncertaintyText(assignment)]
      : []),
  ];
}
