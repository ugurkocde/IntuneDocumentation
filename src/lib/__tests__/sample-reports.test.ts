import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { assessCompliance } from "../compliance";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  SAMPLE_EXCERPTS,
  expectedSampleManifest,
  sampleTenant,
} from "../compliance/demo/sample-plan";
import { renderSampleReport } from "../compliance/demo/render-sample";
import { SAMPLE_REPORTS } from "../compliance/samples";

const SAMPLES_DIR = path.join(process.cwd(), "public", "samples");
const REBUILD = "Run `npm run build:samples` and commit public/samples.";

function frameworkFor(sample: (typeof SAMPLE_REPORTS)[number]) {
  const assessment = assessCompliance(sampleTenant(sample));
  const framework = assessment.frameworks.find(
    (row) => row.framework.id === sample.frameworkId,
  );
  if (!framework) throw new Error(`Unknown framework ${sample.frameworkId}`);
  return { assessment, framework };
}

describe("published sample reports", () => {
  it("are current for the ruleset, the Contoso fixture and the excerpt plan", async () => {
    const manifestPath = path.join(SAMPLES_DIR, "manifest.json");
    expect(
      existsSync(manifestPath),
      `public/samples/manifest.json is missing. ${REBUILD}`,
    ).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const expected = await expectedSampleManifest();
    expect(
      manifest.rulesetVersion,
      `Sample reports were rendered with ruleset ${manifest.rulesetVersion}, the code is ${expected.rulesetVersion}. ${REBUILD}`,
    ).toBe(expected.rulesetVersion);
    expect(
      manifest.fixtureHash,
      `The Contoso demo tenant changed since the samples were rendered. ${REBUILD}`,
    ).toBe(expected.fixtureHash);
    expect(
      manifest.files,
      `The sample catalog or excerpt plan changed. ${REBUILD}`,
    ).toEqual(expected.files);
    for (const sample of SAMPLE_REPORTS)
      expect(
        existsSync(path.join(SAMPLES_DIR, sample.file)),
        `${sample.file} is missing. ${REBUILD}`,
      ).toBe(true);
  });

  // Regenerates every sample through the build script's code path, so a
  // generator change that is not republished fails here.
  it.each(SAMPLE_REPORTS.map((sample) => [sample.file, sample] as const))(
    "%s matches a fresh render and has 5 to 7 pages",
    async (file, sample) => {
      const committedPath = path.join(SAMPLES_DIR, file);
      expect(existsSync(committedPath), `${file} is missing. ${REBUILD}`).toBe(
        true,
      );
      const committed = readFileSync(committedPath);
      const fresh = Buffer.from(await renderSampleReport(sample));
      expect(
        fresh.equals(committed),
        `${file} is stale: the generator output changed. ${REBUILD}`,
      ).toBe(true);
      const pages = (
        committed.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []
      ).length;
      expect(pages, `${file} has ${pages} pages`).toBeGreaterThanOrEqual(5);
      expect(pages, `${file} has ${pages} pages`).toBeLessThanOrEqual(7);
    },
  );
});

describe("Contoso demo tenant", () => {
  it.each(SAMPLE_REPORTS.map((sample) => [sample.frameworkId, sample]))(
    "shows a credible status mix for %s",
    (_id, sample) => {
      const { assessment, framework } = frameworkFor(sample);
      const { summary } = framework;
      const applicable = summary.totalControls - summary.notApplicable;
      // Supporting mappings cap most controls at partial evidence, so
      // "with evidence" counts both evidence statuses.
      expect(summary.withEvidence + summary.partial).toBeGreaterThan(
        applicable / 2,
      );
      expect(summary.partial + summary.conflicting).toBeGreaterThan(0);
      expect(summary.withoutEvidence).toBeGreaterThan(0);

      const mapped = new Set(
        framework.controls.flatMap((control) => control.capabilityIds),
      );
      const results = assessment.capabilities.filter((result) =>
        mapped.has(result.capability.id),
      );
      // Assigned counter-evidence and a configured but unassigned policy.
      expect(
        results.some((result) =>
          result.evidence.some(
            (item) =>
              item.verdict === "disabled" &&
              item.assignment.state === "assigned",
          ),
        ),
      ).toBe(true);
      expect(
        results.some((result) => result.status === "configuredNotAssigned"),
      ).toBe(true);
    },
  );

  it("has mixed policy evidence and an all-clean collection", () => {
    const assessment = assessCompliance(CONTOSO_TENANT);
    expect(
      assessment.capabilities.some(
        (result) => result.status === "conflictingEvidence",
      ),
    ).toBe(true);
    expect(CONTOSO_TENANT.fetchErrors ?? []).toEqual([]);
    expect(CONTOSO_TENANT.collectedAt).toBe("2026-10-08T09:00:00Z");
    expect(
      assessment.collectionCoverage.every((row) => row.status === "complete"),
    ).toBe(true);
  });

  it("keeps the excerpt controls at their planned status", () => {
    for (const sample of SAMPLE_REPORTS) {
      const excerpt = SAMPLE_EXCERPTS[sample.frameworkId] ?? [];
      expect(excerpt.length).toBeGreaterThanOrEqual(2);
      expect(excerpt.length).toBeLessThanOrEqual(3);
      const { framework } = frameworkFor(sample);
      for (const { controlId, status } of excerpt)
        expect(
          framework.controls.find((row) => row.control.id === controlId)
            ?.status,
          `${sample.frameworkId} ${controlId}`,
        ).toBe(status);
    }
  });

  it("uses only synthetic identifiers with resolved group names", () => {
    const serialized = JSON.stringify(CONTOSO_TENANT, (_key, value: unknown) =>
      value instanceof Map ? Object.fromEntries(value) : value,
    );
    const guids = new Set(
      serialized.match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      ),
    );
    // Microsoft built-in identifiers (authentication strengths, empty
    // notification template) are global constants, not tenant data.
    for (const id of guids)
      expect(id, id).toMatch(
        /^(0c0e7050-0000-4000-8000-|00000000-0000-0000-0000-)/,
      );
    expect(serialized).not.toMatch(/@[a-z0-9-]+\.(com|net|org|io)/i);

    const groupNames = CONTOSO_TENANT.groupNames ?? new Map<string, string>();
    const groupIds = [
      ...serialized.matchAll(/"groupId":"([^"]+)"/g),
      ...serialized.matchAll(/"(?:in|ex)cludeGroups":\[([^\]]*)\]/g),
    ].flatMap((match) =>
      match[1]!.replaceAll('"', "").split(",").filter(Boolean),
    );
    expect(groupIds.length).toBeGreaterThan(0);
    for (const id of groupIds) expect(groupNames.has(id), id).toBe(true);
  });
});
