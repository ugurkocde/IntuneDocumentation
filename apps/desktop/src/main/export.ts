import { resolveExportData } from "../../../../src/lib/client-export-resolver";
import { getLastCollection } from "./collect";

export async function prepareExport(accessToken: string) {
  const data = getLastCollection();
  if (!data) {
    throw new Error("Collect tenant data before exporting.");
  }
  return resolveExportData(data, accessToken);
}
