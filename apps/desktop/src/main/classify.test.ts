import { describe, expect, it } from "vitest";
import { labCollectionSections } from "./__fixtures__/lab-collection";
import {
  classifyItem,
  collectionBreakdown,
  ENDPOINT_SECURITY_FAMILY,
  errorFamilyKey,
  isMicrosoftDefault,
  itemFamilyKey,
  SECURITY_BASELINE_FAMILY,
  sectionCount,
} from "./classify";
import { familyCounts, sectionsForFamily } from "../renderer/lib/section-catalog";

const sections = labCollectionSections();
const total = sections.reduce((sum, section) => sum + section.items.length, 0);
const counts = sections.map(sectionCount);

describe("collection classification", () => {
  it("uses a fixture with the lab tenant total", () => {
    expect(total).toBe(818);
  });

  it("splits Settings Catalog by template family", () => {
    const section = { key: "settingsCatalog", familyKey: "settingsCatalog" };
    const family = (templateFamily: unknown) => itemFamilyKey(section, { templateReference: { templateFamily } });
    expect(family("none")).toBe("settingsCatalog");
    expect(family("deviceConfigurationScripts")).toBe("settingsCatalog");
    expect(family("baseline")).toBe(SECURITY_BASELINE_FAMILY);
    expect(family("endpointSecurityFirewall")).toBe(ENDPOINT_SECURITY_FAMILY);
    expect(family("endpointSecurityEndpointPrivilegeManagement")).toBe(ENDPOINT_SECURITY_FAMILY);
    expect(family(undefined)).toBe("settingsCatalog");
    expect(itemFamilyKey(section, null)).toBe("settingsCatalog");

    const catalog = counts.find((entry) => entry.key === "settingsCatalog");
    expect(catalog?.count).toBe(126);
    expect(catalog?.families).toEqual([
      { familyKey: "settingsCatalog", count: 96 },
      { familyKey: ENDPOINT_SECURITY_FAMILY, count: 28 },
      { familyKey: SECURITY_BASELINE_FAMILY, count: 2 },
    ]);
  });

  it("only splits Settings Catalog policies", () => {
    expect(
      itemFamilyKey({ key: "deviceConfigurations", familyKey: "deviceConfigurations" }, {
        templateReference: { templateFamily: "baseline" },
      }),
    ).toBe("deviceConfigurations");
  });

  it("files the Apple ADE token under connectors and renames the legacy intents", () => {
    const ade = counts.find((entry) => entry.key === "depOnboardingSettings");
    expect(ade?.familyKey).toBe("connectors");
    const intents = counts.find((entry) => entry.key === "securityBaselines");
    expect(intents?.familyKey).toBe("securityBaselines");
    expect(intents?.label).toBe("Endpoint security (legacy templates)");
    expect(intents?.label).not.toMatch(/baseline/i);
  });

  it("recognises every kind of Microsoft default", () => {
    expect(isMicrosoftDefault("roleDefinitions", { isBuiltIn: true })).toBe(true);
    expect(isMicrosoftDefault("roleDefinitions", { isBuiltIn: false })).toBe(false);
    expect(isMicrosoftDefault("roleScopeTags", { id: "0", isBuiltIn: true })).toBe(true);
    expect(isMicrosoftDefault("roleScopeTags", { id: "0" })).toBe(true);
    expect(isMicrosoftDefault("roleScopeTags", { id: "3", isBuiltIn: false })).toBe(false);
    expect(isMicrosoftDefault("enrollmentConfigurations", { id: "abc_DefaultLimit" })).toBe(true);
    expect(isMicrosoftDefault("enrollmentConfigurations", { id: "abc_WindowsRestore" })).toBe(true);
    expect(
      isMicrosoftDefault("enrollmentConfigurations", { id: "abc_Windows10EnrollmentCompletionPageConfiguration" }),
    ).toBe(false);
    expect(isMicrosoftDefault("deviceManagementSettings", {})).toBe(true);
    expect(isMicrosoftDefault("androidForWorkSettings", {})).toBe(true);
    expect(isMicrosoftDefault("deviceHealthScripts", { isGlobalScript: true, publisher: "Microsoft" })).toBe(true);
    // An administrator can type Microsoft as the publisher of their own script.
    expect(isMicrosoftDefault("deviceHealthScripts", { isGlobalScript: false, publisher: "Microsoft" })).toBe(false);
    expect(isMicrosoftDefault("deviceManagementPartners", { isConfigured: false })).toBe(true);
    expect(isMicrosoftDefault("deviceManagementPartners", { isConfigured: true })).toBe(false);
    expect(isMicrosoftDefault("remoteAssistancePartners", { onboardingStatus: "notOnboarded" })).toBe(true);
    expect(isMicrosoftDefault("remoteAssistancePartners", { onboardingStatus: "onboarded" })).toBe(false);
    expect(isMicrosoftDefault("mobileThreatDefenseConnectors", { partnerState: "unresponsive" })).toBe(false);
    expect(isMicrosoftDefault("deviceConfigurations", {})).toBe(false);
  });

  it("keeps built in RBAC items in RBAC so they are subtracted once", () => {
    const role = classifyItem({ key: "roleDefinitions", familyKey: "assignmentAndRbac" }, { isBuiltIn: true });
    expect(role).toMatchObject({ bucket: "rbac", microsoftDefault: true });
    const tag = classifyItem({ key: "roleScopeTags", familyKey: "assignmentAndRbac" }, { id: "0" });
    expect(tag).toMatchObject({ bucket: "rbac", microsoftDefault: true });
    const app = classifyItem({ key: "mobileApps", familyKey: "applications" }, { isAssigned: false });
    expect(app.bucket).toBe("app");
    const remediation = classifyItem(
      { key: "deviceHealthScripts", familyKey: "scriptsAndRemediations" },
      { isGlobalScript: true },
    );
    expect(remediation.bucket).toBe("microsoftDefault");
  });

  it("computes the lab tenant breakdown", () => {
    const breakdown = collectionBreakdown(sections);
    expect(breakdown).toEqual({
      policies: 224,
      apps: 537,
      appsAssigned: 67,
      rbac: 45,
      microsoftDefaults: 23,
      microsoftDefaultsInRbac: 11,
    });
    expect(breakdown.policies).toBe(
      total - breakdown.apps - breakdown.rbac - (breakdown.microsoftDefaults - breakdown.microsoftDefaultsInRbac),
    );
  });

  it("keeps family totals equal to the section totals", () => {
    const families = familyCounts(counts);
    const familyTotal = Object.values(families).reduce((sum, count) => sum + count, 0);
    expect(familyTotal).toBe(total);
    expect(counts.reduce((sum, entry) => sum + entry.count, 0)).toBe(total);
    expect(families).toMatchObject({
      settingsCatalog: 96,
      [ENDPOINT_SECURITY_FAMILY]: 28,
      [SECURITY_BASELINE_FAMILY]: 2,
      securityBaselines: 1,
      applications: 537,
      assignmentAndRbac: 45,
      connectors: 5,
      enrollmentConfigurations: 6,
    });
    expect(families.enrollmentAndProvisioning).toBeUndefined();
  });

  it("counts Microsoft defaults per section", () => {
    const defaults = Object.fromEntries(counts.map((entry) => [entry.key, entry.microsoftDefaults ?? 0]));
    expect(defaults).toMatchObject({
      roleDefinitions: 10,
      roleScopeTags: 1,
      enrollmentConfigurations: 5,
      deviceManagementSettings: 1,
      androidForWorkSettings: 1,
      deviceHealthScripts: 2,
      deviceManagementPartners: 1,
      remoteAssistancePartners: 2,
      mobileThreatDefenseConnectors: 0,
      settingsCatalog: 0,
    });
  });

  it("shows a split section under each of its families", () => {
    const endpoint = sectionsForFamily(counts, ENDPOINT_SECURITY_FAMILY);
    expect(endpoint).toHaveLength(1);
    expect(endpoint[0]).toMatchObject({ key: "settingsCatalog", count: 28, itemFamilyKey: ENDPOINT_SECURITY_FAMILY });
    expect(sectionsForFamily(counts, "settingsCatalog")[0]).toMatchObject({ key: "settingsCatalog", count: 96 });
    expect(sectionsForFamily(counts, "connectors").map((entry) => entry.key)).toContain("depOnboardingSettings");
  });

  it("keeps a section load error on its own family only", () => {
    const [catalog] = labCollectionSections();
    const withError = sectionCount({ ...catalog!, error: { message: "Partial" } });
    expect(sectionsForFamily([withError], "settingsCatalog")[0]?.error).toBe("Partial");
    expect(sectionsForFamily([withError], ENDPOINT_SECURITY_FAMILY)[0]?.error).toBeUndefined();
  });

  it("shows a fetch error under the family of the failed item", () => {
    const failed = { familyKey: "settingsCatalog" };
    expect(
      errorFamilyKey(sections, { ...failed, policyId: "catalog-endpointSecurityEndpointPrivilegeManagement-0" }),
    ).toBe(ENDPOINT_SECURITY_FAMILY);
    expect(errorFamilyKey(sections, { ...failed, policyId: "catalog-baseline-0" })).toBe(SECURITY_BASELINE_FAMILY);
    expect(errorFamilyKey(sections, { ...failed, policyId: "collection-settingsCatalog" })).toBe("settingsCatalog");
    expect(errorFamilyKey(sections, { policyId: "depOnboardingSettings", familyKey: "enrollmentAndProvisioning" })).toBe(
      "connectors",
    );
    expect(errorFamilyKey(sections, { policyId: "x" })).toBeUndefined();
  });
});
