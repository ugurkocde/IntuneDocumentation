import { afterEach, describe, expect, it, vi } from "vitest";
import { labCollectionSections } from "./__fixtures__/lab-collection";

const sections = labCollectionSections();

vi.mock("../../../../src/lib/intune-detailed-client", () => ({
  DetailedIntuneService: class {
    async getAllDetailedConfigurations() {
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
