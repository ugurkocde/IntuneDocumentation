import { PolarNotFound } from "./polar";
import {
  activateLicense,
  checkKey,
  deactivateLicense,
  LicenseDenied,
  LicenseUnauthorized,
  LicenseUnavailable,
  refreshLicense,
  verifySignIn,
  type LicenseContext,
} from "./service";
import { TenantStoreUnavailable } from "./tenant-store";

// Key states that end an organization license for good. A missing activation
// (also answered with not_found by Polar's validate) is not among them.
const KEY_GONE = new Set([
  "not_found",
  "revoked",
  "disabled",
  "expired",
  "invalid_key",
]);

export interface TenantLicenseInput {
  idToken: string;
  installId: string;
  os: string;
  appVersion: string;
  action: "activate" | "refresh" | "deactivate";
  activationId?: string;
}

export function maskKey(key: string) {
  return `****${key.slice(-6)}`;
}

async function stored<T>(operation: Promise<T>): Promise<T> {
  try {
    return await operation;
  } catch (error) {
    if (error instanceof TenantStoreUnavailable) {
      console.warn(`desktop-license: ${error.message}`);
      throw new LicenseUnavailable("storage_unavailable");
    }
    throw error;
  }
}

// Licenses an install through its tenant's organization license. The tenant
// comes only from a verified Microsoft ID token, which must be issued to the
// app registration the key holder shared from. The key string is used server
// side only and never returned.
export async function tenantLicense(
  ctx: LicenseContext,
  input: TenantLicenseInput,
) {
  const store = ctx.tenantLicenses;
  if (!store) throw new LicenseUnavailable("storage_unavailable");
  const claims = await verifySignIn(input.idToken);
  if (!claims) throw new LicenseUnauthorized();
  const tenantId = claims.tid.toLowerCase();

  const mapping = await stored(store.get(tenantId));
  // Only a sign-in to the key holder's own app registration counts, so the
  // tenant's admins decide who can claim the license (user assignment,
  // consent). Another app's token is treated like an unlicensed tenant.
  if (
    !mapping ||
    typeof claims.aud !== "string" ||
    claims.aud.toLowerCase() !== mapping.clientId.toLowerCase()
  )
    throw new LicenseDenied("tenant_not_licensed");
  const forget = () => stored(store.delete(tenantId, mapping.licenseKeyId));

  let key;
  try {
    key = await ctx.polar.getKeyWithSecret(mapping.licenseKeyId);
    checkKey(ctx, key, ctx.now?.() ?? Date.now());
  } catch (error) {
    if (error instanceof PolarNotFound) {
      await forget();
      throw new LicenseDenied("not_found");
    }
    if (error instanceof LicenseDenied && KEY_GONE.has(error.reason))
      await forget();
    throw error;
  }

  const common = { key: key.key, installId: input.installId, tenantId };
  if (input.action === "activate") {
    const entitlement = await activateLicense(ctx, {
      ...common,
      os: input.os,
      appVersion: input.appVersion,
    });
    return { ...entitlement, source: "tenant", displayKey: maskKey(key.key) };
  }
  // Refresh and deactivate act on an existing activation of this install.
  if (!input.activationId) throw new LicenseDenied("activation_mismatch");
  if (input.action === "deactivate") {
    await deactivateLicense(ctx, {
      key: key.key,
      activationId: input.activationId,
      owner: { installId: input.installId, tenantId },
    });
    return { success: true };
  }
  const entitlement = await refreshLicense(ctx, {
    ...common,
    activationId: input.activationId,
  });
  return { ...entitlement, source: "tenant", displayKey: maskKey(key.key) };
}
