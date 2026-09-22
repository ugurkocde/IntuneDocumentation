import { type KeyObject } from "node:crypto";
import {
  PolarNotFound,
  PolarNotPermitted,
  type PolarActivation,
  type PolarClient,
  type PolarLicenseKey,
} from "./polar";
import {
  signEntitlement,
  TOKEN_LIFETIME_SECONDS,
  type EntitlementPayload,
} from "./token";

export const INSTALLS_PER_TENANT = 5;
export const MSP_FALLBACK_TENANTS = 10;

// A confirmed refusal. The route answers 403 with this reason so the desktop
// app can tell it apart from an outage (502) and drop its cached token.
export class LicenseDenied extends Error {
  constructor(
    readonly reason:
      | "invalid_key"
      | "not_found"
      | "revoked"
      | "disabled"
      | "expired"
      | "tenant_limit"
      | "install_limit"
      | "activation_limit"
      | "activation_mismatch",
  ) {
    super(reason);
  }
}

export interface LicenseContext {
  polar: PolarClient;
  signingKey: KeyObject;
  proBenefitId: string;
  mspBenefitId: string;
  now?: () => number;
}

export interface Entitlement {
  token: string;
  activationId: string;
  plan: EntitlementPayload["plan"];
  tenants: number;
  expiresAt: string;
}

// Pin the key to this app's benefits (LicenseMeter keys live in the same
// Polar organization) and require it to be currently granted. Polar's
// validate already answers 404 for revoked, disabled and expired keys; the
// status checks are a second line in case that ever changes.
function checkKey(ctx: LicenseContext, key: PolarLicenseKey, now: number) {
  if (
    key.benefit_id !== ctx.proBenefitId &&
    key.benefit_id !== ctx.mspBenefitId
  )
    throw new LicenseDenied("invalid_key");
  if (key.status === "revoked") throw new LicenseDenied("revoked");
  if (key.status === "disabled") throw new LicenseDenied("disabled");
  if (key.status !== "granted") throw new LicenseDenied("invalid_key");
  if (key.expires_at && Date.parse(key.expires_at) <= now)
    throw new LicenseDenied("expired");
  return key.benefit_id === ctx.proBenefitId ? "pro" : "msp";
}

async function tenantAllowance(
  ctx: LicenseContext,
  plan: "pro" | "msp",
  key: PolarLicenseKey,
) {
  if (plan === "pro") return 1;
  const units = await ctx.polar.tenantsForKey(
    ctx.mspBenefitId,
    key.customer_id,
    key.id,
  );
  if (units) return units;
  console.warn(
    `desktop-license: no tenant quantity for key ${key.id}, using ${MSP_FALLBACK_TENANTS}`,
  );
  return MSP_FALLBACK_TENANTS;
}

function metaOf(activation: PolarActivation) {
  const meta = activation.meta ?? {};
  return {
    installId: typeof meta.installId === "string" ? meta.installId : "",
    tenantId: typeof meta.tenantId === "string" ? meta.tenantId : "",
  };
}

// Whether adding (installId, tenantId) to these activations would exceed the
// tenant allowance or the per-tenant install limit.
function limitViolation(
  activations: { installId: string; tenantId: string }[],
  input: { installId: string; tenantId: string },
  tenants: number,
): "tenant_limit" | "install_limit" | null {
  const knownTenants = new Set(activations.map((a) => a.tenantId));
  if (!knownTenants.has(input.tenantId) && knownTenants.size >= tenants)
    return "tenant_limit";
  const installs = new Set(
    activations
      .filter((a) => a.tenantId === input.tenantId)
      .map((a) => a.installId),
  );
  if (!installs.has(input.installId) && installs.size >= INSTALLS_PER_TENANT)
    return "install_limit";
  return null;
}

function issue(
  ctx: LicenseContext,
  now: number,
  fields: Omit<EntitlementPayload, "v" | "status" | "iat" | "exp">,
): Entitlement {
  const iat = Math.floor(now / 1000);
  const exp = iat + TOKEN_LIFETIME_SECONDS;
  const token = signEntitlement(
    { v: 1, status: "granted", iat, exp, ...fields },
    ctx.signingKey,
  );
  return {
    token,
    activationId: fields.act,
    plan: fields.plan,
    tenants: fields.tenants,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

async function validateOrDeny(
  ctx: LicenseContext,
  key: string,
  activationId?: string,
) {
  try {
    return await ctx.polar.validate(key, activationId);
  } catch (error) {
    // Polar does not say why: unknown, revoked, disabled or expired key, or
    // an activation that no longer exists.
    if (error instanceof PolarNotFound) throw new LicenseDenied("not_found");
    throw error;
  }
}

export async function activateLicense(
  ctx: LicenseContext,
  input: {
    key: string;
    installId: string;
    tenantId: string;
    os: string;
    appVersion: string;
  },
): Promise<Entitlement> {
  const now = ctx.now?.() ?? Date.now();
  const validated = await validateOrDeny(ctx, input.key);
  const plan = checkKey(ctx, validated, now);
  const full = await ctx.polar.getKey(validated.id);
  const tenants = await tenantAllowance(ctx, plan, validated);

  const activations = full.activations.map((a) => ({ id: a.id, ...metaOf(a) }));
  let activationId = activations.find(
    (a) => a.installId === input.installId && a.tenantId === input.tenantId,
  )?.id;

  if (!activationId) {
    const violation = limitViolation(activations, input, tenants);
    if (violation) throw new LicenseDenied(violation);
    try {
      const created = await ctx.polar.activate(
        input.key,
        `${input.os} ${input.installId.slice(0, 8)}`,
        {
          installId: input.installId,
          tenantId: input.tenantId,
          os: input.os,
          appVersion: input.appVersion,
        },
      );
      activationId = created.id;
    } catch (error) {
      // Polar refuses once the benefit's own activation limit is reached.
      if (error instanceof PolarNotPermitted)
        throw new LicenseDenied("activation_limit");
      throw error;
    }

    // Concurrent activations can both pass the check above. Re-read and roll
    // back our own activation if the key is now over a limit; a racing
    // request may do the same, which fails closed and a retry succeeds.
    const after = (await ctx.polar.getKey(validated.id)).activations
      .filter((a) => a.id !== activationId)
      .map((a) => ({ id: a.id, ...metaOf(a) }));
    const raced = limitViolation(after, input, tenants);
    if (raced) {
      await ctx.polar.deactivate(input.key, activationId);
      throw new LicenseDenied(raced);
    }
  }

  return issue(ctx, now, {
    sub: validated.id,
    act: activationId,
    plan,
    tenantId: input.tenantId,
    installId: input.installId,
    tenants,
  });
}

export async function refreshLicense(
  ctx: LicenseContext,
  input: {
    key: string;
    activationId: string;
    installId: string;
    tenantId: string;
  },
): Promise<Entitlement> {
  const now = ctx.now?.() ?? Date.now();
  const validated = await validateOrDeny(ctx, input.key, input.activationId);
  const plan = checkKey(ctx, validated, now);
  const current = validated.activation;
  if (!current || current.id !== input.activationId)
    throw new LicenseDenied("activation_mismatch");
  const meta = metaOf(current);
  if (meta.installId !== input.installId || meta.tenantId !== input.tenantId)
    throw new LicenseDenied("activation_mismatch");
  const tenants = await tenantAllowance(ctx, plan, validated);
  return issue(ctx, now, {
    sub: validated.id,
    act: current.id,
    plan,
    tenantId: input.tenantId,
    installId: input.installId,
    tenants,
  });
}

export async function deactivateLicense(
  ctx: LicenseContext,
  input: { key: string; activationId: string },
): Promise<void> {
  // Validate first so only keys of this app can be driven through this API.
  const validated = await validateOrDeny(ctx, input.key, input.activationId);
  if (
    validated.benefit_id !== ctx.proBenefitId &&
    validated.benefit_id !== ctx.mspBenefitId
  )
    throw new LicenseDenied("invalid_key");
  try {
    await ctx.polar.deactivate(input.key, input.activationId);
  } catch (error) {
    if (error instanceof PolarNotFound) throw new LicenseDenied("not_found");
    throw error;
  }
}
