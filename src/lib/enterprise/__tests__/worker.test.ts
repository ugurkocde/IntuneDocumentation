import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, afterAll, it, expect, vi } from "vitest";
import type { Tx } from "../db";
const state = vi.hoisted(() => ({ db: null as PGlite | null }));
vi.mock("../db", () => ({
  systemTransaction: async (work: (sql: Tx) => Promise<unknown>) => {
    const db = state.db!;
    const tag = Object.assign(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        let query = strings[0] ?? "";
        for (let i = 0; i < values.length; i++)
          query += `$${i + 1}${strings[i + 1] ?? ""}`;
        const args = values.map((v) =>
          v instanceof Date
            ? v.toISOString()
            : Array.isArray(v)
              ? `{${v.map((item) => `"${String(item).replaceAll('"', '\\"')}"`).join(",")}}`
              : v,
        );
        return (await db.query(query, args)).rows;
      },
      { json: (v: unknown) => JSON.stringify(v) },
    );
    await db.exec("begin; set local role enterprise_worker");
    try {
      const result = await work(tag as unknown as Tx);
      await db.exec("commit");
      return result;
    } catch (error) {
      await db.exec("rollback");
      throw error;
    }
  },
  audit: async () => undefined,
}));
vi.mock("../billing", () => ({ reconcileBilling: async () => undefined }));
vi.mock("../collector", () => ({
  collectionSteps: [{ name: "Policies" }, { name: "Assignments" }],
  collectStep: async (_tenant: string, index: number) =>
    index === 0
      ? { policies: { status: "complete", data: [{ id: "a", enabled: true }] } }
      : { assignments: { status: "complete", data: [] } },
  collectAuditEvents: async () => ({ events: [], complete: false }),
  probeTenant: async () => undefined,
}));
vi.mock("../reports", () => ({
  generateReport: async () => ({
    buffer: Buffer.from("%PDF-test"),
    errors: [],
    totalPolicies: 1,
    successfulPolicies: 1,
  }),
}));
import { runWorker } from "../worker";
let workspace: string, customer: string, owner: string;
beforeAll(async () => {
  state.db = new PGlite();
  await state.db.exec(
    readFileSync(
      "supabase/migrations/20260909172824_enterprise_workspace_platform.sql",
      "utf8",
    ),
  );
  const [user] = (
    await state.db.query<{ id: string }>(
      "insert into enterprise.users(tenant_id,object_id,name) values(gen_random_uuid(),gen_random_uuid(),'Owner') returning id",
    )
  ).rows;
  owner = user!.id;
  workspace = (
    await state.db.query<{ id: string }>(
      "insert into enterprise.workspaces(name,plan,created_by) values('Workspace','enterprise',$1) returning id",
      [user!.id],
    )
  ).rows[0]!.id;
  await state.db.query(
    "insert into enterprise.memberships(workspace_id,user_id,role) values($1,$2,'owner')",
    [workspace, owner],
  );
  customer = (
    await state.db.query<{ id: string }>(
      "insert into enterprise.tenants(workspace_id,tenant_id,name,kind,status,next_collection_at) values($1,gen_random_uuid(),'Customer','production','connected',now()) returning id",
      [workspace],
    )
  ).rows[0]!.id;
  await state.db.query(
    "insert into enterprise.subscriptions(workspace_id,status,quantity,paid_through) values($1,'active',1,now()+interval '1 month')",
    [workspace],
  );
  vi.stubEnv("ENTERPRISE_ENABLED", "true");
  vi.stubEnv(
    "ENTERPRISE_ENCRYPTION_KEYS",
    JSON.stringify({ test: Buffer.alloc(32, 8).toString("base64") }),
  );
  vi.stubEnv("ENTERPRISE_ACTIVE_KEY", "test");
}, 30000);
afterAll(async () => {
  await state.db?.close();
  vi.unstubAllEnvs();
});
it("resumes section jobs and publishes exactly one encrypted snapshot", async () => {
  expect(await runWorker()).toHaveProperty("processed");
  expect(
    (
      await state.db!.query<{ status: string }>(
        "select status from enterprise.records where kind='snapshot'",
      )
    ).rows[0]?.status,
  ).toBe("collecting");
  expect(await runWorker()).toHaveProperty("processed");
  const snapshots = await state.db!.query<{
    status: string;
    encrypted: string;
  }>("select status,encrypted from enterprise.records where kind='snapshot'");
  expect(snapshots.rows).toHaveLength(1);
  expect(snapshots.rows[0]?.status).toBe("complete");
  expect(snapshots.rows[0]?.encrypted).not.toContain('"enabled"');
  expect(
    (
      await state.db!.query(
        "select * from enterprise.jobs where status='complete'",
      )
    ).rows,
  ).toHaveLength(1);
  expect(await runWorker()).toEqual({ idle: true });
});
it("does not enqueue collection after paid access expires", async () => {
  await state.db!.query(
    "update enterprise.subscriptions set paid_through=now()-interval '1 day' where workspace_id=$1",
    [workspace],
  );
  await state.db!.query(
    "update enterprise.tenants set next_collection_at=now() where id=$1",
    [customer],
  );
  expect(await runWorker()).toEqual({ idle: true });
  expect(
    (await state.db!.query("select * from enterprise.jobs")).rows,
  ).toHaveLength(1);
});

it("a consent callback cannot activate shared tenant access without a customer-admin identity", async () => {
  const { completeConsent, approveConnection } = await import("../tenants");
  const { hashToken } = await import("../crypto");
  const stateToken = "a".repeat(43);
  const tenantId = (
    await state.db!.query<{ tenant_id: string }>(
      "select tenant_id from enterprise.tenants where id=$1",
      [customer],
    )
  ).rows[0]!.tenant_id;
  await state.db!.query(
    "update enterprise.tenants set status='pending' where id=$1",
    [customer],
  );
  await state.db!.query(
    "update enterprise.subscriptions set status='active',paid_through=now()+interval '1 month' where workspace_id=$1",
    [workspace],
  );
  await state.db!.query(
    "insert into enterprise.records(workspace_id,customer_id,kind,name,status,data,expires_at,created_by) values($1,$2,'consent','Consent','pending',$3,now()+interval '1 hour',$4)",
    [
      workspace,
      customer,
      JSON.stringify({ hash: hashToken(stateToken), tenantId }),
      owner,
    ],
  );
  const response = await completeConsent(
    new Request(
      `https://example.test/api/enterprise/consent?tenant=${tenantId}&state=${stateToken}&admin_consent=True`,
    ),
  );
  expect(response.status).toBe(303);
  expect(
    (
      await state.db!.query<{ status: string }>(
        "select status from enterprise.tenants where id=$1",
        [customer],
      )
    ).rows[0]!.status,
  ).toBe("pending");
  await expect(
    approveConnection(
      {
        tenantId: "00000000-0000-4000-8000-000000000099",
        objectId: "00000000-0000-4000-8000-000000000002",
        name: "Wrong directory",
        issuedAt: Math.floor(Date.now() / 1000),
        directoryRoles: ["62e90394-69f5-4237-9190-012177145e10"],
      },
      { token: stateToken, acknowledged: true },
    ),
  ).rejects.toThrow(/customer tenant/);
  const approvalIdentity = {
    tenantId,
    objectId: "00000000-0000-4000-8000-000000000002",
    name: "Customer administrator",
    issuedAt: Math.floor(Date.now() / 1000),
    directoryRoles: ["62e90394-69f5-4237-9190-012177145e10"],
  };
  const excess = (
    await state.db!.query<{ id: string }>(
      "insert into enterprise.tenants(workspace_id,tenant_id,name,kind,status) values($1,gen_random_uuid(),'Other customer','production','connected') returning id",
      [workspace],
    )
  ).rows[0]!.id;
  await expect(
    approveConnection(approvalIdentity, {
      token: stateToken,
      acknowledged: true,
    }),
  ).rejects.toThrow(/additional tenant capacity/);
  await state.db!.query("delete from enterprise.tenants where id=$1", [excess]);
  await expect(
    approveConnection(
      {
        tenantId,
        objectId: "00000000-0000-4000-8000-000000000002",
        name: "Customer administrator",
        issuedAt: Math.floor(Date.now() / 1000),
        directoryRoles: ["62e90394-69f5-4237-9190-012177145e10"],
      },
      { token: stateToken, acknowledged: true },
    ),
  ).resolves.toEqual({ approved: true });
  expect(
    (
      await state.db!.query<{ status: string }>(
        "select status from enterprise.tenants where id=$1",
        [customer],
      )
    ).rows[0]!.status,
  ).toBe("connected");
  await expect(
    approveConnection(
      {
        tenantId,
        objectId: "00000000-0000-4000-8000-000000000002",
        name: "Customer administrator",
        issuedAt: Math.floor(Date.now() / 1000),
        directoryRoles: ["62e90394-69f5-4237-9190-012177145e10"],
      },
      { token: stateToken, acknowledged: true },
    ),
  ).rejects.toThrow(/already used/);
});
