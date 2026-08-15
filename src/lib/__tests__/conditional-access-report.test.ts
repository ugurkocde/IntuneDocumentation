import { describe, expect, it } from "vitest";
import {
  buildConditionalAccessReportRows,
  conditionalAccessStateLabel,
} from "../conditional-access-report";

function rowsByName(policy: any, groupNames?: Map<string, string>) {
  return new Map(
    buildConditionalAccessReportRows(policy, groupNames).map((row) => [
      row.name,
      row.value,
    ]),
  );
}

describe("Conditional Access report rows", () => {
  it("includes target resources and the complete device filter", () => {
    const rows = rowsByName(
      {
        conditions: {
          users: {
            includeGroups: ["pilot-group"],
            excludeGroups: ["break-glass-group"],
          },
          applications: {
            includeApplications: ["Office365"],
          },
          platforms: { includePlatforms: ["windows"] },
          clientAppTypes: ["mobileAppsAndDesktopClients"],
          devices: {
            deviceFilter: {
              mode: "include",
              rule: 'device.deviceOwnership -ne "Company"',
            },
          },
        },
        grantControls: { builtInControls: ["block"] },
      },
      new Map([
        ["pilot-group", "Data Protection Pilot"],
        ["break-glass-group", "Break Glass Accounts"],
      ]),
    );

    expect(rows.get("Include Groups")).toBe("Data Protection Pilot");
    expect(rows.get("Exclude Groups")).toBe("Break Glass Accounts");
    expect(rows.get("Include Applications")).toBe("Office 365");
    expect(rows.get("Device Filter Mode")).toBe("include");
    expect(rows.get("Device Filter Rule")).toBe(
      'device.deviceOwnership -ne "Company"',
    );
    expect(rows.get("Grant Controls")).toBe("block");
  });

  it("preserves configured beta fields and explicit disabled values", () => {
    const rows = rowsByName({
      conditions: {
        authenticationFlows: { transferMethods: ["deviceCodeFlow"] },
        clientApplications: {
          servicePrincipalFilter: {
            mode: "exclude",
            rule: 'CustomSecurityAttribute.foo -eq "bar"',
          },
        },
      },
      grantControls: {
        authenticationStrength: {
          displayName: "Phishing-resistant MFA",
          "authenticationStrength@odata.context": "ignored",
        },
      },
      sessionControls: {
        disableResilienceDefaults: false,
        experimentalControl: { isEnabled: true },
      },
    });

    expect(rows.get("Authentication Flows Transfer Methods")).toBe(
      "deviceCodeFlow",
    );
    expect(rows.get("Service Principal Filter Mode")).toBe("exclude");
    expect(rows.get("Service Principal Filter Rule")).toBe(
      'CustomSecurityAttribute.foo -eq "bar"',
    );
    expect(rows.get("Authentication Strength")).toBe("Phishing-resistant MFA");
    expect(rows.get("Disable Resilience Defaults")).toBe("Disabled");
    expect(rows.get("Session Controls Experimental Control Is Enabled")).toBe(
      "Enabled",
    );
    expect([...rows.values()]).not.toContain("ignored");
  });

  it("formats policy state labels", () => {
    expect(conditionalAccessStateLabel("enabled")).toBe("Enabled");
    expect(
      conditionalAccessStateLabel("enabledForReportingButNotEnforced"),
    ).toBe("Report-only");
    expect(conditionalAccessStateLabel(undefined)).toBe("Unknown");
  });
});
