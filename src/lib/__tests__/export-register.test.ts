import { describe, expect, it } from "vitest";
import { assessCompliance, COMPLIANCE_DISCLAIMER } from "../compliance";
import {
  ASSESSMENT_LABELS,
  CHECK_RESULT_LABELS,
} from "../compliance/check-results";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  buildEvidenceRegister,
  CHECK_COLUMNS,
  controlEvidence,
  registerControlsToCsv,
  registerToCsv,
  registerToXlsx,
  type PolicyStatusRow,
} from "../compliance/export";
import type { ComplianceAssessment } from "../compliance/types";
import { parseCsv, parseXml, sheetCells } from "./helpers/export-sheet";
import { extractZipEntry } from "./helpers/zip";

const assessment = assessCompliance(CONTOSO_TENANT);

function expectedCheckRows(target: ComplianceAssessment) {
  const capabilities = new Map(
    target.capabilities.map((result) => [result.capability.id, result]),
  );
  const expected = new Map<string, number>();
  for (const framework of target.frameworks)
    for (const control of framework.controls) {
      const count = control.capabilityIds.reduce(
        (sum, id) =>
          sum + Math.max(capabilities.get(id)?.checks.length ?? 0, 1),
        0,
      );
      expected.set(
        `${framework.framework.id}|${control.control.id}`,
        Math.max(count, 1),
      );
    }
  return expected;
}

function countRows(
  rows: readonly { frameworkId: string; controlId: string }[],
) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const key = `${row.frameworkId}|${row.controlId}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

describe("buildEvidenceRegister", () => {
  it("has one control row per control and one check row per check per control", () => {
    const register = buildEvidenceRegister(assessment);
    const controlTotal = assessment.frameworks.reduce(
      (sum, framework) => sum + framework.controls.length,
      0,
    );
    expect(register.controls).toHaveLength(controlTotal);
    expect(countRows(register.checks)).toEqual(expectedCheckRows(assessment));
    const resultLabels = new Set<string>([
      ...Object.values(CHECK_RESULT_LABELS),
      "",
    ]);
    const assessmentLabels = new Set<string>([
      ...Object.values(ASSESSMENT_LABELS),
      "",
    ]);
    for (const row of register.checks) {
      expect(resultLabels.has(row.checkResult)).toBe(true);
      expect(assessmentLabels.has(row.assessmentStatus)).toBe(true);
    }
    // The fixture has assigned evidence, so policies and assignments are filled.
    expect(
      register.checks.some((row) => row.policyName && row.assignment),
    ).toBe(true);
  });

  it("counts evidence and lists unassessed aspects per control", () => {
    const register = buildEvidenceRegister(assessment, {
      frameworkId: "iso-27001-2022",
    });
    const framework = assessment.frameworks.find(
      (item) => item.framework.id === "iso-27001-2022",
    )!;
    const capabilities = new Map(
      assessment.capabilities.map((result) => [result.capability.id, result]),
    );
    expect(register.controls.map((row) => row.controlId)).toEqual(
      framework.controls.map((control) => control.control.id),
    );
    framework.controls.forEach((control, index) => {
      const row = register.controls[index]!;
      expect(row.capabilityCount).toBe(control.capabilityIds.length);
      expect(row.evidenceCount).toBe(
        controlEvidence(control, capabilities).length,
      );
      expect(row.unassessedAspects).toBe(control.unassessedAspects.join(" "));
    });
    expect(new Set(register.checks.map((row) => row.frameworkId))).toEqual(
      new Set(["iso-27001-2022"]),
    );
  });

  it("keeps a row for controls without checks", () => {
    const scoped = assessCompliance(CONTOSO_TENANT, { platforms: ["ios"] });
    const register = buildEvidenceRegister(scoped);
    const outside = scoped.frameworks
      .flatMap((framework) => framework.controls)
      .filter((control) => control.status === "notApplicable");
    expect(outside.length).toBeGreaterThan(0);
    const row = register.checks.find(
      (item) => item.controlId === outside[0]!.control.id && !item.capabilityId,
    );
    expect(row?.note).toBe("Outside selected scope");
    expect(countRows(register.checks)).toEqual(expectedCheckRows(scoped));
  });

  it("rejects an unknown framework", () => {
    expect(() =>
      buildEvidenceRegister(assessment, { frameworkId: "unknown" }),
    ).toThrow("Unknown compliance framework");
  });

  it("does not carry device state on checks", () => {
    expect(
      CHECK_COLUMNS.map(([, header]) => header.toLowerCase()),
    ).not.toContain("device state");
  });
});

describe("register exports", () => {
  const hostile = structuredClone(assessment);
  const check = hostile.capabilities
    .find((result) => result.checks.some((item) => item.policyName))!
    .checks.find((item) => item.policyName)!;
  check.policyName = '=HYPERLINK("https://example.invalid")';
  const register = buildEvidenceRegister(hostile);

  it("writes the checks table as CSV with neutralised tenant text", () => {
    const rows = parseCsv(registerToCsv(register));
    expect(rows[0]).toEqual(CHECK_COLUMNS.map(([, header]) => header));
    expect(rows).toHaveLength(register.checks.length + 1);
    const policyColumn = rows[0]!.indexOf("Policy");
    expect(
      rows.some((row) => row[policyColumn] === `'${check.policyName}`),
    ).toBe(true);
    expect(rows.every((row) => !row[policyColumn]?.startsWith("="))).toBe(true);
  });

  it("writes the controls table as CSV", () => {
    const rows = parseCsv(registerControlsToCsv(register));
    expect(rows[0]).toContain("Not established by this evidence");
    expect(rows).toHaveLength(register.controls.length + 1);
  });

  it("writes a workbook with About, Controls, Checks and Policy status", async () => {
    const policyStatus: PolicyStatusRow[] = [
      {
        policyId: "policy-1",
        policyName: "@Windows baseline",
        source: "configurationPolicy",
        collectedAt: "2026-10-18T08:00:00Z",
        succeeded: 12,
        error: 1,
        conflict: 0,
        notApplicable: 2,
        pending: null,
        noStatusReported: false,
      },
      {
        policyId: "policy-2",
        policyName: "Unreported",
        source: "deviceConfiguration",
        collectedAt: "2026-10-18T08:00:00Z",
        succeeded: null,
        error: null,
        conflict: null,
        notApplicable: null,
        pending: null,
        noStatusReported: true,
      },
    ];
    const bytes = await registerToXlsx(register, {
      tenant: "Contoso Ltd",
      collectedAt: hostile.provenance.collectedAt,
      rulesetVersion: hostile.provenance.rulesetVersion,
      generatedAt: "2026-10-18T09:00:00Z",
      policyStatus,
    });
    const workbook = extractZipEntry(bytes, "xl/workbook.xml");
    const names = [...workbook.matchAll(/<sheet name="([^"]+)"/g)].map(
      (match) => match[1],
    );
    expect(names).toEqual(["About", "Controls", "Checks", "Policy status"]);
    for (const part of [
      "[Content_Types].xml",
      "_rels/.rels",
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      "xl/styles.xml",
      ...names.map((_, index) => `xl/worksheets/sheet${index + 1}.xml`),
    ])
      expect(() => parseXml(extractZipEntry(bytes, part)), part).not.toThrow();

    const about = Object.values(
      sheetCells(extractZipEntry(bytes, "xl/worksheets/sheet1.xml")),
    );
    expect(about).toContain(COMPLIANCE_DISCLAIMER);
    expect(about).toContain("Contoso Ltd");
    expect(about).toContain("Control status");
    expect(about).toContain("No status reported");

    const checks = sheetCells(
      extractZipEntry(bytes, "xl/worksheets/sheet3.xml"),
    );
    const lastRow = register.checks.length + 1;
    expect(checks[`A${lastRow}`]).toBe(register.checks.at(-1)!.frameworkId);
    expect(Object.values(checks)).toContain(`'${check.policyName}`);

    const status = sheetCells(
      extractZipEntry(bytes, "xl/worksheets/sheet4.xml"),
    );
    expect(status.B2).toBe("'@Windows baseline");
    expect(status.E2).toBe("12");
    expect(status.E3).toBeUndefined();
    expect(status.J3).toBe("No status reported");
  });
});
