import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  benchmarkCsv,
  benchmarkExportFileName,
  benchmarkJson,
  exportBenchmark,
} from "../export";
import { RESULT_LABELS } from "../display";
import {
  PACK_POLICY,
  TENANT_POLICY,
  UNASSIGNED_POLICY,
  richAssessment,
  richPack,
  unassessedAssessment,
} from "./export-fixtures";

// Local time: file names carry the local date and time.
const LOCAL = new Date(2026, 9, 22, 14, 5);
const decode = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

function keysSorted(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(keysSorted);
  if (value === null || typeof value !== "object") return true;
  const keys = Object.keys(value);
  return (
    keys.join() === [...keys].sort().join() &&
    Object.values(value).every(keysSorted)
  );
}

describe("benchmark export file names", () => {
  it("names the benchmark id, version, Level, tenant and local time only", () => {
    const assessment = richAssessment();
    expect(
      benchmarkExportFileName(assessment, "pdf", {
        tenantLabel: "Synthetic Tenant",
        date: LOCAL,
      }),
    ).toBe(
      "CIS-Readiness-synthetic-bench-1.0.0-L1-synthetic-tenant-2026-10-22-1405.pdf",
    );
    expect(benchmarkExportFileName(assessment, "csv", { date: LOCAL })).toBe(
      "CIS-Readiness-synthetic-bench-1.0.0-L1-2026-10-22-1405.csv",
    );
    expect(
      benchmarkExportFileName(assessment, "json", { date: LOCAL }),
    ).toMatch(/\.json$/);
    expect(
      benchmarkExportFileName(assessment, "drafts", { date: LOCAL }),
    ).toMatch(/-L1-2026-10-22-1405\.zip$/);
  });

  it("keeps titles out of the file name and unsafe characters out of the tenant part", async () => {
    const { fileName } = await exportBenchmark(richAssessment(), "csv", {
      tenantLabel: "../Synthetic: Tenant*",
      renderDate: LOCAL,
      benchmarkName: "Synthetic Named Benchmark",
    });
    expect(fileName).toBe(
      "CIS-Readiness-synthetic-bench-1.0.0-L1-synthetic-tenant-2026-10-22-1405.csv",
    );
  });
});

describe("benchmark CSV", () => {
  it("lists ids, result codes, labels, reasons and open settings without titles", () => {
    const csv = benchmarkCsv(richAssessment());
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe(
      "Benchmark,Version,Level,Item level,Item,ID,Result code,Result,Reason code,Reason,Open setting IDs",
    );
    expect(lines).toContain(
      "synthetic-bench,1.0.0,1,1,Recommendation,1.1,pass,Matches,,,",
    );
    expect(lines).toContain(
      "synthetic-bench,1.0.0,1,1,Recommendation,2.1,review,Needs review,notAssigned,The matching value is only on policies that are not assigned.,synthetic_bench_gamma",
    );
    expect(lines).toHaveLength(1 + richAssessment().recommendations.length);
    for (const item of richAssessment().recommendations)
      expect(csv).not.toContain(item.title);
    expect(csv).not.toContain(TENANT_POLICY);
    expect(csv.startsWith("﻿")).toBe(true);
  });

  it("neutralises cells a spreadsheet would read as a formula", () => {
    const assessment = richAssessment();
    assessment.recommendations[0] = {
      ...assessment.recommendations[0]!,
      id: "=HYPERLINK(1)",
      openSettingIds: ["+cmd"],
    };
    const csv = benchmarkCsv(assessment);
    expect(csv).toContain(",'=HYPERLINK(1),");
    expect(csv).toContain(",'+cmd\r\n");
    for (const line of csv.split("\r\n"))
      for (const cell of line.split(",")) expect(cell).not.toMatch(/^[=+\-@]/);
  });

  it("lists settings when the pack has no recommendations", () => {
    const assessment = {
      ...richAssessment(),
      basis: "settings" as const,
      recommendations: [],
    };
    const csv = benchmarkCsv(assessment);
    expect(csv).toContain(
      "synthetic-bench,1.0.0,1,1,Setting,synthetic_bench_beta,fail,Differs,,,synthetic_bench_beta",
    );
  });
});

describe("benchmark JSON summary", () => {
  it("is deterministic with sorted keys", () => {
    const text = benchmarkJson(richAssessment());
    expect(benchmarkJson(richAssessment())).toBe(text);
    expect(keysSorted(JSON.parse(text))).toBe(true);
  });

  it("holds ids, codes, labels, reasons and counts, no titles or policy names", () => {
    const text = benchmarkJson(richAssessment());
    const summary = JSON.parse(text);
    expect(summary.levels[0].headline.counts).toEqual({
      pass: 1,
      fail: 4,
      review: 2,
      notAssessed: 1,
    });
    expect(summary.levels[0].headline.rate).toBe(0.2);
    expect(summary.results[1]).toMatchObject({
      id: "1.2",
      resultCode: "fail",
      result: RESULT_LABELS.Fail,
    });
    expect(summary.results[5]).toMatchObject({
      id: "2.1",
      reasonCode: "notAssigned",
    });
    expect(summary.disclaimer).toBe(
      "Readiness comparison, not a certification",
    );
    for (const name of [TENANT_POLICY, UNASSIGNED_POLICY, PACK_POLICY])
      expect(text).not.toContain(name);
    for (const item of richAssessment().recommendations)
      expect(text).not.toContain(item.title);
  });

  it("keeps a null headline when nothing was assessed", () => {
    const summary = JSON.parse(benchmarkJson(unassessedAssessment()));
    expect(summary.levels[0].headline.rate).toBeNull();
    expect(summary.levels[0].coverage.source).toBe("none");
  });
});

describe("exportBenchmark", () => {
  it("returns PDF bytes", async () => {
    const result = await exportBenchmark(richAssessment(), "pdf", {
      renderDate: LOCAL,
    });
    expect(decode(result.bytes.subarray(0, 5))).toBe("%PDF-");
    expect(result.fileName).toMatch(/\.pdf$/);
  });

  it("returns the drafts ZIP and needs the pack for it", async () => {
    await expect(exportBenchmark(richAssessment(), "drafts")).rejects.toThrow(
      /delivered pack/,
    );
    const result = await exportBenchmark(richAssessment(), "drafts", {
      pack: richPack(),
      renderDate: LOCAL,
    });
    const zip = await JSZip.loadAsync(result.bytes);
    expect(Object.keys(zip.files)[0]).toBe("README.txt");
  });
});
