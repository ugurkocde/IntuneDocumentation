/**
 * The manual recommendations notice and the Manual section items, ported
 * from TenuVault (cis-manual.ts). The notice and the URL are the only fixed
 * benchmark strings in the repository; titles and text of manual items come
 * from the delivered recommendation list and are never stored.
 */
import type { RecommendationList } from "./pack";

export const MANUAL_RECOMMENDATIONS_NOTICE =
  "Not all recommendations from the CIS Benchmarks are included in this tool. Please refer to the CIS website to access the free CIS Benchmarks PDFs for manual assessment instructions.";
export const MANUAL_RECOMMENDATIONS_URL =
  "https://www.cisecurity.org/cis-benchmarks";
export const MANUAL_NOT_ASSESSED_NOTE =
  "Manual recommendations are not assessed by this view.";

type ListItem = RecommendationList["items"][number];
type Level = ListItem["level"];

/** One manual item as the Manual section shows it. */
export interface ManualItemView {
  identifier: string;
  level: Level;
  title?: string;
  description?: string;
  impact?: string;
  audit?: string;
  remediation?: string;
  hasText: boolean;
  notice: string;
  noticeUrl: string;
  state: "Manual";
}

const TEXT_FIELDS = [
  "title",
  "description",
  "impact",
  "audit",
  "remediation",
] as const;

function toManualView(
  item: Pick<ListItem, "identifier" | "level"> & Partial<ListItem>,
): ManualItemView {
  const view: ManualItemView = {
    identifier: item.identifier,
    level: item.level,
    hasText: false,
    notice: MANUAL_RECOMMENDATIONS_NOTICE,
    noticeUrl: MANUAL_RECOMMENDATIONS_URL,
    state: "Manual",
  };
  const source = item as Partial<Record<(typeof TEXT_FIELDS)[number], unknown>>;
  for (const field of TEXT_FIELDS) {
    const value = source[field];
    if (typeof value === "string" && value.trim()) view[field] = value.trim();
  }
  view.hasText = Boolean(
    view.description || view.impact || view.audit || view.remediation,
  );
  return view;
}

const byIdentifier = (a: { identifier: string }, b: { identifier: string }) =>
  a.identifier.localeCompare(b.identifier, undefined, { numeric: true });

/**
 * Manual items for one Level: list items marked not automated, plus the
 * identifiers given as not assessed, once each. List items win because they
 * may carry a title and text, also for an automated item that is given as
 * not assessed (the pack cannot assess it, so it needs a manual check);
 * only automated items that were assessed are left out.
 */
export function manualItemsForLevel(
  list: RecommendationList | undefined,
  level: Level,
  notAssessed: readonly string[] = [],
): ManualItemView[] {
  const items = new Map<string, ManualItemView>();
  const selected = new Set(notAssessed);
  for (const identifier of selected)
    items.set(identifier, toManualView({ identifier, level }));
  for (const item of list?.items ?? []) {
    if (item.level !== level) continue;
    if (item.automated && !selected.has(item.identifier)) continue;
    items.set(item.identifier, toManualView(item));
  }
  return [...items.values()].sort(byIdentifier);
}
