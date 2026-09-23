import { z } from "zod";

// Looks up the license key a buyer just received, for the getting started page
// Polar redirects to after checkout. Polar appends a customer_session_token to
// that redirect; it is the buyer's own customer portal session, so it can read
// only their keys and grants nothing the portal link would not.

export type CheckoutKeyResult =
  | { status: "ready"; keys: string[] }
  // Polar grants the license key benefit shortly after checkout, so a fresh
  // redirect can arrive before the key exists.
  | { status: "pending" }
  | { status: "unavailable" };

const TOKEN_PATTERN = /^polar_cst_[A-Za-z0-9]{16,128}$/;

const response = z.object({
  items: z.array(
    z.object({
      key: z.string().min(1),
      benefit_id: z.string(),
      status: z.string(),
      created_at: z.string().nullish(),
    }),
  ),
});

function desktopBenefitIds(): Set<string> {
  return new Set(
    [
      process.env.DESKTOP_LICENSE_PRO_BENEFIT_ID,
      process.env.DESKTOP_LICENSE_MSP_BENEFIT_ID,
    ].filter((id): id is string => Boolean(id)),
  );
}

export async function fetchCheckoutLicenseKeys(
  token: string | undefined,
): Promise<CheckoutKeyResult> {
  if (!token || !TOKEN_PATTERN.test(token)) return { status: "unavailable" };
  const base = new URL(process.env.POLAR_API_BASE ?? "https://api.polar.sh")
    .origin;
  let items: z.infer<typeof response>["items"];
  try {
    const res = await fetch(
      `${base}/v1/customer-portal/license-keys/?limit=20`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!res.ok) return { status: "unavailable" };
    const parsed = response.safeParse(await res.json().catch(() => null));
    if (!parsed.success) return { status: "unavailable" };
    items = parsed.data.items;
  } catch {
    return { status: "unavailable" };
  }
  // The organization sells other products; show only desktop app keys when
  // the benefit IDs are configured.
  const benefits = desktopBenefitIds();
  const keys = items
    .filter((item) => item.status === "granted")
    .filter((item) => benefits.size === 0 || benefits.has(item.benefit_id))
    .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))
    .map((item) => item.key);
  return keys.length > 0 ? { status: "ready", keys } : { status: "pending" };
}
