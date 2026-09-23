import type { ExportResolverProgress } from "../../../../src/lib/client-export-resolver";
import { getCollectionOwner, getLastCollection } from "./collect";

export async function prepareExport(
  accessToken: string | (() => Promise<string>),
  owner: string,
  options: { includeComplianceEvidence: boolean },
  onProgress: (progress: ExportResolverProgress) => void,
) {
  const data = getLastCollection();
  if (!data || getCollectionOwner() !== owner) {
    throw new Error(
      "Collect tenant data again for the account that is currently signed in.",
    );
  }
  const { resolveExportData } = await import(
    "../../../../src/lib/client-export-resolver"
  );
  return resolveExportData(
    { ...data, includeComplianceEvidence: options.includeComplianceEvidence },
    accessToken,
    onProgress,
  );
}
