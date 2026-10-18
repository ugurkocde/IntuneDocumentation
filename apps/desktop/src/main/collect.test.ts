import { afterEach, describe, expect, it, vi } from "vitest";
import { labCollectionSections } from "./__fixtures__/lab-collection";

const sections = labCollectionSections();

// The digest the collector redacts with, as set by collectAll.
const digest = vi.hoisted(() => ({
  current: null as unknown,
  duringCollection: [] as unknown[],
}));

vi.mock("../../../../src/lib/intune-policy-registry", async (original) => ({
  ...(await original<object>()),
  setRedactionDigest: (value: unknown) => {
    digest.current = value;
  },
}));

vi.mock("../../../../src/lib/intune-detailed-client", () => ({
  DetailedIntuneService: class {
    async getAllDetailedConfigurations() {
      digest.duringCollection.push(digest.current);
      return {
        collectedAt: "2026-10-08T12:00:00.000Z",
        sections,
        fetchErrors: [
          {
            policyId: "depOnboardingSettings",
            policyName: "Apple ADE tokens",
            policyType: "enrollmentAndProvisioning",
            familyKey: "enrollmentAndProvisioning",
            error: "Partial",
          },
        ],
        permissionErrors: [],
        // The web app's own total, which the desktop app must not change.
        summary: { totalConfigurations: 818, byType: {} },
      };
    }
  },
}));

vi.mock("../../../../src/lib/pdf-page-estimate", () => ({
  estimatePdfPageCount: () => ({ pages: 10, isLarge: false }),
}));

const { clearCollection, collectAll, getSectionItems } = await import("./collect");

afterEach(clearCollection);

describe("collectAll summary", () => {
  it("adds the breakdown and display families without changing the total", async () => {
    const summary = await collectAll(async () => "token", () => undefined, { owner: "owner" });
    expect(summary.totalConfigurations).toBe(818);
    expect(summary.breakdown).toEqual({
      policies: 224,
      apps: 537,
      appsAssigned: 67,
      rbac: 45,
      microsoftDefaults: 23,
      microsoftDefaultsInRbac: 11,
    });
    expect(summary.sectionCounts.reduce((sum, section) => sum + section.count, 0)).toBe(818);
    expect(summary.sectionCounts.find((section) => section.key === "depOnboardingSettings")?.familyKey).toBe(
      "connectors",
    );
    expect(summary.fetchErrors[0]?.familyKey).toBe("connectors");
  });

  it("labels items with their display family and Microsoft default flag", async () => {
    await collectAll(async () => "token", () => undefined, { owner: "owner" });
    const catalog = getSectionItems("settingsCatalog", "owner");
    expect(catalog.items).toHaveLength(126);
    expect(catalog.items.filter((item) => item.familyKey === "endpointSecurityPolicies")).toHaveLength(28);
    const roles = getSectionItems("roleDefinitions", "owner");
    expect(roles.items.filter((item) => item.microsoftDefault)).toHaveLength(10);
    expect(getSectionItems("depOnboardingSettings", "owner").familyKey).toBe("connectors");
  });
});

describe("collectAll redaction digests", () => {
  it("keeps digests of redacted values only while history is on", async () => {
    digest.duringCollection = [];
    await collectAll(async () => "token", () => undefined, { owner: "owner" });
    await collectAll(async () => "token", () => undefined, { owner: "owner", keepDigests: false });
    await collectAll(async () => "token", () => undefined, { owner: "owner", keepDigests: true });
    expect(digest.duringCollection[0]).toBeNull();
    expect(digest.duringCollection[1]).toBeNull();
    expect(typeof digest.duringCollection[2]).toBe("function");
    // Nothing else, such as an export, digests afterwards.
    expect(digest.current).toBeNull();
  });
});
