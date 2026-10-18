import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { assessCompliance } from "../compliance";
import { CONTOSO_TENANT } from "../compliance/demo/contoso-tenant";
import {
  deviceStatusAnnexRows,
  hasPolicyDeviceStatus,
} from "../compliance/device-status-annex";
import { buildManagementSummary } from "../compliance/management/management-summary";
import { canonicalJson } from "../compliance/manifest";
import { generateComplianceReportPDF } from "../compliance/report-pdf";
import type {
  ComplianceAssessment,
  PolicyDeviceStatus,
} from "../compliance/types";
import { extractPdfStreamText } from "./helpers/pdf-text";

const status: PolicyDeviceStatus = {
  collectedAt: "2026-10-18T09:00:00Z",
  sources: {
    configurationPolicies: "collected",
    compliancePolicies: "collected",
    deviceConfigurations: "failed",
  },
  rows: [
    {
      policyId: "catalog-1",
      policyName: "Catalog one",
      source: "configurationPolicies",
      succeeded: 10,
      error: 0,
      conflict: 1,
      notApplicable: 2,
      pending: null,
    },
  ],
};

/** Everything a status, count or summary is derived from. */
function verdicts(assessment: ComplianceAssessment) {
  return canonicalJson({
    capabilities: assessment.capabilities,
    frameworks: assessment.frameworks,
    collectionCoverage: assessment.collectionCoverage,
    scope: assessment.scope,
    management: assessment.frameworks.map((framework) => {
      const summary = buildManagementSummary(
        assessment,
        framework.framework.id,
      );
      return { ...summary, generatedAt: undefined };
    }),
  });
}

describe("policy device status annex", () => {
  it("never changes statuses, counts or the management summary", () => {
    const without: DetailedExportData = {
      ...CONTOSO_TENANT,
      policyDeviceStatus: undefined,
    };
    const withStatus = assessCompliance(CONTOSO_TENANT);
    const withoutStatus = assessCompliance(without);
    expect(verdicts(withStatus)).toBe(verdicts(withoutStatus));
    expect(withStatus.provenance.deviceState).toBe("notCollected");
    expect(withStatus.provenance.policyStatusSummary).toBe("collected");
    expect(withoutStatus.provenance.policyStatusSummary).toBe("notCollected");
    // Not a field on evidence.
    expect(JSON.stringify(withStatus.capabilities)).not.toContain("succeeded");
  });

  it("shows No status reported for a cited policy without a summary row", () => {
    expect(hasPolicyDeviceStatus(status)).toBe(true);
    expect(
      hasPolicyDeviceStatus({
        ...status,
        sources: {
          configurationPolicies: "skipped",
          compliancePolicies: "failed",
          deviceConfigurations: "permissionDenied",
        },
      }),
    ).toBe(false);
    const rows = deviceStatusAnnexRows(
      [
        {
          policyId: "catalog-1",
          policyName: "Catalog one",
          familyKey: "settingsCatalog",
        },
        {
          policyId: "catalog-1",
          policyName: "Catalog one",
          familyKey: "settingsCatalog",
        },
        {
          policyId: "compliance-1",
          policyName: "Compliance one",
          familyKey: "compliancePolicies",
        },
        {
          policyId: "profile-1",
          policyName: "Profile one",
          familyKey: "deviceConfigurations",
        },
        {
          policyId: "ca-1",
          policyName: "CA one",
          familyKey: "conditionalAccessPolicies",
        },
      ],
      status,
    );
    expect(rows).toEqual([
      {
        policyId: "catalog-1",
        policyName: "Catalog one",
        source: "configurationPolicies",
        state: "reported",
        counts: {
          succeeded: 10,
          error: 0,
          conflict: 1,
          notApplicable: 2,
          pending: null,
        },
      },
      {
        policyId: "compliance-1",
        policyName: "Compliance one",
        source: "compliancePolicies",
        state: "noStatusReported",
      },
      {
        policyId: "profile-1",
        policyName: "Profile one",
        source: "deviceConfigurations",
        state: "notCollected",
      },
    ]);
  });

  it("matches report policy ids without regard to case", () => {
    const upper = {
      ...status,
      rows: status.rows.map((row) => ({
        ...row,
        policyId: row.policyId.toUpperCase(),
      })),
    };
    const [row] = deviceStatusAnnexRows(
      [
        {
          policyId: "catalog-1",
          policyName: "Catalog one",
          familyKey: "settingsCatalog",
        },
        {
          policyId: "CATALOG-1",
          policyName: "Catalog one",
          familyKey: "settingsCatalog",
        },
      ],
      upper,
    );
    expect(row).toMatchObject({ policyId: "catalog-1", state: "reported" });
    expect(
      deviceStatusAnnexRows(
        [
          {
            policyId: "catalog-1",
            policyName: "Catalog one",
            familyKey: "settingsCatalog",
          },
          {
            policyId: "CATALOG-1",
            policyName: "Catalog one",
            familyKey: "settingsCatalog",
          },
        ],
        upper,
      ),
    ).toHaveLength(1);
  });

  it("adds the annex to the framework PDF in English and German only when data exists", async () => {
    const english = extractPdfStreamText(
      await generateComplianceReportPDF(CONTOSO_TENANT, {
        frameworkId: "iso-27001-2022",
      }),
    );
    expect(english).toContain("Policy device status");
    expect(english).toContain("No status reported");
    expect(english).toContain("SUCCEEDED");

    const german = extractPdfStreamText(
      await generateComplianceReportPDF(CONTOSO_TENANT, {
        frameworkId: "bsi-it-grundschutz",
      }),
    );
    expect(german).toContain("Gerätestatus je Richtlinie");
    expect(german).toContain("Kein Status gemeldet");

    const without = extractPdfStreamText(
      await generateComplianceReportPDF(
        { ...CONTOSO_TENANT, policyDeviceStatus: undefined },
        { frameworkId: "iso-27001-2022" },
      ),
    );
    expect(without).not.toContain("Policy device status");
    expect(without).not.toContain("No status reported");
  });
});
