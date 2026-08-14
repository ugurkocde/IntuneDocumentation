import { describe, expect, it } from "vitest";
import {
  associateConfigurationSettingDefinitions,
  collectConfiguredSettingDefinitionIds,
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
  it("matches a Settings Catalog definition by ID instead of array order", () => {
    const settingId = "outlook-security-mode";
    const enabledId = `${settingId}_1`;
    const result = extractSettingValue({
      id: "0",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
        settingDefinitionId: settingId,
        choiceSettingValue: { value: enabledId },
      },
      settingDefinitions: [
        {
          id: "guard-behavior",
          displayName: "Guard behavior (User)",
          baseType: "choice",
          options: [],
        },
        {
          id: settingId,
          displayName: "Outlook Security Mode (User)",
          baseType: "choice",
          options: [
            {
              name: "Enabled",
              itemId: enabledId,
              displayName: "Enabled",
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({
      name: "Outlook Security Mode (User)",
      value: "Enabled",
    });
  });

  it("does not fall back to an unrelated single definition", () => {
    const result = extractSettingValue({
      id: "0",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
        settingDefinitionId: "parent",
        choiceSettingValue: { value: "parent_1" },
      },
      settingDefinitions: [
        {
          id: "child",
          displayName: "Child setting",
          options: [
            {
              name: "Enabled",
              itemId: "child_1",
              displayName: "Enabled",
            },
          ],
        },
      ],
    });

    expect(result).toMatchObject({ name: "parent", value: "parent_1" });
  });

  it("does not match an undefined choice against an option without itemId", () => {
    const result = extractSettingValue({
      id: "0",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
        settingDefinitionId: "choice",
        choiceSettingValue: {},
      },
      settingDefinitions: [
        {
          id: "choice",
          displayName: "Choice",
          options: [{ name: "First", displayName: "Wrong option" }],
        },
      ],
    });

    expect(result.value).toBe("Not configured");
  });

  it("shares expanded definitions with settings where Graph omitted them", () => {
    const childId = "oom-formula-setting";
    const settings = associateConfigurationSettingDefinitions([
      {
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId: "oom-formula",
          choiceSettingValue: { value: "oom-formula_1" },
        },
        settingDefinitions: [
          {
            id: "oom-formula",
            displayName: "Configure Outlook object model prompt",
            baseType: "choice",
            options: [],
          },
          {
            id: childId,
            displayName: "Guard behavior (User)",
            baseType: "choice",
            options: [
              {
                name: "Prompt User",
                itemId: `${childId}_1`,
                displayName: "Prompt User",
              },
            ],
          },
        ],
      },
      {
        id: "1",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId: childId,
          choiceSettingValue: { value: `${childId}_1` },
        },
        settingDefinitions: [],
      },
    ]);

    expect(extractSettingValue(settings[1]!)).toMatchObject({
      name: "Guard behavior (User)",
      value: "Prompt User",
    });
  });

  it("collects configured definition IDs from nested setting instances", () => {
    expect(
      collectConfiguredSettingDefinitionIds([
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            settingDefinitionId: "parent",
            choiceSettingValue: {
              value: "parent_1",
              children: [
                {
                  "@odata.type":
                    "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                  settingDefinitionId: "child",
                  simpleSettingValue: { value: "configured" },
                },
              ],
            },
          },
        },
      ]),
    ).toEqual(["parent", "child"]);
  });

  it("uses supplemental definitions to enrich omitted Graph metadata", () => {
    const settings = associateConfigurationSettingDefinitions(
      [
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
            settingDefinitionId: "missing",
            choiceSettingValue: { value: "missing_1" },
          },
          settingDefinitions: [],
        },
      ],
      [
        {
          id: "missing",
          displayName: "Recovered setting",
          options: [
            {
              name: "Enabled",
              itemId: "missing_1",
              displayName: "Enabled",
            },
          ],
        },
      ],
    );

    expect(extractSettingValue(settings[0]!)).toMatchObject({
      name: "Recovered setting",
      value: "Enabled",
    });
  });

  it("resolves choice option values without matching undefined values", () => {
    const definition = {
      id: "choice",
      displayName: "Choice",
      options: [
        { name: "No value", displayName: "Wrong option" },
        {
          name: "Numeric value",
          displayName: "Numeric option",
          optionValue: { value: 1 },
        },
      ],
    };

    expect(
      extractSettingValue({
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
          settingDefinitionId: "choice",
          choiceSettingValue: { value: "1" },
        },
        settingDefinitions: [definition],
      }).value,
    ).toBe("Numeric option");
  });

  it("renders choice collections and collects their nested definition IDs", () => {
    const settings = [
      {
        id: "0",
        settingInstance: {
          "@odata.type":
            "#microsoft.graph.deviceManagementConfigurationChoiceSettingCollectionInstance",
          settingDefinitionId: "collection",
          choiceSettingCollectionValue: [
            {
              value: "collection_1",
              children: [
                {
                  "@odata.type":
                    "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                  settingDefinitionId: "collection-child",
                  simpleSettingValue: { value: "configured" },
                },
              ],
            },
          ],
        },
        settingDefinitions: [
          {
            id: "collection",
            displayName: "Collection",
            options: [
              {
                name: "Selected",
                itemId: "collection_1",
                displayName: "Selected option",
              },
            ],
          },
          {
            id: "collection-child",
            displayName: "Collection child",
          },
        ],
      },
    ];

    expect(collectConfiguredSettingDefinitionIds(settings)).toEqual([
      "collection",
      "collection-child",
    ]);
    expect(extractSettingValue(settings[0]!)).toMatchObject({
      value: "Selected option",
      type: "Choice Collection",
      nestedSettings: [
        {
          name: "  Collection child",
          value: "configured",
        },
      ],
    });
  });

  it("collects definition IDs from group collections", () => {
    expect(
      collectConfiguredSettingDefinitionIds([
        {
          id: "0",
          settingInstance: {
            "@odata.type":
              "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
            settingDefinitionId: "group",
            groupSettingCollectionValue: [
              {
                children: [
                  {
                    "@odata.type":
                      "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                    settingDefinitionId: "group-child",
                    simpleSettingValue: { value: "configured" },
                  },
                ],
              },
            ],
          },
        },
      ]),
    ).toEqual(["group", "group-child"]);
  });

  it("retains the complete definition set for deeply nested settings", () => {
    const result = extractSettingValue({
      id: "0",
      settingInstance: {
        "@odata.type":
          "#microsoft.graph.deviceManagementConfigurationGroupSettingCollectionInstance",
        settingDefinitionId: "root",
        groupSettingCollectionValue: [
          {
            children: [
              {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                settingDefinitionId: "middle",
                choiceSettingValue: {
                  value: "middle_1",
                  children: [
                    {
                      "@odata.type":
                        "#microsoft.graph.deviceManagementConfigurationSimpleSettingInstance",
                      settingDefinitionId: "grandchild",
                      simpleSettingValue: { value: "configured" },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
      settingDefinitions: [
        { id: "root", displayName: "Root" },
        {
          id: "middle",
          displayName: "Middle",
          options: [
            {
              name: "Enabled",
              itemId: "middle_1",
              displayName: "Enabled",
            },
          ],
        },
        { id: "grandchild", displayName: "Grandchild" },
      ],
    });

    expect(result.nestedSettings).toEqual([
      { name: "  Middle", value: "Enabled", description: undefined },
      { name: "    Grandchild", value: "configured", description: undefined },
    ]);
  });

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
