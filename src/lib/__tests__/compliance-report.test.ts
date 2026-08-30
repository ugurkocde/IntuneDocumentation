import { describe, expect, it } from "vitest";
import type { DetailedExportData } from "../configuration-analyzer";
import { COMPLIANCE_CAPABILITIES } from "../compliance/capabilities";
import {
  complianceReportFileName,
  generateComplianceReportPDF,
  GERMAN_CAPABILITY_NAMES,
} from "../compliance/report-pdf";
import { extractPdfStreamText } from "./helpers/pdf-text";

const allDevicesAssignment = [
  {
    id: "assignment-1",
    target: { "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget" },
  },
];

function createExportData(): DetailedExportData {
  return {
    settingsCatalog: [
      {
        id: "bitlocker-policy",
        name: "Assigned BitLocker evidence policy",
        configType: "Settings Catalog",
        platforms: "windows10",
        settings: [
          {
            id: "setting-1",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
              settingDefinitionId:
                "device_vendor_msft_bitlocker_requiredeviceencryption",
              choiceSettingValue: {
                value: "device_vendor_msft_bitlocker_requiredeviceencryption_1",
                children: [],
              },
            },
          },
        ],
        assignments: allDevicesAssignment,
      },
    ],
    deviceConfigurations: [
      {
        id: "assigned-firewall-counter-evidence",
        displayName: "Assigned firewall deviation",
        "@odata.type":
          "#microsoft.graph.windows10EndpointProtectionConfiguration",
        configType: "Device Configuration",
        firewallProfileDomain: { firewallEnabled: "blocked" },
        assignments: allDevicesAssignment,
      },
      {
        id: "unassigned-gatekeeper-counter-evidence",
        displayName: "Unassigned Gatekeeper deviation",
        "@odata.type": "#microsoft.graph.macOSEndpointProtectionConfiguration",
        configType: "Device Configuration",
        gatekeeperAllowedAppSource: "anywhere",
        assignments: [],
      },
    ],
    administrativeTemplates: [],
    compliancePolicies: [
      {
        id: "defender-compliance-policy",
        displayName: "Assigned Defender disabled policy",
        "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
        configType: "Compliance Policy",
        settings: [
          {
            id: "setting-1",
            settingInstance: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
              settingDefinitionId:
                "device_vendor_msft_policy_config_defender_allowrealtimemonitoring",
              choiceSettingValue: {
                value:
                  "device_vendor_msft_policy_config_defender_allowrealtimemonitoring_0",
                children: [],
              },
            },
          },
        ],
        assignments: allDevicesAssignment,
      },
    ],
    appProtectionPolicies: [],
    securityBaselines: [],
    scripts: { windows: [], macOS: [] },
    appConfigurations: [],
    windowsUpdatePolicies: [],
    enrollmentConfigurations: [],
    conditionalAccessPolicies: [],
    fetchErrors: [
      {
        policyId: "catalog-fetch",
        policyName: "Settings Catalog",
        policyType: "Settings Catalog",
        error: "The policy detail request could not be completed.",
        permissionHint: "Check DeviceManagementConfiguration.Read.All.",
      },
    ],
  };
}

describe("compliance report PDF", () => {
  it("renders a German BSI report with evidence, gaps, and disclaimer", async () => {
    const report = await generateComplianceReportPDF(createExportData(), {
      frameworkId: "bsi-it-grundschutz",
    });
    const renderedText = extractPdfStreamText(report);

    expect(Buffer.from(report).subarray(0, 4).toString()).toBe("%PDF");
    expect(renderedText).toContain("Technischer Nachweisbericht:");
    expect(renderedText).toContain("Intune-Konfiguration");
    expect(renderedText).toContain(
      "BSI IT-Grundschutz-Kompendium, Edition 2023",
    );
    expect(renderedText).toContain("Inhaltsverzeichnis");
    expect(renderedText).toContain("Ergebnisübersicht");
    expect(renderedText).toContain("Datengrundlage und Geltungsbereich");
    expect(renderedText).toContain("Anhang A: Nachweisverzeichnis");
    expect(renderedText).toContain("Manuelle Bewertung");
    expect(renderedText).toContain("Berichts-ID");
    expect(renderedText).toContain("Regelwerk-Version");
    expect(renderedText).toMatch(/E-001/);
    expect(renderedText).toContain("Die Datenerhebung war unvollständig");
    expect(renderedText).toContain("Seite 2 von ");
    expect(renderedText).toContain(
      "Technischer Konfigurationsnachweis erkannt",
    );
    expect(renderedText).toContain("SYS.3.2.2.A17");
    expect(renderedText).toContain("Kein technischer Nachweis gefunden");
    expect(renderedText).toContain("ersetzt keine");
    expect(renderedText).toContain("Assigned BitLocker evidence policy");
    expect(renderedText).toContain("Einstellungskatalog");
    expect(renderedText).not.toContain("Settings Catalog");
    expect(renderedText).not.toContain(
      "Client Bausteine (SYS.2.2.3, SYS.2.4, SYS.3.2.1, SYS.3.2.2) are mapped",
    );
  });

  it("renders an English NIST 800-53 report", async () => {
    const report = await generateComplianceReportPDF(createExportData(), {
      frameworkId: "nist-800-53-r5",
    });
    const renderedText = extractPdfStreamText(report);

    expect(renderedText).toContain("Technical Evidence Report: Intune");
    expect(renderedText).toContain("Configuration");
    expect(renderedText).toContain("SC-28");
    expect(renderedText).toContain("Technical configuration evidence detected");
    expect(renderedText).toContain("neither a certification");
    expect(renderedText).toContain("Appendix A: Evidence Register");
    expect(renderedText).not.toContain("Manuelle Bewertung");
  });

  it("labels assigned and unassigned counter-evidence without overstating risk", async () => {
    const report = await generateComplianceReportPDF(createExportData(), {
      frameworkId: "bsi-it-grundschutz",
    });
    const renderedText = extractPdfStreamText(report);

    expect(renderedText).toContain("Risiko E-");
    expect(renderedText).toContain("blocked");
    expect(renderedText).toContain(
      "Abweichende Konfiguration erkannt und zugewiesen",
    );
    expect(renderedText).toContain("jedoch nicht zugewiesen");
  });

  it("builds a timestamped framework and tenant-specific file name", () => {
    expect(
      complianceReportFileName("bsi-it-grundschutz", "Contoso GmbH"),
    ).toMatch(
      /Compliance-Report-BSI-IT-Grundschutz-contoso-gmbh-\d{4}-\d{2}-\d{2}-\d{4}\.pdf/,
    );
    expect(complianceReportFileName("nist-csf-2")).toMatch(
      /Compliance-Report-NIST-CSF-2-\d{4}-\d{2}-\d{2}-\d{4}\.pdf/,
    );
  });

  it("includes every body evidence reference in the appendix", async () => {
    const report = await generateComplianceReportPDF(createExportData(), {
      frameworkId: "bsi-it-grundschutz",
    });
    const renderedText = extractPdfStreamText(report);
    const appendixHeading = "(Anhang A: Nachweisverzeichnis) Tj";
    const appendixStart = renderedText.lastIndexOf(appendixHeading);
    expect(appendixStart).toBeGreaterThan(0);

    const bodyRefs = new Set(
      renderedText.slice(0, appendixStart).match(/E-\d{3}/g) ?? [],
    );
    const appendixRefs = new Set(
      renderedText.slice(appendixStart).match(/E-\d{3}/g) ?? [],
    );
    expect(bodyRefs.size).toBeGreaterThan(0);
    for (const ref of bodyRefs) {
      expect(appendixRefs.has(ref)).toBe(true);
    }
  });

  it("assigns evidence references independent of policy input order", async () => {
    const policy = (id: string, name: string) => ({
      id,
      name,
      configType: "Settings Catalog",
      platforms: "windows10",
      settings: [
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            settingDefinitionId:
              "device_vendor_msft_bitlocker_requiredeviceencryption",
            choiceSettingValue: {
              value: "device_vendor_msft_bitlocker_requiredeviceencryption_1",
              children: [],
            },
          },
        },
      ],
      assignments: allDevicesAssignment,
    });

    for (const ordering of [
      [policy("zzz-policy", "Zebra Baseline"), policy("aaa-policy", "Alpha Baseline")],
      [policy("aaa-policy", "Alpha Baseline"), policy("zzz-policy", "Zebra Baseline")],
    ]) {
      const data = { ...createExportData(), settingsCatalog: ordering };
      const bytes = await generateComplianceReportPDF(data, {
        frameworkId: "bsi-it-grundschutz",
      });
      const text = extractPdfStreamText(bytes);
      // Registry sorts by policy id, so E-001 must always be the aaa policy.
      expect(text).toMatch(/E-001[\s\S]{0,300}Alpha Baseline/);
    }
  });

  it("lists additional policy families in the assessed inventory", async () => {
    const data = createExportData();
    data.windowsUpdatePolicies = [
      {
        id: "update-ring",
        displayName: "Update ring",
        "@odata.type": "#microsoft.graph.windowsUpdateForBusinessConfiguration",
        automaticUpdateMode: "autoInstallAtMaintenanceTime",
        assignments: allDevicesAssignment,
      },
    ];

    const bytes = await generateComplianceReportPDF(data, {
      frameworkId: "bsi-it-grundschutz",
    });
    expect(extractPdfStreamText(bytes)).toContain(
      "Weitere Richtlinienfamilien",
    );
  });

  it("provides a German name for every compliance capability", () => {
    for (const capability of COMPLIANCE_CAPABILITIES) {
      expect(GERMAN_CAPABILITY_NAMES[capability.id]).toBeTruthy();
    }
  });
});
