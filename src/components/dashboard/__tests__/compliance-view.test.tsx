// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { ComplianceView } from "../compliance-view";
import type { IntuneConfigurations } from "../types";

const configurations: IntuneConfigurations = {
  settingsCatalog: [],
  deviceConfigurations: [],
  administrativeTemplates: [],
  securityBaselines: [],
  compliancePolicies: [],
  appProtectionPolicies: [],
  scripts: { windows: [], macOS: [] },
  appConfigurations: [],
  windowsUpdatePolicies: [],
  enrollmentConfigurations: [],
  conditionalAccessPolicies: [],
  sections: [
    {
      key: "settingsCatalog",
      familyKey: "settingsCatalog",
      label: "Settings Catalog",
      selectionPrefix: "catalog",
      items: [
        {
          id: "bitlocker-policy",
          displayName: "Assigned BitLocker dashboard policy",
          configType: "Settings Catalog",
          settings: [
            {
              id: "0",
              settingInstance: {
                "@odata.type":
                  "#microsoft.graph.deviceManagementConfigurationChoiceSettingInstance",
                settingDefinitionId:
                  "device_vendor_msft_bitlocker_requiredeviceencryption",
                choiceSettingValue: {
                  value:
                    "device_vendor_msft_bitlocker_requiredeviceencryption_1",
                },
              },
            },
          ],
          assignments: [
            {
              target: {
                "@odata.type": "#microsoft.graph.allDevicesAssignmentTarget",
              },
            },
          ],
        },
      ],
    },
  ],
  summary: {
    totalConfigurations: 1,
    byType: { settingsCatalog: 1 },
  },
};

describe("ComplianceView", () => {
  afterEach(cleanup);

  it("switches frameworks and expands control evidence", async () => {
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);

    expect(
      screen.getByRole("button", { name: "BSI IT-Grundschutz" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "NIST SP 800-53" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "NIST CSF 2.0" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Partial configuration evidence").length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "NIST SP 800-53" }));

    const sc28Control = screen.getByRole("button", { name: /SC-28/ });
    expect(sc28Control).toHaveAttribute("aria-expanded", "false");

    await user.click(sc28Control);

    expect(sc28Control).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Assigned BitLocker dashboard policy"),
    ).toBeInTheDocument();
  });

  it("distinguishes assigned and unassigned deviating configurations", async () => {
    const user = userEvent.setup();
    const counterConfigurations: IntuneConfigurations = {
      ...configurations,
      sections: [
        {
          ...configurations.sections[0]!,
          items: [
            {
              id: "assigned-firewall-deviation",
              displayName: "Assigned firewall deviation",
              "@odata.type":
                "#microsoft.graph.windows10EndpointProtectionConfiguration",
              firewallProfileDomain: { firewallEnabled: "blocked" },
              assignments: [
                {
                  target: {
                    "@odata.type":
                      "#microsoft.graph.allDevicesAssignmentTarget",
                  },
                },
              ],
            },
            {
              id: "unassigned-firewall-deviation",
              displayName: "Unassigned firewall deviation",
              "@odata.type":
                "#microsoft.graph.windows10EndpointProtectionConfiguration",
              firewallProfilePrivate: { firewallEnabled: "blocked" },
              assignments: [],
            },
          ],
        },
      ],
    };

    render(<ComplianceView configurations={counterConfigurations} />);
    await user.click(screen.getByRole("button", { name: /NET.3.2/ }));

    expect(
      screen.getByText("Deviating configuration detected"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Deviating configuration detected and assigned (risk)"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Deviating configuration detected, but not assigned"),
    ).toBeInTheDocument();
    expect(screen.getByText("Risk: blocked")).toBeInTheDocument();
  });

  it("shows minimum-version assessment caveats", async () => {
    const user = userEvent.setup();
    const minimumVersionConfigurations: IntuneConfigurations = {
      ...configurations,
      sections: [
        {
          ...configurations.sections[0]!,
          items: [
            {
              id: "windows-minimum-version",
              displayName: "Windows minimum version",
              "@odata.type": "#microsoft.graph.windows10CompliancePolicy",
              osMinimumVersion: "10.0.26100",
              assignments: [
                {
                  target: {
                    "@odata.type":
                      "#microsoft.graph.allDevicesAssignmentTarget",
                  },
                },
              ],
            },
          ],
        },
      ],
    };

    render(<ComplianceView configurations={minimumVersionConfigurations} />);
    await user.click(screen.getByRole("button", { name: /OPS.1.1.3/ }));

    expect(
      screen.getAllByText(
        "A minimum version is configured; whether it is current is not assessed.",
      ).length,
    ).toBeGreaterThan(0);
  });
});
