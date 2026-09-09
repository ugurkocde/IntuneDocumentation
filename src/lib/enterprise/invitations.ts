import { randomInt } from "node:crypto";
import { z } from "zod";
import { type Identity } from "./auth";
import {
  audit,
  identityTransaction,
  systemTransaction,
  workspaceTransaction,
} from "./db";
import {
  EnterpriseError,
  canDelegate,
  type Member,
  type Role,
  scopeSchema,
  uuid,
} from "./domain";
import { hashToken, secretToken } from "./crypto";
import { appOrigin, sendEmail } from "./email";
import { paid } from "./records";
const invitationSchema = z.object({
  email: z
    .string()
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  role: z.enum(["admin", "analyst", "viewer", "auditor"]),
  scope: scopeSchema,
  expiresAt: z.string().datetime().nullable(),
});
type Invite = {
  id: string;
  workspace_id: string;
  email: string;
  role: Role;
  customer_scope: string[] | null;
  member_expires_at: string | null;
  created_by: string;
  attempts: number;
  challenge_hash: string | null;
  challenge_user: string | null;
  challenge_expires_at: string | null;
};
export async function invite(
  identity: Identity,
  workspace: string,
  input: unknown,
) {
  const data = invitationSchema.parse(input);
  if (
    data.role === "auditor" &&
    (!data.expiresAt || Date.parse(data.expiresAt) <= Date.now())
  )
    throw new EnterpriseError(400, "Auditor access requires a future expiry.");
  const token = secretToken();
  const result = await workspaceTransaction(
    identity,
    workspace,
    "manage",
    null,
    async (sql, member) => {
      await paid(sql, workspace);
      await sql`select id from enterprise.workspaces where id=${workspace} for update`;
      const [count] =
        await sql`select count(*)::int as count from enterprise.invitations where workspace_id=${workspace} and created_at>now()-interval '1 day'`;
      if (Number(count?.count ?? 0) >= 100)
        throw new EnterpriseError(
          429,
          "Daily invitation limit reached. Contact support for larger onboarding batches.",
        );
      if (!canDelegate(member, data.role, data.scope))
        throw new EnterpriseError(
          403,
          "You cannot delegate this role or scope.",
        );
      if (data.scope) {
        const tenants =
          await sql`select id from enterprise.tenants where workspace_id=${workspace} and id=any(${data.scope}::uuid[])`;
        if (tenants.length !== new Set(data.scope).size)
          throw new EnterpriseError(400, "Customer scope is invalid.");
      }
      const [row] = await sql<
        { id: string }[]
      >`insert into enterprise.invitations(workspace_id,email,role,customer_scope,member_expires_at,token_hash,created_by,expires_at) values(${workspace},${data.email},${data.role},${data.scope},${data.expiresAt},${hashToken(token)},${member.user_id},now()+interval '7 days') returning id`;
      await audit(sql, workspace, member.user_id, "invitation.created", null, {
        invitationId: row!.id,
        role: data.role,
      });
      return row!;
    },
  );
  try {
    await sendEmail(
      [data.email],
      "Your Intune Documentation team invitation",
      `You have been invited to a private workspace. Sign in with your Microsoft business account, then verify this mailbox to accept. The link expires in 7 days.\n\n${appOrigin()}/enterprise?invite=${token}\n\nIf unexpected, ignore this message.`,
      result.id,
    );
  } catch (error) {
    await workspaceTransaction(
      identity,
      workspace,
      "manage",
      null,
      async (sql) => {
        await sql`update enterprise.invitations set revoked_at=now() where id=${result.id}`;
      },
    );
    throw error;
  }
  return { id: result.id };
}
export async function acceptInvite(identity: Identity, input: unknown) {
  const { token, code } = z
    .object({
      token: z.string().min(40).max(100),
      code: z
        .string()
        .regex(/^\d{8}$/)
        .optional(),
    })
    .parse(input);
  const user = await identityTransaction(identity, async (_sql, id) => id);
  const generated = String(randomInt(10000000, 100000000));
  const outcome = await systemTransaction(async (sql) => {
    const [row] = await sql<
      Invite[]
    >`select * from enterprise.invitations where token_hash=${hashToken(token)} and expires_at>now() and revoked_at is null and accepted_at is null for update`;
    if (!row)
      throw new EnterpriseError(
        410,
        "This invitation is invalid, expired, revoked or already accepted.",
      );
    const [inviter] = await sql<
      Member[]
    >`select * from enterprise.memberships where workspace_id=${row.workspace_id} and user_id=${row.created_by}`;
    if (!inviter || !canDelegate(inviter, row.role, row.customer_scope))
      throw new EnterpriseError(
        403,
        "The inviter no longer has permission to grant this access.",
      );
    if (
      row.member_expires_at &&
      Date.parse(row.member_expires_at) <= Date.now()
    )
      throw new EnterpriseError(410, "The invited access period has expired.");
    if (!code) {
      const updated =
        await sql`update enterprise.invitations set challenge_hash=${hashToken(generated)},challenge_user=${user},challenge_expires_at=now()+interval '10 minutes',challenged_at=now() where id=${row.id} and attempts<5 and (challenged_at is null or challenged_at<now()-interval '60 seconds') returning id`;
      if (!updated.length)
        return {
          error:
            "Please wait before requesting another code, or ask for a new invitation.",
          status: 429,
        };
      return { email: row.email, invitation: row.id };
    }
    if (
      row.attempts >= 5 ||
      row.challenge_user !== user ||
      !row.challenge_expires_at ||
      Date.parse(row.challenge_expires_at) <= Date.now() ||
      row.challenge_hash !== hashToken(code)
    ) {
      await sql`update enterprise.invitations set attempts=attempts+1 where id=${row.id}`;
      return { error: "Verification code is invalid or expired.", status: 400 };
    }
    await sql`insert into enterprise.memberships(workspace_id,user_id,role,customer_scope,expires_at,display_name) values(${row.workspace_id},${user},${row.role},${row.customer_scope},${row.member_expires_at},${identity.name}) on conflict do nothing`;
    await sql`update enterprise.invitations set accepted_by=${user},accepted_at=now(),challenge_hash=null where id=${row.id}`;
    await audit(sql, row.workspace_id, user, "invitation.accepted", null, {
      invitationId: row.id,
    });
    return { workspaceId: row.workspace_id };
  });
  if (outcome.error) throw new EnterpriseError(outcome.status, outcome.error);
  if (outcome.email) {
    await sendEmail(
      [outcome.email],
      "Verify your team invitation",
      `Your verification code is ${generated}. It expires in 10 minutes. Enter it only in the Intune Documentation invitation you started.`,
      `${outcome.invitation}-${Date.now()}`,
    );
    return { verificationRequired: true };
  }
  return { workspaceId: outcome.workspaceId };
}
export async function updateMember(
  identity: Identity,
  workspace: string,
  user: string,
  input: unknown,
) {
  uuid.parse(user);
  const data = z
    .object({
      role: z.enum(["owner", "admin", "analyst", "viewer", "auditor"]),
      scope: scopeSchema,
      expiresAt: z.string().datetime().nullable(),
      remove: z.boolean().default(false),
    })
    .parse(input);
  return workspaceTransaction(
    identity,
    workspace,
    "manage",
    null,
    async (sql, actor) => {
      // Membership administration exposes identities, so only full-workspace admins manage existing members.
      if (
        actor.customer_scope !== null ||
        !canDelegate(actor, data.role, data.scope)
      )
        throw new EnterpriseError(
          403,
          "Only a workspace-wide administrator can update members.",
        );
      await sql`select id from enterprise.workspaces where id=${workspace} for update`;
      const [target] = await sql<
        Member[]
      >`select * from enterprise.memberships where workspace_id=${workspace} and user_id=${user}`;
      if (!target || (target.role === "owner" && actor.role !== "owner"))
        throw new EnterpriseError(
          403,
          "Only an owner can change another owner's access.",
        );
      if (data.role === "owner" && (data.scope !== null || data.expiresAt))
        throw new EnterpriseError(
          400,
          "Owners require permanent workspace-wide access.",
        );
      if (
        data.role === "auditor" &&
        (!data.expiresAt || Date.parse(data.expiresAt) <= Date.now())
      )
        throw new EnterpriseError(400, "Auditors require a future expiry.");
      if (target.role === "owner" && (data.remove || data.role !== "owner")) {
        const owners =
          await sql`select user_id from enterprise.memberships where workspace_id=${workspace} and role='owner'`;
        if (owners.length <= 1)
          throw new EnterpriseError(
            409,
            "Add another owner before removing or changing the final owner.",
          );
      }
      if (data.remove)
        await sql`delete from enterprise.memberships where workspace_id=${workspace} and user_id=${user}`;
      else
        await sql`update enterprise.memberships set role=${data.role},customer_scope=${data.scope},expires_at=${data.expiresAt} where workspace_id=${workspace} and user_id=${user}`;
      await audit(
        sql,
        workspace,
        actor.user_id,
        data.remove ? "membership.removed" : "membership.updated",
        null,
        { user, role: data.role, scope: data.scope },
      );
      return { updated: true };
    },
  );
}

export async function revokeInvitation(
  identity: Identity,
  workspace: string,
  id: string,
) {
  return workspaceTransaction(
    identity,
    workspace,
    "manage",
    null,
    async (sql, member) => {
      const [row] = await sql<
        Invite[]
      >`select * from enterprise.invitations where workspace_id=${workspace} and id=${id}`;
      if (!row || !canDelegate(member, row.role, row.customer_scope))
        throw new EnterpriseError(
          403,
          "This invitation is outside your administrative scope.",
        );
      await sql`update enterprise.invitations set revoked_at=now(),challenge_hash=null where workspace_id=${workspace} and id=${id} and accepted_at is null`;
      await audit(sql, workspace, member.user_id, "invitation.revoked", null, {
        invitationId: id,
      });
      return { updated: true };
    },
  );
}
