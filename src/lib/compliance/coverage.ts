import type { DetailedExportData } from "../configuration-analyzer";
import { assignmentsIncomplete, itemFetchErrors } from "./assignments";
import type {
  CapabilityResult,
  CollectionCoverage,
  ComplianceCapability,
} from "./types";
import {
  tenantPolicyCoverage,
  tenantPolicyNames,
  TENANT_POLICY_FAMILIES,
} from "./tenant-policies";

/** The collected items of every collection family, by family key. */
export function collectionFamilies(
  data: Omit<DetailedExportData, "groupNames">,
) {
  if (data.sections?.length)
    return data.sections.map((section) => ({
      family: section.familyKey,
      items: section.items,
      error: section.error?.message,
    }));
  return [
    ...[
      "settingsCatalog",
      "deviceConfigurations",
      "administrativeTemplates",
      "compliancePolicies",
      "appProtectionPolicies",
      "securityBaselines",
      "appConfigurations",
      "windowsUpdatePolicies",
      "enrollmentConfigurations",
      "conditionalAccessPolicies",
    ].map((family) => ({
      family,
      items: (data as any)[family] ?? [],
      error: undefined as string | undefined,
    })),
    {
      family: "scripts",
      items: [...(data.scripts?.windows ?? []), ...(data.scripts?.macOS ?? [])],
      error: undefined,
    },
  ];
}

export function collectConfigurations(
  data: Omit<DetailedExportData, "groupNames">,
): Record<string, any>[] {
  return collectionFamilies(data).flatMap(({ family, items }) =>
    items
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => {
        const incomplete = assignmentsIncomplete(
          item,
          itemFetchErrors(data.fetchErrors, item, family),
          family,
        );
        return {
          ...item,
          ...(family === "conditionalAccessPolicies"
            ? { "@odata.type": "#microsoft.graph.conditionalAccessPolicy" }
            : {}),
          ...(incomplete
            ? {
                collectionStatus: {
                  ...item.collectionStatus,
                  assignments: "incomplete",
                },
              }
            : {}),
          __evidenceFamily: family,
        };
      }),
  );
}

export function buildCollectionCoverage(
  data: Omit<DetailedExportData, "groupNames">,
  capabilities: readonly CapabilityResult[],
  evidenceOnly = false,
): CollectionCoverage[] {
  const rows = new Map<string, CollectionCoverage>();
  const evidence = new Set(
    capabilities.flatMap((result) =>
      result.evidence.map((item) => `${item.familyKey}:${item.policyId}`),
    ),
  );
  for (const { family, items, error } of collectionFamilies(data)) {
    const row = rows.get(family) ?? {
      family,
      collectedPolicies: 0,
      recognizedPolicies: 0,
      unsupportedPolicies: 0,
      status: data.collectedAt ? "complete" : "unknown",
      errors: [],
    };
    row.collectedPolicies += items.length;
    const recognized = items.filter((item: any) =>
      evidence.has(`${family}:${item.id}`),
    ).length;
    row.recognizedPolicies += recognized;
    row.unsupportedPolicies += items.length - recognized;
    if (error) row.errors.push(error);
    for (const item of items) {
      const incompleteParts = Object.entries(item.collectionStatus ?? {})
        .filter(
          ([part, status]) =>
            status === "incomplete" &&
            (!evidenceOnly ||
              !["scheduledActionsForRule", "apps", "categories"].includes(
                part,
              )),
        )
        .map(([part]) => part);
      if (
        (item.hasFetchError &&
          (!evidenceOnly ||
            !Object.entries(item.collectionStatus ?? {}).some(
              ([part, status]) =>
                status === "incomplete" &&
                ["scheduledActionsForRule", "apps", "categories"].includes(
                  part,
                ),
            ))) ||
        incompleteParts.length
      )
        row.errors.push(
          `${item.displayName ?? item.name ?? item.id}: ${item.fetchErrorMessage ?? `incomplete ${incompleteParts.join(", ") || "policy details"}`}`,
        );
    }
    rows.set(family, row);
  }
  for (const error of data.fetchErrors ?? []) {
    // Ancillary relation warnings remain visible in the collection report, but
    // do not invalidate settings or assignment evidence already collected.
    if (
      evidenceOnly &&
      /scheduledActionsForRule|scheduledActionConfigurations|\/(?:apps|categories)(?:[/?]|$)|[?&]\$expand=categories(?:&|$)/i.test(
        error.endpoint ?? "",
      )
    )
      continue;
    const normalizeFamily = (value: string) =>
      value
        .toLowerCase()
        .replace(/[^a-z]/g, "")
        .replace(/ies$/, "y")
        .replace(/s$/, "");
    const family =
      error.familyKey ??
      [...rows.keys()].find(
        (key) => normalizeFamily(key) === normalizeFamily(error.policyType),
      ) ??
      error.policyType;
    const row = rows.get(family) ?? {
      family,
      collectedPolicies: 0,
      recognizedPolicies: 0,
      unsupportedPolicies: 0,
      status: "incomplete",
      errors: [],
    };
    row.errors.push(`${error.policyName}: ${error.error}`);
    rows.set(family, row);
  }
  for (const error of data.permissionErrors ?? []) {
    const row = [...rows.values()].find(
      (candidate) =>
        candidate.family.toLowerCase().replace(/[^a-z]/g, "") ===
        error.resource.toLowerCase().replace(/[^a-z]/g, ""),
    );
    if (row) row.errors.push(error.message);
    else
      rows.set(error.resource, {
        family: error.resource,
        collectedPolicies: 0,
        recognizedPolicies: 0,
        unsupportedPolicies: 0,
        status: "incomplete",
        errors: [error.message],
      });
  }
  for (const row of tenantPolicyCoverage(data, evidence))
    rows.set(row.family, row);
  for (const row of rows.values()) {
    if (TENANT_POLICY_FAMILY_KEYS.has(row.family)) continue;
    if (row.errors.length) row.status = "incomplete";
    else if (data.collectionSkippedFamilies?.includes(row.family))
      row.status = "notCollected";
    row.errors = [...new Set(row.errors)];
  }
  return [...rows.values()];
}

export function isCapabilityCollectionIncomplete(
  data: Omit<DetailedExportData, "groupNames">,
  capability: ComplianceCapability,
): boolean {
  return capabilityCollectionGaps(data, capability).length > 0;
}

const TENANT_POLICY_FAMILY_KEYS = new Set(
  Object.values(TENANT_POLICY_FAMILIES),
);

export function capabilityCollectionGaps(
  data: Omit<DetailedExportData, "groupNames">,
  capability: ComplianceCapability,
): CollectionCoverage[] {
  const policies = tenantPolicyNames(capability);
  // Entra tenant policies are read on their own, never from sections.
  if (policies.length) {
    const families = policies.map((name) => TENANT_POLICY_FAMILIES[name]);
    return tenantPolicyCoverage(data, new Set(), true).filter(
      (row) =>
        families.includes(row.family) &&
        ["incomplete", "notCollected"].includes(row.status),
    );
  }
  const relevant =
    capability.platform === "tenant"
      ? ["conditionalAccessPolicies"]
      : [
          "settingsCatalog",
          "deviceConfigurations",
          "administrativeTemplates",
          "securityBaselines",
          "compliancePolicies",
          ...(capability.id.includes("update")
            ? ["windowsUpdatePolicies"]
            : []),
          ...(capability.id.includes("app-data")
            ? ["appProtectionPolicies"]
            : []),
        ];
  return buildCollectionCoverage(data, [], true).filter(
    (row) =>
      relevant.includes(row.family) &&
      ["incomplete", "notCollected"].includes(row.status),
  );
}
