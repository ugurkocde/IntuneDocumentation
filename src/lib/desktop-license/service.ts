import { type KeyObject } from "node:crypto";
import { GUID, verifyEntraIdToken } from "~/lib/entra-id-token";
import {
  PolarNotFound,
  PolarNotPermitted,
  type PolarActivation,
  type PolarClient,
  type PolarLicenseKey,
} from "./polar";
import {
  TenantStoreUnavailable,
  type TenantLicenseStore,
} from "./tenant-store";
import {
  signEntitlement,
  TOKEN_LIFETIME_SECONDS,
  type EntitlementPayload,
} from "./token";

export const INSTALLS_PER_TENANT = 5;

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
      | "activation_mismatch"
      | "tenant_not_licensed",
  ) {
    super(reason);
  }
}

// The license could not be evaluated, for example because the MSP tenant
// quantity is missing. The route answers 503 so the desktop app keeps its
// cached token and retries later.
export class LicenseUnavailable extends Error {
  constructor(
    readonly reason: "tenant_quantity_unknown" | "storage_unavailable",
  ) {
    super(reason);
  }
}

// The Microsoft ID token of an organization license request did not verify.
// The route answers 401.
export class LicenseUnauthorized extends Error {}

export interface LicenseContext {
  polar: PolarClient;
  signingKey: KeyObject;
  proBenefitId: string;
  mspBenefitId: string;
  // Organization license mappings; null when storage is not configured, in
  // which case key licenses work without sharing.
  tenantLicenses: TenantLicenseStore | null;
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
export function checkKey(
  ctx: LicenseContext,
  key: PolarLicenseKey,
  now: number,
) {
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
  // Fail closed: granting a default could license more tenants than paid for.
  console.warn(`desktop-license: no tenant quantity for key ${key.id}`);
  throw new LicenseUnavailable("tenant_quantity_unknown");
}

function metaOf(activation: PolarActivation) {
  const meta = activation.meta ?? {};
  return {
    installId: typeof meta.installId === "string" ? meta.installId : "",
    tenantId: typeof meta.tenantId === "string" ? meta.tenantId : "",
  };
}

// Activations oldest first. Polar's created_at decides when every activation
// has one; otherwise Polar's own order stands. The order is the same on every
// call, so the same tenants stay licensed after a downgrade.
function activationsOf(key: { activations: PolarActivation[] }) {
  const list = [...key.activations];
  if (
    list.every((a) => a.created_at && !Number.isNaN(Date.parse(a.created_at)))
  )
    list.sort((a, b) => Date.parse(a.created_at!) - Date.parse(b.created_at!));
  return list.map((a) => ({ id: a.id, ...metaOf(a) }));
}

// Position of value among the distinct values in order; a value not yet
// present ranks last.
function rankOf(values: string[], value: string) {
  const distinct = [...new Set(values)];
  const index = distinct.indexOf(value);
  return index === -1 ? distinct.length : index;
}

// Whether (installId, tenantId), bound or about to be bound, is outside the
// tenant allowance or the per-tenant install limit. Tenants rank by their
// oldest activation and only the first `tenants` of them are licensed, and
// likewise the first installs of each tenant. So a lowered quantity takes
// effect on refresh and reuse, not only on new activations, and of two racing
// activations exactly the older one stays.
function limitViolation(
  activations: { installId: string; tenantId: string }[],
  input: { installId: string; tenantId: string },
  tenants: number,
): "tenant_limit" | "install_limit" | null {
  const tenantIds = activations.map((a) => a.tenantId);
  if (rankOf(tenantIds, input.tenantId) >= tenants) return "tenant_limit";
  const installs = activations
    .filter((a) => a.tenantId === input.tenantId)
    .map((a) => a.installId);
  if (rankOf(installs, input.installId) >= INSTALLS_PER_TENANT)
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

// Remove an activation that lost a race, retrying once. If it still fails the
// activation stays bound in Polar without a token; the limit check on refresh
// and reuse keeps it from being licensed while the key is over its limits.
async function rollBack(
  ctx: LicenseContext,
  key: string,
  activationId: string,
) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await ctx.polar.deactivate(key, activationId);
      return;
    } catch (error) {
      if (error instanceof PolarNotFound) return;
      if (attempt === 2)
        console.error(
          `desktop-license: rollback of over-limit activation ${activationId} failed, it stays bound until deactivated`,
          error,
        );
    }
  }
}

interface ActivateInput {
  key: string;
  installId: string;
  tenantId: string;
  os: string;
  appVersion: string;
}

interface RefreshInput {
  key: string;
  activationId: string;
  installId: string;
  tenantId: string;
}

async function activateKey(
  ctx: LicenseContext,
  input: ActivateInput,
): Promise<{ entitlement: Entitlement; keyId: string }> {
  const now = ctx.now?.() ?? Date.now();
  const validated = await validateOrDeny(ctx, input.key);
  const plan = checkKey(ctx, validated, now);
  const [full, tenants] = await Promise.all([
    ctx.polar.getKey(validated.id),
    tenantAllowance(ctx, plan, validated),
  ]);

  const activations = activationsOf(full);
  // Checked for an existing activation too, so reuse honours a lowered
  // allowance.
  const violation = limitViolation(activations, input, tenants);
  if (violation) throw new LicenseDenied(violation);
  let activationId = activations.find(
    (a) => a.installId === input.installId && a.tenantId === input.tenantId,
  )?.id;

  if (!activationId) {
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

    // Concurrent activations can both pass the check above. Re-read, our own
    // activation included, and roll it back if it ranks outside the limits.
    // Both racers see the same order, so only the newer one gives way.
    const after = activationsOf(await ctx.polar.getKey(validated.id));
    const raced = limitViolation(after, input, tenants);
    if (raced) {
      await rollBack(ctx, input.key, activationId);
      throw new LicenseDenied(raced);
    }
  }

  const entitlement = issue(ctx, now, {
    sub: validated.id,
    act: activationId,
    plan,
    tenantId: input.tenantId,
    installId: input.installId,
    tenants,
  });
  return { entitlement, keyId: validated.id };
}

export async function activateLicense(
  ctx: LicenseContext,
  input: ActivateInput,
): Promise<Entitlement> {
  return (await activateKey(ctx, input)).entitlement;
}

async function refreshKey(
  ctx: LicenseContext,
  input: RefreshInput,
): Promise<{ entitlement: Entitlement; keyId: string }> {
  const now = ctx.now?.() ?? Date.now();
  const validated = await validateOrDeny(ctx, input.key, input.activationId);
  const plan = checkKey(ctx, validated, now);
  const current = validated.activation;
  if (!current || current.id !== input.activationId)
    throw new LicenseDenied("activation_mismatch");
  const meta = metaOf(current);
  if (meta.installId !== input.installId || meta.tenantId !== input.tenantId)
    throw new LicenseDenied("activation_mismatch");
  // Re-check the limits on every refresh so a lowered allowance applies to
  // tenants that are already bound.
  const [full, tenants] = await Promise.all([
    ctx.polar.getKey(validated.id),
    tenantAllowance(ctx, plan, validated),
  ]);
  const violation = limitViolation(activationsOf(full), input, tenants);
  if (violation) throw new LicenseDenied(violation);
  const entitlement = issue(ctx, now, {
    sub: validated.id,
    act: current.id,
    plan,
    tenantId: input.tenantId,
    installId: input.installId,
    tenants,
  });
  return { entitlement, keyId: validated.id };
}

export async function refreshLicense(
  ctx: LicenseContext,
  input: RefreshInput,
): Promise<Entitlement> {
  return (await refreshKey(ctx, input)).entitlement;
}

// A fresh sign-in, not a token kept around: the desktop app asks MSAL for a
// new ID token when its cached one is older than a few minutes.
export const ID_TOKEN_MAX_AGE_SECONDS = 15 * 60;

// Verifies a Microsoft ID token for a license request: an ID token (no scp
// or roles) issued to some app registration (a GUID audience) within the
// last 15 minutes. Callers compare its tid and aud with what they expect.
export function verifySignIn(idToken: string) {
  return verifyEntraIdToken(idToken, {
    audience: GUID,
    maxAgeSeconds: ID_TOKEN_MAX_AGE_SECONDS,
  });
}

// Records or removes the organization license for the key holder's tenant
// after a successful activation or refresh. Without an explicit choice a Pro
// key shares and an MSP key does not, since an MSP's client tenants are not
// its own. Writing the mapping needs proof of the tenant: an ID token for
// that tenant issued to the app registration being shared (clientId).
// Without it the entitlement is still returned, with shared false and
// sharedReason "sign_in_required". Removing needs no proof: it only removes a
// mapping that points to this key. Sharing is best effort: a storage failure
// never costs the key holder the license, it only leaves shared out of the
// response.
async function applySharing(
  ctx: LicenseContext,
  result: { entitlement: Entitlement; keyId: string },
  input: { tenantId: string } & SharingInput,
): Promise<
  Entitlement & { shared?: boolean; sharedReason?: "sign_in_required" }
> {
  const { entitlement, keyId } = result;
  const { tenantId, clientId } = input;
  const store = ctx.tenantLicenses;
  if (!store) return entitlement;
  const share = input.shareWithTenant ?? entitlement.plan === "pro";
  try {
    if (!share) {
      await store.delete(tenantId, keyId);
      return { ...entitlement, shared: false };
    }
    const claims = input.idToken ? await verifySignIn(input.idToken) : null;
    if (
      !clientId ||
      !claims ||
      claims.tid.toLowerCase() !== tenantId ||
      typeof claims.aud !== "string" ||
      claims.aud.toLowerCase() !== clientId
    )
      return {
        ...entitlement,
        shared: false,
        sharedReason: "sign_in_required",
      };
    await store.put({
      tenantId,
      licenseKeyId: keyId,
      benefitId:
        entitlement.plan === "pro" ? ctx.proBenefitId : ctx.mspBenefitId,
      clientId,
      sharedByActivationId: entitlement.activationId,
    });
    return { ...entitlement, shared: true };
  } catch (error) {
    if (!(error instanceof TenantStoreUnavailable)) throw error;
    console.warn(`desktop-license: sharing not updated, ${error.message}`);
    return entitlement;
  }
}

type SharingInput = {
  clientId?: string;
  idToken?: string;
  shareWithTenant?: boolean;
};

export async function activateAndShare(
  ctx: LicenseContext,
  input: ActivateInput & SharingInput,
) {
  return applySharing(ctx, await activateKey(ctx, input), input);
}

export async function refreshAndShare(
  ctx: LicenseContext,
  input: RefreshInput & SharingInput,
) {
  return applySharing(ctx, await refreshKey(ctx, input), input);
}

// With owner set, the activation must belong to that install and tenant: an
// organization license install may only release its own activation.
export async function deactivateLicense(
  ctx: LicenseContext,
  input: {
    key: string;
    activationId: string;
    owner?: { installId: string; tenantId: string };
  },
): Promise<void> {
  // Validate first so only keys of this app can be driven through this API.
  const validated = await validateOrDeny(ctx, input.key, input.activationId);
  if (
    validated.benefit_id !== ctx.proBenefitId &&
    validated.benefit_id !== ctx.mspBenefitId
  )
    throw new LicenseDenied("invalid_key");
  if (input.owner) {
    const current = validated.activation;
    const meta = current ? metaOf(current) : null;
    if (
      !current ||
      current.id !== input.activationId ||
      meta?.installId !== input.owner.installId ||
      meta?.tenantId !== input.owner.tenantId
    )
      throw new LicenseDenied("activation_mismatch");
  }
  try {
    await ctx.polar.deactivate(input.key, input.activationId);
  } catch (error) {
    if (error instanceof PolarNotFound) throw new LicenseDenied("not_found");
    throw error;
  }
}
