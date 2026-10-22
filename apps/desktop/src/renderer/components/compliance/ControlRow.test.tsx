// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type { ControlAssessment } from "../../../../../../src/lib/compliance/types";
import type { ComplianceCapabilityView } from "../../../shared/ipc-types";
import { ControlRow } from "./ControlRow";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const control = {
  control: { id: "8.5", title: "Sign-in, unlock and credential protection", summary: "Authentication" },
  capabilityIds: ["tenant-security-defaults-enabled"],
  enforcedCapabilityIds: [],
  status: "noEvidence",
  unassessedAspects: [],
  excludedCapabilityIds: [],
} as ControlAssessment;

function defaults(alternative?: ComplianceCapabilityView["alternative"]): ComplianceCapabilityView {
  return {
    capability: { id: "tenant-security-defaults-enabled", name: "Security defaults enabled (Entra ID)" },
    status: "noEvidence",
    evidence: [],
    limitations: [],
    checks: [
      {
        assessmentStatus: "checked",
        result: alternative ? null : "different",
        settingId: "identitySecurityDefaultsEnforcementPolicy.securityDefaultsEnabled",
        expectedValue: "Security defaults enabled",
        actualValue: "Off",
        policyId: "identitySecurityDefaultsEnforcementPolicy",
        policyName: "Security defaults",
      },
    ],
    ...(alternative ? { alternative } : {}),
  };
}

let root: Root | null = null;
let container: HTMLElement;

/** The capability section under the expanded control. */
function section() {
  return screen.getByRole("heading", { name: "Security defaults enabled (Entra ID)" }).closest("section")!;
}

async function render(capability: ComplianceCapabilityView) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <ControlRow
        control={control}
        capabilitiesById={new Map([[capability.capability.id, capability]])}
        expanded
        onToggle={() => undefined}
      />,
    ),
  );
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("ControlRow capability label", () => {
  it.each([
    ["inUse", "Not needed, an alternative is set up"],
    ["notCombinable", "Not applicable while Conditional Access policies exist"],
  ] as const)("shows a neutral label for an alternative %s", async (state, label) => {
    await render(defaults({ state, capabilityIds: [] }));
    expect(within(section()).getByText(label)).toBeTruthy();
    expect(within(section()).queryByText(/\d+ match, \d+ missing/)).toBeNull();
  });

  it("keeps the check summary for an ordinary gap", async () => {
    await render(defaults());
    expect(within(section()).getByText("0 match, 0 missing, 1 different")).toBeTruthy();
  });
});
