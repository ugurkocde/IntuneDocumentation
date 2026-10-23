import { describe, expect, it, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";
import {
  assignmentsIncomplete,
  summarizeAssignments,
} from "../compliance/assignments";
import { defenderForEndpointPolicyFixture } from "./fixtures/intune-beta";

describe("Settings Catalog definition enrichment", () => {
  it("batches missing definitions and caches successful responses", async () => {
    const filters: string[] = [];
    const get = vi.fn(async () => ({
      value: [
        { id: "first", displayName: "First" },
        { id: "second", displayName: "Second" },
      ],
    }));
    const request = {
      version: vi.fn(() => request),
      filter: vi.fn((filter: string) => {
        filters.push(filter);
        return request;
      }),
      top: vi.fn(() => request),
      get,
    };
    const service = new DetailedIntuneService("test-token") as any;
    service.client = { api: vi.fn(() => request) };

    await expect(
      service.getConfigurationSettingDefinitions(["first", "second"]),
    ).resolves.toEqual([
      { id: "first", displayName: "First" },
      { id: "second", displayName: "Second" },
    ]);
    await service.getConfigurationSettingDefinitions(["first", "second"]);

    expect(filters).toEqual(["id eq 'first' or id eq 'second'"]);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("does not cache a failed batch as a permanent miss", async () => {
    const get = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("temporary failure"), { statusCode: 503 }),
      )
      .mockRejectedValueOnce(
        Object.assign(new Error("temporary failure"), { statusCode: 503 }),
      )
      .mockResolvedValueOnce({
        value: [{ id: "retryable", displayName: "Recovered" }],
      });
    const request = {
      version: vi.fn(() => request),
      filter: vi.fn(() => request),
      top: vi.fn(() => request),
      get,
    };
    const service = new DetailedIntuneService("test-token") as any;
    service.client = { api: vi.fn(() => request) };

    await expect(
      service.getConfigurationSettingDefinitions(["retryable"]),
    ).resolves.toEqual([]);
    await expect(
      service.getConfigurationSettingDefinitions(["retryable"]),
    ).resolves.toEqual([{ id: "retryable", displayName: "Recovered" }]);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it("caches a successful response that definitively omits an ID", async () => {
    const get = vi.fn(async () => ({ value: [] }));
    const request = {
      version: vi.fn(() => request),
      filter: vi.fn(() => request),
      top: vi.fn(() => request),
      get,
    };
    const service = new DetailedIntuneService("test-token") as any;
    service.client = { api: vi.fn(() => request) };

    await expect(
      service.getConfigurationSettingDefinitions(["not-found"]),
    ).resolves.toEqual([]);
    await expect(
      service.getConfigurationSettingDefinitions(["not-found"]),
    ).resolves.toEqual([]);
    expect(get).toHaveBeenCalledTimes(1);
  });
});

describe("Defender for Endpoint configuration policies", () => {
  it("keeps Defender-managed policies in the ordinary Settings Catalog collection", async () => {
    const policy = structuredClone(defenderForEndpointPolicyFixture);
    const responses = new Map<string, unknown>([
      [
        "/deviceManagement/configurationPolicies",
        {
          value: [
            {
              id: policy.id,
              name: policy.name,
              description: policy.description,
              platforms: policy.platforms,
              technologies: policy.technologies,
              createdDateTime: policy.createdDateTime,
              lastModifiedDateTime: policy.lastModifiedDateTime,
              settingCount: policy.settingCount,
              templateReference: policy.templateReference,
            },
          ],
        },
      ],
      [
        `/deviceManagement/configurationPolicies('${policy.id}')/settings`,
        { value: policy.settings },
      ],
      [
        `/deviceManagement/configurationPolicies('${policy.id}')/assignments`,
        { value: policy.assignments },
      ],
    ]);
    const requestedPaths: string[] = [];
    const service = new DetailedIntuneService("test-token") as any;

    service.client = {
      api: vi.fn((path: string) => {
        requestedPaths.push(path);
        const request = {
          version: vi.fn(() => request),
          select: vi.fn(() => request),
          top: vi.fn(() => request),
          expand: vi.fn(() => request),
          get: vi.fn(async () => {
            if (!responses.has(path)) {
              throw new Error(`Unexpected Microsoft Graph path: ${path}`);
            }
            return responses.get(path);
          }),
        };
        return request;
      }),
    };

    const result = await service.getConfigurationPoliciesWithSettings();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: policy.id,
      displayName: policy.name,
      configType: "Settings Catalog",
      technologies: "mdm,microsoftSense",
      templateReference: {
        templateFamily: "endpointSecurityAntivirus",
      },
    });
    expect(result[0]?.settings?.[0]).toMatchObject({
      settingInstance: {
        settingDefinitionId:
          "device_vendor_msft_policy_config_defender_excludedextensions",
        simpleSettingCollectionValue: [{ value: ".sample" }],
      },
      settingDefinitions: [{ displayName: "Excluded file extensions" }],
    });
    expect(result[0]?.assignments?.[0]?.target?.["@odata.type"]).toBe(
      "#microsoft.graph.allDevicesAssignmentTarget",
    );
    expect(requestedPaths).toEqual([
      "/deviceManagement/configurationPolicies",
      `/deviceManagement/configurationPolicies('${policy.id}')/settings`,
      `/deviceManagement/configurationPolicies('${policy.id}')/assignments`,
    ]);
  });
});

// A policy whose detail fetch failed outright keeps no assignments, so the
// collector marks them incomplete: the engine and the desktop list read
// unknown, never not assigned.
describe("policies whose detail fetch failed", () => {
  const collectors: Array<[string, (service: any) => Promise<any[]>]> = [
    ["device configurations", (s) => s.getDeviceConfigurationsDetailed()],
    ["compliance policies", (s) => s.getCompliancePoliciesDetailed()],
    ["app protection policies", (s) => s.getAppProtectionPoliciesDetailed()],
    ["security baselines", (s) => s.getSecurityBaselinesDetailed()],
    ["Windows scripts", (s) => s.getWindowsScriptsDetailed()],
    ["macOS scripts", (s) => s.getMacOSScriptsDetailed()],
    ["app configurations", (s) => s.getAppConfigurationsDetailed()],
  ];

  it.each(collectors)(
    "marks the assignments of %s incomplete",
    async (_family, collect) => {
      const service = new DetailedIntuneService("test-token") as any;
      const request: any = {
        version: vi.fn(() => request),
        select: vi.fn(() => request),
        top: vi.fn(() => request),
        expand: vi.fn(() => request),
        get: vi.fn(async () => ({
          value: [
            {
              "@odata.type": "#microsoft.graph.windows10GeneralConfiguration",
              id: "synthetic-policy",
              displayName: "Synthetic policy",
            },
          ],
        })),
      };
      service.client = { api: vi.fn(() => request) };
      const failure = new Error("Synthetic detail failure");
      service.readPolicyRelation = vi.fn().mockRejectedValue(failure);
      service.readPolicyDetails = vi.fn().mockRejectedValue(failure);
      service.readComplianceScheduledActions = vi
        .fn()
        .mockRejectedValue(failure);

      const items = await collect(service);

      expect(items.length).toBeGreaterThan(0);
      for (const item of items) {
        expect(item).toMatchObject({
          assignments: [],
          collectionStatus: { assignments: "incomplete" },
          hasFetchError: true,
          fetchErrorMessage: "Synthetic detail failure",
        });
        expect(assignmentsIncomplete(item)).toBe(true);
        expect(
          summarizeAssignments(item.assignments, undefined, true).state,
        ).toBe("unknown");
      }
    },
  );
});

// Settings Catalog policies and Administrative Templates read their parts
// one by one. A Settings Catalog settings request that fails without its
// expanded form, or an Administrative Template failure after its reads
// (here the first collection error record), still marks the assignments
// incomplete.
describe("Settings Catalog and Administrative Template detail failures", () => {
  it.each([
    [
      "Settings Catalog",
      "/deviceManagement/configurationPolicies",
      (s: any) => s.getConfigurationPoliciesWithSettings(),
      false,
    ],
    [
      "Administrative Templates",
      "/deviceManagement/groupPolicyConfigurations",
      (s: any) => s.getGroupPolicyConfigurationsDetailed(),
      true,
    ],
  ])(
    "marks the assignments of %s incomplete",
    async (_family, listPath, collect, failRecord) => {
      const service = new DetailedIntuneService("test-token") as any;
      service.client = {
        api: vi.fn((path: string) => {
          const request: any = {
            version: vi.fn(() => request),
            select: vi.fn(() => request),
            top: vi.fn(() => request),
            expand: vi.fn(() => request),
            filter: vi.fn(() => request),
            get: vi.fn(async () => {
              if (path === listPath)
                return {
                  value: [
                    {
                      id: "synthetic-policy",
                      name: "Synthetic policy",
                      displayName: "Synthetic policy",
                    },
                  ],
                };
              throw Object.assign(new Error("Synthetic denied"), {
                statusCode: 403,
              });
            }),
          };
          return request;
        }),
      };
      const push = service.fetchErrors.push.bind(service.fetchErrors);
      let failed = !failRecord;
      service.fetchErrors.push = (...entries: unknown[]) => {
        if (!failed) {
          failed = true;
          throw new Error("Synthetic detail failure");
        }
        return push(...entries);
      };

      const [item] = await collect(service);

      expect(failed).toBe(true);
      expect(service.fetchErrors.length).toBeGreaterThan(0);
      expect(item).toMatchObject({
        assignments: [],
        collectionStatus: { assignments: "incomplete", settings: "incomplete" },
        hasFetchError: true,
      });
      expect(assignmentsIncomplete(item)).toBe(true);
    },
  );
});
