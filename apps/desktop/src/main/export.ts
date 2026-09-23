import type { ExportResolverProgress } from "../../../../src/lib/client-export-resolver";
import { estimatePdfPageCount } from "../../../../src/lib/pdf-page-estimate";
import type { DetailedExportData } from "../../../../src/lib/configuration-analyzer";
import {
  COMPACT_SCOPE_MAX_ITEMS,
  type ScopeItemRef,
} from "../shared/export-scope";
import type { PdfEstimate } from "../shared/ipc-types";
import { getCollectionOwner, getLastCollection } from "./collect";
import { buildScopedExportData } from "./export-scope";

function collectionFor(owner: string) {
  const data = getLastCollection();
  if (!data || getCollectionOwner() !== owner) {
    throw new Error(
      "Collect tenant data again for the account that is currently signed in.",
    );
  }
  return data;
}

// Configuration exports never carry compliance evidence; the Compliance
// Evidence screen produces that separately.
export async function prepareExport(
  accessToken: string | (() => Promise<string>),
  owner: string,
  scope: ScopeItemRef[] | null,
  onProgress: (progress: ExportResolverProgress) => void,
) {
  const collection = collectionFor(owner);
  const data = scope ? buildScopedExportData(collection, scope) : collection;
  const { resolveExportData } = await import(
    "../../../../src/lib/client-export-resolver"
  );
  return resolveExportData(
    { ...data, includeComplianceEvidence: false },
    accessToken,
    onProgress,
  );
}

// The PDF length of a scoped export, estimated without calling Graph.
export function estimateScopedExport(
  owner: string,
  scope: ScopeItemRef[],
): PdfEstimate {
  const data = buildScopedExportData(collectionFor(owner), scope);
  const estimate = estimatePdfPageCount({
    ...(data as unknown as DetailedExportData),
    includeComplianceEvidence: false,
    documentScope: { compact: scope.length <= COMPACT_SCOPE_MAX_ITEMS },
  });
  return { pages: estimate.pages, isLarge: estimate.isLarge };
}
