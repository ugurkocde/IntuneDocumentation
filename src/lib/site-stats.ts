import { supabase } from "~/lib/supabase";

export interface SiteStats {
  exportCount: number;
  mauCount: number;
}

const EMPTY_STATS: SiteStats = { exportCount: 0, mauCount: 0 };

/**
 * Server-side stats lookup used to render trust numbers into the page HTML.
 * Returns zeros when Supabase is not configured or unreachable so callers
 * can fall back to static copy.
 */
export async function getSiteStats(): Promise<SiteStats> {
  if (!supabase) {
    return EMPTY_STATS;
  }

  const [exportsResult, mauResult] = await Promise.allSettled([
    supabase.from("export_statistics").select("export_count").single(),
    supabase.rpc("get_mau_count"),
  ]);

  const exportCount =
    exportsResult.status === "fulfilled" && !exportsResult.value.error
      ? (exportsResult.value.data?.export_count ?? 0)
      : 0;

  const mauCount =
    mauResult.status === "fulfilled" && !mauResult.value.error
      ? ((mauResult.value.data as number | null) ?? 0)
      : 0;

  return { exportCount, mauCount };
}
