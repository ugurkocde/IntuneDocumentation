import { describe, expect, it } from "vitest";
import { assessBenchmark } from "../assessment";
import { computeCoverage, extractRecommendationIds } from "../coverage";
import { coverageStatement, levelCheckSummary } from "../display";
import { NOW, choice, collection, list, pack, tenantPolicy } from "./fixtures";

describe("recommendation identifier extraction", () => {
  it("extracts distinct dotted-decimal identifiers, sorted", () => {
    expect(extractRecommendationIds("covers 2.1 and 1.10.2, also 2.1")).toEqual(
      ["1.10.2", "2.1"],
    );
  });

  it("excludes the pack version token and export timestamps", () => {
    expect(
      extractRecommendationIds("1.0.0 build 2026.10.21 item 3.4", {
        packVersion: "1.0.0",
      }),
    ).toEqual(["3.4"]);
  });

  it("never takes part of a prefixed version or a longer token", () => {
    expect(extractRecommendationIds("v1.0.0 x3.4 5.6a 7.8")).toEqual(["7.8"]);
  });
});

describe("coverage of the full benchmark", () => {
  const items = [
    { identifier: "1.1", level: 1 as const, automated: true },
    { identifier: "1.2", level: 1 as const, automated: true },
    { identifier: "1.3", level: 1 as const, automated: true },
    {
      identifier: "1.4",
      level: 1 as const,
      automated: false,
      title: "Synthetic manual item",
    },
    { identifier: "2.1", level: 2 as const, automated: true },
  ];

  it("uses the delivered list as the denominator", () => {
    const coverage = computeCoverage({
      level: 1,
      version: "1.0.0",
      descriptions: ["Implements 1.3 and 9.9"],
      assessedIds: ["1.1"],
      unassessedIds: ["1.2"],
      list: list(items),
    });
    expect(coverage).toMatchObject({
      source: "list",
      denominator: 3,
      numerator: 2,
      coveredIds: ["1.1", "1.3"],
      notCoveredIds: ["1.2"],
      outsideListIds: ["9.9"],
    });
    expect(coverage.coverage).toBeCloseTo(2 / 3);
  });

  it("is not shown without a list", () => {
    const coverage = computeCoverage({
      level: 1,
      version: "1.0.0",
      descriptions: [],
      assessedIds: ["1.1"],
      unassessedIds: [],
    });
    expect([coverage.source, coverage.denominator, coverage.coverage]).toEqual([
      "none",
      null,
      null,
    ]);
    expect(coverageStatement({ level: 1, coverage })).toBe(
      "The full benchmark also has manual and other recommendations; coverage of the full benchmark will be shown once its list is published.",
    );
  });

  it("shows coverage, manual items and the check summary in an assessment with a matching list", () => {
    const target = pack(
      [
        {
          settings: [choice("synthetic_a", "on"), choice("synthetic_b", "on")],
        },
      ],
      [
        {
          id: "1.1",
          title: "Synthetic one",
          level: 1,
          settings: ["synthetic_a"],
        },
        {
          id: "1.2",
          title: "Synthetic two",
          level: 1,
          settings: ["synthetic_outside"],
        },
      ],
    );
    const policies = [
      tenantPolicy({ settings: [choice("synthetic_a", "on")] }),
    ];
    const withList = assessBenchmark(collection({ policies }), target, {
      now: NOW,
      list: list(items),
    });
    const level = withList.levels[0]!;
    expect(withList.listUsed).toBe(true);
    expect(coverageStatement(level)).toBe(
      "Coverage: 33.3% (1 of 3 automated recommendations), from the delivered recommendation list.",
    );
    expect(
      level.manual.map((item) => [item.identifier, item.title ?? null]),
    ).toEqual([
      ["1.2", null],
      ["1.3", null],
      ["1.4", "Synthetic manual item"],
    ]);
    expect(levelCheckSummary(level, 1)).toBe(
      "Level 1: Intune Documentation checks 1 of 4 recommendations automatically. The other 3 need a manual check.",
    );

    const otherVersion = assessBenchmark(collection({ policies }), target, {
      now: NOW,
      list: list(items, { version: "2.0.0" }),
    });
    expect(otherVersion.listUsed).toBe(false);
    expect(coverageStatement(otherVersion.levels[0]!)).toMatch(
      /^This pack covers \d+ recommendations?\. The full benchmark also has manual and other recommendations; coverage of the full benchmark will be shown once its list is published\.$/,
    );
    expect(levelCheckSummary(otherVersion.levels[0]!, 1)).toBe(
      "Level 1: Intune Documentation checks 1 recommendation of this pack automatically. The one listed here and any recommendations outside the pack need a manual check.",
    );
  });

  it("keeps the delivered title and audit text of automated items selected for a manual check (finding 3)", () => {
    const target = pack(
      [{ settings: [choice("synthetic_a", "on")] }],
      [
        {
          id: "1.1",
          title: "Synthetic one",
          level: 1,
          settings: ["synthetic_a"],
        },
        {
          id: "1.2",
          title: "Synthetic two",
          level: 1,
          settings: ["synthetic_outside"],
        },
      ],
    );
    const delivered = list([
      {
        identifier: "1.1",
        level: 1,
        automated: true,
        title: "Synthetic assessed item",
      },
      {
        identifier: "1.2",
        level: 1,
        automated: true,
        title: "Synthetic item the pack cannot assess",
        audit: "Synthetic audit steps",
      },
      {
        identifier: "1.3",
        level: 1,
        automated: true,
        title: "Synthetic item outside the pack",
      },
    ]);
    const run = assessBenchmark(
      collection({
        policies: [tenantPolicy({ settings: [choice("synthetic_a", "on")] })],
      }),
      target,
      { now: NOW, list: delivered },
    );
    const manual = run.levels[0]!.manual;
    expect(
      manual.map((item) => [
        item.identifier,
        item.title ?? null,
        item.audit ?? null,
      ]),
    ).toEqual([
      ["1.2", "Synthetic item the pack cannot assess", "Synthetic audit steps"],
      ["1.3", "Synthetic item outside the pack", null],
    ]);
    expect(manual.find((item) => item.identifier === "1.2")!.hasText).toBe(
      true,
    );
    // The assessed automated item is not a manual one.
    expect(manual.map((item) => item.identifier)).not.toContain("1.1");
  });
});
