import type { SupabaseClient } from "@supabase/supabase-js";

// Tenant -> license key mapping for organization licenses. Only Polar ids are
// stored, never the key string.
export interface TenantLicense {
  tenantId: string;
  licenseKeyId: string;
  benefitId: string;
  // The key holder's app registration. Only ID tokens issued to it license
  // the tenant, so the tenant's admins control who can claim the license.
  clientId: string;
  sharedByActivationId: string | null;
}

export interface TenantLicenseStore {
  get(tenantId: string): Promise<TenantLicense | null>;
  put(record: TenantLicense): Promise<void>;
  // Removes the mapping only while it still points to licenseKeyId, so one
  // key cannot remove another key's mapping.
  delete(tenantId: string, licenseKeyId: string): Promise<void>;
}

// The storage could not be read or written.
export class TenantStoreUnavailable extends Error {}

const TABLE = "desktop_tenant_licenses";

// Needs the service role client: the table has RLS enabled and no policies.
export function supabaseTenantLicenseStore(
  client: SupabaseClient,
): TenantLicenseStore {
  const fail = (action: string, error: { message: string }) =>
    new TenantStoreUnavailable(`${TABLE} ${action}: ${error.message}`);
  return {
    async get(tenantId) {
      const { data, error } = await client
        .from(TABLE)
        .select(
          "license_key_id, benefit_id, client_id, shared_by_activation_id",
        )
        .eq("tenant_id", tenantId)
        .maybeSingle<{
          license_key_id: string;
          benefit_id: string;
          client_id: string;
          shared_by_activation_id: string | null;
        }>();
      if (error) throw fail("read", error);
      return data
        ? {
            tenantId,
            licenseKeyId: data.license_key_id,
            benefitId: data.benefit_id,
            clientId: data.client_id,
            sharedByActivationId: data.shared_by_activation_id,
          }
        : null;
    },
    async put(record) {
      const { error } = await client.from(TABLE).upsert(
        {
          tenant_id: record.tenantId,
          license_key_id: record.licenseKeyId,
          benefit_id: record.benefitId,
          client_id: record.clientId,
          shared_by_activation_id: record.sharedByActivationId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id" },
      );
      if (error) throw fail("write", error);
    },
    async delete(tenantId, licenseKeyId) {
      const { error } = await client
        .from(TABLE)
        .delete()
        .eq("tenant_id", tenantId)
        .eq("license_key_id", licenseKeyId);
      if (error) throw fail("delete", error);
    },
  };
}
