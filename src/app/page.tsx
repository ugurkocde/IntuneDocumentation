import { getSiteStats } from "~/lib/site-stats";
import { HomePage } from "./home-page";

// Re-render the page at most every 5 minutes so the trust stats stay fresh
// without a client-side fetch.
export const revalidate = 300;

export default async function Page() {
  const stats = await getSiteStats();
  return <HomePage stats={stats} />;
}
