import { describe, expect, it } from "vitest";
import { assessCompliance, essentialEightFramework } from "../compliance";
import type { DetailedExportData } from "../configuration-analyzer";
import { COMPLIANCE_CAPABILITIES } from "../compliance/capabilities";
import { createEvidenceManifest } from "../compliance/manifest";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import { extractPdfStreamText } from "./helpers/pdf-text";
import source from "../compliance/frameworks/essential-eight-requirements.json";

const data = (
  level: 1 | 2 | 3 = 1,
  values: Record<string, unknown> = {},
): DetailedExportData => ({
  assessmentScope: { essentialEightMaturityLevel: level },
  settingsCatalog: [],
  administrativeTemplates: [],
  compliancePolicies: [],
  securityBaselines: [],
  scripts: { windows: [], macOS: [] },
  deviceConfigurations: [
    {
      id: "endpoint",
      displayName: "Example endpoint",
      "@odata.type":
        "#microsoft.graph.windows10EndpointProtectionConfiguration",
      assignments: [
        {
          target: {
            "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
          },
        },
      ],
      ...values,
    },
  ],
});
const assess = (input: DetailedExportData) =>
  assessCompliance(input).frameworks.find(
    (f) => f.framework.id === "essential-eight",
  )!;

describe("Essential Eight target maturity", () => {
  it.each([
    [1, 48],
    [2, 107],
    [3, 149],
  ] as const)("includes every Level %s requirement", (level, count) => {
    const framework = essentialEightFramework(level);
    expect(Object.keys(framework.controls)).toHaveLength(count);
    expect(
      new Set(Object.values(framework.controls).map((c) => c.title)).size,
    ).toBe(8);
    expect(
      new Set(
        source.requirements.filter((r) => r.level === level).map((r) => r.id),
      ).size,
    ).toBe(count);
    const known = new Set(COMPLIANCE_CAPABILITIES.map((c) => c.id));
    for (const [capability, ids] of Object.entries(framework.mappings)) {
      expect(known.has(capability)).toBe(true);
      for (const id of ids) expect(framework.controls[id]).toBeDefined();
    }
    const result = assess(data(level));
    expect(result.summary.withEvidence).toBe(0);
    expect(
      result.controls
        .filter((c) => c.control.title === "Regular backups")
        .every((c) => c.status === "notAssessed"),
    ).toBe(true);
    expect(result.framework.version).toContain(
      `target Maturity Level ${level}`,
    );
  });
  it("does not invent maturity zero or silently accept invalid targets", () => {
    expect(() => essentialEightFramework(0 as any)).toThrow();
    expect(() => essentialEightFramework(4 as any)).toThrow();
    expect(
      assessCompliance({ ...data(), assessmentScope: undefined }).scope
        .essentialEightMaturityLevel,
    ).toBe(1);
  });
  it("only introduces Win32 macro restrictions at Levels 2 and 3", () => {
    const values = { defenderOfficeMacroCodeAllowWin32ImportsType: "block" };
    expect(
      assess(data(1, values)).controls.some((c) =>
        c.capabilityIds.includes("windows-office-macro-win32-block"),
      ),
    ).toBe(false);
    for (const level of [2, 3] as const) {
      const row = assess(data(level, values)).controls.find((c) =>
        c.capabilityIds.includes("windows-office-macro-win32-block"),
      )!;
      expect(row.status).toBe("partialEvidence");
    }
  });
  it.each(["auditMode", "warn", "disable", "userDefined"])(
    "does not count %s as blocking",
    (mode) => {
      const row = assess(
        data(2, { defenderOfficeAppsLaunchChildProcessType: mode }),
      ).controls.find((c) =>
        c.capabilityIds.includes("windows-office-child-process-block"),
      )!;
      expect(row.enforcedCapabilityIds).toEqual([]);
      expect(row.status).not.toBe("partialEvidence");
    },
  );
  it("does not credit Level 3 protections at lower levels", () => {
    for (const level of [1, 2] as const)
      expect(
        essentialEightFramework(level).mappings["windows-credential-guard"],
      ).toBeUndefined();
    expect(
      essentialEightFramework(3).mappings["windows-credential-guard"],
    ).toHaveLength(1);
    expect(
      Object.values(essentialEightFramework(3).controls).some((c) =>
        c.summary.includes("48 hours"),
      ),
    ).toBe(true);
  });
  it("preserves selected target and changes ruleset hash without changing snapshot hash", async () => {
    const one = await createEvidenceManifest(data(1));
    const three = await createEvidenceManifest(data(3));
    expect(one.snapshotSha256).toBe(three.snapshotSha256);
    expect(one.rulesetSha256).not.toBe(three.rulesetSha256);
    expect(three.assessment.scope.essentialEightMaturityLevel).toBe(3);
  });
  it.each([1, 2, 3] as const)(
    "exports the Level %s requirements and target disclaimer to PDF",
    async (level) => {
      const bytes = await generateComplianceReportPDF(data(level), {
        frameworkId: "essential-eight",
      });
      const text = extractPdfStreamText(bytes);
      expect(text).toContain(`Maturity Level ${level}`);
      expect(text).toContain(`ML${level}-BK-01`);
      expect(text).toContain("achieved maturity");
      expect(text).toContain(
        "Application control is implemented on workstations.",
      );
      const contentsStart = text.indexOf("(Table of Contents) Tj");
      const contentsEnd = text.indexOf("(Summary) Tj", contentsStart);
      // The first Summary entry belongs to the contents. Stop at the body
      // Summary heading, which follows the contents page's text stream.
      const bodyStart = text.indexOf("(Summary) Tj", contentsEnd + 1);
      expect(contentsStart).toBeGreaterThan(0);
      expect(bodyStart).toBeGreaterThan(contentsEnd);
      const contents = text.slice(contentsStart, bodyStart);
      const strategies = new Set(
        Object.values(essentialEightFramework(level).controls).map(
          (control) => control.title,
        ),
      );
      for (const strategy of strategies) {
        expect(contents.split(`(${strategy}) Tj`)).toHaveLength(2);
      }
      expect(contents).not.toMatch(/ML[123]-[A-Z]+-\d+/);
    },
  );
});

it("keeps operational patch and backup requirements separate from expanded technical checks", () => {
  for (const level of [1, 2, 3] as const) {
    const framework = essentialEightFramework(level);
    const mapped = new Set(Object.values(framework.mappings).flat());
    for (const control of Object.values(framework.controls)) {
      if (
        control.summary.includes("48 hours") ||
        control.title === "Regular backups"
      )
        expect(mapped.has(control.id)).toBe(false);
    }
    expect(mapped.size).toBe({ 1: 15, 2: 25, 3: 31 }[level]);
  }
});
it("preserves conflicting ASR policies and explicit platform scope", () => {
  const input = data(2, { defenderOfficeAppsLaunchChildProcessType: "block" });
  input.deviceConfigurations.push({
    ...input.deviceConfigurations[0]!,
    id: "counter",
    defenderOfficeAppsLaunchChildProcessType: "auditMode",
  });
  const row = assess(input).controls.find((c) =>
    c.capabilityIds.includes("windows-office-child-process-block"),
  )!;
  expect(row.status).toBe("conflictingEvidence");
  input.assessmentScope = {
    essentialEightMaturityLevel: 2,
    platforms: ["macos"],
  };
  const scoped = assess(input).controls.find(
    (c) => c.control.id === row.control.id,
  )!;
  expect(scoped.status).toBe("notApplicable");
});
