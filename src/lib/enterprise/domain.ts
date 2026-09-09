import { z } from "zod";

export const roles = [
  "owner",
  "admin",
  "analyst",
  "viewer",
  "auditor",
] as const;
export type Role = (typeof roles)[number];
export type Plan = "enterprise" | "msp";
export type Permission =
  | "read"
  | "manage"
  | "investigate"
  | "approve"
  | "review"
  | "billing";
export type Member = {
  user_id: string;
  role: Role;
  customer_scope: string[] | null;
  expires_at: string | null;
};
export class EnterpriseError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
const rights: Record<Role, readonly Permission[]> = {
  owner: ["read", "manage", "investigate", "approve", "review", "billing"],
  admin: ["read", "manage", "investigate", "approve", "review"],
  analyst: ["read", "investigate"],
  viewer: ["read"],
  auditor: ["read", "review"],
};
export function allowed(
  member: Member,
  permission: Permission,
  customer?: string | null,
  now = Date.now(),
) {
  return (
    (!member.expires_at || Date.parse(member.expires_at) > now) &&
    rights[member.role].includes(permission) &&
    (!customer ||
      member.customer_scope === null ||
      member.customer_scope.includes(customer))
  );
}
export function requirePermission(
  member: Member,
  permission: Permission,
  customer?: string | null,
) {
  if (!allowed(member, permission, customer))
    throw new EnterpriseError(
      403,
      "Your current role or customer scope does not permit this action.",
    );
}
export function canDelegate(actor: Member, role: Role, scope: string[] | null) {
  return (
    allowed(actor, "manage") &&
    (role !== "owner" || actor.role === "owner") &&
    (actor.customer_scope === null ||
      (scope !== null &&
        scope.every((id) => actor.customer_scope!.includes(id))))
  );
}
export const FOUNDERS_END = "2026-10-31T23:00:00.000Z";
export function price(
  plan: Plan,
  productionCount: number,
  interval: "month" | "year",
  founders = false,
) {
  if (
    !Number.isSafeInteger(productionCount) ||
    productionCount < 0 ||
    productionCount > 10000
  )
    throw new EnterpriseError(400, "Invalid tenant quantity.");
  if (founders && interval === "year")
    throw new EnterpriseError(
      400,
      "Founders pricing cannot be combined with annual pricing.",
    );
  const base = plan === "enterprise" ? 14900 : 24900;
  const included = plan === "enterprise" ? 1 : 10;
  const extras = Math.max(0, productionCount - included);
  const monthly = base + extras * (plan === "enterprise" ? 9900 : 2000);
  return {
    currency: "USD",
    included,
    extras,
    cents:
      interval === "year"
        ? (monthly * 12 * 85) / 100
        : founders
          ? monthly / 2
          : monthly,
    interval,
  };
}
export const uuid = z.string().uuid();
export const text = z.string().trim().min(1).max(240);
export const scopeSchema = z.array(uuid).max(1000).nullable();
export const ruleSchema = z.object({
  id: uuid,
  name: text,
  section: text,
  path: z.string().min(1).max(500),
  operator: z.enum(["equals", "notEquals", "contains", "exists"]),
  expected: z.union([z.string().max(5000), z.number(), z.boolean(), z.null()]),
  severity: z.enum(["low", "medium", "high", "critical"]),
});
export const standardSchema = z.object({
  templateId: uuid.optional(),
  definitionVersion: z.number().int().min(1).max(100000).default(1),
  name: text,
  description: z.string().max(4000),
  rules: z.array(ruleSchema).min(1).max(200),
});
export type Standard = z.input<typeof standardSchema>;
export type Section = {
  status: "complete" | "failed";
  data: unknown[];
  error?: string;
  familyKey?: string;
  label?: string;
  selectionPrefix?: string;
};
export type Snapshot = {
  version: 1;
  capturedAt: string;
  sections: Record<string, Section>;
};
export type Change = {
  section: string;
  policy: string;
  name: string;
  path: string;
  before?: unknown;
  after?: unknown;
  kind: "added" | "removed" | "changed";
};
export type RuleResult = {
  rule: string;
  policy: string;
  status: "pass" | "fail" | "unknown";
  actual?: unknown;
  severity: string;
};

export function monthsAfter(date: Date, months: number) {
  const result = new Date(date),
    day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}
