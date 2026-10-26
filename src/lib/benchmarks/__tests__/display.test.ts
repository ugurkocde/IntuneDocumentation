import { describe, expect, it } from "vitest";
import {
  headlineBaseText,
  headlineWithBase,
  levelCheckSummary,
  matchingPolicies,
  settingStatusText,
} from "../display";
import { unassessedAssessment, unassignedAssessment } from "./export-fixtures";

const counts = (pass: number, fail: number, review: number) => ({
  pass,
  fail,
  review,
  notAssessed: 0,
});

describe("headline with its base", () => {
  it("names how many results the rate is based on and how many need review", () => {
    expect(headlineWithBase(1, counts(1, 0, 87))).toBe(
      "100% of 1 assessed, 87 need review",
    );
    expect(headlineWithBase(0.5, counts(1, 1, 1))).toBe(
      "50% of 2 assessed, 1 needs review",
    );
    expect(headlineBaseText(counts(1200, 34, 0))).toBe(
      "of 1,234 assessed, 0 need review",
    );
  });

  it("keeps the wording of a null rate", () => {
    expect(headlineWithBase(null, counts(0, 0, 5))).toBe("n/a");
    expect(headlineWithBase(null, counts(0, 0, 5), "Not available")).toBe(
      "Not available",
    );
  });
});

describe("setting status beside its result", () => {
  it("qualifies a match that needs review with why", () => {
    const present = { status: "Present" as const, result: "Review" as const };
    expect(settingStatusText({ ...present, reason: "notAssigned" }, 1)).toBe(
      "Matches, on an unassigned policy",
    );
    expect(settingStatusText({ ...present, reason: "notAssigned" }, 2)).toBe(
      "Matches, on unassigned policies",
    );
    expect(
      settingStatusText({ ...present, reason: "assignmentUnknown" }, 1),
    ).toBe("Matches, assignment unknown");
    expect(settingStatusText(present)).toBe("Matches, needs review");
  });

  it("keeps the plain label where status and result agree", () => {
    expect(settingStatusText({ status: "Present", result: "Pass" })).toBe(
      "Matches",
    );
    expect(settingStatusText({ status: "Different", result: "Fail" })).toBe(
      "Differs",
    );
    expect(
      settingStatusText({
        status: "Review",
        result: "Review",
        reason: "notAssignedDiffers",
      }),
    ).toBe("Needs review");
    expect(
      settingStatusText({ status: "Unmapped", result: "Not assessed" }),
    ).toBe("Not assessed");
  });

  it("counts the policies whose value matches", () => {
    const assessment = unassignedAssessment();
    const byId = new Map(
      assessment.settings.map((finding) => [finding.settingId, finding]),
    );
    const [match, , mixed] = assessment.recommendations;
    const of = (id: string) => matchingPolicies([byId.get(id)!], id);
    expect(of(match!.settings[0]!.id)).toBe(1);
    expect(of(mixed!.settings[0]!.id)).toBe(1);
  });
});

describe("automatic check summary", () => {
  // A Level without a delivered list, so no total is claimed.
  const level = { ...unassessedAssessment().levels[0]!, manual: [] };
  const on = (basis: "recommendations" | "settings") => ({
    ...level,
    headline: { ...level.headline, basis },
  });

  it("counts settings for a pack judged by settings", () => {
    expect(level.listIdentifiers).toEqual([]);
    expect(levelCheckSummary(on("settings"), 1)).toBe(
      "Level 1: Intune Documentation checks 1 setting of this pack automatically. Recommendations outside the pack, including manual ones, need a manual check.",
    );
    expect(levelCheckSummary(on("settings"), 12)).toContain(
      "checks 12 settings of this pack automatically.",
    );
    expect(levelCheckSummary(on("recommendations"), 12)).toContain(
      "checks 12 recommendations of this pack automatically.",
    );
  });
});
