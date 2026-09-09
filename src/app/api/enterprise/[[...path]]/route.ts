import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { authenticate } from "~/lib/enterprise/auth";
import {
  identityTransaction,
  workspaceTransaction,
  systemTransaction,
  audit,
} from "~/lib/enterprise/db";
import {
  EnterpriseError,
  allowed,
  type Member,
  uuid,
  text,
} from "~/lib/enterprise/domain";
import {
  acceptInvite,
  invite,
  updateMember,
  revokeInvitation,
} from "~/lib/enterprise/invitations";
import {
  createRecord,
  recordAction,
  present,
  linked,
  paid,
  readable,
  type RecordRow,
  context,
} from "~/lib/enterprise/records";
import {
  addTenants,
  consentLink,
  completeConsent,
  approveConnection,
  connectionInfo,
  tenantAction,
} from "~/lib/enterprise/tenants";
import { billingAction, receiveBilling } from "~/lib/enterprise/billing";
import { decrypt, hashToken } from "~/lib/enterprise/crypto";
import { requestReport, runWorker } from "~/lib/enterprise/worker";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;
export const preferredRegion = "fra1";
const json = (value: unknown, status = 200) =>
  Response.json(value, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
async function body(request: Request) {
  const raw = await request.text();
  if (raw.length > 1000000)
    throw new EnterpriseError(413, "Request too large.");
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new EnterpriseError(400, "Invalid JSON request.");
  }
}
async function external(request: Request, path: string[]) {
  if (request.method !== "GET")
    throw new EnterpriseError(405, "The external API is read-only.");
  const token =
    request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!token.startsWith("idoc_") || token.length > 100)
    throw new EnterpriseError(401, "Invalid API credential.");
  return systemTransaction(async (sql) => {
    const [key] = await sql<
      RecordRow[]
    >`select * from enterprise.records where kind='api_key' and status='active' and data->>'hash'=${hashToken(token)} and expires_at>now()`;
    if (!key)
      throw new EnterpriseError(401, "API credential expired or was revoked.");
    const [member] = await sql<
      Member[]
    >`select * from enterprise.memberships where workspace_id=${key.workspace_id} and user_id=${key.created_by}`;
    if (!member || !allowed(member, "manage", key.customer_id))
      throw new EnterpriseError(
        403,
        "The credential owner no longer has integration access.",
      );
    await paid(sql, key.workspace_id);
    const bucket = `api:${key.id}:${Math.floor(Date.now() / 60000)}`;
    const [limit] =
      await sql`insert into enterprise.rate_limits(key,resets_at) values(${bucket},now()+interval '2 minutes') on conflict(key) do update set count=enterprise.rate_limits.count+1 returning count`;
    if (Number(limit!.count) > 60)
      throw new EnterpriseError(
        429,
        "API rate limit exceeded. Try again next minute.",
      );
    const kind = z
      .enum(["snapshot", "finding", "report"])
      .parse(path[1] ?? "snapshot");
    const id = path[2];
    if (id) {
      uuid.parse(id);
      const record = await linked(
        sql,
        key.workspace_id,
        key.customer_id,
        id,
        kind,
      );
      return json(present(record, kind !== "report"));
    }
    const before = new URL(request.url).searchParams.get("before");
    if (before) z.string().datetime().parse(before);
    const records = await sql<
      RecordRow[]
    >`select * from enterprise.records where workspace_id=${key.workspace_id} and customer_id=${key.customer_id} and kind=${kind} and (${before}::timestamptz is null or created_at<${before}::timestamptz) order by created_at desc limit 100`;
    return json({ records: records.map((r) => present(r)), limit: 100 });
  });
}
async function handle(
  request: Request,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  try {
    const path = (await params).path ?? [],
      url = new URL(request.url),
      method = request.method;
    if (path[0] === "config" && method === "GET")
      return json({
        enabled: process.env.ENTERPRISE_ENABLED === "true",
        clientId: process.env.ENTERPRISE_ENTRA_CLIENT_ID ?? null,
        apiId: process.env.ENTERPRISE_ENTRA_API_ID ?? null,
      });
    if (process.env.ENTERPRISE_ENABLED !== "true")
      throw new EnterpriseError(
        503,
        "Paid workspaces are not enabled on this installation.",
      );
    if (path[0] === "billing-webhook" && method === "POST")
      return json(await receiveBilling(request));
    if (path[0] === "worker") {
      const secret = process.env.CRON_SECRET,
        actual = request.headers.get("authorization") ?? "",
        expected = `Bearer ${secret ?? ""}`;
      if (
        !secret ||
        secret.length < 32 ||
        actual.length !== expected.length ||
        !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
      )
        throw new EnterpriseError(401, "Unauthorized worker request.");
      return json(await runWorker());
    }
    if (path[0] === "consent" && method === "GET")
      return completeConsent(request);
    if (path[0] === "external") return external(request, path);
    const identity = await authenticate(request);
    if (path[0] === "connection-info" && method === "GET")
      return json(await connectionInfo(url.searchParams.get("token") ?? ""));
    if (path[0] === "connection-approval" && method === "POST")
      return json(await approveConnection(identity, await body(request)));
    if (path[0] === "invitations" && method === "POST")
      return json(await acceptInvite(identity, await body(request)));
    if (path[0] !== "workspaces")
      throw new EnterpriseError(404, "Endpoint not found.");
    if (!path[1]) {
      if (method === "GET")
        return json(
          await identityTransaction(identity, async (sql, userId) => ({
            user: { id: userId, name: identity.name },
            workspaces:
              await sql`select w.*,m.role,m.customer_scope from enterprise.workspaces w join enterprise.memberships m on m.workspace_id=w.id where m.user_id=${userId} and (m.expires_at is null or m.expires_at>now()) order by w.created_at`,
          })),
        );
      if (method === "POST") {
        const data = z
          .object({ name: text, plan: z.enum(["enterprise", "msp"]) })
          .parse(await body(request));
        return json(
          await identityTransaction(identity, async (sql) => {
            const [row] =
              await sql`select enterprise.provision(${data.name},${data.plan}) as id`;
            return row;
          }),
          201,
        );
      }
    }
    const workspace = uuid.parse(path[1]),
      resource = path[2],
      id = path[3];
    if (method === "GET")
      return workspaceTransaction(
        identity,
        workspace,
        "read",
        null,
        async (sql, member) => {
          if (!resource) {
            const [ws] =
              await sql`select * from enterprise.workspaces where id=${workspace}`;
            const [subscription] =
              await sql`select * from enterprise.subscriptions where workspace_id=${workspace}`;
            return json({
              workspace: ws,
              member,
              subscription,
              tenants:
                await sql`select * from enterprise.tenants where workspace_id=${workspace} order by name`,
            });
          }
          const customer = url.searchParams.get("customer");
          if (customer) {
            uuid.parse(customer);
            if (!allowed(member, "read", customer))
              throw new EnterpriseError(403, "Customer is outside your scope.");
          }
          if (["records", "download"].includes(resource))
            await readable(sql, workspace);
          if (resource === "records") {
            if (id) {
              uuid.parse(id);
              const record = await linked(sql, workspace, customer, id);
              if (
                ["api_key", "webhook", "consent", "billing_checkout"].includes(
                  record.kind,
                )
              )
                throw new EnterpriseError(
                  403,
                  "Integration secrets are only displayed at creation.",
                );
              return json(present(record, true));
            }
            const kind = z
              .enum([
                "snapshot",
                "baseline",
                "standard",
                "finding",
                "exception",
                "review",
                "annotation",
                "report",
                "schedule",
                "api_key",
                "webhook",
                "maintenance",
                "alert_route",
              ])
              .parse(url.searchParams.get("kind"));
            if (
              ["api_key", "webhook"].includes(kind) &&
              !allowed(member, "manage", customer)
            )
              throw new EnterpriseError(403, "Administrator access required.");
            const query = z
              .string()
              .max(200)
              .parse(url.searchParams.get("q") ?? "");
            const before = url.searchParams.get("before");
            if (before) z.string().datetime().parse(before);
            const records = await sql<
              RecordRow[]
            >`select * from enterprise.records where workspace_id=${workspace} and kind=${kind} and (name ilike ${"%" + query + "%"} or id::text=${query}) and (${customer}::uuid is null or customer_id=${customer} or customer_id is null) and (${before}::timestamptz is null or created_at<${before}::timestamptz) order by created_at desc limit 100`;
            return json({
              records: records.map((r) => present(r)),
              nextCursor:
                records.length === 100 ? records.at(-1)?.created_at : null,
            });
          }
          if (resource === "download" && id) {
            uuid.parse(id);
            const row = await linked(sql, workspace, customer, id, "report");
            const data = decrypt<{ base64: string }>(
              row.encrypted!,
              context(row),
            );
            await audit(
              sql,
              workspace,
              member.user_id,
              "report.downloaded",
              customer,
              { reportId: id },
            );
            return new Response(
              new Uint8Array(Buffer.from(data.base64, "base64")),
              {
                headers: {
                  "Content-Type":
                    row.data.format === "pdf"
                      ? "application/pdf"
                      : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                  "Content-Disposition": `attachment; filename="intune-report-${id}.${row.data.format === "pdf" ? "pdf" : "docx"}"`,
                  "Cache-Control": "private, no-store",
                },
              },
            );
          }
          if (resource === "team") {
            if (!allowed(member, "manage") || member.customer_scope !== null)
              throw new EnterpriseError(
                403,
                "Workspace-wide administrator access required.",
              );
            return json({
              members:
                await sql`select * from enterprise.memberships where workspace_id=${workspace}`,
              invitations:
                await sql`select id,email,role,customer_scope,expires_at,accepted_at,revoked_at from enterprise.invitations where workspace_id=${workspace} order by created_at desc limit 100`,
            });
          }
          if (resource === "activity")
            return json({
              events:
                await sql`select * from enterprise.audit_events where workspace_id=${workspace} and (${customer}::uuid is null or customer_id=${customer}) order by created_at desc limit 100`,
            });
          if (resource === "jobs")
            return json({
              jobs: await sql`select id,customer_id,kind,status,attempts,error,created_at,completed_at from enterprise.jobs where workspace_id=${workspace} and (${customer}::uuid is null or customer_id=${customer}) order by created_at desc limit 100`,
            });
          throw new EnterpriseError(404, "Endpoint not found.");
        },
      );
    if (method === "POST") {
      const input = await body(request);
      if (resource === "invitations" && id)
        return json(
          await revokeInvitation(identity, workspace, uuid.parse(id)),
        );
      if (resource === "team")
        return json(
          id
            ? await updateMember(identity, workspace, id, input)
            : await invite(identity, workspace, input),
        );
      if (resource === "records")
        return json(
          id
            ? await recordAction(identity, workspace, uuid.parse(id), input)
            : await createRecord(identity, workspace, input),
        );
      if (resource === "jobs" && id) {
        uuid.parse(id);
        const data = z.object({ customerId: uuid }).parse(input);
        return json(
          await workspaceTransaction(
            identity,
            workspace,
            "investigate",
            data.customerId,
            async (sql, member) => {
              await paid(sql, workspace);
              const retried =
                await sql`update enterprise.jobs set status='queued',attempts=0,available_at=now(),error=null where id=${id} and workspace_id=${workspace} and customer_id=${data.customerId} and status='failed' returning id`;
              if (!retried.length)
                throw new EnterpriseError(
                  409,
                  "Only failed jobs can be retried.",
                );
              await audit(
                sql,
                workspace,
                member.user_id,
                "job.retried",
                data.customerId,
                { jobId: id },
              );
              return { updated: true };
            },
          ),
        );
      }
      if (resource === "tenants")
        return json(
          id
            ? await tenantAction(identity, workspace, uuid.parse(id), input)
            : await addTenants(identity, workspace, input),
        );
      if (resource === "consent" && id)
        return json(await consentLink(identity, workspace, uuid.parse(id)));
      if (resource === "billing")
        return json(await billingAction(identity, workspace, input));
      if (resource === "report") {
        const data = z
          .object({
            customerId: uuid,
            snapshotId: uuid,
            format: z.enum(["pdf", "docx"]),
            template: z.enum(["detailed", "executive", "qbr"]),
          })
          .parse(input);
        return json(
          await workspaceTransaction(
            identity,
            workspace,
            "read",
            data.customerId,
            async (sql) => {
              await paid(sql, workspace);
              return requestReport(
                sql,
                workspace,
                data.customerId,
                data.snapshotId,
                data.format,
                data.template,
              );
            },
          ),
        );
      }
    }
    throw new EnterpriseError(405, "Method not supported.");
  } catch (error) {
    if (error instanceof EnterpriseError)
      return json({ error: error.message }, error.status);
    if (error instanceof z.ZodError)
      return json(
        {
          error: error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        },
        400,
      );
    console.error("Enterprise request failed", {
      type: error instanceof Error ? error.name : "UnknownError",
    });
    return json(
      {
        error:
          "The request could not complete. Try again or contact support@ugurlabs.com.",
      },
      500,
    );
  }
}
export { handle as GET, handle as POST };
