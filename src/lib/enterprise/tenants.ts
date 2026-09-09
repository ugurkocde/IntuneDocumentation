import { z } from "zod";
import { type Identity, requireTenantAdministrator } from "./auth";
import { audit, systemTransaction, workspaceTransaction } from "./db";
import { hashToken, secretToken } from "./crypto";
import { EnterpriseError, text, uuid, allowed, type Member } from "./domain";
import { appOrigin } from "./email";
import { insertRecord, paid, type RecordRow } from "./records";
import { probeTenant } from "./collector";
export async function addTenants(
  identity: Identity,
  workspace: string,
  input: unknown,
) {
  const { tenants, acknowledged } = z
    .object({
      tenants: z
        .array(
          z.object({
            name: text,
            tenantId: uuid,
            kind: z.enum(["production", "test", "customer", "internal"]),
          }),
        )
        .min(1)
        .max(100),
      acknowledged: z.literal(true),
    })
    .parse(input);
  return workspaceTransaction(
    identity,
    workspace,
    "manage",
    null,
    async (sql, member) => {
      if (member.customer_scope !== null)
        throw new EnterpriseError(
          403,
          "Only workspace-wide administrators can onboard tenants.",
        );
      await paid(sql, workspace);
      const [ws] =
        await sql`select plan from enterprise.workspaces where id=${workspace} for update`;
      const [billing] =
        await sql`select quantity from enterprise.subscriptions where workspace_id=${workspace}`;
      const current =
        await sql`select kind,tenant_id from enterprise.tenants where workspace_id=${workspace} and status<>'disconnected'`;
      const permitted =
        ws!.plan === "enterprise"
          ? ["production", "test"]
          : ["customer", "internal"];
      if (tenants.some((t) => !permitted.includes(t.kind)))
        throw new EnterpriseError(400, "Tenant type does not match this plan.");
      const combined = [
        ...current,
        ...tenants.map((t) => ({ kind: t.kind, tenant_id: t.tenantId })),
      ];
      if (new Set(combined.map((t) => t.tenant_id)).size !== combined.length)
        throw new EnterpriseError(
          409,
          "A tenant is already in this workspace or appears twice in the request.",
        );
      if (
        combined.filter((t) => ["test", "internal"].includes(t.kind as string))
          .length > 1
      )
        throw new EnterpriseError(
          409,
          "The plan includes one test or internal tenant.",
        );
      const billable = combined.filter((t) =>
        ["production", "customer"].includes(t.kind as string),
      ).length;
      if (billable > Number(billing?.quantity ?? 0))
        throw new EnterpriseError(
          402,
          "Purchase additional tenant capacity in Billing before onboarding these tenants.",
        );
      const result = [];
      for (const tenant of tenants) {
        const [row] = await sql<
          { id: string }[]
        >`insert into enterprise.tenants(workspace_id,name,tenant_id,kind) values(${workspace},${tenant.name},${tenant.tenantId},${tenant.kind}) returning id`;
        await audit(sql, workspace, member.user_id, "tenant.created", row!.id, {
          retentionAcknowledged: acknowledged,
        });
        result.push(row!);
      }
      return { tenants: result };
    },
  );
}
export async function consentLink(
  identity: Identity,
  workspace: string,
  customer: string,
) {
  return workspaceTransaction(
    identity,
    workspace,
    "manage",
    customer,
    async (sql, member) => {
      await paid(sql, workspace);
      const [tenant] =
        await sql`select tenant_id from enterprise.tenants where workspace_id=${workspace} and id=${customer}`;
      if (!tenant) throw new EnterpriseError(404, "Customer not found.");
      const client = process.env.ENTERPRISE_COLLECTOR_CLIENT_ID;
      if (!client)
        throw new EnterpriseError(
          503,
          "Collector application is not configured.",
        );
      const state = secretToken();
      await insertRecord(
        sql,
        workspace,
        customer,
        "consent",
        "Customer admin consent",
        { hash: hashToken(state), tenantId: tenant.tenant_id },
        member.user_id,
        undefined,
        "pending",
        new Date(Date.now() + 3600000).toISOString(),
      );
      const url = new URL(
        `https://login.microsoftonline.com/${String(tenant.tenant_id)}/v2.0/adminconsent`,
      );
      url.search = new URLSearchParams({
        client_id: client,
        scope: "https://graph.microsoft.com/.default",
        redirect_uri: `${appOrigin()}/api/enterprise/consent`,
        state,
      }).toString();
      return { url: url.toString() };
    },
  );
}
export async function completeConsent(request: Request) {
  const url = new URL(request.url),
    state = url.searchParams.get("state"),
    tenantId = url.searchParams.get("tenant");
  if (
    !state ||
    state.length > 100 ||
    !tenantId ||
    !uuid.safeParse(tenantId).success ||
    url.searchParams.get("admin_consent")?.toLowerCase() !== "true"
  )
    throw new EnterpriseError(
      400,
      "Microsoft consent was not completed. Return to your workspace and try again.",
    );
  const row = await systemTransaction(async (sql) => {
    const [record] = await sql<
      RecordRow[]
    >`select * from enterprise.records where kind='consent' and data->>'hash'=${hashToken(state)} and status='pending' and expires_at>now()`;
    if (!record || record.data.tenantId !== tenantId)
      throw new EnterpriseError(
        400,
        "Consent request expired or belongs to another tenant.",
      );
    return record;
  });
  await systemTransaction(async (sql) => {
    await sql`update enterprise.records set status='awaiting_identity',updated_at=now() where id=${row.id} and status='pending'`;
  });
  // Existing application consent is shared across workspaces, so a token probe
  // alone cannot authorize a NEW workspace. Require a signed customer-admin identity.
  return Response.redirect(
    `${appOrigin()}/enterprise?connection=${state}&tenant=${tenantId}`,
    303,
  );
}
export async function approveConnection(identity: Identity, input: unknown) {
  const { token, acknowledged } = z
    .object({
      token: z.string().min(40).max(100),
      acknowledged: z.literal(true),
    })
    .parse(input);
  const row = await systemTransaction(async (sql) => {
    const [record] = await sql<
      RecordRow[]
    >`select * from enterprise.records where kind='consent' and data->>'hash'=${hashToken(token)} and status='awaiting_identity' and expires_at>now()`;
    if (!record)
      throw new EnterpriseError(
        410,
        "Connection approval expired or was already used.",
      );
    return record;
  });
  const tenantId = uuid.parse(row.data.tenantId);
  requireTenantAdministrator(identity, tenantId);
  await probeTenant(tenantId);
  await systemTransaction(async (sql) => {
    await paid(sql, row.workspace_id);
    await sql`select id from enterprise.workspaces where id=${row.workspace_id} for update`;
    const [initiator] = await sql<
      Member[]
    >`select user_id,role,customer_scope,expires_at::text from enterprise.memberships where workspace_id=${row.workspace_id} and user_id=${row.created_by}`;
    if (!initiator || !allowed(initiator, "manage", row.customer_id))
      throw new EnterpriseError(
        403,
        "The requesting administrator no longer has permission. Request a new connection link.",
      );
    const [target] =
      await sql`select kind from enterprise.tenants where id=${row.customer_id} and workspace_id=${row.workspace_id}`;
    if (!target)
      throw new EnterpriseError(404, "Customer tenant no longer exists.");
    const otherTenants =
      await sql`select kind from enterprise.tenants where workspace_id=${row.workspace_id} and id<>${row.customer_id} and status<>'disconnected'`;
    const [capacity] =
      await sql`select quantity from enterprise.subscriptions where workspace_id=${row.workspace_id}`;
    const billable = ["production", "customer"].includes(target.kind as string);
    const used = otherTenants.filter(
      (t) => ["production", "customer"].includes(t.kind as string) === billable,
    ).length;
    if (used >= (billable ? Number(capacity?.quantity ?? 0) : 1))
      throw new EnterpriseError(
        402,
        "The workspace needs additional tenant capacity before this connection can be approved.",
      );
    const [subscription] =
      await sql`select status from enterprise.subscriptions where workspace_id=${row.workspace_id}`;
    if (subscription?.status === "trialing") {
      await sql`insert into enterprise.trial_tenants(tenant_id,workspace_id) values(${tenantId},${row.workspace_id}) on conflict do nothing`;
      const [claim] =
        await sql`select workspace_id from enterprise.trial_tenants where tenant_id=${tenantId}`;
      if (claim?.workspace_id !== row.workspace_id)
        throw new EnterpriseError(
          402,
          "This customer tenant has already used a monitoring trial. Activate a paid subscription to connect it here.",
        );
    }
    const consumed =
      await sql`update enterprise.records set status='consumed',updated_at=now(),data=data||${sql.json({ approvedTenant: identity.tenantId, approvedObject: identity.objectId, retentionAcknowledged: acknowledged })} where id=${row.id} and status='awaiting_identity' and expires_at>now() returning id`;
    if (!consumed.length)
      throw new EnterpriseError(
        409,
        "Approval was already completed or expired.",
      );
    await sql`update enterprise.tenants set status='connected',consented_at=now(),next_collection_at=now(),health=null where id=${row.customer_id} and workspace_id=${row.workspace_id}`;
    await audit(
      sql,
      row.workspace_id,
      null,
      "tenant.customer_admin_verified",
      row.customer_id,
      { tenantId, adminObjectId: identity.objectId },
    );
  });
  return { approved: true };
}
export async function tenantAction(
  identity: Identity,
  workspace: string,
  customer: string,
  input: unknown,
) {
  const data = z
    .object({
      action: z.enum(["refresh", "disconnect", "branding"]),
      name: text.optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
    })
    .parse(input);
  return workspaceTransaction(
    identity,
    workspace,
    data.action === "refresh" ? "investigate" : "manage",
    customer,
    async (sql, member) => {
      const [tenant] =
        await sql`select * from enterprise.tenants where workspace_id=${workspace} and id=${customer} for update`;
      if (!tenant) throw new EnterpriseError(404, "Customer not found.");
      if (data.action === "refresh") {
        await paid(sql, workspace);
        if (tenant.status !== "connected")
          throw new EnterpriseError(409, "Connect the customer tenant first.");
        const active =
          await sql`select id from enterprise.jobs where customer_id=${customer} and kind='collect' and (status in ('queued','running') or created_at>now()-interval '15 minutes') limit 1`;
        if (active.length)
          throw new EnterpriseError(
            429,
            "Collection is running or was recently requested. Try again in 15 minutes.",
          );
        await sql`update enterprise.tenants set next_collection_at=now() where id=${customer}`;
      } else if (data.action === "disconnect") {
        await sql`update enterprise.tenants set status='disconnected',next_collection_at=null where id=${customer}`;
        await sql`update enterprise.jobs set status='canceled' where customer_id=${customer} and status in ('queued','running')`;
      } else {
        await sql`update enterprise.tenants set branding=${sql.json({ companyName: data.name ?? (tenant.name as string), primaryColor: data.color ?? "#136c55" })} where id=${customer}`;
      }
      await audit(
        sql,
        workspace,
        member.user_id,
        `tenant.${data.action}`,
        customer,
      );
      return { updated: true };
    },
  );
}

export async function connectionInfo(token: string) {
  if (token.length < 40 || token.length > 100)
    throw new EnterpriseError(400, "Invalid connection request.");
  return systemTransaction(async (sql) => {
    const [row] =
      await sql`select w.name as workspace_name,t.name as customer_name,u.name as requested_by from enterprise.records r join enterprise.workspaces w on w.id=r.workspace_id join enterprise.tenants t on t.id=r.customer_id join enterprise.users u on u.id=r.created_by where r.kind='consent' and r.data->>'hash'=${hashToken(token)} and r.status='awaiting_identity' and r.expires_at>now()`;
    if (!row)
      throw new EnterpriseError(
        410,
        "Connection request expired or was already used.",
      );
    return row;
  });
}
