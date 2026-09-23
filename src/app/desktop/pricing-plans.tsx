"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import {
  DESKTOP_PLANS,
  DESKTOP_TRIAL_DAYS,
  formatDesktopPrice,
  type BillingInterval,
  type DesktopPlan,
} from "~/lib/desktop-app";

const intervals: { id: BillingInterval; label: string }[] = [
  { id: "monthly", label: "Monthly" },
  { id: "yearly", label: "Yearly" },
];

function PlanCard({
  plan,
  interval,
  featured,
}: {
  plan: DesktopPlan;
  interval: BillingInterval;
  featured: boolean;
}) {
  const unit = interval === "monthly" ? "month" : "year";
  const extraTenant = plan.extraTenantPrice
    ? ` Each additional tenant ${formatDesktopPrice(plan.extraTenantPrice[interval])} per ${unit}.`
    : "";

  return (
    <article
      className={`relative flex flex-col rounded-3xl border bg-white p-7 sm:p-8 ${
        featured
          ? "shadow-soft border-teal-600/40 ring-1 ring-teal-600/20"
          : "border-petrol-950/8 shadow-card"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-petrol-950 text-xl font-semibold">{plan.name}</h3>
        {featured && (
          <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold tracking-[0.14em] text-teal-700 uppercase">
            Best value per tenant
          </span>
        )}
      </div>
      <p className="text-petrol-600 mt-2 text-sm leading-6">{plan.audience}</p>

      <div className="mt-6 flex items-baseline gap-2">
        <span className="text-petrol-950 text-5xl font-semibold tracking-[-0.04em] tabular-nums">
          {formatDesktopPrice(plan.price[interval])}
        </span>
        <span className="text-petrol-600 text-sm">per {unit}</span>
      </div>
      <p className="text-petrol-600 mt-2 min-h-10 text-sm leading-5">
        {interval === "yearly"
          ? `Equals ${formatDesktopPrice(plan.price.yearly / 12)} per month, two months free.`
          : plan.extraTenantPrice
            ? `Includes ${plan.tenantsIncluded} tenants.`
            : "One tenant, billed monthly."}
        {extraTenant}
      </p>

      <a
        href={plan.checkoutUrl[interval]}
        className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none ${
          featured
            ? "hover:bg-petrol-800 bg-teal-700"
            : "bg-petrol-950 hover:bg-petrol-800"
        }`}
      >
        Start {DESKTOP_TRIAL_DAYS}-day free trial
      </a>
      <p className="text-petrol-600 mt-2 text-center text-xs leading-5">
        Card required. Cancel before day {DESKTOP_TRIAL_DAYS} and you pay
        nothing.
      </p>

      <ul className="border-petrol-950/8 mt-7 space-y-3 border-t pt-6">
        {plan.features.map((feature) => (
          <li
            key={feature}
            className="text-petrol-700 flex items-start gap-3 text-sm leading-6"
          >
            <Check
              className="mt-1 h-4 w-4 shrink-0 text-teal-700"
              aria-hidden="true"
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export function PricingPlans() {
  const [interval, setBillingInterval] = useState<BillingInterval>("monthly");

  return (
    <div>
      <div className="flex justify-center">
        <div
          role="group"
          aria-label="Billing interval"
          className="border-petrol-950/10 inline-flex rounded-full border bg-white p-1"
        >
          {intervals.map((option) => {
            const active = option.id === interval;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setBillingInterval(option.id)}
                className={`min-h-10 cursor-pointer rounded-full px-5 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                  active
                    ? "bg-petrol-950 text-white"
                    : "text-petrol-700 hover:text-petrol-950"
                }`}
              >
                {option.label}
                {option.id === "yearly" && (
                  <span
                    className={`ml-2 text-xs font-medium ${active ? "text-teal-100" : "text-teal-700"}`}
                  >
                    2 months free
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-auto mt-10 grid max-w-4xl gap-6 md:grid-cols-2">
        <PlanCard
          plan={DESKTOP_PLANS.pro}
          interval={interval}
          featured={false}
        />
        <PlanCard plan={DESKTOP_PLANS.msp} interval={interval} featured />
      </div>
    </div>
  );
}
