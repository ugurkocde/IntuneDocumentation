import type { DetailedExportData } from "../configuration-analyzer";
import type {
  CapabilityResult,
  CollectionCoverage,
  ComplianceCapability,
} from "./types";

function families(data: Omit<DetailedExportData, "groupNames">) {
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
  return families(data).flatMap(({ family, items }) =>
    items
      .filter((item: any) => item && typeof item === "object")
      .map((item: any) => {
        const errors =
          data.fetchErrors?.filter(
            (error) =>
              error.policyId === item.id &&
              (!error.familyKey || error.familyKey === family),
          ) ?? [];
        const assignmentsIncomplete =
          (item.hasFetchError && !item.collectionStatus) ||
          errors.some((error) =>
            /assignments/i.test(`${error.endpoint ?? ""} ${error.error}`),
          );
        return {
          ...item,
          ...(family === "conditionalAccessPolicies"
            ? { "@odata.type": "#microsoft.graph.conditionalAccessPolicy" }
            : {}),
          ...(assignmentsIncomplete
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
): CollectionCoverage[] {
  const rows = new Map<string, CollectionCoverage>();
  const evidence = new Set(
    capabilities.flatMap((result) =>
      result.evidence.map((item) => `${item.familyKey}:${item.policyId}`),
    ),
  );
  for (const { family, items, error } of families(data)) {
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
        .filter(([, status]) => status === "incomplete")
        .map(([part]) => part);
      if (item.hasFetchError || incompleteParts.length)
        row.errors.push(
          `${item.displayName ?? item.name ?? item.id}: ${item.fetchErrorMessage ?? `incomplete ${incompleteParts.join(", ") || "policy details"}`}`,
        );
    }
    rows.set(family, row);
  }
  for (const error of data.fetchErrors ?? []) {
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
  for (const row of rows.values()) {
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
  return buildCollectionCoverage(data, []).some(
    (row) =>
      relevant.includes(row.family) &&
      ["incomplete", "notCollected"].includes(row.status),
  );
}
