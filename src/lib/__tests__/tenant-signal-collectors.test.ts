import { describe, expect, it, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";
import {
  collectPolicyDeviceStatus,
  collectTenantIdentityPolicies,
  overviewToStatus,
  parseReportPage,
  reportRowToStatus,
} from "../tenant-signal-collectors";

const passThrough = <T>(request: () => Promise<T>) => request();

function graphError(statusCode: number, message = "Request failed") {
  return Object.assign(new Error(message), { statusCode });
}

/** A Graph client stub keyed by path; POST bodies are recorded. */
function client(
  handlers: Record<string, (body?: any) => unknown>,
  calls: Array<{ path: string; body?: unknown }> = [],
) {
  return {
    api: (path: string) => {
      const request: any = {
        version: () => request,
        select: () => request,
        expand: () => request,
        responseType: () => request,
        get: async () => {
          calls.push({ path });
          const handler = handlers[path];
          if (!handler) throw new Error(`Unexpected GET ${path}`);
          return handler();
        },
        post: async (body: unknown) => {
          calls.push({ path, body });
          const handler = handlers[path];
          if (!handler) throw new Error(`Unexpected POST ${path}`);
          return handler(body);
        },
      };
      return request;
    },
  } as any;
}

describe("Entra tenant policy collection", () => {
  it("reads the three policies and normalises the beta authorizationPolicy collection", async () => {
    const result = await collectTenantIdentityPolicies(
      client({
        "/policies/authenticationMethodsPolicy": () => ({
          "@odata.context": "https://graph.microsoft.com/beta/$metadata",
          id: "authenticationMethodsPolicy",
          authenticationMethodConfigurations: [],
        }),
        "/policies/identitySecurityDefaultsEnforcementPolicy": () => ({
          id: "00000000-0000-0000-0000-000000000005",
          isEnabled: false,
        }),
        "/policies/authorizationPolicy": () => ({
          value: [{ id: "authorizationPolicy", allowInvitesFrom: "everyone" }],
        }),
      }),
      passThrough,
    );
    expect(result.status).toEqual({
      authenticationMethods: "collected",
      securityDefaults: "collected",
      authorization: "collected",
    });
    expect(result.errors).toBeUndefined();
    expect(result.authenticationMethods).toEqual({
      id: "authenticationMethodsPolicy",
      authenticationMethodConfigurations: [],
    });
    expect(result.authorization).toEqual({
      id: "authorizationPolicy",
      allowInvitesFrom: "everyone",
    });
  });

  it("records denied and failed reads per policy", async () => {
    const result = await collectTenantIdentityPolicies(
      client({
        "/policies/authenticationMethodsPolicy": () => {
          throw graphError(403, "Forbidden");
        },
        "/policies/identitySecurityDefaultsEnforcementPolicy": () => {
          throw graphError(500, "Upstream failure");
        },
        "/policies/authorizationPolicy": () => ({ value: [] }),
      }),
      passThrough,
    );
    expect(result.status).toEqual({
      authenticationMethods: "permissionDenied",
      securityDefaults: "failed",
      authorization: "failed",
    });
    expect(result.authenticationMethods).toBeUndefined();
    expect(result.errors?.authenticationMethods).toContain("403");
    expect(result.errors?.securityDefaults).toContain("Upstream failure");
  });
});

describe("Intune report parsing", () => {
  const report = {
    TotalRowCount: 1,
    Schema: [
      { Column: "NumberOfCompliantDevices", PropertyType: "Int64" },
      { Column: "PolicyId", PropertyType: "String" },
      { Column: "PolicyName", PropertyType: "String" },
      { Column: "NumberOfNonCompliantOrErrorDevices", PropertyType: "Int64" },
    ],
    Values: [[4, "policy-1", "Policy one", 2]],
  };

  it("reads values by column name from objects, JSON text and JSON strings", () => {
    for (const body of [
      report,
      JSON.stringify(report),
      JSON.stringify(JSON.stringify(report)),
    ]) {
      expect(parseReportPage(body)).toEqual({
        totalRowCount: 1,
        rows: [
          {
            NumberOfCompliantDevices: 4,
            PolicyId: "policy-1",
            PolicyName: "Policy one",
            NumberOfNonCompliantOrErrorDevices: 2,
          },
        ],
      });
    }
    expect(() => parseReportPage({ Values: [] })).toThrow(/Schema/);
    expect(() => parseReportPage("not json")).toThrow();
  });

  it("maps report and overview counts, keeping unknown counts null", () => {
    expect(
      reportRowToStatus(
        {
          PolicyId: "policy-1",
          PolicyName: "Policy one",
          NumberOfCompliantDevices: 4,
          NumberOfNonCompliantDevices: 1,
          NumberOfErrorDevices: 2,
          NumberOfConflictDevices: 0,
        },
        "compliancePolicies",
      ),
    ).toEqual({
      policyId: "policy-1",
      policyName: "Policy one",
      source: "compliancePolicies",
      succeeded: 4,
      error: 3,
      conflict: 0,
      notApplicable: null,
      pending: null,
    });
    expect(
      reportRowToStatus({ PolicyName: "No id" }, "compliancePolicies"),
    ).toBe(null);
    expect(
      overviewToStatus({
        id: "profile-1",
        displayName: "Profile one",
        deviceStatusOverview: {
          successCount: 9,
          errorCount: 1,
          failedCount: 2,
          conflictCount: 0,
          notApplicableCount: 3,
          pendingCount: 4,
        },
      }),
    ).toEqual({
      policyId: "profile-1",
      policyName: "Profile one",
      source: "deviceConfigurations",
      succeeded: 9,
      error: 3,
      conflict: 0,
      notApplicable: 3,
      pending: 4,
    });
    expect(overviewToStatus({ id: "no-overview" })).toBe(null);
  });
});

describe("policy device status collection", () => {
  const page = (rows: unknown[][], total: number) => ({
    TotalRowCount: total,
    Schema: [
      { Column: "PolicyId", PropertyType: "String" },
      { Column: "PolicyName", PropertyType: "String" },
      { Column: "NumberOfCompliantDevices", PropertyType: "Int64" },
    ],
    Values: rows,
  });

  it("pages reports with top and skip to the total row count", async () => {
    const calls: Array<{ path: string; body?: any }> = [];
    const configuration =
      "/deviceManagement/reports/getConfigurationPolicyNonComplianceSummaryReport";
    const compliance =
      "/deviceManagement/reports/getCompliancePolicyNonComplianceSummaryReport";
    const result = await collectPolicyDeviceStatus(
      client(
        {
          [configuration]: (body) =>
            JSON.stringify(
              page(
                body.skip === 0
                  ? Array.from({ length: 1000 }, (_, index) => [
                      `cfg-${index}`,
                      `Config ${index}`,
                      1,
                    ])
                  : [["cfg-last", "Config last", 2]],
                1001,
              ),
            ),
          [compliance]: () => page([["cmp-1", "Compliance one", 5]], 1),
          "/deviceManagement/deviceConfigurations": () => ({
            value: [
              {
                id: "profile-1",
                displayName: "Profile one",
                deviceStatusOverview: { successCount: 3, pendingCount: 1 },
              },
            ],
          }),
        },
        calls,
      ),
      passThrough,
    );
    expect(
      calls
        .filter((call) => call.path === configuration)
        .map((call) => [call.body.top, call.body.skip]),
    ).toEqual([
      [1000, 0],
      [1000, 1000],
    ]);
    expect(calls.find((call) => call.path === compliance)?.body.select).toEqual(
      expect.arrayContaining(["PolicyId", "NumberOfCompliantDevices"]),
    );
    expect(result.sources).toEqual({
      configurationPolicies: "collected",
      compliancePolicies: "collected",
      deviceConfigurations: "collected",
    });
    expect(result.errors).toBeUndefined();
    expect(result.rows).toHaveLength(1003);
    expect(
      result.rows.find((row) => row.policyId === "profile-1"),
    ).toMatchObject({ succeeded: 3, pending: 1, error: null });
  });

  it("records a failed or denied source without losing the others", async () => {
    const result = await collectPolicyDeviceStatus(
      client({
        "/deviceManagement/reports/getConfigurationPolicyNonComplianceSummaryReport":
          () => {
            throw graphError(403, "Forbidden");
          },
        "/deviceManagement/reports/getCompliancePolicyNonComplianceSummaryReport":
          () => "{ broken",
        "/deviceManagement/deviceConfigurations": () => ({ value: [] }),
      }),
      passThrough,
    );
    expect(result.sources).toEqual({
      configurationPolicies: "permissionDenied",
      compliancePolicies: "failed",
      deviceConfigurations: "collected",
    });
    expect(result.rows).toEqual([]);
  });

  it("skips every source with a reason when the deadline has passed", async () => {
    const calls: Array<{ path: string }> = [];
    const result = await collectPolicyDeviceStatus(
      client({}, calls),
      passThrough,
      {
        deadline: 1000,
        now: () => 2000,
      },
    );
    expect(calls).toEqual([]);
    expect(Object.values(result.sources)).toEqual([
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(result.errors?.compliancePolicies).toContain("time budget");
  });
});

describe("collector integration", () => {
  function service(budgetMs?: number) {
    const instance = new DetailedIntuneService(
      "token",
      undefined,
      undefined,
      budgetMs,
    ) as any;
    for (const method of [
      "getConfigurationPoliciesWithSettings",
      "getDeviceConfigurationsDetailed",
      "getGroupPolicyConfigurationsDetailed",
      "getCompliancePoliciesDetailed",
      "getAppProtectionPoliciesDetailed",
      "getSecurityBaselinesDetailed",
      "getAppConfigurationsDetailed",
      "getWindowsUpdatePoliciesDetailed",
      "getEnrollmentConfigurationsDetailed",
      "getConditionalAccessPoliciesDetailed",
      "getAdditionalConfigurationSections",
    ])
      vi.spyOn(instance, method).mockResolvedValue([]);
    vi.spyOn(instance, "getScriptsDetailed").mockResolvedValue({
      windows: [],
      macOS: [],
    });
    return instance;
  }

  it("reads Entra policies in the Conditional Access step, outside sections", async () => {
    const instance = service();
    const identity = vi
      .spyOn(instance, "getTenantIdentityPolicies")
      .mockResolvedValue({
        securityDefaults: { isEnabled: true },
        status: { securityDefaults: "collected" },
      });
    vi.spyOn(instance, "getPolicyDeviceStatus").mockResolvedValue({
      collectedAt: "2026-10-18T00:00:00Z",
      sources: {
        configurationPolicies: "collected",
        compliancePolicies: "collected",
        deviceConfigurations: "collected",
      },
      rows: [],
    });
    const result = await instance.getAllDetailedConfigurations(true);
    expect(identity).toHaveBeenCalledOnce();
    expect(result.tenantIdentityPolicies.status.securityDefaults).toBe(
      "collected",
    );
    expect(result.policyDeviceStatus.sources.compliancePolicies).toBe(
      "collected",
    );
    expect(result.summary.totalConfigurations).toBe(0);
    expect(
      result.sections.map(
        (section: { familyKey: string }) => section.familyKey,
      ),
    ).not.toContain("authenticationMethodsPolicy");
  });

  it("skips Entra policies without Conditional Access and the annex on partial retries", async () => {
    const instance = service();
    const identity = vi.spyOn(instance, "getTenantIdentityPolicies");
    const status = vi
      .spyOn(instance, "getPolicyDeviceStatus")
      .mockResolvedValue(undefined);
    const full = await instance.getAllDetailedConfigurations(false);
    expect(identity).not.toHaveBeenCalled();
    expect(Object.values(full.tenantIdentityPolicies.status)).toEqual([
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(status).toHaveBeenCalledOnce();

    const retry = await instance.getAllDetailedConfigurations(false, [
      "Compliance Policies",
    ]);
    expect(status).toHaveBeenCalledOnce();
    expect(retry.policyDeviceStatus).toBeUndefined();
    expect(retry.tenantIdentityPolicies).toBeUndefined();
  });

  it("skips the annex with a recorded reason when the web budget is nearly used", async () => {
    const instance = service(15_000);
    const steps: string[] = [];
    instance.progressCallback = (event: { step: string; type: string }) =>
      steps.push(`${event.step}:${event.type}`);
    instance.client = client({});
    const result = await instance.getPolicyDeviceStatus();
    expect(Object.values(result.sources)).toEqual([
      "skipped",
      "skipped",
      "skipped",
    ]);
    expect(result.errors.configurationPolicies).toContain("time budget");
    expect(steps).toEqual(["Policy device status:error"]);
  });
});
