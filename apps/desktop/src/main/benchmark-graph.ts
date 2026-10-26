import { createGraphClient, type TokenProvider } from "../../../../src/lib/graph-client";
import { definitionNames, type SettingNames } from "../../../../src/lib/benchmarks/tenant-settings";

// Microsoft Graph reads for the CIS Benchmarks view, GET only and within the
// scopes the app already requests (no new permission):
// - Setting definition names for settings the tenant does not hold (delivered
//   packs carry no settingDefinitions): GET /beta/deviceManagement/
//   configurationSettings/{id}, the deviceManagementConfigurationSettingDefinition
//   with displayName and, for choice settings, options[].itemId and
//   displayName; an id Graph does not know answers 404. Verified with Lokka
//   (lab tenant, app-only) on 2026-10-26; covered by
//   DeviceManagementConfiguration.Read.All. The same list with $filter=id eq
//   ... answers too, but took 9 to 15 seconds per request in the lab, while
//   ten requests by id took 0.2 seconds, so ids are read one by one, at most
//   DEFINITION_READS_AT_ONCE at a time (the shared Graph client also limits
//   concurrency and retries throttling).
// - The tenant display name: GET /v1.0/organization?$select=displayName
//   (delegated User.Read is enough; verified with Lokka on 2026-10-26).
// A failed read falls back to the setting id or the shortened tenant id; only
// counts are logged, never names.

type LogDetail = Record<string, string | number | boolean | null | undefined>;

export const DEFINITION_READS_AT_ONCE = 6;
export const MAX_DEFINITION_READS = 1000;
export const BENCHMARK_GRAPH_BUDGET_MS = 60_000;

type GraphClient = Pick<ReturnType<typeof createGraphClient>, "api">;

export function benchmarkGraph(options: {
  token: TokenProvider;
  log(level: "info" | "warn", message: string, detail?: LogDetail): void;
  // For tests: the Graph client to use.
  client?: (budgetMs: number) => GraphClient;
}) {
  const client = (budgetMs: number) =>
    options.client?.(budgetMs) ?? createGraphClient(options.token, { budgetMs });
  const tenantNames = new Map<string, string | null>();

  return {
    // Display names of the given setting definition ids, read once per run,
    // DEFINITION_READS_AT_ONCE at a time. Ids that could not be read are
    // missing from the answer, so callers show the id.
    async settingNames(ids: readonly string[]): Promise<SettingNames> {
      const wanted = [...new Set(ids)]
        .filter((id) => id.length > 0 && id.length <= 500)
        .slice(0, MAX_DEFINITION_READS);
      const names: SettingNames = {};
      const graph = client(BENCHMARK_GRAPH_BUDGET_MS);
      let failed = 0;
      let unknown = 0;
      let next = 0;
      const read = async () => {
        for (let index = next++; index < wanted.length; index = next++) {
          const id = wanted[index]!;
          try {
            const definition = await graph
              .api(`/deviceManagement/configurationSettings/${encodeURIComponent(id)}`)
              .version("beta")
              .get();
            // Only the definition asked for is kept; Graph may answer an id
            // in another letter case, and it is kept under the id asked for.
            if (typeof definition?.id === "string" && definition.id.toLowerCase() === id.toLowerCase())
              definitionNames([{ ...definition, id }], names);
          } catch (error) {
            if ((error as { statusCode?: number })?.statusCode === 404) unknown += 1;
            else failed += 1;
          }
        }
      };
      await Promise.all(Array.from({ length: Math.min(DEFINITION_READS_AT_ONCE, wanted.length) }, read));
      options.log(failed ? "warn" : "info", "benchmark setting names", {
        asked: wanted.length,
        named: Object.keys(names).length,
        unknown,
        failed,
      });
      return names;
    },
    // The organization's display name, once per tenant while signed in.
    async tenantName(tenantId: string): Promise<string | undefined> {
      if (tenantNames.has(tenantId)) return tenantNames.get(tenantId) ?? undefined;
      let name: string | null = null;
      try {
        const response = await client(15_000).api("/organization?$select=displayName").version("v1.0").get();
        const first = Array.isArray(response?.value) ? response.value[0] : null;
        const value = typeof first?.displayName === "string" ? first.displayName.trim() : "";
        name = value ? value.slice(0, 200) : null;
      } catch {
        options.log("warn", "tenant name not read");
      }
      tenantNames.set(tenantId, name);
      return name ?? undefined;
    },
    // Sign out and account change.
    reset(): void {
      tenantNames.clear();
    },
  };
}
