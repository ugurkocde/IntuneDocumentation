import { describe, expect, it } from "vitest";
import {
  extractAppConfigurationSettings,
  extractSettingValue,
  parseAdministrativeTemplate,
  parseDocumentableProperties,
} from "../configuration-parser";
import {
  administrativeTemplateFixture,
  appConfigurationFixture,
  enrollmentStatusPageFixture,
} from "./fixtures/intune-beta";

describe("configuration parser regressions", () => {
  it("uses Graph itemId values to resolve Settings Catalog choice labels", () => {
    const result = extractSettingValue({
      id: "choice",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
        settingDefinitionId: "choice",
        choiceSettingValue: { value: "choice-item-id" },
      },
      settingDefinitions: [
        {
          id: "choice",
          displayName: "Choice",
          baseType: "choice",
          options: [
            {
              name: "legacy-name",
              itemId: "choice-item-id",
              displayName: "Friendly choice",
            },
          ],
        },
      ],
    });

    expect(result.value).toBe("Friendly choice");
  });

  it("preserves appConfigKey and appConfigKeyValue fields", () => {
    expect(extractAppConfigurationSettings(appConfigurationFixture)).toEqual([
      {
        name: "refreshInterval",
        value: "123",
        type: "integerType",
      },
    ]);
  });

  it("documents enrollment status page derived fields", () => {
    const settings = parseDocumentableProperties(enrollmentStatusPageFixture);
    expect(settings).toEqual(
      expect.arrayContaining([
        { name: "Show Installation Progress", value: "Enabled" },
        { name: "Install Progress Timeout In Minutes", value: "60" },
        { name: "Install Quality Updates", value: "Enabled" },
      ]),
    );
  });

  it("uses Administrative Template presentation values", () => {
    expect(parseAdministrativeTemplate(administrativeTemplateFixture)).toEqual([
      {
        name: "Configure a policy",
        value: "Policy value: Configured value",
        state: "Enabled",
        category: "Windows Components",
      },
    ]);
  });

  it("renders enriched child collections as readable nested settings", () => {
    expect(
      parseDocumentableProperties({
        items: [
          {
            displayName: "Required app",
            payloadId: "app-1",
            intent: "required",
          },
        ],
      }),
    ).toEqual([
      { name: "Items › Required app › Payload Id", value: "app-1" },
      { name: "Items › Required app › Intent", value: "required" },
    ]);
  });
});
