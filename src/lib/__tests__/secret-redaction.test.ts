import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  extractAppConfigurationSettings,
  extractSettingValue,
  parseAdministrativeTemplate,
  parseDeviceConfiguration,
  parseDocumentableProperties,
} from "../configuration-parser";
import { REDACTED_VALUE, sanitizeGraphData } from "../intune-policy-registry";

// Graph-shaped fixtures carrying dummy secrets. Every dummy starts with
// "DUMMY" so a single search proves none survives sanitizing and parsing.
const containsDummy = (value: unknown) =>
  JSON.stringify(value).includes("DUMMY");

const sanitize = <T>(value: T) => sanitizeGraphData(value) as T;

describe("secret redaction for shareable documentation", () => {
  it("redacts secret app configuration key/value pairs and keeps the rest", () => {
    const deviceAppConfig = sanitize({
      "@odata.type": "#microsoft.graph.iosMobileAppConfiguration",
      displayName: "Mail app",
      settings: [
        "apiKey",
        "api_key",
        "Password",
        "ServerToken",
        "SharedSecret",
        "clientSecret",
        "privateKey",
        "credential",
        "pwd",
        "passcode",
      ].map((appConfigKey) => ({
        appConfigKey,
        appConfigKeyType: "stringType",
        appConfigKeyValue: `DUMMY-${appConfigKey}`,
      })),
    });
    const safeSettings = sanitize({
      settings: [
        {
          appConfigKey: "serverUrl",
          appConfigKeyType: "stringType",
          appConfigKeyValue: "https://mail.example.com",
        },
        {
          appConfigKey: "test",
          appConfigKeyType: "stringType",
          appConfigKeyValue: "visible",
        },
        {
          appConfigKey: "RequirePasscode",
          appConfigKeyType: "booleanType",
          appConfigKeyValue: "true",
        },
      ],
    });

    const rows = extractAppConfigurationSettings(deviceAppConfig);
    expect(rows).toHaveLength(10);
    expect(rows.every((row: any) => row.value === REDACTED_VALUE)).toBe(true);
    expect(containsDummy(deviceAppConfig)).toBe(false);
    expect(extractAppConfigurationSettings(safeSettings)).toEqual([
      {
        name: "serverUrl",
        value: "https://mail.example.com",
        type: "stringType",
      },
      { name: "test", value: "visible", type: "stringType" },
      { name: "RequirePasscode", value: "true", type: "booleanType" },
    ]);
  });

  it("redacts secret managed app custom settings by name", () => {
    const config = sanitize({
      "@odata.type": "#microsoft.graph.targetedManagedAppConfiguration",
      displayName: "Managed app",
      customSettings: [
        { name: "Password", value: "DUMMY-pass" },
        { name: "apiKey", value: "DUMMY-api" },
        { name: "serverUrl", value: "https://app.example.com" },
      ],
    });

    const rows = parseDocumentableProperties(config);
    expect(containsDummy(rows)).toBe(false);
    expect(rows).toEqual(
      expect.arrayContaining([
        { name: "Custom Settings › Password › Value", value: REDACTED_VALUE },
        {
          name: "Custom Settings › serverUrl › Value",
          value: "https://app.example.com",
        },
      ]),
    );
  });

  it("redacts nested Settings Catalog values for secret definitions", () => {
    const policy = sanitize({
      settings: [
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
            settingDefinitionId: "com.apple.directoryservice.managed_password",
            simpleSettingValue: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationStringSettingValue",
              value: "DUMMY-simple",
            },
          },
        },
        {
          id: "1",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationSimpleSettingCollectionInstance",
            settingDefinitionId: "com.apple.extensiblesso_registrationtoken",
            simpleSettingCollectionValue: [
              { value: "DUMMY-collection-1" },
              { value: "DUMMY-collection-2" },
            ],
          },
        },
        {
          id: "2",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
            settingDefinitionId: "com.apple.wifi.managed_item",
            groupSettingCollectionValue: [
              {
                children: [
                  {
                    settingDefinitionId: "com.apple.wifi.managed_ssid_str",
                    simpleSettingValue: { value: "Corp WiFi" },
                  },
                  {
                    settingDefinitionId: "com.apple.wifi.managed_password",
                    simpleSettingValue: { value: "DUMMY-child" },
                  },
                ],
              },
            ],
          },
        },
        {
          id: "3",
          settingInstance: {
            settingDefinitionId: "vendor_msft_example_unrelatedname",
            simpleSettingValue: {
              "@odata.type":
                "#microsoft.graph.deviceManagementConfigurationSecretSettingValue",
              value: "DUMMY-secret-type",
              valueState: "notEncrypted",
            },
          },
        },
        {
          id: "4",
          settingInstance: {
            settingDefinitionId:
              "device_vendor_msft_policy_config_devicelock_minimumpasswordlength",
            simpleSettingValue: { value: 14 },
          },
        },
      ],
    });

    expect(containsDummy(policy)).toBe(false);
    const values = policy.settings.map((setting: any) =>
      extractSettingValue(setting),
    );
    expect(values[0]!.value).toBe(REDACTED_VALUE);
    expect(values[1]!.value).toBe(`${REDACTED_VALUE}, ${REDACTED_VALUE}`);
    expect(values[2]!.nestedSettings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Corp WiFi" }),
        expect.objectContaining({ value: REDACTED_VALUE }),
      ]),
    );
    expect(values[3]!.value).toBe(REDACTED_VALUE);
    expect(values[4]!.value).toBe("14");
    expect(
      (policy.settings[3] as any).settingInstance.simpleSettingValue.valueState,
    ).toBe("notEncrypted");
  });

  it("redacts product keys, license content and kiosk exit codes", () => {
    const [edition, kiosk, storeApp] = sanitize([
      {
        "@odata.type": "#microsoft.graph.editionUpgradeConfiguration",
        displayName: "Edition upgrade",
        licenseType: "productKey",
        targetEdition: "windows10Enterprise",
        productKey: "DUMMY-PRODUCT-KEY",
        license: "DUMMY-LICENSE-CONTENT",
      },
      {
        "@odata.type":
          "#microsoft.graph.androidDeviceOwnerGeneralDeviceConfiguration",
        displayName: "Kiosk",
        kioskModeExitCode: "DUMMY-1234",
        isKioskModeExitCodeSet: true,
      },
      {
        "@odata.type": "#microsoft.graph.microsoftStoreForBusinessApp",
        productKey: "9WZDNCRFJ3PZ/0016",
      },
    ]);

    const rendered = [edition, kiosk].flatMap((config) =>
      parseDeviceConfiguration(config).flatMap((category) => category.settings),
    );
    expect(containsDummy(rendered)).toBe(false);
    expect(rendered.map((setting) => setting.value)).toEqual(
      expect.arrayContaining(["windows10Enterprise", "Enabled"]),
    );
    expect(storeApp).toMatchObject({ productKey: "9WZDNCRFJ3PZ/0016" });
  });

  it("redacts decoded script fallbacks and never renders them in DOCX", () => {
    expect(sanitize({ scriptContentBase64: "RFVNTVktc2NyaXB0" })).toEqual({
      scriptContentBase64: REDACTED_VALUE,
    });
    const docxSource = readFileSync(
      join(__dirname, "..", "docx-generator-detailed.ts"),
      "utf8",
    );
    expect(docxSource).not.toContain("scriptContentBase64");
  });

  it("redacts ADMX text values labelled as passwords", () => {
    const definitionValues = sanitize([
      {
        enabled: true,
        definition: { displayName: "Proxy settings", categoryPath: "Network" },
        presentationValues: [
          {
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
            value: "DUMMY-admx",
            presentation: {
              "@odata.type": "#microsoft.graph.groupPolicyPresentationTextBox",
              label: "Proxy password",
            },
          },
          {
            "@odata.type":
              "#microsoft.graph.groupPolicyPresentationValueMultiText",
            values: ["DUMMY-multi"],
            presentation: {
              "@odata.type":
                "#microsoft.graph.groupPolicyPresentationMultiTextBox",
              label: "Password list",
            },
          },
          {
            "@odata.type":
              "#microsoft.graph.groupPolicyPresentationValueDecimal",
            value: 12,
            presentation: {
              "@odata.type":
                "#microsoft.graph.groupPolicyPresentationDecimalTextBox",
              label: "Minimum password length",
            },
          },
          {
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
            value: "Large letters",
            presentation: {
              "@odata.type":
                "#microsoft.graph.groupPolicyPresentationDropdownList",
              label: "Password complexity",
            },
          },
          {
            "@odata.type": "#microsoft.graph.groupPolicyPresentationValueText",
            value: "proxy.example.com",
            presentation: {
              "@odata.type": "#microsoft.graph.groupPolicyPresentationTextBox",
              label: "Proxy server",
            },
          },
        ],
      },
    ]);

    const [parsed] = parseAdministrativeTemplate(definitionValues);
    expect(containsDummy(parsed)).toBe(false);
    expect(parsed!.value).toBe(
      [
        `Proxy password: ${REDACTED_VALUE}`,
        `Password list: ${REDACTED_VALUE}`,
        "Minimum password length: 12",
        "Password complexity: Large letters",
        "Proxy server: proxy.example.com",
      ].join(", "),
    );
  });
});
