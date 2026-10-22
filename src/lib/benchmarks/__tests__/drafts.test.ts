import { readFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIX_PACK_WARNING } from "../../compliance/fix-pack";
import {
  benchmarkDraftsReadme,
  buildBenchmarkDraftsZip,
  generateBenchmarkDrafts,
} from "../drafts";
import {
  ALPHA,
  BETA,
  GAMMA,
  LENGTH,
  MAC,
  PACK_POLICY,
  TEMPLATED,
  TENANT_POLICY,
  UNASSIGNED_POLICY,
  richAssessment,
  richPack,
} from "./export-fixtures";

const settingIds = (drafts: ReturnType<typeof generateBenchmarkDrafts>) =>
  drafts.drafts.flatMap((draft) => draft.settingIds);

afterEach(() => vi.restoreAllMocks());

describe("benchmark draft policies", () => {
  it("drafts only Missing settings, one unassigned policy per pack policy with generic names", () => {
    const result = generateBenchmarkDrafts(richAssessment(), richPack());
    expect(settingIds(result)).toEqual([LENGTH, MAC]);
    expect(result.drafts.map((draft) => draft.json.name)).toEqual([
      "synthetic-bench 1.0.0 L1 draft 1",
      "synthetic-bench 1.0.0 L1 draft 2",
    ]);
    expect(result.drafts.map((draft) => draft.fileName)).toEqual([
      "01-synthetic-bench-1.0.0-L1-draft-1.json",
      "02-synthetic-bench-1.0.0-L1-draft-2.json",
    ]);
    const [windows, mac] = result.drafts;
    expect(windows!.json.platforms).toBe("windows10");
    expect(windows!.json.technologies).toBe("mdm");
    expect(mac!.json.platforms).toBe("macOS");
    expect(mac!.json.technologies).toBe("mdm,appleRemoteManagement");
    for (const draft of result.drafts) {
      expect(draft.json).not.toHaveProperty("assignments");
      expect(draft.json.templateReference).toEqual({
        templateId: "",
        templateFamily: "none",
      });
      expect(draft.json.roleScopeTagIds).toEqual(["0"]);
      expect(JSON.stringify(draft.json)).not.toMatch(/TemplateReference/);
    }
    expect(windows!.json.settings).toEqual([
      {
        "@odata.type": "#microsoft.graph.deviceManagementConfigurationSetting",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
          settingDefinitionId: LENGTH,
          simpleSettingValue: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationIntegerSettingValue",
            value: 14,
          },
        },
      },
    ]);
  });

  it("describes drafts with the fix pack warning and recommendation ids only", () => {
    const result = generateBenchmarkDrafts(richAssessment(), richPack());
    expect(result.drafts[0]!.recommendationIds).toEqual(["1.3"]);
    expect(result.drafts[0]!.json.description).toBe(
      `${FIX_PACK_WARNING} Benchmark synthetic-bench 1.0.0, Level 1. Recommendations: 1.3.`,
    );
    const text = JSON.stringify(result.drafts);
    expect(text).not.toContain(PACK_POLICY);
    for (const item of richAssessment().recommendations)
      expect(text).not.toContain(item.title);
  });

  it("names the policy to change for Different instead of drafting it", () => {
    const result = generateBenchmarkDrafts(richAssessment(), richPack());
    expect(settingIds(result)).not.toContain(BETA);
    expect(result.changes).toEqual([
      {
        settingId: BETA,
        recommendationIds: ["1.2"],
        policies: [TENANT_POLICY],
      },
    ]);
    expect(benchmarkDraftsReadme(result, richAssessment())).toContain(
      `${BETA}: change policy ${TENANT_POLICY}. Recommendations 1.2.`,
    );
  });

  it("skips pack policies created from a template and settings that need review", () => {
    const result = generateBenchmarkDrafts(richAssessment(), richPack());
    expect(settingIds(result)).not.toContain(TEMPLATED);
    expect(settingIds(result)).not.toContain(GAMMA);
    expect(settingIds(result)).not.toContain(ALPHA);
    const reasons = Object.fromEntries(
      result.notGenerated.map((gap) => [gap.settingId, gap.reason]),
    );
    expect(reasons[TEMPLATED]).toMatch(/created from a template/);
    expect(reasons[GAMMA]).toContain(`Assign policy ${UNASSIGNED_POLICY}`);
  });

  it("drafts nothing on an incomplete collection", () => {
    const assessment = richAssessment({ complete: false });
    const result = generateBenchmarkDrafts(assessment, richPack());
    expect(result.drafts).toEqual([]);
    expect(benchmarkDraftsReadme(result, assessment)).toContain(
      "None. The collection could not establish that the setting is missing.",
    );
  });

  it("gates a Missing setting on the completeness of the collection", () => {
    const assessment = richAssessment();
    const incomplete = {
      ...assessment,
      collection: { ...assessment.collection, complete: false },
    };
    const result = generateBenchmarkDrafts(incomplete, richPack());
    expect(result.drafts).toEqual([]);
    expect(result.notGenerated.map((gap) => gap.settingId)).toEqual(
      expect.arrayContaining([LENGTH, MAC]),
    );
  });

  it("refuses a pack that does not belong to the assessment", () => {
    expect(() =>
      generateBenchmarkDrafts(richAssessment(), {
        ...richPack(),
        version: "2.0.0",
      }),
    ).toThrow(/does not match/);
  });

  it("builds a deterministic ZIP of README.txt and the drafts without pack text", async () => {
    const result = generateBenchmarkDrafts(richAssessment(), richPack());
    const bytes = await buildBenchmarkDraftsZip(result, richAssessment());
    expect(
      Buffer.from(
        await buildBenchmarkDraftsZip(
          generateBenchmarkDrafts(richAssessment(), richPack()),
          richAssessment(),
        ),
      ).equals(Buffer.from(bytes)),
    ).toBe(true);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual([
      "README.txt",
      ...result.drafts.map((draft) => draft.fileName),
    ]);
    const texts = await Promise.all(
      Object.values(zip.files).map((file) => file.async("string")),
    );
    for (const text of texts) {
      expect(text).not.toContain(PACK_POLICY);
      for (const item of richAssessment().recommendations)
        expect(text).not.toContain(item.title);
      expect(text).not.toMatch(/[–—]| - /);
      expect(text).not.toMatch(/\bcompliant\b|\bcertified\b/i);
    }
    const readme = texts[0]!;
    expect(readme).toContain("Create > Import policy");
    expect(readme).toContain("never writes to your tenant");
    expect(readme).toContain(
      "Summary: 2 draft policies, 1 policy changes, 3 not generated.",
    );
  });

  it("never writes to a tenant", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const result = generateBenchmarkDrafts(richAssessment(), richPack());
    await buildBenchmarkDraftsZip(result, richAssessment());
    expect(fetchSpy).not.toHaveBeenCalled();
    for (const file of ["drafts.ts", "export.ts", "readiness-pdf.ts"]) {
      const source = readFileSync(
        path.join(process.cwd(), "src/lib/benchmarks", file),
        "utf8",
      );
      expect(source, file).not.toMatch(
        /\bfetch\(|XMLHttpRequest|graph\.microsoft\.com|net\.request/,
      );
    }
  });
});
