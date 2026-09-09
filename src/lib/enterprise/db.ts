import postgres from "postgres";
import { type Identity } from "./auth";
import {
  EnterpriseError,
  type Member,
  type Permission,
  requirePermission,
} from "./domain";
export type Tx = postgres.TransactionSql;
let connection: postgres.Sql | undefined,
  workerConnection: postgres.Sql | undefined;
function connect(worker: boolean) {
  const url =
    process.env[
      worker ? "ENTERPRISE_WORKER_DATABASE_URL" : "ENTERPRISE_DATABASE_URL"
    ];
  if (!url)
    throw new EnterpriseError(503, "Workspace storage is not configured.");
  return postgres(url, {
    max: 3,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl:
      process.env.ENTERPRISE_LOCAL_DATABASE === "true" ? false : "verify-full",
  });
}
export function database() {
  return (connection ??= connect(false));
}
export function workerDatabase() {
  return (workerConnection ??= connect(true));
}
export async function identityTransaction<T>(
  identity: Identity,
  work: (sql: Tx, userId: string) => Promise<T>,
): Promise<T> {
  const result = await database().begin(async (sql) => {
    await sql`set local role enterprise_app`;
    await sql`select set_config('enterprise.tid', ${identity.tenantId}, true), set_config('enterprise.oid', ${identity.objectId}, true)`;
    const [user] = await sql<
      { id: string }[]
    >`select enterprise.identify(${identity.name}) as id`;
    if (!user)
      throw new EnterpriseError(401, "Unable to establish workspace identity.");
    await sql`select set_config('enterprise.user_id', ${user.id}, true)`;
    return work(sql, user.id);
  });
  return result as T;
}
export async function workspaceTransaction<T>(
  identity: Identity,
  workspaceId: string,
  permission: Permission,
  customer: string | null,
  work: (sql: Tx, member: Member) => Promise<T>,
): Promise<T> {
  return identityTransaction(identity, async (sql, userId) => {
    const [member] = await sql<
      Member[]
    >`select user_id, role, customer_scope, expires_at::text from enterprise.memberships where workspace_id=${workspaceId} and user_id=${userId} and (expires_at is null or expires_at > now())`;
    if (!member)
      throw new EnterpriseError(404, "Workspace not found or access expired.");
    requirePermission(member, permission, customer);
    await sql`select set_config('enterprise.workspace_id', ${workspaceId}, true)`;
    return work(sql, member);
  });
}
export async function systemTransaction<T>(
  work: (sql: Tx) => Promise<T>,
): Promise<T> {
  return (await workerDatabase().begin(async (sql) => {
    await sql`set local role enterprise_worker`;
    return work(sql);
  })) as T;
}
export async function audit(
  sql: Tx,
  workspace: string,
  actor: string | null,
  action: string,
  customer: string | null,
  details: Record<string, unknown> = {},
) {
  await sql`insert into enterprise.audit_events(workspace_id, actor_id, action, customer_id, details) values (${workspace},${actor},${action},${customer},${sql.json(details as postgres.JSONValue)})`;
}
