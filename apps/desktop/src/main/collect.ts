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
  sectionCounts: Array<{ label: string; count: number }>;
  fetchErrors: number;
  permissionErrors: number;
}

type FullCollection = Awaited<
  ReturnType<DetailedIntuneService["getAllDetailedConfigurations"]>
>;

let lastCollection: FullCollection | null = null;

export function getLastCollection(): FullCollection | null {
  return lastCollection;
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
  onProgress?: ProgressCallback,
): Promise<FullCollectionSummary> {
  const service = new DetailedIntuneService(accessToken, onProgress);
  const data = await service.getAllDetailedConfigurations(true);
  lastCollection = data;
  return {
    collectedAt: data.collectedAt,
    totalConfigurations: data.summary.totalConfigurations,
    sectionCounts: data.sections.map((section) => ({
      label: section.label,
      count: section.items.length,
    })),
    fetchErrors: data.fetchErrors.length,
    permissionErrors: data.permissionErrors.length,
  };
}
