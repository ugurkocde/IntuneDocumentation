import type { AssignmentSummary } from "./types";

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
    const target = assignment?.target;
    if (!target || typeof target["@odata.type"] !== "string") {
      unknownTarget = true;
      continue;
    }
    const type = target["@odata.type"]
      .replace(/^#?(microsoft\.graph\.)?/, "")
      .toLowerCase();
    let label: string;
    if (type === "alldevicesassignmenttarget") label = "All Devices";
    else if (
      ["alllicensedusersassignmenttarget", "allusersassignmenttarget"].includes(
        type,
      )
    )
      label = "All Users";
    else if (
      ["groupassignmenttarget", "exclusiongroupassignmenttarget"].includes(
        type,
      ) &&
      typeof target.groupId === "string" &&
      target.groupId
    )
      label = `Group: ${groupNames.get(target.groupId) ?? target.groupName ?? target.groupId}`;
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
      if (!["include", "exclude"].includes(mode)) unknownTarget = true;
    } else if (mode && mode !== "none") {
      unknownTarget = true;
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
