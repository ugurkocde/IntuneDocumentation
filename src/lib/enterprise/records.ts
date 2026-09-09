import { randomUUID } from "node:crypto";
import { type JSONValue } from "postgres";
import { z } from "zod";
import { type Identity } from "./auth";
import { audit, type Tx, workspaceTransaction } from "./db";
import { decrypt, encrypt, hashToken, secretToken } from "./crypto";
import {
  EnterpriseError,
  type Permission,
  type Snapshot,
  standardSchema,
  text,
  uuid,
} from "./domain";
import { diffSnapshots } from "./analysis";
export type RecordRow = {
  id: string;
  workspace_id: string;
  customer_id: string | null;
  kind: string;
  name: string;
  status: string;
  data: Record<string, any>;
  encrypted: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  expires_at: string | null;
};
export const context = (
  row: Pick<RecordRow, "workspace_id" | "customer_id" | "id">,
) => `${row.workspace_id}/${row.customer_id ?? "workspace"}/${row.id}`;
export async function insertRecord(
  sql: Tx,
  workspace: string,
  customer: string | null,
  kind: string,
  name: string,
  data: Record<string, unknown>,
  actor: string | null,
  secret?: unknown,
  status = "active",
  expires: string | null = null,
) {
  const id = randomUUID();
  const encrypted =
    secret === undefined
      ? null
      : encrypt(
          secret,
          context({ workspace_id: workspace, customer_id: customer, id }),
        );
  const [row] = await sql<
    RecordRow[]
  >`insert into enterprise.records(id,workspace_id,customer_id,kind,name,data,encrypted,created_by,status,expires_at) values(${id},${workspace},${customer},${kind},${name},${sql.json(data as JSONValue)},${encrypted},${actor},${status},${expires}) returning *`;
  return row!;
}
function expiredEvidence(row: RecordRow) {
  return (
    ["snapshot", "report", "finding"].includes(row.kind) &&
    row.expires_at !== null &&
    Date.parse(row.expires_at) <= Date.now()
  );
}
export function present(row: RecordRow, includeSecret = false) {
  const { encrypted, ...safe } = row;
  const data = { ...row.data };
  delete data.hash;
  return {
    ...safe,
    data,
    ...(includeSecret && encrypted && !expiredEvidence(row)
      ? { content: decrypt<unknown>(encrypted, context(row)) }
      : {}),
  };
}
export async function paid(sql: Tx, workspace: string) {
  const [subscription] =
    await sql`select status,paid_through,trial_ends_at from enterprise.subscriptions where workspace_id=${workspace}`;
  const until =
    subscription?.status === "trialing"
      ? subscription.trial_ends_at
      : subscription?.paid_through;
  if (
    !subscription ||
    !["active", "trialing"].includes(subscription.status as string) ||
    !until ||
    new Date(until as string).getTime() <= Date.now()
  )
    throw new EnterpriseError(
      402,
      "An active subscription or trial is required. Open Billing to continue.",
    );
}
const createSchema = z.object({
  kind: z.enum([
    "standard",
    "exception",
    "review",
    "annotation",
    "schedule",
    "webhook",
    "api_key",
    "maintenance",
    "alert_route",
  ]),
  customerId: uuid.nullable(),
  name: text,
  data: z.record(z.unknown()),
});
const scheduleSchema = z.object({
  cadence: z.enum(["daily", "weekly", "monthly", "quarterly"]),
  hour: z.number().int().min(0).max(23),
  timezone: z
    .string()
    .max(100)
    .refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Invalid timezone"),
  format: z.enum(["pdf", "docx"]),
  template: z.enum(["detailed", "executive", "qbr"]),
  recipients: z.array(z.string().email()).max(20),
  nextRun: z.string().datetime(),
  enabled: z.boolean(),
});
export async function createRecord(
  identity: Identity,
  workspace: string,
  input: unknown,
) {
  const values = createSchema.parse(input);
  const permission: Permission = ["annotation", "exception"].includes(
    values.kind,
  )
    ? "investigate"
    : values.kind === "review"
      ? "review"
      : "manage";
  return workspaceTransaction(
    identity,
    workspace,
    permission,
    values.customerId,
    async (sql, member) => {
      await paid(sql, workspace);
      if (!values.customerId && member.customer_scope !== null)
        throw new EnterpriseError(
          403,
          "Select a customer within your assigned scope.",
        );
      let data: Record<string, unknown> = values.data,
        secret: unknown,
        status = "active",
        expires: string | null = null;
      if (
        [
          "exception",
          "review",
          "annotation",
          "schedule",
          "maintenance",
          "alert_route",
          "webhook",
          "api_key",
        ].includes(values.kind) &&
        !values.customerId
      )
        throw new EnterpriseError(400, "Select a customer for this record.");
      if (values.kind === "standard") {
        data = standardSchema.parse({ ...data, name: values.name });
        if (data.templateId) {
          if (!values.customerId)
            throw new EnterpriseError(
              400,
              "An override must select a customer.",
            );
          const template = await linked(
            sql,
            workspace,
            null,
            data.templateId as string,
            "standard",
          );
          if (template.status !== "active")
            throw new EnterpriseError(
              409,
              "The workspace template is not active.",
            );
          await sql`update enterprise.records set status='superseded',updated_at=now() where workspace_id=${workspace} and customer_id=${values.customerId} and kind='standard' and data->>'templateId'=${data.templateId as string} and status='active'`;
        }
      }
      if (values.kind === "exception") {
        data = z
          .object({
            findingId: uuid,
            owner: text,
            reason: z.string().min(10).max(4000),
            expiresAt: z.string().datetime(),
          })
          .parse(data);
        if (Date.parse(data.expiresAt as string) <= Date.now())
          throw new EnterpriseError(
            400,
            "Exception expiry must be in the future.",
          );
        await linked(
          sql,
          workspace,
          values.customerId,
          data.findingId as string,
          "finding",
        );
        status = "pending";
        expires = data.expiresAt as string;
      }
      if (values.kind === "review") {
        data = z
          .object({ snapshotId: uuid, statement: z.string().min(10).max(4000) })
          .parse(data);
        const snapshot = await linked(
          sql,
          workspace,
          values.customerId,
          data.snapshotId as string,
          "snapshot",
        );
        if (snapshot.status !== "complete")
          throw new EnterpriseError(
            409,
            "Only complete snapshots can be signed off.",
          );
        data = {
          ...data,
          snapshotVersion: snapshot.version,
          standards: snapshot.data.standardVersions ?? [],
          signedAt: new Date().toISOString(),
          signer: member.user_id,
        };
        status = "signed";
      }
      if (values.kind === "annotation") {
        data = z
          .object({
            recordId: uuid,
            note: z.string().min(1).max(8000),
            ticket: z.string().max(500).default(""),
          })
          .parse(data);
        await linked(
          sql,
          workspace,
          values.customerId,
          data.recordId as string,
        ); // Does not assert external actor attribution.
      }
      if (values.kind === "schedule") data = scheduleSchema.parse(data);
      if (values.kind === "alert_route")
        data = z
          .object({
            recipients: z.array(z.string().email()).min(1).max(20),
            events: z
              .array(z.enum(["drift.detected", "collection.completed"]))
              .min(1),
          })
          .parse(data);
      if (values.kind === "maintenance") {
        data = z
          .object({
            startsAt: z.string().datetime(),
            endsAt: z.string().datetime(),
            reason: text,
          })
          .parse(data);
        if (
          Date.parse(data.endsAt as string) <=
          Date.parse(data.startsAt as string)
        )
          throw new EnterpriseError(
            400,
            "Maintenance must end after it starts.",
          );
      }
      if (values.kind === "webhook") {
        data = z
          .object({
            url: z.string().url().max(2000),
            events: z
              .array(
                z.enum([
                  "collection.completed",
                  "drift.detected",
                  "report.ready",
                ]),
              )
              .min(1),
          })
          .parse(data);
        const url = new URL(data.url as string);
        if (
          url.protocol !== "https:" ||
          url.username ||
          url.password ||
          (url.port && url.port !== "443")
        )
          throw new EnterpriseError(
            400,
            "Use a public HTTPS endpoint on port 443.",
          );
        secret = { signingSecret: secretToken() };
      }
      let credential: string | undefined;
      if (values.kind === "api_key") {
        const settings = z
          .object({ expiresAt: z.string().datetime() })
          .parse(data);
        if (
          Date.parse(settings.expiresAt) <= Date.now() ||
          Date.parse(settings.expiresAt) > Date.now() + 366 * 86400000
        )
          throw new EnterpriseError(
            400,
            "API credentials must expire within one year.",
          );
        credential = `idoc_${secretToken()}`;
        data = {
          hash: hashToken(credential),
          prefix: credential.slice(0, 12),
          owner: member.user_id,
        };
        expires = settings.expiresAt;
      }
      const row = await insertRecord(
        sql,
        workspace,
        values.customerId,
        values.kind,
        values.name,
        data,
        member.user_id,
        secret,
        status,
        expires,
      );
      await audit(
        sql,
        workspace,
        member.user_id,
        `${values.kind}.created`,
        values.customerId,
        { recordId: row.id },
      );
      return {
        ...present(row),
        ...(credential ? { credential } : {}),
        ...(secret ? { secret } : {}),
      };
    },
  );
}
export async function linked(
  sql: Tx,
  workspace: string,
  customer: string | null,
  id: string,
  kind?: string,
) {
  const [row] = await sql<
    RecordRow[]
  >`select * from enterprise.records where id=${id} and workspace_id=${workspace} and customer_id is not distinct from ${customer}::uuid`;
  if (!row || expiredEvidence(row) || (kind && row.kind !== kind))
    throw new EnterpriseError(
      404,
      "Evidence record is unavailable in this customer scope.",
    );
  return row;
}
export async function recordAction(
  identity: Identity,
  workspace: string,
  id: string,
  input: unknown,
) {
  const { action, customerId, otherId } = z
    .object({
      action: z.enum(["approve", "reject", "baseline", "compare", "archive"]),
      customerId: uuid.nullable(),
      otherId: uuid.optional(),
    })
    .parse(input);
  return workspaceTransaction(
    identity,
    workspace,
    action === "compare" ? "read" : action === "archive" ? "manage" : "approve",
    customerId,
    async (sql, member) => {
      const row = await linked(sql, workspace, customerId, id);
      if (action === "compare") {
        if (row.kind !== "snapshot" || !otherId)
          throw new EnterpriseError(400, "Choose two snapshots to compare.");
        const other = await linked(
          sql,
          workspace,
          customerId,
          otherId,
          "snapshot",
        );
        return diffSnapshots(
          decrypt<Snapshot>(row.encrypted!, context(row)),
          decrypt<Snapshot>(other.encrypted!, context(other)),
        );
      }
      await paid(sql, workspace);
      if (action === "baseline") {
        if (row.kind !== "snapshot" || row.status !== "complete")
          throw new EnterpriseError(
            409,
            "Approve a complete snapshot as the baseline.",
          );
        await sql`update enterprise.records set status='superseded',updated_at=now() where workspace_id=${workspace} and customer_id=${customerId} and kind='baseline' and status='approved'`;
        const baseline = await insertRecord(
          sql,
          workspace,
          customerId,
          "baseline",
          `Baseline: ${row.name}`,
          { snapshotId: id, approvedAt: new Date().toISOString() },
          member.user_id,
          undefined,
          "approved",
        );
        await audit(
          sql,
          workspace,
          member.user_id,
          "baseline.approved",
          customerId,
          { recordId: baseline.id, snapshotId: id },
        );
        return present(baseline);
      }
      if (action === "approve" || action === "reject") {
        if (row.kind !== "exception" || row.status !== "pending")
          throw new EnterpriseError(
            409,
            "This exception is not awaiting approval.",
          );
        if (row.created_by === member.user_id)
          throw new EnterpriseError(
            403,
            "Another approver must review your exception.",
          );
        if (!row.expires_at || Date.parse(row.expires_at) <= Date.now())
          throw new EnterpriseError(410, "This exception has expired.");
        await sql`update enterprise.records set status=${action === "approve" ? "approved" : "rejected"},data=data||${sql.json({ approver: member.user_id, approvedAt: new Date().toISOString() })},updated_at=now() where id=${id}`;
      } else {
        if (
          ![
            "standard",
            "schedule",
            "webhook",
            "api_key",
            "maintenance",
            "alert_route",
          ].includes(row.kind)
        )
          throw new EnterpriseError(
            400,
            "Immutable evidence cannot be archived through this action.",
          );
        await sql`update enterprise.records set status='archived',updated_at=now() where id=${id}`;
      }
      await audit(
        sql,
        workspace,
        member.user_id,
        `${row.kind}.${action}`,
        customerId,
        { recordId: id },
      );
      return { updated: true };
    },
  );
}

export async function readable(sql: Tx, workspace: string) {
  const [subscription] =
    await sql`select provider_id,paid_through,trial_ends_at from enterprise.subscriptions where workspace_id=${workspace}`;
  const until = subscription?.paid_through ?? subscription?.trial_ends_at;
  if (
    subscription?.provider_id &&
    until &&
    new Date(until as string).getTime() + 30 * 86400000 < Date.now()
  )
    throw new EnterpriseError(
      402,
      "The 30-day export recovery window has ended. Contact support to review your subscription.",
    );
}
