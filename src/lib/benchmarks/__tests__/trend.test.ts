import { describe, expect, it } from "vitest";
import {
  benchmarkTrend,
  driftSignals,
  sparklineSegments,
  trendChangeText,
} from "../trend";

import { storedRun } from "./fixtures";

const DIGEST_B = `sha256:${"b".repeat(64)}`;

describe("benchmark trend from stored runs", () => {
  it("returns no points for no runs and a first point for one", () => {
    expect(benchmarkTrend([])).toEqual([]);
    const [point] = benchmarkTrend([storedRun("2026-10-01T09:00:00Z", 3, 1)]);
    expect([
      point!.rate,
      point!.comparison,
      point!.change,
      trendChangeText(point!),
    ]).toEqual([0.75, "first", null, "First comparison"]);
  });

  it("sorts oldest first without changing the input, and computes the change", () => {
    const runs = [
      storedRun("2026-10-03T09:00:00Z", 1, 1),
      storedRun("2026-10-01T09:00:00Z", 3, 1),
    ];
    const copy = structuredClone(runs);
    const points = benchmarkTrend(runs);
    expect(runs).toEqual(copy);
    expect(points.map((point) => point.rate)).toEqual([0.75, 0.5]);
    expect(points[1]!.change).toBeCloseTo(-0.25);
    expect(trendChangeText(points[1]!)).toBe("-25.0 pp");
  });

  it("keeps Review out of the rate, as the live headline does", () => {
    expect(
      benchmarkTrend([
        storedRun("2026-10-01T09:00:00Z", 1, 1, { review: 6 }),
      ])[0]!.rate,
    ).toBe(0.5);
    expect(
      benchmarkTrend([
        storedRun("2026-10-01T09:00:00Z", 0, 0, { review: 2 }),
      ])[0]!.rate,
    ).toBeNull();
  });

  it("never compares across a pack change, a version, a Level or a basis", () => {
    const points = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 3, 1),
      storedRun("2026-10-02T09:00:00Z", 1, 1, { packDigest: DIGEST_B }),
      storedRun("2026-10-03T09:00:00Z", 1, 1, { version: "2.0.0" }),
      storedRun("2026-10-04T09:00:00Z", 1, 1, { level: 2 }),
      storedRun("2026-10-05T09:00:00Z", 1, 1, {
        packDigest: DIGEST_B,
        basis: "settings",
      }),
    ]);
    expect(points.map((point) => point.comparison)).toEqual([
      "first",
      "pack-changed",
      "first",
      "first",
      "pack-changed",
    ]);
    expect(points.every((point) => point.change === null)).toBe(true);
  });

  it("reports drift at exactly 5 points but not at 4.9, and prefers below-bar", () => {
    const decline = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 80, 20),
      storedRun("2026-10-02T09:00:00Z", 75, 25),
    ]);
    expect(driftSignals(decline).map((entry) => entry.kind)).toEqual([
      "decline",
    ]);
    const small = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 800, 200),
      storedRun("2026-10-02T09:00:00Z", 751, 249),
    ]);
    expect(driftSignals(small)).toEqual([]);
    const below = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 95, 5),
      storedRun("2026-10-02T09:00:00Z", 85, 15),
    ]);
    expect(driftSignals(below).map((entry) => entry.kind)).toEqual([
      "below-bar",
    ]);
    // The counts behind both rates, so the drift names its base.
    expect(driftSignals(below)[0]).toMatchObject({
      previousCounts: { pass: 95, fail: 5 },
      currentCounts: { pass: 85, fail: 15 },
    });
    const rise = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 85, 15),
      storedRun("2026-10-02T09:00:00Z", 95, 5),
    ]);
    expect(driftSignals(rise)).toEqual([]);
    const changed = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 95, 5),
      storedRun("2026-10-02T09:00:00Z", 50, 50, { packDigest: DIGEST_B }),
    ]);
    expect(driftSignals(changed)).toEqual([]);
  });

  it("breaks sparkline segments at null rates and at points not compared", () => {
    const points = benchmarkTrend([
      storedRun("2026-10-01T09:00:00Z", 1, 1),
      storedRun("2026-10-02T09:00:00Z", 2, 1),
      storedRun("2026-10-03T09:00:00Z", 0, 0, { review: 1 }),
      storedRun("2026-10-04T09:00:00Z", 2, 2),
      storedRun("2026-10-05T09:00:00Z", 2, 2, { packDigest: DIGEST_B }),
    ]);
    expect(sparklineSegments(points)).toEqual([[0, 1], [3], [4]]);
  });
});
