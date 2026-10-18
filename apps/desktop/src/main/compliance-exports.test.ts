import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { assessCompliance } from "../../../../src/lib/compliance";
import { CONTOSO_TENANT } from "../../../../src/lib/compliance/demo/contoso-tenant";
import { generateFixPack } from "../../../../src/lib/compliance/fix-pack";
import type { PolicyDeviceStatus } from "../../../../src/lib/compliance/types";
import { parseCsv, parseXml, sheetCells } from "../../../../src/lib/__tests__/helpers/export-sheet";
import {
  fixPackPreviewOf,
  parseRegisterFormat,
  policyDeviceStatusOf,
  registerFile,
  registerPolicyStatus,
} from "./compliance";

const assessment = assessCompliance(CONTOSO_TENANT);
const status = CONTOSO_TENANT.policyDeviceStatus!;
const REPORT_NAME = "Compliance-Report-ISO-27001-2022-ffc10f05-2026-10-18-1200.pdf";

describe("register format", () => {
  it("accepts only csv and xlsx", () => {
    expect(parseRegisterFormat("csv")).toBe("csv");
    expect(parseRegisterFormat("xlsx")).toBe("xlsx");
    for (const value of ["pdf", "XLSX", undefined, 1])
      expect(() => parseRegisterFormat(value)).toThrow(/CSV or Excel/);
  });
});

describe("register policy status", () => {
  it("lists the cited device policies with counts or no status", () => {
    const rows = registerPolicyStatus(assessment, "iso-27001-2022", status)!;
    expect(rows.length).toBeGreaterThan(0);
    const reported = status.rows.find((row) => row.policyName === "WIN - Baseline - BitLocker")!;
    expect(rows.find((row) => row.policyId === reported.policyId)).toMatchObject({
      source: "Configuration report",
      collectedAt: status.collectedAt,
      succeeded: reported.succeeded,
      error: reported.error,
      noStatusReported: false,
    });
    // A policy without a report row is never a count of zero.
    for (const row of rows.filter((item) => item.noStatusReported))
      expect([row.succeeded, row.error, row.conflict, row.notApplicable, row.pending]).toEqual([
        null,
        null,
        null,
        null,
        null,
      ]);
  });

  it("marks sources that were not collected and leaves the sheet out without status", () => {
    const partial: PolicyDeviceStatus = {
      ...status,
      sources: { ...status.sources, configurationPolicies: "permissionDenied" },
    };
    const rows = registerPolicyStatus(assessment, "iso-27001-2022", partial)!;
    const notCollected = rows.filter((row) => row.source.endsWith("not collected"));
    expect(notCollected.length).toBeGreaterThan(0);
    for (const row of notCollected) {
      expect(row.source).toBe("Configuration report, not collected");
      expect(row.noStatusReported).toBe(false);
      expect(row.succeeded).toBeNull();
    }
    expect(registerPolicyStatus(assessment, "iso-27001-2022", undefined)).toBeUndefined();
    const none: PolicyDeviceStatus = {
      ...status,
      sources: { configurationPolicies: "failed", compliancePolicies: "failed", deviceConfigurations: "skipped" },
    };
    expect(registerPolicyStatus(assessment, "iso-27001-2022", none)).toBeUndefined();
  });
});

describe("register file", () => {
  it("saves the checks table as CSV named after the report", async () => {
    const file = await registerFile(assessment, "iso-27001-2022", "csv", { reportFileName: REPORT_NAME });
    expect(file.fileName).toBe("Evidence-Register-ISO-27001-2022-ffc10f05-2026-10-18-1200.csv");
    const rows = parseCsv(new TextDecoder().decode(file.bytes));
    expect(rows[0]).toContain("Control ID");
    expect(rows.slice(1).every((row) => row[0] === "iso-27001-2022")).toBe(true);
  });

  it("builds a workbook whose every part parses, with a Policy status sheet", async () => {
    const file = await registerFile(assessment, "iso-27001-2022", "xlsx", {
      reportFileName: REPORT_NAME,
      tenantLabel: "ffc10f05...",
      policyDeviceStatus: status,
    });
    expect(file.fileName.endsWith(".xlsx")).toBe(true);
    const zip = await JSZip.loadAsync(file.bytes);
    const xmlParts = Object.keys(zip.files).filter((name) => /\.(xml|rels)$/.test(name));
    expect(xmlParts).toContain("[Content_Types].xml");
    for (const name of xmlParts) parseXml(await zip.file(name)!.async("string"));
    const workbook = await zip.file("xl/workbook.xml")!.async("string");
    for (const sheet of ["About", "Controls", "Checks", "Policy status"]) expect(workbook).toContain(`name="${sheet}"`);
    const about = sheetCells(await zip.file("xl/worksheets/sheet1.xml")!.async("string"));
    expect(Object.values(about)).toContain("ffc10f05...");
    expect(Object.values(about).some((value) => value.startsWith("ISO"))).toBe(true);
  });

  it("leaves the Policy status sheet out without collected device status", async () => {
    const file = await registerFile(assessment, "iso-27001-2022", "xlsx", { reportFileName: REPORT_NAME });
    const workbook = await (await JSZip.loadAsync(file.bytes)).file("xl/workbook.xml")!.async("string");
    expect(workbook).not.toContain("Policy status");
  });
});

describe("fix pack preview", () => {
  it("carries the summary, draft names and every not generatable reason", () => {
    const pack = generateFixPack(assessment, { frameworkId: "iso-27001-2022", collection: CONTOSO_TENANT });
    const preview = fixPackPreviewOf(pack);
    expect(preview.summary).toEqual(pack.summary);
    expect(preview.policies).toEqual(
      pack.policies.map((policy) => ({
        fileName: policy.fileName,
        name: policy.json.name,
        capabilityId: policy.capabilityId,
      })),
    );
    expect(preview.notGeneratable).toEqual(pack.notGeneratable);
    // No setting payload reaches the renderer.
    expect(JSON.stringify(preview)).not.toContain("settingDefinitionId");
  });
});

describe("policy device status of a section", () => {
  const sections = [
    {
      key: "configurationPolicies",
      familyKey: "settingsCatalog",
      items: [{ id: "a" }, { id: "b" }],
    },
    { key: "deviceConfigurations", familyKey: "deviceConfigurations", items: [{ id: "c" }] },
    { key: "appProtection", familyKey: "appProtectionPolicies", items: [{ id: "d" }] },
  ];
  const deviceStatus: PolicyDeviceStatus = {
    collectedAt: "2026-10-18T10:00:00Z",
    sources: { configurationPolicies: "collected", compliancePolicies: "collected", deviceConfigurations: "failed" },
    errors: { deviceConfigurations: "Graph returned 500." },
    rows: [
      {
        policyId: "a",
        policyName: "A",
        source: "configurationPolicies",
        succeeded: 4,
        error: 1,
        conflict: 0,
        notApplicable: 2,
        pending: null,
      },
      // Another source with the same id is not this section's status.
      {
        policyId: "b",
        policyName: "B",
        source: "compliancePolicies",
        succeeded: 9,
        error: 0,
        conflict: 0,
        notApplicable: 0,
        pending: 0,
      },
    ],
  };
  const collection = { sections, policyDeviceStatus: deviceStatus } as unknown as Parameters<
    typeof policyDeviceStatusOf
  >[0];

  it("keys counts by item id and omits policies without a report row", () => {
    expect(policyDeviceStatusOf(collection, "configurationPolicies")).toEqual({
      source: "configurationPolicies",
      sourceLabel: "Configuration report",
      state: "collected",
      error: null,
      collectedAt: "2026-10-18T10:00:00Z",
      rows: { a: { succeeded: 4, error: 1, conflict: 0, notApplicable: 2, pending: null } },
    });
  });

  it("matches report rows to policies regardless of id case", () => {
    const upper = {
      sections,
      policyDeviceStatus: {
        ...deviceStatus,
        rows: deviceStatus.rows.map((row) => ({ ...row, policyId: row.policyId.toUpperCase() })),
      },
    } as unknown as Parameters<typeof policyDeviceStatusOf>[0];
    expect(policyDeviceStatusOf(upper, "configurationPolicies")?.rows).toEqual({
      a: { succeeded: 4, error: 1, conflict: 0, notApplicable: 2, pending: null },
    });
  });

  it("reports a source that was not collected with its reason", () => {
    expect(policyDeviceStatusOf(collection, "deviceConfigurations")).toMatchObject({
      state: "failed",
      error: "Graph returned 500.",
      rows: {},
    });
    const older = { sections } as unknown as Parameters<typeof policyDeviceStatusOf>[0];
    expect(policyDeviceStatusOf(older, "configurationPolicies")).toMatchObject({
      state: "skipped",
      collectedAt: null,
      error: "Device status was not part of this collection.",
    });
  });

  it("returns null for families without device status and rejects unknown sections", () => {
    expect(policyDeviceStatusOf(collection, "appProtection")).toBeNull();
    expect(() => policyDeviceStatusOf(collection, "missing")).toThrow(/not part of the last collection/);
  });
});
