import { describe, expect, it } from "vitest";
import {
  portfolioBenchmarks,
  portfolioRows,
  type PortfolioEntry,
} from "../portfolio";
import { storedRun } from "./fixtures";

const tenant = (
  id: string,
  runs: PortfolioEntry["runs"],
  name?: string,
): PortfolioEntry => ({
  tenantId: `00000000-0000-0000-0000-00000000000${id}`,
  tenantName: name ?? `Synthetic tenant ${id}`,
  runs,
});

describe("benchmark portfolio from stored runs", () => {
  it("returns no rows for no tenants and a row with the newest run of a tenant", () => {
    expect(portfolioRows([])).toEqual([]);
    const rows = portfolioRows([
      tenant("1", [
        storedRun("2026-10-01T09:00:00Z", 1, 1),
        storedRun("2026-10-05T09:00:00Z", 3, 1),
      ]),
    ]);
    expect(
      rows[0]!.levels.map((level) => [
        level.level,
        level.rate,
        level.assessedAt,
      ]),
    ).toEqual([[1, 0.75, "2026-10-05T09:00:00Z"]]);
  });

  it("ranks by Level 1 rate, then Level 2, keeps null rates and unassessed tenants last", () => {
    const rows = portfolioRows([
      tenant("1", [storedRun("2026-10-01T09:00:00Z", 1, 1)]),
      tenant("2", [storedRun("2026-10-01T09:00:00Z", 3, 1)]),
      tenant("3", [storedRun("2026-10-01T09:00:00Z", 0, 0, { review: 2 })]),
      tenant("4", []),
      {
        tenantId: "00000000-0000-0000-0000-000000000005",
        error: "Could not load",
      },
    ]);
    expect(rows.map((row) => row.tenantName ?? row.error)).toEqual([
      "Synthetic tenant 2",
      "Synthetic tenant 1",
      "Synthetic tenant 3",
      "Could not load",
      "Synthetic tenant 4",
    ]);
    expect(rows[3]!.assessedAt).toBeNull();
  });

  it("takes each Level from the newest run of that Level, so a newer Level 1 run does not hide Level 2", () => {
    const rows = portfolioRows([
      tenant("1", [
        storedRun("2026-10-01T09:00:00Z", 1, 1, { level: 2 }),
        storedRun("2026-10-05T09:00:00Z", 3, 1),
      ]),
    ]);
    expect(rows[0]!.levels.map((level) => [level.level, level.rate])).toEqual([
      [1, 0.75],
      [2, 0.5],
    ]);
  });

  it("compares tenants on one benchmark and version, by default the one most tenants ran", () => {
    const entries = [
      tenant("1", [storedRun("2026-10-01T09:00:00Z", 1, 1)]),
      tenant("2", [
        storedRun("2026-10-01T09:00:00Z", 1, 1),
        storedRun("2026-10-09T09:00:00Z", 1, 0, { version: "2.0.0" }),
      ]),
      tenant("3", [
        storedRun("2026-10-09T09:00:00Z", 1, 0, { version: "2.0.0" }),
      ]),
      tenant("4", [
        storedRun("2026-10-09T09:00:00Z", 1, 0, {
          benchmark: "synthetic-other",
        }),
      ]),
    ];
    expect(
      portfolioBenchmarks(entries).map((item) => [
        item.benchmark,
        item.version,
        item.tenants,
      ]),
    ).toEqual([
      ["synthetic-bench", "2.0.0", 2],
      ["synthetic-bench", "1.0.0", 2],
      ["synthetic-other", "1.0.0", 1],
    ]);
    const rows = portfolioRows(entries, {
      benchmark: "synthetic-bench",
      version: "1.0.0",
    });
    expect(
      rows.map((row) => [
        row.tenantName,
        row.version,
        row.otherBenchmark ?? false,
      ]),
    ).toEqual([
      ["Synthetic tenant 1", "1.0.0", false],
      ["Synthetic tenant 2", "1.0.0", false],
      ["Synthetic tenant 3", null, true],
      ["Synthetic tenant 4", null, true],
    ]);
  });

  it("deduplicates tenants by lowercased id and does not change the input", () => {
    const first = tenant(
      "a",
      [storedRun("2026-10-01T09:00:00Z", 1, 1)],
      "First",
    );
    const entries = [
      first,
      {
        ...first,
        tenantId: first.tenantId.toUpperCase(),
        tenantName: "Second",
      },
    ];
    const copy = structuredClone(entries);
    expect(portfolioRows(entries).map((row) => row.tenantName)).toEqual([
      "First",
    ]);
    expect(entries).toEqual(copy);
  });

  it("never ranks rates of different bases against each other", () => {
    const rows = portfolioRows([
      tenant("1", [
        storedRun("2026-10-01T09:00:00Z", 9, 1, { basis: "settings" }),
      ]),
      tenant("2", [storedRun("2026-10-01T09:00:00Z", 1, 9)]),
    ]);
    expect(rows.map((row) => row.levels[0]!.basis)).toEqual([
      "recommendations",
      "settings",
    ]);
  });
});
