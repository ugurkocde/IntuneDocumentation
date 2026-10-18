import { ResponseType } from "@microsoft/microsoft-graph-client";
import type { Client } from "@microsoft/microsoft-graph-client";
import { collectAllPagesWithStatus } from "./graph-paging";
import { graphStatus } from "./graph-request";
import type {
  PolicyDeviceStatus,
  PolicyDeviceStatusRow,
  PolicyStatusSource,
  TenantIdentityPolicies,
  TenantIdentityPolicyName,
  TenantPolicyCollectionStatus,
} from "./compliance/types";

// Read-only collectors for data kept outside configuration `sections`: Entra
// tenant policies (Policy.Read.All, the Conditional Access permission) and
// Intune per-policy device status summaries (DeviceManagementConfiguration
// .Read.All). Endpoints and response shapes were verified on Graph beta in
// the lab tenant on 18 October 2026.

type GraphClient = Pick<Client, "api">;
type Retry = <T>(request: () => Promise<T>) => Promise<T>;

const IDENTITY_ENDPOINTS: Record<TenantIdentityPolicyName, string> = {
  authenticationMethods: "/policies/authenticationMethodsPolicy",
  securityDefaults: "/policies/identitySecurityDefaultsEnforcementPolicy",
  authorization: "/policies/authorizationPolicy",
};

function failure(error: unknown): {
  status: TenantPolicyCollectionStatus;
  reason: string;
} {
  const status = graphStatus(error);
  if (status === 401 || status === 403)
    return {
      status: "permissionDenied",
      reason: `access denied (HTTP ${status})`,
    };
  const message =
    error instanceof Error && error.message ? error.message : "request failed";
  return {
    status: "failed",
    reason: status ? `HTTP ${status}: ${message}` : message,
  };
}

/** A collection where every policy was skipped, with the reason. */
export function skippedIdentityPolicies(
  reason: string,
): TenantIdentityPolicies {
  const names = Object.keys(IDENTITY_ENDPOINTS) as TenantIdentityPolicyName[];
  return {
    status: Object.fromEntries(names.map((name) => [name, "skipped"])),
    errors: Object.fromEntries(names.map((name) => [name, reason])),
  };
}

export async function collectTenantIdentityPolicies(
  client: GraphClient,
  retry: Retry,
): Promise<TenantIdentityPolicies> {
  const result: TenantIdentityPolicies = { status: {}, errors: {} };
  await Promise.all(
    (
      Object.entries(IDENTITY_ENDPOINTS) as Array<
        [TenantIdentityPolicyName, string]
      >
    ).map(async ([name, endpoint]) => {
      try {
        const response = await retry(() =>
          client.api(endpoint).version("beta").get(),
        );
        // Beta returns authorizationPolicy as a collection with one item.
        const policy = Array.isArray(response?.value)
          ? response.value[0]
          : response;
        if (!policy || typeof policy !== "object")
          throw new Error("Graph returned no policy object");
        const rest: Record<string, unknown> = { ...policy };
        delete rest["@odata.context"];
        result[name] = rest;
        result.status[name] = "collected";
      } catch (error) {
        const { status, reason } = failure(error);
        result.status[name] = status;
        result.errors![name] = reason;
      }
    }),
  );
  if (!Object.keys(result.errors!).length) delete result.errors;
  return result;
}

const REPORTS: ReadonlyArray<{
  source: Exclude<PolicyStatusSource, "deviceConfigurations">;
  endpoint: string;
}> = [
  {
    source: "configurationPolicies",
    endpoint:
      "/deviceManagement/reports/getConfigurationPolicyNonComplianceSummaryReport",
  },
  {
    source: "compliancePolicies",
    endpoint:
      "/deviceManagement/reports/getCompliancePolicyNonComplianceSummaryReport",
  },
];

const REPORT_COLUMNS = [
  "PolicyId",
  "PolicyName",
  "NumberOfCompliantDevices",
  "NumberOfNonCompliantOrErrorDevices",
  "NumberOfNonCompliantDevices",
  "NumberOfErrorDevices",
  "NumberOfConflictDevices",
  "NumberOfNotApplicableDevices",
];

const REPORT_PAGE_SIZE = 1000;

export interface ReportPage {
  totalRowCount: number | null;
  rows: Array<Record<string, unknown>>;
}

/**
 * Parses an Intune report response. The body may arrive as an object, as
 * JSON text or as a JSON string inside JSON; values are read by column name
 * because the column order follows the request's select list.
 */
export function parseReportPage(body: unknown): ReportPage {
  let value = body;
  for (let depth = 0; depth < 2 && typeof value === "string"; depth++)
    value = JSON.parse(value);
  if (!value || typeof value !== "object")
    throw new Error("The report response is not a JSON object");
  const report = value as Record<string, unknown>;
  const schema = Array.isArray(report.Schema) ? report.Schema : null;
  const values = Array.isArray(report.Values) ? report.Values : null;
  if (!schema || !values)
    throw new Error("The report response has no Schema or Values");
  const columns = schema.map((column: any) =>
    typeof column?.Column === "string" ? column.Column : "",
  );
  return {
    totalRowCount:
      typeof report.TotalRowCount === "number" ? report.TotalRowCount : null,
    rows: values
      .filter((row): row is unknown[] => Array.isArray(row))
      .map((row) =>
        Object.fromEntries(
          columns.map((column: string, index: number) => [column, row[index]]),
        ),
      ),
  };
}

const count = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;

export function reportRowToStatus(
  row: Record<string, unknown>,
  source: PolicyStatusSource,
): PolicyDeviceStatusRow | null {
  if (typeof row.PolicyId !== "string" || !row.PolicyId) return null;
  const nonCompliant = count(row.NumberOfNonCompliantDevices);
  const errors = count(row.NumberOfErrorDevices);
  return {
    policyId: row.PolicyId,
    policyName: typeof row.PolicyName === "string" ? row.PolicyName : "",
    source,
    succeeded: count(row.NumberOfCompliantDevices),
    // Not compliant or error, as one failure count.
    error:
      count(row.NumberOfNonCompliantOrErrorDevices) ??
      (nonCompliant !== null && errors !== null ? nonCompliant + errors : null),
    conflict: count(row.NumberOfConflictDevices),
    notApplicable: count(row.NumberOfNotApplicableDevices),
    // The summary reports have no pending column.
    pending: null,
  };
}

export function overviewToStatus(
  item: Record<string, any>,
): PolicyDeviceStatusRow | null {
  const overview = item?.deviceStatusOverview;
  if (typeof item?.id !== "string" || !overview || typeof overview !== "object")
    return null;
  const errorCount = count(overview.errorCount);
  const failedCount = count(overview.failedCount);
  return {
    policyId: item.id,
    policyName: typeof item.displayName === "string" ? item.displayName : "",
    source: "deviceConfigurations",
    succeeded: count(overview.successCount),
    error:
      errorCount === null && failedCount === null
        ? null
        : (errorCount ?? 0) + (failedCount ?? 0),
    conflict: count(overview.conflictCount),
    notApplicable: count(overview.notApplicableCount),
    pending: count(overview.pendingCount),
  };
}

/** A collection where every source was skipped, with the reason. */
export function skippedPolicyDeviceStatus(reason: string): PolicyDeviceStatus {
  const sources: PolicyStatusSource[] = [
    "configurationPolicies",
    "compliancePolicies",
    "deviceConfigurations",
  ];
  return {
    collectedAt: new Date().toISOString(),
    sources: Object.fromEntries(
      sources.map((source) => [source, "skipped"]),
    ) as PolicyDeviceStatus["sources"],
    errors: Object.fromEntries(sources.map((source) => [source, reason])),
    rows: [],
  };
}

export async function collectPolicyDeviceStatus(
  client: GraphClient,
  retry: Retry,
  options: { deadline?: number; now?: () => number } = {},
): Promise<PolicyDeviceStatus> {
  const now = options.now ?? Date.now;
  const outOfTime = () =>
    options.deadline !== undefined && now() >= options.deadline;
  const result: PolicyDeviceStatus = {
    collectedAt: new Date(now()).toISOString(),
    sources: {
      configurationPolicies: "skipped",
      compliancePolicies: "skipped",
      deviceConfigurations: "skipped",
    },
    errors: {},
    rows: [],
  };
  const fail = (source: PolicyStatusSource, error: unknown) => {
    const { status, reason } = failure(error);
    result.sources[source] = status;
    result.errors![source] = reason;
  };
  const budget = "Skipped to stay within the collection time budget.";

  await Promise.all([
    ...REPORTS.map(async ({ source, endpoint }) => {
      const rows: PolicyDeviceStatusRow[] = [];
      try {
        for (let skip = 0; ; skip += REPORT_PAGE_SIZE) {
          if (outOfTime()) {
            result.errors![source] = budget;
            return;
          }
          const body = await retry(() =>
            client
              .api(endpoint)
              .version("beta")
              .responseType(ResponseType.TEXT)
              .post({ select: REPORT_COLUMNS, top: REPORT_PAGE_SIZE, skip }),
          );
          const page = parseReportPage(body);
          for (const row of page.rows) {
            const status = reportRowToStatus(row, source);
            if (status) rows.push(status);
          }
          const total = page.totalRowCount ?? 0;
          if (!page.rows.length || skip + REPORT_PAGE_SIZE >= total) break;
        }
        result.rows.push(...rows);
        result.sources[source] = "collected";
      } catch (error) {
        fail(source, error);
      }
    }),
    (async () => {
      if (outOfTime()) {
        result.errors!.deviceConfigurations = budget;
        return;
      }
      try {
        const first = await retry(() =>
          client
            .api("/deviceManagement/deviceConfigurations")
            .version("beta")
            .select("id,displayName")
            .expand("deviceStatusOverview")
            .get(),
        );
        const pages = await collectAllPagesWithStatus<any>(
          client as unknown as Client,
          first,
        );
        if (!pages.complete) throw pages.error;
        for (const item of pages.items) {
          const status = overviewToStatus(item);
          if (status) result.rows.push(status);
        }
        result.sources.deviceConfigurations = "collected";
      } catch (error) {
        fail("deviceConfigurations", error);
      }
    })(),
  ]);
  result.rows.sort(
    (left, right) =>
      left.source.localeCompare(right.source) ||
      left.policyName.localeCompare(right.policyName) ||
      left.policyId.localeCompare(right.policyId),
  );
  if (!Object.keys(result.errors!).length) delete result.errors;
  return result;
}
