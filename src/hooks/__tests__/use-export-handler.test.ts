// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveExportData = vi.fn(async (data: Record<string, unknown>) => ({
  ...data,
  groupNames: new Map(),
  deviceCounts: {},
}));

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({ instance: {}, accounts: [] }),
}));
vi.mock("~/lib/id-token", () => ({ getIdToken: vi.fn() }));
vi.mock("~/lib/client-export-resolver", () => ({ resolveExportData }));
vi.mock("~/lib/pdf-generator-detailed", () => ({
  generateDetailedPDF: vi.fn(async () => ({
    buffer: new Uint8Array([37, 80, 68, 70]),
    errors: [],
  })),
}));

import { useExportHandler } from "../use-export-handler";

const tenantIdentityPolicies = {
  securityDefaults: { isEnabled: false },
  status: { securityDefaults: "collected" },
};
const policyDeviceStatus = {
  collectedAt: "2026-10-18T00:00:00Z",
  sources: {
    configurationPolicies: "collected",
    compliancePolicies: "collected",
    deviceConfigurations: "collected",
  },
  rows: [],
};

function render(includeCA: boolean) {
  return renderHook(() =>
    useExportHandler({
      configurations: {
        collectedAt: "2026-10-18T00:00:00Z",
        sections: [],
        tenantIdentityPolicies,
        policyDeviceStatus,
      },
      selectedConfigs: new Set(),
      brandingOptions: {},
      includeCA,
      caConsentStatus: "included",
      getAccessToken: async () => "token",
    }),
  ).result.current;
}

describe("web full export data", () => {
  beforeEach(() => resolveExportData.mockClear());

  it("passes Entra tenant policies and the device status annex to the generator", async () => {
    const result = await render(true).handleExport("pdf-detailed");
    expect(result.success).toBe(true);
    expect(resolveExportData.mock.calls[0]?.[0]).toMatchObject({
      tenantIdentityPolicies,
      policyDeviceStatus,
    });
  });

  it("drops tenant policies when Conditional Access is excluded, keeping the annex", async () => {
    await render(false).handleExport("pdf-detailed");
    const data = resolveExportData.mock.calls[0]?.[0];
    expect(data?.tenantIdentityPolicies).toBeUndefined();
    expect(data?.policyDeviceStatus).toEqual(policyDeviceStatus);
  });
});
