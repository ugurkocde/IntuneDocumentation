// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("shows only the framework picker when no selection is stored", () => {
    render(<ComplianceView configurations={configurations} />);

    expect(
      screen.getByRole("heading", {
        name: "Choose a compliance framework",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "ISO/IEC 27001" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SOC 2" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "NIST SP 800-53" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "NIST CSF 2.0" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "BSI IT-Grundschutz" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Def Stan 05-138" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Cyber Essentials" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "NIST SP 800-171 Rev. 2" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "NIST SP 800-171 Rev. 3" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(9);
    expect(
      screen.queryByRole("button", { name: /Download report/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /SC-28/ }),
    ).not.toBeInTheDocument();
  });

  it("reveals ISO 27001 content from the framework picker", async () => {
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);

    await user.click(screen.getByRole("button", { name: "ISO/IEC 27001" }));

    expect(
      await screen.findByRole("button", {
        name: "Selected framework: ISO/IEC 27001",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: /8\.24/ }),
    ).toBeInTheDocument();
  });

  it("keeps the stored Revision 2 selection and switches to an independent Revision 3 assessment", async () => {
    window.localStorage.setItem("compliance-framework", "nist-800-171-r2");
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);
    const selector = await screen.findByRole("button", {
      name: "Selected framework: NIST SP 800-171 Rev. 2",
    });
    expect(
      screen.getByText(/11 of 110 published requirements/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /3\.13\.16/ }),
    ).toBeInTheDocument();
    await user.click(selector);
    await user.click(
      screen.getByRole("menuitem", { name: /NIST SP 800-171 Rev\. 3/ }),
    );
    expect(
      await screen.findByRole("button", {
        name: "Selected framework: NIST SP 800-171 Rev. 3",
      }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(/11 of 97 published requirements/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /03\.13\.08/ }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /3\.13\.16/ }),
    ).not.toBeInTheDocument();
    expect(window.localStorage.getItem("compliance-framework")).toBe(
      "nist-800-171-r3",
    );
  });

  it("reveals the selected framework content and dropdown trigger", async () => {
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);

    await user.click(screen.getByRole("button", { name: "NIST SP 800-53" }));

    const trigger = await screen.findByRole("button", {
      name: "Selected framework: NIST SP 800-53",
    });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveFocus();
    expect(
      screen.getByRole("button", { name: "Download report (PDF)" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Partial configuration evidence").length,
    ).toBeGreaterThan(0);
  });

  it("persists and restores a framework selection", async () => {
    const user = userEvent.setup();
    const firstRender = render(
      <ComplianceView configurations={configurations} />,
    );

    await user.click(screen.getByRole("button", { name: "NIST SP 800-53" }));
    expect(window.localStorage.getItem("compliance-framework")).toBe(
      "nist-800-53-r5",
    );

    firstRender.unmount();
    render(<ComplianceView configurations={configurations} />);

    expect(
      await screen.findByRole("button", {
        name: "Selected framework: NIST SP 800-53",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Download report (PDF)" }),
    ).toBeInTheDocument();
  });

  it("returns to the picker and clears the stored selection", async () => {
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);

    await user.click(screen.getByRole("button", { name: "NIST SP 800-53" }));
    await user.click(
      await screen.findByRole("button", {
        name: "Selected framework: NIST SP 800-53",
      }),
    );
    await user.click(
      screen.getByRole("menuitem", { name: "Show all frameworks" }),
    );

    expect(
      await screen.findByRole("heading", {
        name: "Choose a compliance framework",
      }),
    ).toBeInTheDocument();
    expect(window.localStorage.getItem("compliance-framework")).toBeNull();
  });

  it("expands control evidence inside the selected framework", async () => {
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);

    await user.click(screen.getByRole("button", { name: "NIST SP 800-53" }));

    const sc28Control = await screen.findByRole("button", { name: /SC-28/ });
    expect(sc28Control).toHaveAttribute("aria-expanded", "false");

    await user.click(sc28Control);

    expect(sc28Control).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Assigned BitLocker dashboard policy"),
    ).toBeInTheDocument();
  });

  it("shows resolved group names in evidence when a name map is provided", async () => {
    const user = userEvent.setup();
    const grouped = structuredClone(configurations);
    const firstItem = grouped.sections[0]?.items[0];
    if (firstItem) {
      firstItem.assignments = [
        {
          id: "assignment-1",
          target: {
            "@odata.type": "#microsoft.graph.groupAssignmentTarget",
            groupId: "group-1",
          },
        },
      ];
    }
    render(
      <ComplianceView
        configurations={grouped}
        groupNames={new Map([["group-1", "Security Operations"]])}
      />,
    );

    await user.click(screen.getByRole("button", { name: "NIST SP 800-53" }));
    const sc28Control = await screen.findByRole("button", { name: /SC-28/ });
    await user.click(sc28Control);

    expect(screen.getByText(/Security Operations/)).toBeInTheDocument();
    expect(screen.queryByText(/group-1/)).not.toBeInTheDocument();
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
    await user.click(
      screen.getByRole("button", { name: "BSI IT-Grundschutz" }),
    );
    await user.click(screen.getByRole("button", { name: /NET.3.2/ }));

    expect(
      screen.getByText("Non-enforcing setting detected"),
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
    await user.click(
      screen.getByRole("button", { name: "BSI IT-Grundschutz" }),
    );
    await user.click(screen.getByRole("button", { name: /OPS.1.1.3/ }));

    expect(
      screen.getAllByText(
        "A minimum version is configured; whether it is current is not assessed.",
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe("ComplianceView assessment scope", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });
  it("lets users exclude platforms and preserves assessment limitations", async () => {
    window.localStorage.setItem("compliance-framework", "bsi-it-grundschutz");
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);
    await user.click(await screen.findByRole("checkbox", { name: "macOS" }));
    expect(
      screen.getByRole("button", { name: /SYS.2.4.A6/ }),
    ).toHaveTextContent("Outside selected scope");
    expect(
      screen.getByRole("button", { name: "Download evidence record (JSON)" }),
    ).toBeInTheDocument();
  });
  it("applies the selected Def Stan risk level", async () => {
    window.localStorage.setItem("compliance-framework", "def-stan-05-138-i4");
    const user = userEvent.setup();
    render(<ComplianceView configurations={configurations} />);
    await user.selectOptions(
      await screen.findByRole("combobox", {
        name: "Def Stan Cyber Risk Profile",
      }),
      "0",
    );
    expect(screen.getByRole("button", { name: /2317/ })).toHaveTextContent(
      "Outside selected scope",
    );
  });
  it("makes incomplete collection visible before opening individual controls", async () => {
    window.localStorage.setItem("compliance-framework", "iso-27001-2022");
    render(
      <ComplianceView
        configurations={{
          ...configurations,
          fetchErrors: [
            {
              policyId: "failed",
              policyName: "Policy",
              policyType: "Settings Catalog",
              familyKey: "settingsCatalog",
              error: "Forbidden",
            },
          ],
        }}
      />,
    );
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Collection is incomplete",
    );
  });
});
