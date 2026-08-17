import { describe, expect, it, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";
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
      .mockRejectedValueOnce(new Error("temporary failure"))
      .mockRejectedValueOnce(new Error("temporary failure"))
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
