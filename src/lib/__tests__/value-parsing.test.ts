import { describe, it, expect } from "vitest";
import {
  formatValue,
  parseAdministrativeTemplate,
  parseAssignments,
  parseComplianceRules,
  parseSecurityBaseline,
  extractSettingValue,
} from "../configuration-parser";

describe("documentation value integrity", () => {
  it("preserves structured pairs, zero, false, and heterogeneous lists", () => {
    expect(
      formatValue([
        { name: "Server", value: "example.com" },
        { value: 0 },
        { value: false },
        null,
        "tail",
      ]),
    ).toBe("Server: example.com\n0\nDisabled\nNot configured\ntail");
    expect(formatValue(["first", { value: 0 }])).toBe("first\n0");
  });
  it("preserves literal technical strings", () => {
    expect(
      extractSettingValue({
        id: "x",
        settingInstance: {
          settingDefinitionId: "x",
          simpleSettingValue: { value: "device_vendor_msft_custom_value" },
        },
      } as any).value,
    ).toBe("device_vendor_msft_custom_value");
  });
  it("reads Administrative Template list presentations", () => {
    expect(
      parseAdministrativeTemplate([
        {
          enabled: true,
          presentationValues: [
            { values: [{ name: "Site", value: "example.com" }] },
          ],
        },
      ])[0]?.value,
    ).toBe("Values: Site: example.com");
  });
  it.each(["group", "allDevices", "allLicensedUsers"])(
    "retains filters on %s assignments",
    (kind) => {
      const target =
        kind === "group"
          ? { groupId: "group" }
          : { "@odata.type": `#microsoft.graph.${kind}AssignmentTarget` };
      expect(
        parseAssignments([
          {
            target: {
              ...target,
              deviceAndAppManagementAssignmentFilterId: "filter",
              deviceAndAppManagementAssignmentFilterType: "exclude",
            },
          },
        ]),
      ).toContain("Filter (Exclude): filter");
    },
  );
  it("distinguishes unavailable assignments and partial results", () => {
    expect(parseAssignments([], "incomplete")).toContain("unavailable");
    expect(parseAssignments([], "complete")).toBe("Not assigned");
    expect(
      parseAssignments([{ target: { groupId: "group" } }], "incomplete"),
    ).toBe("Group: group (collection incomplete)");
  });
  it("omits collection metadata and preserves unavailable action status", () => {
    const rules = parseComplianceRules({
      passwordRequired: true,
      configType: "Compliance Policy",
      collectionStatus: { scheduledActionsForRule: "incomplete" },
      scheduledActionsForRule: [],
    });
    expect(rules).toHaveLength(1);
    expect(rules[0]?.action).toContain("Actions unavailable");
  });
  it.each([
    [12, "12 hours"],
    [36, "36 hours"],
    [24, "1 day"],
    [0, "immediately"],
  ])("preserves %s hour action timing", (hours, label) => {
    expect(
      parseComplianceRules({
        passwordRequired: true,
        scheduledActionsForRule: [
          {
            scheduledActionConfigurations: [
              { actionType: "block", gracePeriodHours: hours },
            ],
          },
        ],
      })[0]?.action,
    ).toBe(`Mark device noncompliant${hours === 0 ? " " : " after "}${label}`);
  });
  it("reads baseline JSON values including zero and false", () => {
    const settings = parseSecurityBaseline(
      [],
      [
        { definitionId: "one", valueJson: "false" },
        { definitionId: "two", valueJson: "0" },
        { definitionId: "three", valueJson: '"literal"' },
      ],
    )[0]?.settings;
    expect(settings?.map((s) => s.value)).toEqual(["Disabled", "0", "literal"]);
    expect(
      parseSecurityBaseline([
        {
          displayName: "Legacy",
          settings: [{ definitionId: "legacy", boolValue: false }],
        },
      ])[0]?.settings[0]?.value,
    ).toBe("Disabled");
  });
});
