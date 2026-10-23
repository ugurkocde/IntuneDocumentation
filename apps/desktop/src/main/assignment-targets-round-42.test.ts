import { describe, expect, it } from "vitest";
import { assignmentTargets } from "./collect";
import { ASSIGNMENT_UNRESOLVED, NOT_ASSIGNED, assignmentText } from "../shared/assignment-text";

// Round 42: the desktop list and search count the targets a policy applies
// to as the engine does (compliance/assignments.ts resolveAssignments).
// Synthetic ids only.
const GROUP_A = "0f0e0d0c-0000-4000-8000-00000000000a";
const GROUP_B = "0f0e0d0c-0000-4000-8000-00000000000b";

const group = (groupId: string, intent?: string) => ({
  id: `assignment-${groupId}-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.groupAssignmentTarget", groupId },
});
const exclusion = (groupId: string) => ({
  id: `exclusion-${groupId}`,
  target: { "@odata.type": "#microsoft.graph.exclusionGroupAssignmentTarget", groupId },
});
const allDevices = (intent?: string) => ({
  id: `all-devices-${intent ?? "none"}`,
  ...(intent ? { intent } : {}),
  target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
});

const text = (assignments: unknown[]) => assignmentText(assignmentTargets(assignments, false));

describe("round 42: desktop assignment counts", () => {
  it("does not count a group the policy also excludes, in any case", () => {
    expect(text([group(GROUP_A), exclusion(GROUP_A)])).toBe(NOT_ASSIGNED);
    expect(text([group(GROUP_A), exclusion(GROUP_A.toUpperCase())])).toBe(NOT_ASSIGNED);
    expect(text([group(GROUP_A), exclusion(GROUP_A), group(GROUP_B)])).toBe("Assigned to 1 group");
  });

  it("does not count removal intents as targets", () => {
    expect(text([group(GROUP_A, "remove")])).toBe(NOT_ASSIGNED);
    expect(text([allDevices("remove")])).toBe(NOT_ASSIGNED);
    expect(text([group(GROUP_A, "uninstall")])).toBe(NOT_ASSIGNED);
    expect(text([group(GROUP_A, "apply"), group(GROUP_A, "remove")])).toBe(NOT_ASSIGNED);
  });

  it("still counts applying intents", () => {
    expect(text([group(GROUP_A, "apply"), group(GROUP_B, "remove")])).toBe("Assigned to 1 group");
    expect(text([group(GROUP_A, "required"), allDevices("available")])).toBe("Assigned to All devices and 1 group");
    expect(text([group(GROUP_A), group(GROUP_A.toUpperCase())])).toBe("Assigned to 1 group");
  });

  it("leaves the targeting unknown beside a remove of all devices or an uninstall of all users", () => {
    // A complete list with a conflict reads unresolved (round 43).
    expect(text([group(GROUP_A, "apply"), allDevices("remove")])).toBe(ASSIGNMENT_UNRESOLVED);
    const allUsersUninstall = {
      id: "all-users-uninstall",
      intent: "uninstall",
      target: { "@odata.type": "#microsoft.graph.allLicensedUsersAssignmentTarget" },
    };
    expect(text([group(GROUP_A, "available"), allUsersUninstall])).toBe(ASSIGNMENT_UNRESOLVED);
    expect(text([group(GROUP_A, "required"), allUsersUninstall])).toBe("Assigned to 1 group");
    expect(text([allDevices("apply"), group(GROUP_A, "remove")])).toBe("Assigned to All devices");
  });

  it("keeps an undocumented intent unreadable", () => {
    expect(assignmentTargets([group(GROUP_A, "Remove")], false).assignmentUnknown).toBe(true);
  });
});
