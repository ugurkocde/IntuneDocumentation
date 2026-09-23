import { z } from "zod";

// Thin client over the authenticated Polar license key API. The server uses
// the /v1/license-keys/* endpoints rather than the unauthenticated
// /v1/customer-portal/license-keys/* twins: Polar recommends them for servers
// and the public ones are rate limited per IP, which a shared hosting egress
// would hit quickly. Request and response schemas are identical.

// A confirmed "no" from Polar, as opposed to Polar being unavailable.
export class PolarNotFound extends Error {}
export class PolarNotPermitted extends Error {}
export class PolarUnavailable extends Error {}

const activation = z.object({
  id: z.string(),
  meta: z.record(z.unknown()).nullish(),
  created_at: z.string().nullish(),
});

const licenseKey = z.object({
  id: z.string(),
  customer_id: z.string(),
  benefit_id: z.string(),
  status: z.string(),
  expires_at: z.string().nullish(),
});

export type PolarLicenseKey = z.infer<typeof licenseKey>;
export type PolarActivation = z.infer<typeof activation>;

const validated = licenseKey.extend({ activation: activation.nullish() });
const withActivations = licenseKey.extend({ activations: z.array(activation) });
const grants = z.object({
  items: z.array(
    z.object({
      subscription_id: z.string().nullish(),
      properties: z.object({ license_key_id: z.string().optional() }).nullish(),
    }),
  ),
});
const subscription = z.object({ units: z.number().int().nullish() });

export interface PolarConfig {
  base: string;
  organizationId: string;
  token: string;
}

export function createPolarClient(config: PolarConfig) {
  async function call<T>(
    method: "GET" | "POST",
    path: string,
    schema: z.ZodType<T> | null,
    body?: object,
  ): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${config.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${config.token}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      throw new PolarUnavailable(`Polar ${path} unreachable`);
    }
    if (response.status === 404) throw new PolarNotFound(path);
    if (response.status === 403) throw new PolarNotPermitted(path);
    if (!response.ok) {
      throw new PolarUnavailable(`Polar ${path} returned ${response.status}`);
    }
    if (!schema) return undefined as T;
    const parsed = schema.safeParse(await response.json().catch(() => null));
    if (!parsed.success) {
      throw new PolarUnavailable(`Polar ${path} returned an unexpected shape`);
    }
    return parsed.data;
  }

  const org = config.organizationId;
  return {
    validate: (key: string, activationId?: string) =>
      call("POST", "/v1/license-keys/validate", validated, {
        key,
        organization_id: org,
        ...(activationId ? { activation_id: activationId } : {}),
      }),
    getKey: (id: string) =>
      call(
        "GET",
        `/v1/license-keys/${encodeURIComponent(id)}`,
        withActivations,
      ),
    activate: (key: string, label: string, meta: Record<string, string>) =>
      call("POST", "/v1/license-keys/activate", activation, {
        key,
        organization_id: org,
        label,
        meta,
      }),
    deactivate: (key: string, activationId: string) =>
      call("POST", "/v1/license-keys/deactivate", null, {
        key,
        organization_id: org,
        activation_id: activationId,
      }),
    // Tenant quantity (unit-based price) of the subscription that granted
    // this license key, or null when the grant or a quantity cannot be found.
    // Seat-based prices do not fit: Polar grants their benefits to invited
    // members, not to the buyer.
    async tenantsForKey(benefitId: string, customerId: string, keyId: string) {
      const query = new URLSearchParams({
        customer_id: customerId,
        is_granted: "true",
        limit: "100",
      });
      const list = await call(
        "GET",
        `/v1/benefits/${encodeURIComponent(benefitId)}/grants?${query}`,
        grants,
      );
      const grant = list.items.find(
        (item) => item.properties?.license_key_id === keyId,
      );
      if (!grant?.subscription_id) return null;
      const sub = await call(
        "GET",
        `/v1/subscriptions/${encodeURIComponent(grant.subscription_id)}`,
        subscription,
      );
      return sub.units && sub.units > 0 ? sub.units : null;
    },
  };
}

export type PolarClient = ReturnType<typeof createPolarClient>;
