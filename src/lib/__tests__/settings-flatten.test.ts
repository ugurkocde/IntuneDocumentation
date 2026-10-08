import { describe, expect, it } from "vitest";
import { CONTOSO_TENANT } from "~/lib/compliance/demo/contoso-tenant";
import { flattenItemSettings } from "~/lib/settings-flatten";
import {
  administrativeTemplateFixture,
  appConfigurationFixture,
  defenderForEndpointPolicyFixture,
  enrollmentStatusPageFixture,
} from "./fixtures/intune-beta";

const byName = (name: string) => (row: { name: string }) => row.name === name;
const policy = (items: unknown[] | undefined, name: string) =>
  (items as Array<Record<string, unknown>>).find(
    (item) => item.name === name || item.displayName === name,
  );

describe("flattenItemSettings", () => {
  it("resolves Settings Catalog display names, option labels and ids", () => {
    const rows = flattenItemSettings(
      "settingsCatalog",
      policy(CONTOSO_TENANT.settingsCatalog, "WIN - Baseline - BitLocker"),
    );
    expect(rows.find(byName("Require Device Encryption"))).toEqual({
      name: "Require Device Encryption",
      value: "Enabled",
      definitionId: "device_vendor_msft_bitlocker_requiredeviceencryption",
      path: [],
    });
  });

  it("flattens nested children with their parent chain", () => {
    const item = policy(
      CONTOSO_TENANT.settingsCatalog,
      "WIN - Baseline - BitLocker",
    );
    const nested = flattenItemSettings("settingsCatalog", item).find(
      (row) => row.path.length > 0,
    );
    expect(nested?.definitionId).toMatch(/^device_vendor_msft_bitlocker_/);
    expect(nested?.path[0]).toMatch(/^device_vendor_msft_bitlocker_/);
  });

  it("numbers repeated groups and skips unconfigured values", () => {
    const item = {
      settings: [
        {
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
            settingDefinitionId: "vendor_msft_firewall_mdmstore_firewallrules",
            groupSettingCollectionValue: [
              {
                children: [
                  {
                    settingDefinitionId:
                      "vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}_name",
                    simpleSettingValue: { value: "Allow RDP" },
                  },
                ],
              },
              {
                children: [
                  {
                    settingDefinitionId:
                      "vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}_name",
                    simpleSettingValue: { value: "Block SMB" },
                  },
                  {
                    settingDefinitionId:
                      "vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}_description",
                    simpleSettingValue: { value: null },
                  },
                ],
              },
            ],
          },
          settingDefinitions: [
            {
              id: "vendor_msft_firewall_mdmstore_firewallrules",
              displayName: "Firewall Rules",
            },
            {
              id: "vendor_msft_firewall_mdmstore_firewallrules_{firewallrulename}_name",
              displayName: "Name",
            },
          ],
        },
      ],
    };
    const rows = flattenItemSettings("settingsCatalog", item);
    expect(rows).toEqual([
      expect.objectContaining({
        name: "Name",
        value: "Allow RDP",
        path: ["Firewall Rules 1"],
      }),
      expect.objectContaining({
        name: "Name",
        value: "Block SMB",
        path: ["Firewall Rules 2"],
      }),
    ]);
  });

  it("treats Endpoint security policies in any section as Settings Catalog", () => {
    const rows = flattenItemSettings(
      "securityBaselines",
      defenderForEndpointPolicyFixture,
    );
    expect(rows[0]).toMatchObject({
      name: "Excluded file extensions",
      value: ".sample",
      definitionId:
        "device_vendor_msft_policy_config_defender_excludedextensions",
    });
  });

  it("documents device configuration properties with their Graph names", () => {
    const rows = flattenItemSettings(
      "deviceConfigurations",
      policy(
        CONTOSO_TENANT.deviceConfigurations,
        "WIN - Device restrictions - Corporate",
      ),
    );
    expect(rows.find(byName("Password Minimum Length"))).toMatchObject({
      value: "8",
      definitionId: "passwordMinimumLength",
      category: "Password",
    });
    expect(rows.some((row) => row.definitionId === "displayName")).toBe(false);
  });

  it("lists custom OMA-URI settings by their URI", () => {
    const rows = flattenItemSettings("deviceConfigurations", {
      "@odata.type": "#microsoft.graph.windows10CustomConfiguration",
      displayName: "Quick Machine Recovery",
      omaSettings: [
        {
          "@odata.type": "#microsoft.graph.omaSettingBoolean",
          displayName: "EnableCloudRemediation",
          omaUri:
            "./Device/Vendor/MSFT/RemoteRemediation/CloudRemediationSettings/EnableCloudRemediation",
          value: true,
        },
      ],
    });
    expect(rows).toEqual([
      {
        name: "EnableCloudRemediation",
        value: "Enabled",
        definitionId:
          "./Device/Vendor/MSFT/RemoteRemediation/CloudRemediationSettings/EnableCloudRemediation",
        path: [],
        category: "Custom OMA-URI",
      },
    ]);
  });

  it("documents compliance rules and update rings", () => {
    const compliance = flattenItemSettings(
      "compliancePolicies",
      policy(CONTOSO_TENANT.compliancePolicies, "WIN - Compliance - Baseline"),
    );
    expect(compliance.find(byName("Os Minimum Version"))).toMatchObject({
      value: "10.0.22631",
      definitionId: "osMinimumVersion",
    });
    expect(
      compliance.some((row) => row.definitionId === "scheduledActionsForRule"),
    ).toBe(false);

    const ring = flattenItemSettings(
      "windowsUpdatePolicies",
      policy(CONTOSO_TENANT.windowsUpdatePolicies, "WIN - Update ring Pilot"),
    );
    expect(ring.find(byName("Automatic Update Mode"))?.definitionId).toBe(
      "automaticUpdateMode",
    );
  });

  it("documents Administrative Template values with state and category", () => {
    const rows = flattenItemSettings("administrativeTemplates", {
      definitionValues: [
        {
          ...administrativeTemplateFixture[0],
          definition: {
            id: "9c628cf0-6e74-4db6-9dcb-5b6e0e243d61",
            displayName: "Configure a policy",
            categoryPath: "\\Windows Components\\BitLocker",
          },
        },
      ],
    });
    expect(rows).toEqual([
      {
        name: "Configure a policy",
        value: "Enabled: Policy value: Configured value",
        definitionId: "9c628cf0-6e74-4db6-9dcb-5b6e0e243d61",
        path: ["Windows Components", "BitLocker"],
        category: "\\Windows Components\\BitLocker",
      },
    ]);
  });

  it("documents security baseline intent settings by definition id", () => {
    const rows = flattenItemSettings("securityBaselines", {
      displayName: "macOS FileVault",
      settings: [
        {
          "@odata.type":
            "#microsoft.graph.deviceManagementBooleanSettingInstance",
          definitionId:
            "deviceConfiguration--macOSEndpointProtectionConfiguration_fileVaultEnabled",
          valueJson: "true",
          value: true,
        },
        {
          definitionId: "deviceConfiguration--unset",
          valueJson: "null",
          value: null,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      value: "Enabled",
      definitionId:
        "deviceConfiguration--macOSEndpointProtectionConfiguration_fileVaultEnabled",
    });
  });

  it("documents app configuration keys", () => {
    const rows = flattenItemSettings(
      "appConfigurations",
      appConfigurationFixture,
    );
    expect(rows).toContainEqual({
      name: "refreshInterval",
      value: "123",
      definitionId: "refreshInterval",
      path: [],
    });
  });

  it("falls back to documentable properties with a parent path", () => {
    const enrollment = flattenItemSettings(
      "enrollmentConfigurations",
      enrollmentStatusPageFixture,
    );
    expect(enrollment.find(byName("Custom Error Message"))).toMatchObject({
      value: "Contact support",
      definitionId: "customErrorMessage",
    });

    const ca = flattenItemSettings(
      "conditionalAccessPolicies",
      policy(
        CONTOSO_TENANT.conditionalAccessPolicies,
        "CA - Require MFA all users",
      ),
    );
    const users = ca.find(byName("Include Users"));
    expect(users).toMatchObject({
      value: "All",
      path: ["Conditions", "Users"],
    });
    expect(users?.definitionId).toBeUndefined();
  });

  it("never un-redacts sanitized values", () => {
    const rows = flattenItemSettings("windowsScripts", {
      displayName: "Script",
      fileName: "fix.ps1",
      scriptContent: "[Redacted]",
    });
    expect(
      rows.find((row) => row.definitionId === "scriptContent")?.value,
    ).toBe("[Redacted]");
  });

  it("returns nothing for empty input", () => {
    expect(flattenItemSettings("settingsCatalog", null)).toEqual([]);
    expect(flattenItemSettings("settingsCatalog", { settings: [] })).toEqual(
      [],
    );
  });
});
