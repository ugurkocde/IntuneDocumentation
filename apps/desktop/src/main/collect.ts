import {
  DetailedIntuneService,
  type ProgressCallback,
} from "../../../../src/lib/intune-detailed-client";
import type { TokenProvider } from "../../../../src/lib/graph-client";
import {
  getItemLabel,
  getStableItemId,
} from "../../../../src/lib/configuration-sections";
import { setRedactionDigest } from "../../../../src/lib/intune-policy-registry";
import { estimatePdfPageCount } from "../../../../src/lib/pdf-page-estimate";
import { contentDigest } from "../../../../src/lib/snapshots/projection";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import {
  assignmentsIncomplete,
  itemFetchErrors,
  resolveAssignments,
} from "../../../../src/lib/compliance/assignments";
import { canonicalPlatforms } from "../../../../src/lib/compliance/graph-rows";
import {
  classifyItem,
  collectionBreakdown,
  errorFamilyKey,
  sectionCount,
  sectionFamilyKey,
  sectionLabel,
} from "./classify";
import type {
  AssignmentTargets,
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

// Configuration exports from the desktop app never include compliance
// evidence, so neither does the estimate.
function estimate(data: FullCollection): PdfEstimate | null {
  try {
    const result = estimatePdfPageCount({
      ...(data as unknown as DetailedExportData),
      includeComplianceEvidence: false,
    });
    return { pages: result.pages, isLarge: result.isLarge };
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
  // keepDigests is set while history is on: the collector then keeps a
  // digest of each value it redacts, so history can tell that a script or
  // secret changed without storing it. The digests stay in main and are
  // keyed before a snapshot keeps them.
  options: { owner: string; signal?: AbortSignal; budgetMs?: number; keepDigests?: boolean },
): Promise<FullCollectionSummary> {
  if (collecting) {
    throw new Error("A collection is already running.");
  }
  collecting = true;
  let loaded = 0;
  setRedactionDigest(options.keepDigests ? contentDigest : null);
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
      sectionCounts: data.sections.map(sectionCount),
      breakdown: collectionBreakdown(data.sections),
      fetchErrors: data.fetchErrors.map((error) => ({
        policyName: error.policyName,
        policyType: error.policyType,
        familyKey: errorFamilyKey(data.sections, error),
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
    setRedactionDigest(null);
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
  section: { key: string; familyKey: string; label: string },
  item: Record<string, unknown>,
  index: number,
  fetchErrors: FullCollection["fetchErrors"],
): SectionItemSummary {
  const classification = classifyItem(section, item);
  const incomplete = assignmentsIncomplete(
    item,
    itemFetchErrors(fetchErrors, item, section.familyKey),
    section.familyKey,
  );
  // A type with assignments whose assignments were not collected, or that
  // Graph returned as no list or a value that is not one, reads unknown
  // rather than as a type without assignments or as not assigned.
  const assignments = Array.isArray(item.assignments) ? (item.assignments as unknown[]) : incomplete ? [] : null;
  return {
    id: getStableItemId(section, item, index),
    displayName: getItemLabel(section, item),
    odataType: text(item["@odata.type"]),
    description: text(item.description),
    // Settings Catalog platforms in canonical form (graph-rows.ts); a value
    // that is no set of documented members names no platform.
    platforms: item.platforms != null ? canonicalPlatforms(item.platforms) : text(item.platformType),
    technologies: text(item.technologies),
    lastModifiedDateTime: text(item.lastModifiedDateTime),
    ...assignmentTargets(assignments, incomplete),
    hasFetchError: item.hasFetchError === true,
    familyKey: classification.familyKey,
    ...(classification.microsoftDefault ? { microsoftDefault: true } : {}),
  };
}

/**
 * What a policy is assigned to: the targets it applies to after its
 * exclusions (case insensitive group ids) and removal intents, read by the
 * engine's resolveAssignments, so the list, search and the engine count the
 * same targets. An assignment of an undocumented type, intent or without
 * what its type targets, or assignments that were not fully collected
 * (assignmentsIncomplete, as the engine reads it), leave the targeting
 * unknown rather than read as not assigned.
 */
export function assignmentTargets(
  assignments: unknown[] | null,
  incomplete: boolean,
): AssignmentTargets {
  const targets: AssignmentTargets = {
    assignmentCount: null,
    assignmentUnknown: false,
    assignedToAllUsers: false,
    assignedToAllDevices: false,
    assignedToCollections: 0,
    assignedToOrganizationalUnits: 0,
  };
  if (!assignments) return targets;
  const resolved = resolveAssignments(assignments, undefined, incomplete);
  targets.assignmentUnknown = resolved.state === "unknown";
  targets.assignmentCount = 0;
  for (const { type } of resolved.effective) {
    if (type === "alllicensedusersassignmenttarget")
      targets.assignedToAllUsers = true;
    else if (type === "alldevicesassignmenttarget")
      targets.assignedToAllDevices = true;
    else if (
      type === "groupassignmenttarget" ||
      type === "scopetaggroupassignmenttarget"
    )
      targets.assignmentCount += 1;
    else if (type === "configurationmanagercollectionassignmenttarget")
      targets.assignedToCollections += 1;
    else if (type === "organizationalunitassignmenttarget")
      targets.assignedToOrganizationalUnits += 1;
  }
  return targets;
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
  const fetchErrors = lastCollection.fetchErrors;
  return {
    key: section.key,
    familyKey: sectionFamilyKey(section),
    label: sectionLabel(section),
    error: section.error?.message ?? null,
    items: section.items.map((item, index) =>
      summarizeItem(section, item as Record<string, unknown>, index, fetchErrors),
    ),
  };
}
