import { env } from "~/env";
import type { BillingInterval, DesktopPlanId } from "~/lib/desktop-app";

// Polar checkout links open a new checkout session on every request, so
// crawlers following them create abandoned checkouts. Import this module only
// from client components: the links then live in the JS bundle, never in
// server-rendered HTML or RSC props, and resolve when a buyer clicks.
const CHECKOUT_URLS: Record<DesktopPlanId, Record<BillingInterval, string>> = {
  pro: {
    monthly:
      env.NEXT_PUBLIC_POLAR_CHECKOUT_PRO_MONTHLY ??
      "https://buy.polar.sh/polar_cl_p9S59fMAgCTA3jZFPZk3HWG0t4jwEppBYAbc11oMQJe",
    yearly:
      env.NEXT_PUBLIC_POLAR_CHECKOUT_PRO_YEARLY ??
      "https://buy.polar.sh/polar_cl_NTrlkfk9H6jsKNumiVZH6mFSDJ5UjEp86Se4v3W8qVe",
  },
  msp: {
    monthly:
      env.NEXT_PUBLIC_POLAR_CHECKOUT_MSP_MONTHLY ??
      "https://buy.polar.sh/polar_cl_W0ELNRLkIf260KU5XrnjPAbczSCQw5rQBnW2u1DdMBk",
    yearly:
      env.NEXT_PUBLIC_POLAR_CHECKOUT_MSP_YEARLY ??
      "https://buy.polar.sh/polar_cl_AvIwR0OPaKE6f0npXdp5BpkCapNDfKnmTeGtz4An7jj",
  },
};

export function getDesktopCheckoutUrl(
  plan: DesktopPlanId,
  interval: BillingInterval,
): string {
  return CHECKOUT_URLS[plan][interval];
}

export function openDesktopCheckout(
  plan: DesktopPlanId,
  interval: BillingInterval,
): void {
  window.location.assign(getDesktopCheckoutUrl(plan, interval));
}
