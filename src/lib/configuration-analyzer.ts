import {
  assignmentsIncomplete,
  itemFetchErrors,
  summarizeAssignments,
  UNASSIGNABLE_REGISTRY_KEYS,
} from "./compliance/assignments";
import { collectionFamilies } from "./compliance/coverage";
import { canonicalPlatforms, targetGroupId } from "./compliance/graph-rows";
import type {
  AssessmentScope,
  PolicyDeviceStatus,
  TenantIdentityPolicies,
} from "./compliance/types";
import type { BrandingOptions } from "~/types/branding";
import type { ConfigurationSectionData } from "./configuration-sections";

export interface DetailedExportData {
  collectedAt?: string;
  collectionStartedAt?: string;
  collectionSkippedFamilies?: string[];
  assessmentScope?: AssessmentScope;
  permissionErrors?: Array<{
    resource: string;
    message: string;
    requiredPermission: string;
  }>;
  sections?: ConfigurationSectionData[];
  fetchErrors?: Array<{
    policyId: string;
    policyName: string;
    policyType: string;
    familyKey?: string;
    error: string;
    statusCode?: number;
    endpoint?: string;
    permissionHint?: string;
    partial?: boolean;
  }>;
  settingsCatalog: any[];
  deviceConfigurations: any[];
  administrativeTemplates: any[];
  compliancePolicies: any[];
  appProtectionPolicies?: any[];
  securityBaselines: any[];
  scripts: {
    windows: any[];
    macOS: any[];
  };
  appConfigurations?: any[];
  windowsUpdatePolicies?: any[];
  enrollmentConfigurations?: any[];
  conditionalAccessPolicies?: any[];
  /** Entra tenant policies; never part of `sections`. */
  tenantIdentityPolicies?: TenantIdentityPolicies;
  /** Intune per-policy device status counts; an annex, never assessed. */
  policyDeviceStatus?: PolicyDeviceStatus;
  groupNames?: Map<string, string>;
  deviceCounts?: Record<string, number>;
  branding?: BrandingOptions;
  /**
   * Shortened id of the signed in tenant, for example "1a2b3c4d...", shown on
   * the cover and in the running header. Absent when the tenant is unknown.
   */
  tenantLabel?: string;
  includeComplianceEvidence?: boolean;
  /**
   * Opt in: documents part of a tenant, such as a single configuration or a
   * section. Absent for a full export, which keeps the default layout.
   */
  documentScope?: DocumentScope;
}

export interface DocumentScope {
  /** Cover title, for example the configuration or section name. */
  title?: string;
  /** Cover line under "Configuration Documentation". */
  subtitle?: string;
  /**
   * Leaves out the executive summary, the configuration inventory and the
   * table of contents, so a short document starts with the item details.
   */
  compact?: boolean;
}

export interface PolicyExportError {
  policyType: string;
  policyName: string;
  error: string;
}

export interface ExportGenerationResult {
  buffer: Uint8Array;
  errors: PolicyExportError[];
  totalPolicies: number;
  successfulPolicies: number;
}

export type ConfigurationAnalytics = ReturnType<typeof analyzeConfigurations>;

/** now is the reference time for the recent and stale counts. */
export function analyzeConfigurations(
  data: DetailedExportData,
  now: Date = new Date(),
) {
  const allConfigs = data.sections?.length
    ? data.sections.flatMap((section) => section.items)
    : [
        ...data.settingsCatalog,
        ...data.deviceConfigurations,
        ...data.administrativeTemplates,
        ...data.compliancePolicies,
        ...(data.appProtectionPolicies || []),
        ...data.securityBaselines,
        ...data.scripts.windows,
        ...data.scripts.macOS,
        ...(data.appConfigurations || []),
        ...(data.windowsUpdatePolicies || []),
        ...(data.enrollmentConfigurations || []),
        ...(data.conditionalAccessPolicies || []),
      ];

  // Registry types without an assignment relationship have no assignment coverage to assess.
  const nonAssignableKeys = UNASSIGNABLE_REGISTRY_KEYS;
  const nonAssignable = new Set([
    ...(data.conditionalAccessPolicies ?? []),
    ...(data.sections ?? [])
      .filter(
        (section) =>
          section.familyKey === "conditionalAccessPolicies" ||
          nonAssignableKeys.has(section.key),
      )
      .flatMap((section) => section.items),
  ]);
  const uniqueGroups = new Set<string>();
  const groupAssignmentCount: Record<string, number> = {};
  let assignedCount = 0;
  let unassignedCount = 0;
  let unknownCount = 0;
  // The family of every item, so its collection errors are matched as the
  // engine matches them (itemFetchErrors).
  const familyOf = new Map<unknown, string>();
  for (const { family, items } of collectionFamilies(data))
    for (const item of items) familyOf.set(item, family);
  const assignmentState = (config: any) =>
    nonAssignable.has(config) ||
    nonAssignableKeys.has(config.registryKey) ||
    config["@odata.type"] === "#microsoft.graph.conditionalAccessPolicy"
      ? "notApplicable"
      : summarizeAssignments(
          config.assignments,
          undefined,
          assignmentsIncomplete(
            config,
            itemFetchErrors(data.fetchErrors, config, familyOf.get(config)),
          ),
        ).state;
  const inventoryCounts = (items: any[]) => ({
    total: items.length,
    assigned: items.filter((item) => assignmentState(item) === "assigned")
      .length,
    unassigned: items.filter((item) => assignmentState(item) === "notAssigned")
      .length,
    unknown: items.filter((item) => assignmentState(item) === "unknown").length,
    notApplicable: items.filter(
      (item) => assignmentState(item) === "notApplicable",
    ).length,
  });

  allConfigs.forEach((config) => {
    const state = assignmentState(config);
    if (state === "assigned") {
      assignedCount++;
      config.assignments.forEach((assignment: any) => {
        const odataType =
          typeof assignment.target?.["@odata.type"] === "string"
            ? assignment.target["@odata.type"].toLowerCase()
            : "";

        if (odataType.includes("exclusiongroupassignmenttarget")) return;
        // A scope tag target names its group by entraObjectId.
        const groupId = targetGroupId(assignment.target);
        if (groupId) {
          uniqueGroups.add(groupId);
          groupAssignmentCount[groupId] =
            (groupAssignmentCount[groupId] || 0) + 1;
        } else if (odataType.includes("alllicensedusers")) {
          uniqueGroups.add("All Users");
          groupAssignmentCount["All Users"] =
            (groupAssignmentCount["All Users"] || 0) + 1;
        } else if (odataType.includes("alldevices")) {
          uniqueGroups.add("All Devices");
          groupAssignmentCount["All Devices"] =
            (groupAssignmentCount["All Devices"] || 0) + 1;
        }
      });
    } else if (state === "notAssigned") {
      unassignedCount++;
    } else if (state === "unknown") {
      unknownCount++;
    }
  });

  const platformCounts: Record<string, number> = {};

  const normalizePlatform = (platform: string): string => {
    if (typeof platform !== "string") return String(platform);
    const lower = platform.toLowerCase();
    if (lower.includes("windows")) return "Windows";
    if (lower.includes("mac")) return "macOS";
    if (lower.includes("ios")) return "iOS";
    if (lower.includes("android")) return "Android";
    if (lower.includes("linux")) return "Linux";
    return platform;
  };

  allConfigs.forEach((config) => {
    let platform: string | null = null;

    // A Settings Catalog policy counts once for each of its platforms, read
    // as documented members (compliance/graph-rows.ts canonicalPlatforms);
    // platforms of another shape name none.
    if (config.platforms) {
      const members = canonicalPlatforms(config.platforms)
        ?.split(",")
        .filter((member) => member !== "none")
        .map(normalizePlatform);
      for (const member of new Set(members))
        platformCounts[member] = (platformCounts[member] || 0) + 1;
    } else if (config.platformType) {
      platform = normalizePlatform(config.platformType);
    } else if (config["@odata.type"]) {
      const odataType = config["@odata.type"];
      if (typeof odataType === "string") {
        const type = odataType.toLowerCase();
        if (type.includes("windows")) platform = "Windows";
        else if (type.includes("mac")) platform = "macOS";
        else if (type.includes("ios")) platform = "iOS";
        else if (type.includes("android")) platform = "Android";
      }
    }

    if (platform) {
      platformCounts[platform] = (platformCounts[platform] || 0) + 1;
    }
  });

  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  let recentlyCreated = 0;
  let recentlyModified = 0;
  let staleConfigs = 0;

  allConfigs.forEach((config) => {
    if (config.createdDateTime) {
      const created = new Date(config.createdDateTime);
      if (created > sevenDaysAgo) recentlyCreated++;
    }
    if (config.lastModifiedDateTime) {
      const modified = new Date(config.lastModifiedDateTime);
      if (modified > thirtyDaysAgo) recentlyModified++;
      if (modified < ninetyDaysAgo) staleConfigs++;
    }
  });

  const topGroups = Object.entries(groupAssignmentCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  const inventory = data.sections?.length
    ? data.sections.map((section) => ({
        key: section.key,
        label: section.label,
        ...inventoryCounts(section.items),
      }))
    : [
        {
          key: "settingsCatalog",
          label: "Settings Catalog",
          items: data.settingsCatalog,
        },
        {
          key: "deviceConfigurations",
          label: "Device Configurations",
          items: data.deviceConfigurations,
        },
        {
          key: "administrativeTemplates",
          label: "Administrative Templates",
          items: data.administrativeTemplates,
        },
        {
          key: "compliancePolicies",
          label: "Compliance Policies",
          items: data.compliancePolicies,
        },
        {
          key: "appProtectionPolicies",
          label: "App Protection Policies",
          items: data.appProtectionPolicies || [],
        },
        {
          key: "securityBaselines",
          label: "Security Baselines",
          items: data.securityBaselines,
        },
        {
          key: "scriptsWindows",
          label: "Scripts (Windows)",
          items: data.scripts.windows,
        },
        {
          key: "scriptsMacOS",
          label: "Scripts (macOS)",
          items: data.scripts.macOS,
        },
        {
          key: "appConfigurations",
          label: "App Configurations",
          items: data.appConfigurations || [],
        },
        {
          key: "windowsUpdatePolicies",
          label: "Windows Update Policies",
          items: data.windowsUpdatePolicies || [],
        },
        {
          key: "enrollmentConfigurations",
          label: "Enrollment Configurations",
          items: data.enrollmentConfigurations || [],
        },
        {
          key: "conditionalAccessPolicies",
          label: "Conditional Access Policies",
          items: data.conditionalAccessPolicies || [],
        },
      ].map(({ key, label, items }) => ({
        key,
        label,
        ...inventoryCounts(items),
      }));

  return {
    totalConfigs: allConfigs.length,
    assignmentApplicableConfigs: assignedCount + unassignedCount + unknownCount,
    assignmentNotApplicableConfigs:
      allConfigs.length - assignedCount - unassignedCount - unknownCount,
    assignedConfigs: assignedCount,
    unassignedConfigs: unassignedCount,
    unknownAssignmentConfigs: unknownCount,
    uniqueGroupsCount: uniqueGroups.size,
    topGroups,
    platformCounts,
    recentlyCreated,
    recentlyModified,
    staleConfigs,
    inventory,
    byType: {
      settingsCatalog: data.settingsCatalog.length,
      deviceConfigurations: data.deviceConfigurations.length,
      administrativeTemplates: data.administrativeTemplates.length,
      compliancePolicies: data.compliancePolicies.length,
      appProtectionPolicies: (data.appProtectionPolicies || []).length,
      securityBaselines: data.securityBaselines.length,
      scriptsWindows: data.scripts.windows.length,
      scriptsMacOS: data.scripts.macOS.length,
    },
  };
}
