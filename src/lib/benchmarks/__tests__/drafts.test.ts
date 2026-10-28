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
  UNASSIGNED_MATCH,
  UNASSIGNED_OTHER,
  UNASSIGNED_POLICY,
  UNASSIGNED_UNREADABLE,
  richAssessment,
  richPack,
  unassignedAssessment,
  unassignedPack,
} from "./export-fixtures";
import { assessBenchmark } from "../assessment";
import {
  choice,
  collection,
  deviceConfiguration,
  NOW,
  pack,
  tenantPolicy,
} from "./fixtures";

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

  // Round 39: a policy that holds another value is never the one to assign.
  it("advises assigning a matching unassigned policy and changing a differing one first", () => {
    const assessment = unassignedAssessment();
    const result = generateBenchmarkDrafts(assessment, unassignedPack());
    expect(result.drafts).toEqual([]);
    expect(result.changes).toEqual([]);
    const reasons = Object.fromEntries(
      result.notGenerated.map((gap) => [gap.settingId, gap.reason]),
    );
    expect(reasons[ALPHA]).toBe(
      `The matching value is only on policies that are not assigned. Assign policy ${UNASSIGNED_MATCH} instead of importing a second one.`,
    );
    expect(reasons[LENGTH]).toBe(
      `Only policies that are not assigned hold this setting, and none of them matches the recommended value. Change the value in policy ${UNASSIGNED_OTHER} before assigning it, or set the recommended value in a policy that is assigned. Change ${GAMMA} in policy ${UNASSIGNED_OTHER} from 2 to 1 before assigning it. No draft is generated, because a second policy with this setting conflicts once both are assigned.`,
    );
    expect(reasons[GAMMA]).toBe(
      `Only policies that are not assigned hold this setting: some match the recommended value and some hold another value. Assign policy ${UNASSIGNED_MATCH} instead of importing a second one, and change the value in policy ${UNASSIGNED_OTHER} before assigning it. Change ${LENGTH} in policy ${UNASSIGNED_OTHER} from 9 to 14 before assigning it. The value in policy ${UNASSIGNED_UNREADABLE} could not be read; check it before assigning that policy.`,
    );
    for (const id of [LENGTH, GAMMA])
      expect(reasons[id]).not.toContain(
        "The matching value is only on policies that are not assigned",
      );
    const readme = benchmarkDraftsReadme(result, assessment);
    expect(readme).toContain(
      `${LENGTH}: ${reasons[LENGTH]} Recommendations 1.2.`,
    );
    expect(readme).not.toContain(`Assign policy ${UNASSIGNED_OTHER}`);
  });

  it("drafts nothing for a setting that may be set outside the Settings Catalog (D2)", () => {
    const assessment = richAssessment({
      other: {
        deviceConfigurations: [
          deviceConfiguration("macOSCustomConfiguration"),
          deviceConfiguration(
            "windows10CustomConfiguration",
            "synthetic-config-2",
          ),
        ],
      },
    });
    const result = generateBenchmarkDrafts(assessment, richPack());
    expect(result.drafts).toEqual([]);
    const reasons = Object.fromEntries(
      result.notGenerated.map((gap) => [gap.settingId, gap.reason]),
    );
    expect(reasons[LENGTH]).toContain("outside the Settings Catalog");
    expect(reasons[MAC]).toContain("outside the Settings Catalog");
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

  // Round 45: an empty Drafts list claims nothing is missing only when no
  // Missing finding exists.
  it("says no draft was generated when the only Missing setting is in a template policy", () => {
    const templatedPack = pack([
      {
        name: "Synthetic templated pack policy",
        settings: [choice(TEMPLATED, "1")],
      },
    ]);
    (
      templatedPack.policies as Array<Record<string, unknown>>
    )[0]!.templateReference = {
      templateId: "00000000-0000-0000-0000-00000000c001_1",
    };
    const assessment = assessBenchmark(
      collection({ policies: [tenantPolicy({ settings: [] })] }),
      templatedPack,
      { now: NOW },
    );
    expect(assessment.settings.map((finding) => finding.status)).toEqual([
      "Missing",
    ]);
    const result = generateBenchmarkDrafts(assessment, templatedPack);
    expect(result.drafts).toEqual([]);
    const readme = benchmarkDraftsReadme(result, assessment);
    expect(readme).toContain(
      "No draft policies were generated; see Not generated.",
    );
    expect(readme).not.toContain("No setting is missing");
    expect(readme).toContain(`- ${TEMPLATED}: `);
  });

  it("still says nothing is missing when no setting is Missing", () => {
    const presentPack = pack([{ settings: [choice(ALPHA, "1")] }]);
    const assessment = assessBenchmark(
      collection({
        policies: [tenantPolicy({ settings: [choice(ALPHA, "1")] })],
      }),
      presentPack,
      { now: NOW },
    );
    expect(assessment.settings.map((finding) => finding.status)).toEqual([
      "Present",
    ]);
    const readme = benchmarkDraftsReadme(
      generateBenchmarkDrafts(assessment, presentPack),
      assessment,
    );
    expect(readme).toContain(
      "None. No setting is missing from the collection.",
    );
    expect(readme).not.toContain("No draft policies were generated");
  });

  // Defensive: the assessment marks no setting Missing on an incomplete
  // collection, but the drafts still gate on completeness.
  it("points a Missing setting the completeness gate holds back to Not generated", () => {
    const assessment = richAssessment();
    const incomplete = {
      ...assessment,
      collection: { ...assessment.collection, complete: false },
    };
    const readme = benchmarkDraftsReadme(
      generateBenchmarkDrafts(incomplete, richPack()),
      incomplete,
    );
    expect(readme).toContain(
      "No draft policies were generated; see Not generated.",
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

// Round 47 lab review: the README says what the ZIP holds, by readable names.
describe("benchmark drafts README wording", () => {
  it("says the ZIP holds no draft and gives no import steps when nothing is drafted", () => {
    const assessment = unassignedAssessment();
    const readme = benchmarkDraftsReadme(generateBenchmarkDrafts(assessment, unassignedPack()), assessment);
    expect(readme).toContain("This ZIP holds no draft policy.");
    expect(readme).not.toContain("Each JSON file is a draft");
    expect(readme).not.toContain("How to import a policy");
  });

  it("names settings by their readable name with the id beside it", () => {
    const assessment = {
      ...unassignedAssessment(),
      settingNames: { [LENGTH]: { name: "Synthetic minimum length", options: {} } },
    };
    const readme = benchmarkDraftsReadme(generateBenchmarkDrafts(assessment, unassignedPack()), assessment);
    expect(readme).toContain(`- Synthetic minimum length (${LENGTH}): `);
    expect(readme).toContain(`- ${GAMMA}: `);
  });

  it("does not say no recommendation is mapped for settings judged by themselves", () => {
    const setting = "synthetic_bench_settings_only";
    const settingsPack = pack([{ settings: [choice(setting, "1")] }]);
    const assessment = assessBenchmark(
      collection({ policies: [tenantPolicy({ name: "Synthetic unassigned", settings: [choice(setting, "1")], assignments: [] })] }),
      settingsPack,
      { now: NOW },
    );
    expect(assessment.basis).toBe("settings");
    const drafts = generateBenchmarkDrafts(assessment, settingsPack);
    expect(drafts.notGenerated.map((gap) => gap.recommendationIds)).toEqual([[]]);
    const readme = benchmarkDraftsReadme(drafts, assessment);
    expect(readme).toContain(`- ${setting}: The matching value is only on policies that are not assigned.`);
    expect(readme).not.toContain("No recommendation mapped.");
  });
});
