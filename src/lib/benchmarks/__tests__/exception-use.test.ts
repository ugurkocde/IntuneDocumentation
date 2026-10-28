import { describe, expect, it } from "vitest";
import {
  assessBenchmark,
  combineLevelAssessments,
  exceptionLevels,
  type BenchmarkAssessment,
} from "../assessment";
import { exceptionsForLevel, type BenchmarkException } from "../exceptions";
import {
  BENCH,
  NOW,
  VERSION,
  choice,
  collection,
  pack,
  tenantPolicy,
} from "./fixtures";

// The engine records, per result, the exception in effect for each setting
// that does not pass and whether the adjusted headline credits the result,
// so every view shows exactly what the headline counted.

const SHARED = "synthetic_bench_shared";
const OTHER = "synthetic_bench_other";
const PASSING = "synthetic_bench_passing";

const tenant = () =>
  collection({
    policies: [
      tenantPolicy({
        settings: [
          choice(SHARED, "0"),
          choice(OTHER, "0"),
          choice(PASSING, "1"),
        ],
      }),
    ],
  });

const exception = (
  id: string,
  settingId: string,
  extra: Partial<BenchmarkException> = {},
): BenchmarkException => ({
  id,
  benchmark: BENCH,
  version: VERSION,
  level: 1,
  settingId,
  owner: "Synthetic owner",
  reason: "Synthetic reason",
  expiresOn: "2999-12-31",
  createdAt: "2026-10-01T09:00:00.000Z",
  ...extra,
});
const EXPIRED = {
  expiresOn: "2026-10-01",
  createdAt: "2026-09-01T09:00:00.000Z",
};

const levelOne = pack(
  [
    {
      settings: [choice(SHARED, "1"), choice(OTHER, "1"), choice(PASSING, "1")],
    },
  ],
  [
    { id: "1.1", title: "Synthetic shared", level: 1, settings: [SHARED] },
    {
      id: "1.2",
      title: "Synthetic two settings",
      level: 1,
      settings: [SHARED, OTHER],
    },
    { id: "1.3", title: "Synthetic passing", level: 1, settings: [PASSING] },
  ],
);
const levelTwo = pack(
  [{ settings: [choice(SHARED, "1")] }],
  [{ id: "2.1", title: "Synthetic level two", level: 2, settings: [SHARED] }],
  2,
);

const recommendation = (assessment: BenchmarkAssessment, id: string) =>
  assessment.recommendations.find((item) => item.id === id)!;
const headline = (assessment: BenchmarkAssessment, level: 1 | 2) =>
  assessment.levels.find((item) => item.level === level)!.headline;

/** What main does for a Level 2 comparison: both packs, with the Level precedence. */
function compared(exceptions: BenchmarkException[]): BenchmarkAssessment {
  return combineLevelAssessments(
    [levelOne, levelTwo].map((part) =>
      assessBenchmark(tenant(), part, {
        now: NOW,
        exceptions: exceptionsForLevel(exceptions, part.level, 2),
      }),
    ),
  );
}

describe("exception state per result", () => {
  it("records the exception in effect on each open setting and credits only what the headline counts", () => {
    const assessment = assessBenchmark(tenant(), levelOne, {
      now: NOW,
      exceptions: [exception("shared", SHARED), exception("passing", PASSING)],
    });
    const one = recommendation(assessment, "1.1");
    expect(one.settings[0]!.exception).toEqual({ id: "shared", applies: true });
    expect(one.credited).toBe(true);
    // Another open setting without an exception: recorded, not credited.
    const two = recommendation(assessment, "1.2");
    expect(two.result).toBe("Fail");
    expect(two.settings.map((setting) => setting.exception)).toEqual([
      { id: "shared", applies: true },
      undefined,
    ]);
    expect(two.credited).toBeUndefined();
    // A setting that passes uses no exception.
    const three = recommendation(assessment, "1.3");
    expect(three.result).toBe("Pass");
    expect(three.settings[0]).not.toHaveProperty("exception");
    expect(three).not.toHaveProperty("credited");
    // The headline counts exactly the credited results.
    const level = headline(assessment, 1);
    expect([level.rate, level.adjusted, level.exceptionIds]).toEqual([
      1 / 3,
      2 / 3,
      ["shared"],
    ]);
  });

  it("keeps an exception that no longer applies in effect without credit, and prefers one that applies", () => {
    const expired = assessBenchmark(tenant(), levelOne, {
      now: NOW,
      exceptions: [exception("old", SHARED, EXPIRED)],
    });
    expect(recommendation(expired, "1.1").settings[0]!.exception).toEqual({
      id: "old",
      applies: false,
    });
    expect(recommendation(expired, "1.1").credited).toBeUndefined();
    expect(headline(expired, 1).adjusted).toBeNull();
    // Created after the as-of date: not applying either.
    const later = assessBenchmark(tenant(), levelOne, {
      now: NOW,
      exceptions: [
        exception("later", SHARED, { createdAt: "2026-10-25T09:00:00.000Z" }),
      ],
    });
    expect(recommendation(later, "1.1").settings[0]!.exception).toEqual({
      id: "later",
      applies: false,
    });
    for (const order of [
      ["old", "new"],
      ["new", "old"],
    ]) {
      const both = assessBenchmark(tenant(), levelOne, {
        now: NOW,
        exceptions: order.map((id) =>
          exception(id, SHARED, id === "old" ? EXPIRED : {}),
        ),
      });
      expect(recommendation(both, "1.1").settings[0]!.exception).toEqual({
        id: "new",
        applies: true,
      });
      expect(headline(both, 1).exceptionIds).toEqual(["new"]);
    }
  });

  it("records the state on the setting results of a pack judged by settings", () => {
    const settingsOnly = pack([
      { settings: [choice(SHARED, "1"), choice(PASSING, "1")] },
    ]);
    const assessment = assessBenchmark(tenant(), settingsOnly, {
      now: NOW,
      exceptions: [exception("shared", SHARED), exception("passing", PASSING)],
    });
    expect(assessment.basis).toBe("settings");
    const [shared, passing] = assessment.settings;
    expect([shared!.exception, shared!.credited]).toEqual([
      { id: "shared", applies: true },
      true,
    ]);
    expect(passing).not.toHaveProperty("exception");
    expect(headline(assessment, 1).exceptionIds).toEqual(["shared"]);
    // Findings of a pack judged by recommendations carry no state.
    const byRecommendations = assessBenchmark(tenant(), levelOne, {
      now: NOW,
      exceptions: [exception("shared", SHARED)],
    });
    for (const finding of byRecommendations.settings)
      expect(finding).not.toHaveProperty("exception");
  });

  describe("Level 1 with Level 2", () => {
    const one = (extra: Partial<BenchmarkException> = {}) =>
      exception("one", SHARED, { level: 1, ...extra });
    const two = (extra: Partial<BenchmarkException> = {}) =>
      exception("two", SHARED, { level: 2, ...extra });

    it("keeps the expired Level 1 exception on Level 1 and credits Level 2 with its own", () => {
      const assessment = compared([one(EXPIRED), two()]);
      expect(recommendation(assessment, "1.1").settings[0]!.exception).toEqual({
        id: "one",
        applies: false,
      });
      expect(recommendation(assessment, "1.1").credited).toBeUndefined();
      expect(recommendation(assessment, "2.1").settings[0]!.exception).toEqual({
        id: "two",
        applies: true,
      });
      expect(recommendation(assessment, "2.1").credited).toBe(true);
      expect(headline(assessment, 1).exceptionIds).toEqual([]);
      expect(headline(assessment, 1).adjusted).toBeNull();
      expect(headline(assessment, 2).exceptionIds).toEqual(["two"]);
    });

    it("gives each Level its own when both have one", () => {
      const assessment = compared([one(), two()]);
      expect(recommendation(assessment, "1.1").settings[0]!.exception!.id).toBe(
        "one",
      );
      expect(recommendation(assessment, "2.1").settings[0]!.exception!.id).toBe(
        "two",
      );
      expect(headline(assessment, 1).exceptionIds).toEqual(["one"]);
      expect(headline(assessment, 2).exceptionIds).toEqual(["two"]);
    });

    it("applies a Level 2 exception to Level 1 when Level 1 has none, by its stored id", () => {
      const assessment = compared([two()]);
      expect(recommendation(assessment, "1.1").settings[0]!.exception).toEqual({
        id: "two",
        applies: true,
      });
      expect(recommendation(assessment, "1.1").credited).toBe(true);
      expect(recommendation(assessment, "2.1").credited).toBe(true);
      expect(headline(assessment, 1).exceptionIds).toEqual(["two"]);
      expect(headline(assessment, 2).exceptionIds).toEqual(["two"]);
    });

    // Round 47 review: a Level 1 exception of another version or benchmark
    // for the same setting id never blocks the Level 2 exception.
    it("applies a Level 2 exception to Level 1 when only another version or benchmark has a Level 1 one", () => {
      const assessment = compared([
        exception("old-version", SHARED, { version: `${VERSION}-older` }),
        exception("other-bench", SHARED, { benchmark: `${BENCH}-other` }),
        two(),
      ]);
      expect(recommendation(assessment, "1.1").settings[0]!.exception).toEqual({ id: "two", applies: true });
      expect(recommendation(assessment, "1.1").credited).toBe(true);
      expect(headline(assessment, 1).exceptionIds).toEqual(["two"]);
    });

    it("never applies a Level 1 exception to Level 2", () => {
      const assessment = compared([one()]);
      expect(recommendation(assessment, "1.1").credited).toBe(true);
      expect(recommendation(assessment, "2.1").settings[0]).not.toHaveProperty(
        "exception",
      );
      expect(recommendation(assessment, "2.1").credited).toBeUndefined();
      expect(headline(assessment, 2).adjusted).toBeNull();
    });
  });
});

describe("exceptionLevels", () => {
  it("names the Levels whose exceptions an assessment applies", () => {
    expect(exceptionLevels(compared([]))).toEqual([1, 2]);
    expect(
      exceptionLevels(assessBenchmark(tenant(), levelOne, { now: NOW })),
    ).toEqual([1]);
    // A Level 2 pack holding Level 1 recommendations applies Level 2 only.
    const mixed = pack(
      [{ settings: [choice(SHARED, "1")] }],
      [
        { id: "1.1", title: "Synthetic one", level: 1, settings: [SHARED] },
        { id: "2.1", title: "Synthetic two", level: 2, settings: [SHARED] },
      ],
      2,
    );
    const alone = assessBenchmark(tenant(), mixed, { now: NOW });
    expect(alone.levels.map((level) => level.level)).toEqual([1, 2]);
    expect(exceptionLevels(alone)).toEqual([2]);
  });
});
