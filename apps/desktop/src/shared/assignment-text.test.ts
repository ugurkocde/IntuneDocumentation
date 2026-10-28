import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_UNREADABLE,
  ASSIGNMENT_UNRESOLVED,
  NOT_ASSIGNED,
  assignmentNeedsReview,
  assignmentText,
} from "./assignment-text";
import type { AssignmentTargets } from "./ipc-types";

const targets = (overrides: Partial<AssignmentTargets> = {}): AssignmentTargets => ({
  assignmentCount: 0,
  assignmentUnknown: false,
  assignedToAllUsers: false,
  assignedToAllDevices: false,
  assignedToCollections: 0,
  assignedToOrganizationalUnits: 0,
  ...overrides,
});

describe("assignment line", () => {
  it("says the assignment could not be read instead of not assigned", () => {
    const text = assignmentText(targets({ assignmentUnknown: true, assignmentCount: 1 }));
    expect(text).toBe(ASSIGNMENT_UNREADABLE);
    expect(assignmentNeedsReview(text)).toBe(true);
  });

  it("says the targeting could not be resolved for a readable conflict", () => {
    const text = assignmentText(targets({ assignmentUnknown: true, assignmentUnresolved: true }));
    expect(text).toBe(ASSIGNMENT_UNRESOLVED);
    expect(assignmentNeedsReview(text)).toBe(true);
    expect(assignmentText(targets({ assignmentUnknown: false, assignmentUnresolved: true }))).toBe(NOT_ASSIGNED);
  });

  it("names Configuration Manager collections and organizational units", () => {
    expect(assignmentText(targets({ assignedToCollections: 1 }))).toBe(
      "Assigned to 1 Configuration Manager collection",
    );
    expect(assignmentText(targets({ assignmentCount: 2, assignedToOrganizationalUnits: 2 }))).toBe(
      "Assigned to 2 groups and 2 organizational units",
    );
  });

  it("keeps not assigned and resource types without assignments", () => {
    expect(assignmentText(targets())).toBe(NOT_ASSIGNED);
    expect(assignmentText(targets({ assignmentCount: null, assignmentUnknown: true }))).toBeNull();
    expect(assignmentText(targets({ assignedToAllDevices: true, assignmentCount: 1 }))).toBe(
      "Assigned to All devices and 1 group",
    );
    expect(assignmentNeedsReview("Assigned to 1 group")).toBe(false);
  });
});
