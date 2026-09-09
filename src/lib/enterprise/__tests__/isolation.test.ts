import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
let db: PGlite,
  workspace: string,
  other: string,
  owner: string,
  guest: string,
  customerA: string,
  customerB: string;
const tenant = "00000000-0000-4000-8000-000000000001";
async function asUser(object: string, work: (id: string) => Promise<void>) {
  await db.exec("begin; set local role enterprise_app");
  try {
    await db.query(
      "select set_config('enterprise.tid',$1,true),set_config('enterprise.oid',$2,true)",
      [tenant, object],
    );
    const result = await db.query<{ id: string }>(
      "select enterprise.identify('Test member') as id",
    );
    const id = result.rows[0]!.id;
    await db.query("select set_config('enterprise.user_id',$1,true)", [id]);
    await work(id);
    await db.exec("commit");
  } catch (error) {
    await db.exec("rollback");
    throw error;
  }
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    readFileSync(
      "supabase/migrations/20260909172824_enterprise_workspace_platform.sql",
      "utf8",
    ),
  );
  await asUser("00000000-0000-4000-8000-000000000002", async (id) => {
    owner = id;
    workspace = (
      await db.query<{ id: string }>(
        "select enterprise.provision('Contoso','msp') as id",
      )
    ).rows[0]!.id;
  });
  await asUser("00000000-0000-4000-8000-000000000003", async (id) => {
    guest = id;
    other = (
      await db.query<{ id: string }>(
        "select enterprise.provision('Other company','enterprise') as id",
      )
    ).rows[0]!.id;
  });
  customerA = (
    await db.query<{ id: string }>(
      "insert into enterprise.tenants(workspace_id,tenant_id,name,kind) values($1,gen_random_uuid(),'Customer A','customer') returning id",
      [workspace],
    )
  ).rows[0]!.id;
  customerB = (
    await db.query<{ id: string }>(
      "insert into enterprise.tenants(workspace_id,tenant_id,name,kind) values($1,gen_random_uuid(),'Customer B','customer') returning id",
      [workspace],
    )
  ).rows[0]!.id;
  await db.query(
    "insert into enterprise.records(workspace_id,customer_id,kind,name) values($1,$2,'snapshot','A evidence'),($1,$3,'snapshot','B evidence')",
    [workspace, customerA, customerB],
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
describe("private paid-data database", () => {
  it("limits a creator to one trial workspace while allowing checkout retries", async () => {
    await asUser("00000000-0000-4000-8000-000000000002", async () => {
      const claim = async (id: string) =>
        (
          await db.query<{ allowed: boolean }>(
            "select enterprise.claim_trial($1) as allowed",
            [id],
          )
        ).rows[0]!.allowed;
      expect(await claim(workspace)).toBe(true);
      expect(await claim(workspace)).toBe(true);
      const second = (
        await db.query<{ id: string }>(
          "select enterprise.provision('Second workspace','enterprise') as id",
        )
      ).rows[0]!.id;
      expect(await claim(second)).toBe(false);
    });
  });
  it("does not auto-join a user from the same Entra tenant", async () => {
    await asUser("00000000-0000-4000-8000-000000000003", async () => {
      const result = await db.query<{ id: string }>(
        "select id from enterprise.workspaces",
      );
      expect(result.rows.map((r) => r.id)).toEqual([other]);
      expect(
        (
          await db.query(
            "select * from enterprise.records where workspace_id=$1",
            [workspace],
          )
        ).rows,
      ).toEqual([]);
    });
  });
  it("enforces selected-customer scope even without an application WHERE filter", async () => {
    await db.query(
      "insert into enterprise.memberships(workspace_id,user_id,role,customer_scope) values($1,$2,'viewer',array[$3]::uuid[])",
      [workspace, guest, customerA],
    );
    await asUser("00000000-0000-4000-8000-000000000003", async () => {
      expect(
        (
          await db.query<{ name: string }>(
            "select name from enterprise.records",
          )
        ).rows.map((r) => r.name),
      ).toEqual(["A evidence"]);
      expect(
        (
          await db.query<{ id: string }>("select id from enterprise.tenants")
        ).rows.map((r) => r.id),
      ).toEqual([customerA]);
    });
  });
  it("rejects inserting evidence into an unauthorized customer", async () => {
    await expect(
      asUser("00000000-0000-4000-8000-000000000003", async () => {
        await db.query(
          "insert into enterprise.records(workspace_id,customer_id,kind,name) values($1,$2,'annotation','forbidden')",
          [workspace, customerB],
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });
  it("applies membership revocation to the next transaction", async () => {
    await db.query(
      "delete from enterprise.memberships where workspace_id=$1 and user_id=$2",
      [workspace, guest],
    );
    await asUser("00000000-0000-4000-8000-000000000003", async () => {
      expect((await db.query("select * from enterprise.records")).rows).toEqual(
        [],
      );
    });
  });
  it("protects the final owner in the database", async () => {
    await expect(
      asUser("00000000-0000-4000-8000-000000000002", async () => {
        await db.query(
          "delete from enterprise.memberships where workspace_id=$1 and user_id=$2",
          [workspace, owner],
        );
      }),
    ).rejects.toThrow(/final workspace owner/);
  });
  it("does not expose paid identity tables to the app role", async () => {
    await expect(
      asUser("00000000-0000-4000-8000-000000000002", async () => {
        await db.query("select * from enterprise.users");
      }),
    ).rejects.toThrow(/permission denied/);
  });
  it("enables RLS on every paid table", async () => {
    const result = await db.query<{ relname: string }>(
      "select relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='enterprise' and c.relkind='r' and not c.relrowsecurity",
    );
    expect(result.rows).toEqual([]);
  });
  it("prevents reassignment of a record across workspaces", async () => {
    await expect(
      asUser("00000000-0000-4000-8000-000000000002", async () => {
        await db.query(
          "update enterprise.records set workspace_id=$1,customer_id=null where workspace_id=$2",
          [other, workspace],
        );
      }),
    ).rejects.toThrow(/row-level security/);
  });
});
