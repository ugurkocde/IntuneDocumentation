// Test-only adapter. Vite aliases it for UI contract tests; Next never imports it.
const w = "10000000-0000-4000-8000-000000000001",
  a = "20000000-0000-4000-8000-000000000001",
  b = "20000000-0000-4000-8000-000000000002";
const now = "2026-09-09T08:30:00.000Z";
const workspace = {
  id: w,
  name: "Northstar Managed Services",
  plan: "msp",
  role: "owner",
};
const tenants = [
  {
    id: a,
    name: "Contoso Manufacturing",
    tenant_id: "30000000-0000-4000-8000-000000000001",
    kind: "customer",
    status: "connected",
    last_collected_at: now,
    health: null,
    branding: { companyName: "Contoso Manufacturing" },
  },
  {
    id: b,
    name: "Fabrikam Health",
    tenant_id: "30000000-0000-4000-8000-000000000002",
    kind: "customer",
    status: "pending",
    last_collected_at: null,
    health: null,
    branding: {},
  },
];
let records: any[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    workspace_id: w,
    customer_id: a,
    kind: "snapshot",
    name: "Daily configuration collection",
    status: "complete",
    created_at: now,
    data: { step: 12, totalSteps: 12, changes: 3 },
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    workspace_id: w,
    customer_id: a,
    kind: "snapshot",
    name: "Previous configuration collection",
    status: "complete",
    created_at: "2026-09-08T08:30:00Z",
    data: { step: 12, totalSteps: 12, changes: 0 },
  },
  {
    id: "40000000-0000-4000-8000-000000000003",
    workspace_id: w,
    customer_id: a,
    kind: "finding",
    name: "Endpoint protection: assignment changed",
    status: "open",
    created_at: now,
    data: { severity: "high", type: "drift" },
  },
  {
    id: "40000000-0000-4000-8000-000000000004",
    workspace_id: w,
    customer_id: a,
    kind: "report",
    name: "Contoso monthly configuration report",
    status: "ready",
    created_at: now,
    data: { format: "pdf", template: "executive" },
  },
];
export async function enterpriseSession() {
  return {
    getActiveAccount: () =>
      new URLSearchParams(location.search).has("signedOut")
        ? null
        : { name: "Alex Morgan" },
  };
}
export async function signIn() {}
export async function signOut() {
  location.assign("/?signedOut=1");
}
export async function api<T = any>(
  path: string,
  body?: any,
  download = false,
): Promise<T> {
  await new Promise((resolve) => setTimeout(resolve, 30));
  const url = new URL(path, "http://contract.test/"),
    parts = url.pathname.split("/").filter(Boolean);
  if (download) return new Blob(["Test PDF"], { type: "application/pdf" }) as T;
  if (path.startsWith("connection-info"))
    return {
      workspace_name: "Northstar Managed Services",
      customer_name: "Contoso Manufacturing",
      requested_by: "Alex Morgan",
    } as T;
  if (path === "workspaces")
    return { user: { name: "Alex Morgan" }, workspaces: [workspace] } as T;
  if (parts[2] === "records") {
    if (body) {
      if (parts[3])
        return body.action === "compare"
          ? ({
              changes: [
                {
                  path: "/assignments",
                  kind: "changed",
                  before: ["Old group"],
                  after: ["New group"],
                },
              ],
              skipped: [],
            } as T)
          : ({ updated: true } as T);
      const row = {
        ...body,
        id: crypto.randomUUID(),
        customer_id: body.customerId,
        status: "active",
        created_at: now,
      };
      records = [row, ...records];
      return row as T;
    }
    if (parts[3])
      return {
        ...records.find((r) => r.id === parts[3]),
        content: {
          version: 1,
          sections: {
            settingsCatalog: {
              status: "complete",
              data: [
                { id: "policy-1", name: "Endpoint protection", settings: [] },
              ],
            },
          },
        },
      } as T;
    return {
      records: records.filter(
        (r) =>
          r.kind === url.searchParams.get("kind") &&
          (!url.searchParams.get("customer") ||
            r.customer_id === url.searchParams.get("customer") ||
            !r.customer_id),
      ),
    } as T;
  }
  if (parts[2] === "activity")
    return {
      events: [
        {
          id: "event-1",
          action: "collection.completed",
          actor_id: null,
          customer_id: a,
          created_at: now,
        },
      ],
    } as T;
  if (parts[2] === "jobs") return { jobs: [] } as T;
  if (parts[2] === "team")
    return body
      ? ({ id: "invitation-1" } as T)
      : ({
          members: [
            {
              user_id: "50000000-0000-4000-8000-000000000001",
              display_name: "Alex Morgan",
              role: "owner",
              customer_scope: null,
              expires_at: null,
            },
          ],
          invitations: [],
        } as T);
  if (parts[2] === "consent")
    return { url: "https://login.microsoftonline.com/test-consent" } as T;
  if (body) return { updated: true } as T;
  return {
    workspace,
    tenants,
    member: {
      user_id: "50000000-0000-4000-8000-000000000001",
      role: "owner",
      customer_scope: null,
      expires_at: null,
    },
    subscription: {
      status: "active",
      quantity: 10,
      interval: "month",
      founders_at: null,
      paid_through: "2026-10-09T00:00:00Z",
      trial_ends_at: null,
      cancel_at_period_end: false,
    },
  } as T;
}
