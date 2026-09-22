import {
  DetailedIntuneService,
  type ProgressCallback,
} from "../../../../src/lib/intune-detailed-client";
import { IntuneService } from "../../../../src/lib/graph-client";

export interface DeviceConfigurationSummary {
  id: string;
  displayName: string;
  odataType: string;
}

export interface CollectionResult {
  count: number;
  errors: Array<{ source: string; message: string; statusCode?: number }>;
  items: DeviceConfigurationSummary[];
}

export interface FullCollectionSummary {
  collectedAt: string;
  totalConfigurations: number;
  sectionCounts: Array<{ key: string; label: string; count: number }>;
  fetchErrors: number;
  permissionErrors: number;
}

type FullCollection = Awaited<
  ReturnType<DetailedIntuneService["getAllDetailedConfigurations"]>
>;

let lastCollection: FullCollection | null = null;
let collectionOwner: string | null = null;
let collecting = false;

export function getLastCollection(): FullCollection | null {
  return lastCollection;
}

export function getCollectionOwner(): string | null {
  return collectionOwner;
}

export function isCollecting(): boolean {
  return collecting;
}

export function clearCollection(): void {
  lastCollection = null;
  collectionOwner = null;
}

export async function collectDeviceConfigurations(
  accessToken: string,
): Promise<CollectionResult> {
  const service = new IntuneService(accessToken);
  const items = await service.getDeviceConfigurations();
  return {
    count: items.length,
    errors: service.getFetchErrors(),
    items: items.map((item) => ({
      id: item.id,
      displayName: item.displayName,
      odataType: item["@odata.type"],
    })),
  };
}

export async function collectAll(
  accessToken: string,
  onProgress: ProgressCallback | undefined,
  options: { owner: string; signal?: AbortSignal; budgetMs?: number },
): Promise<FullCollectionSummary> {
  if (collecting) {
    throw new Error("A collection is already running.");
  }
  collecting = true;
  try {
    const service = new DetailedIntuneService(
      accessToken,
      onProgress,
      options.signal,
      options.budgetMs ?? 30 * 60_000,
    );
    const data = await service.getAllDetailedConfigurations(true);
    if (options.signal?.aborted) {
      throw new Error("Collection was cancelled.");
    }
    lastCollection = data;
    collectionOwner = options.owner;
    return {
      collectedAt: data.collectedAt,
      totalConfigurations: data.summary.totalConfigurations,
      sectionCounts: data.sections.map((section) => ({
        key: section.familyKey,
        label: section.label,
        count: section.items.length,
      })),
      fetchErrors: data.fetchErrors.length,
      permissionErrors: data.permissionErrors.length,
    };
  } finally {
    collecting = false;
  }
}
