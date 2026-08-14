import { describe, expect, it, vi } from "vitest";
import { DetailedIntuneService } from "../intune-detailed-client";

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
