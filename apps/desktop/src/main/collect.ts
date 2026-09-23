import {
  DetailedIntuneService,
  type ProgressCallback,
} from "../../../../src/lib/intune-detailed-client";
import type { TokenProvider } from "../../../../src/lib/graph-client";
import {
  getItemLabel,
  getStableItemId,
} from "../../../../src/lib/configuration-sections";
import { estimatePdfPageCount } from "../../../../src/lib/pdf-page-estimate";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import type {
  FullCollectionSummary,
  PdfEstimate,
  SectionItemSummary,
  SectionItemsResult,
} from "../shared/ipc-types";

type FullCollection = Awaited<
  ReturnType<DetailedIntuneService["getAllDetailedConfigurations"]>
>;

let lastCollection: FullCollection | null = null;
let lastSummary: FullCollectionSummary | null = null;
let collectionOwner: string | null = null;
let collecting = false;

export function getLastCollection(): FullCollection | null {
  return lastCollection;
}

export function getCollectionOwner(): string | null {
  return collectionOwner;
}

// Lets a reloaded renderer show the collection main still holds.
export function getLastSummary(owner: string | null): FullCollectionSummary | null {
  return owner && collectionOwner === owner ? lastSummary : null;
}

export function clearCollection(): void {
  lastCollection = null;
  lastSummary = null;
  collectionOwner = null;
}

function estimate(data: FullCollection): PdfEstimate | null {
  try {
    const withEvidence = estimatePdfPageCount(
      data as unknown as DetailedExportData,
    );
    const without = estimatePdfPageCount({
      ...(data as unknown as DetailedExportData),
      includeComplianceEvidence: false,
    });
    return {
      pages: withEvidence.pages,
      pagesWithoutEvidence: without.pages,
      isLarge: withEvidence.isLarge,
    };
  } catch {
    return null;
  }
}

export async function collectAll(
  accessToken: TokenProvider,
  onProgress: (
    event: Parameters<ProgressCallback>[0],
    loaded: number,
  ) => void,
  options: { owner: string; signal?: AbortSignal; budgetMs?: number },
): Promise<FullCollectionSummary> {
  if (collecting) {
    throw new Error("A collection is already running.");
  }
  collecting = true;
  let loaded = 0;
  try {
    const service = new DetailedIntuneService(
      accessToken,
      (event) => {
        if (event.type === "section" && event.section) {
          loaded += event.section.items.length;
        }
        onProgress(event, loaded);
      },
      options.signal,
      options.budgetMs ?? 30 * 60_000,
    );
    const data = await service.getAllDetailedConfigurations(true);
    if (options.signal?.aborted) {
      throw new Error("Collection was cancelled.");
    }
    const summary: FullCollectionSummary = {
      collectedAt: data.collectedAt,
      totalConfigurations: data.summary.totalConfigurations,
      sectionCounts: data.sections.map((section) => ({
        key: section.key,
        familyKey: section.familyKey,
        label: section.label,
        count: section.items.length,
        ...(section.error ? { error: section.error.message } : {}),
      })),
      fetchErrors: data.fetchErrors.map((error) => ({
        policyName: error.policyName,
        policyType: error.policyType,
        familyKey: error.familyKey,
        error: error.error,
        permissionHint: error.permissionHint,
      })),
      permissionErrors: data.permissionErrors.map((error) => ({
        resource: error.resource,
        requiredPermission: error.requiredPermission,
        message: error.message,
      })),
      pdfEstimate: estimate(data),
    };
    lastCollection = data;
    lastSummary = summary;
    collectionOwner = options.owner;
    return summary;
  } finally {
    collecting = false;
  }
}

function text(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value;
  if (Array.isArray(value)) {
    const parts = value.filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    );
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function summarizeItem(
  section: { key: string; label: string },
  item: Record<string, unknown>,
  index: number,
): SectionItemSummary {
  const assignments = Array.isArray(item.assignments)
    ? (item.assignments as Array<{ target?: Record<string, unknown> }>)
    : null;
  const targetType = (assignment: { target?: Record<string, unknown> }) =>
    String(assignment.target?.["@odata.type"] ?? "");
  const included = assignments?.filter(
    (assignment) => !targetType(assignment).includes("exclusion"),
  );
  return {
    id: getStableItemId(section, item, index),
    displayName: getItemLabel(section, item),
    odataType: text(item["@odata.type"]),
    description: text(item.description),
    platforms: text(item.platforms) ?? text(item.platformType),
    technologies: text(item.technologies),
    lastModifiedDateTime: text(item.lastModifiedDateTime),
    assignmentCount: included
      ? included.filter((assignment) => assignment.target?.groupId).length
      : null,
    assignedToAllUsers: Boolean(
      included?.some((assignment) =>
        targetType(assignment).includes("allLicensedUsers"),
      ),
    ),
    assignedToAllDevices: Boolean(
      included?.some((assignment) =>
        targetType(assignment).includes("allDevices"),
      ),
    ),
    hasFetchError: item.hasFetchError === true,
  };
}

// Returns display metadata only; full settings never leave the main process.
export function getSectionItems(
  key: string,
  owner: string | null,
): SectionItemsResult {
  if (!lastCollection || !owner || collectionOwner !== owner) {
    throw new Error("Collect tenant data first.");
  }
  const section = lastCollection.sections.find((entry) => entry.key === key);
  if (!section) {
    throw new Error("This section is not part of the last collection.");
  }
  return {
    key: section.key,
    familyKey: section.familyKey,
    label: section.label,
    error: section.error?.message ?? null,
    items: section.items.map((item, index) =>
      summarizeItem(section, item as Record<string, unknown>, index),
    ),
  };
}
