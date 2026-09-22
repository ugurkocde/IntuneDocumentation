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
