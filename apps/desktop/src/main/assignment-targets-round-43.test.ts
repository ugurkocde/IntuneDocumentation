import { describe, expect, it } from "vitest";
import { TARGETING_UNRESOLVED_TEXT } from "../../../../src/lib/compliance/assignments";
import { assignmentTargets } from "./collect";
import {
  ASSIGNMENT_UNREADABLE,
  ASSIGNMENT_UNRESOLVED,
  NOT_ASSIGNED,
  assignmentNeedsReview,
  assignmentText,
} from "../shared/assignment-text";

// Round 43: app exclusions apply within their intent, and the desktop line
// says why targeting is unknown. Synthetic ids only.
const GROUP_A = "0f0e0d0c-0000-4000-8000-00000000000a";
const GROUP_B = "0f0e0d0c-0000-4000-8000-00000000000b";

const group = (groupId: string, intent?: string) => ({
  id: `assignment-${groupId}-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
});
const exclusion = (groupId: string, intent?: string) => ({
  id: `exclusion-${groupId}-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId },
});
const allUsers = (intent: string) => ({
  id: `all-users-${intent}`,
  intent,
  target: { "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget" },
});

const text = (assignments: unknown[], incomplete = false) =>
  assignmentText(assignmentTargets(assignments, incomplete));

describe("round 43: desktop app exclusions and unknown targeting", () => {
  it("keeps a Required group excluded only under Uninstall or Available", () => {
    expect(text([group(GROUP_A, "required"), allUsers("uninstall"), exclusion(GROUP_A, "uninstall")])).toBe(
      "Assigned to 1 group",
    );
    expect(text([group(GROUP_A, "required"), group(GROUP_B, "available"), exclusion(GROUP_A, "available")])).toBe(
      "Assigned to 2 groups",
    );
  });

  it("does not count a Required group excluded under Required", () => {
    expect(text([group(GROUP_A, "required"), exclusion(GROUP_A, "required")])).toBe(NOT_ASSIGNED);
    expect(text([allUsers("required"), group(GROUP_A, "required"), exclusion(GROUP_A, "required")])).toBe(
      "Assigned to All users",
    );
  });

  it("keeps configuration exclusions for the whole profile", () => {
    expect(text([group(GROUP_A, "apply"), exclusion(GROUP_A, "apply")])).toBe(NOT_ASSIGNED);
    expect(text([group(GROUP_A), exclusion(GROUP_A)])).toBe(NOT_ASSIGNED);
  });

  it("says unresolved targeting apart from assignments that could not be read", () => {
    expect(ASSIGNMENT_UNRESOLVED).toBe(TARGETING_UNRESOLVED_TEXT);
    const conflict = assignmentTargets([group(GROUP_A, "available"), allUsers("uninstall")], false);
    expect(conflict).toMatchObject({ assignmentUnknown: true, assignmentUnresolved: true });
    expect(assignmentText(conflict)).toBe(ASSIGNMENT_UNRESOLVED);
    expect(assignmentNeedsReview(ASSIGNMENT_UNRESOLVED)).toBe(true);
    expect(text([group(GROUP_A, "available"), allUsers("uninstall")], true)).toBe(ASSIGNMENT_UNREADABLE);
    expect(text([group(GROUP_A, "Remove")])).toBe(ASSIGNMENT_UNREADABLE);
    expect(text([group(GROUP_A, "required")], true)).toBe(ASSIGNMENT_UNREADABLE);
  });
});
