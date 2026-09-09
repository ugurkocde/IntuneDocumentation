import Link from "next/link";
import { Check, ArrowRight } from "lucide-react";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
export const metadata = {
  title: "Hobby, Enterprise & MSP pricing",
  description:
    "Free Intune documentation, plus paid team workspaces, encrypted configuration history, audit reviews, and MSP customer reporting.",
};
const secondaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-mint-100 bg-white px-5 py-3 text-sm font-semibold text-petrol-800 transition-colors hover:bg-mint-100 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600";
const primaryButton =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-teal-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-600";

const features = [
  ["Every existing documentation feature", "Included", "Included", "Included"],
  [
    "PDF, Word, custom branding & current compliance evidence",
    "Included",
    "Included",
    "Included",
  ],
  [
    "Self-hosting and existing Hobby storage behavior",
    "Included",
    "Included",
    "Included",
  ],
  ["Unattended read-only collection", "", "Daily", "Daily, per customer"],
  [
    "Encrypted EU configuration history",
    "",
    "12 months",
    "12 months per customer",
  ],
  ["Setting and assignment diffs", "", "Included", "Included"],
  ["Approved baselines & drift alerts", "", "Included", "Portfolio findings"],
  [
    "Custom standards & exceptions",
    "",
    "Included",
    "Templates & customer overrides",
  ],
  [
    "Audit notes, tickets & expiring reviewers",
    "",
    "Included",
    "Customer scoped",
  ],
  ["Invited team members", "", "Unlimited", "Unlimited"],
  [
    "Scheduled documentation & executive reports",
    "",
    "Included",
    "Customer reports & QBR packs",
  ],
  [
    "Private report library",
    "",
    "Corporate library",
    "Branded customer portals",
  ],
  ["Read-only API & signed webhooks", "", "Included", "Customer scoped"],
  ["Priority email support", "", "Included", "Included"],
];
export default function PricingPage() {
  const origin = process.env.APP_SITE_ORIGIN ?? "",
    paid = process.env.ENTERPRISE_ENABLED === "true";
  return (
    <div className="bg-mint-50 min-h-screen pt-16">
      <NavigationHeader />
      <main>
        <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8 lg:px-10 lg:py-20">
          <div className="mb-10 flex justify-end">
            <Link className={secondaryButton} href={`${origin}/enterprise`}>
              Workspace sign-in
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
          </div>
          <p className="mb-3 text-xs font-bold tracking-[0.16em] text-teal-700 uppercase">
            A plan for every stage
          </p>
          <h1 className="text-petrol-950 max-w-4xl text-4xl leading-tight font-bold tracking-tight sm:text-5xl lg:text-6xl">
            Start with documentation.
            <br />
            Build a history your team can trust.
          </h1>
          <p
            style={{
              maxWidth: 660,
              color: "var(--color-petrol-600)",
              margin: "22px 0 38px",
              fontSize: 16,
            }}
          >
            Hobby stays free with every existing feature. Paid workspaces add
            the history, collaboration, and customer oversight that teams need.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                name: "Hobby",
                price: "Free",
                sub: "For individual documentation",
                items: [
                  "All current features stay free",
                  "Manual documentation & exports",
                  "Existing storage behavior",
                  "Self-hosting",
                ],
                href: `${origin}/sign-in`,
                cta: "Open Hobby",
              },
              {
                name: "Enterprise",
                price: "$149",
                sub: "Per month · 1 production + 1 test tenant",
                items: [
                  "Unlimited invited team members",
                  "History, standards & audit reviews",
                  "Scheduled reports & email alerts",
                  "Additional production tenant: $99/month",
                ],
                href: `${origin}/enterprise`,
                cta: paid ? "Start a 30-day trial" : "Explore paid workspaces",
              },
              {
                name: "MSP",
                price: "$249",
                sub: "Per month · 10 customers + 1 internal tenant",
                items: [
                  "Everything in Enterprise",
                  "Customer portfolio & scoped technicians",
                  "Branded report portals & QBR packs",
                  "Additional customer: $20/month",
                ],
                href: `${origin}/enterprise`,
                cta: paid ? "Start a 30-day trial" : "Explore paid workspaces",
              },
            ].map((plan) => (
              <section
                className="border-mint-100 shadow-card min-w-0 overflow-hidden rounded-2xl border bg-white"
                key={plan.name}
              >
                <div className="flex h-full flex-col items-start p-6 sm:p-7">
                  <h2 className="text-petrol-950 text-xl font-semibold">
                    {plan.name}
                  </h2>
                  <p className="text-petrol-950 my-5 text-4xl font-bold tracking-tight tabular-nums">
                    {plan.price}
                  </p>
                  <p className="text-petrol-600 text-sm leading-6">
                    {plan.sub}
                  </p>
                  <ul className="text-petrol-600 my-6 grid gap-3 text-sm leading-6">
                    {plan.items.map((item) => (
                      <li key={item} className="flex items-start gap-2">
                        <Check
                          size={16}
                          className="mt-1 shrink-0 text-teal-600"
                          aria-hidden="true"
                        />
                        {item}
                      </li>
                    ))}
                  </ul>
                  <Link
                    className={`mt-auto w-full ${plan.name === "Hobby" ? secondaryButton : primaryButton}`}
                    href={plan.href}
                  >
                    {plan.cta}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                </div>
              </section>
            ))}
          </div>
          <div className="mt-8 flex flex-col items-start gap-6 rounded-2xl border border-teal-100 bg-teal-50 p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="mb-3 text-xs font-bold tracking-[0.16em] text-teal-700 uppercase">
                Founders offer
              </p>
              <h2 className="text-petrol-950 text-xl font-semibold">
                50% off for your first 12 paid months.
              </h2>
              <p>
                Enterprise from $74.50/month. MSP from $124.50/month. Extra
                tenants are also half price. Monthly billing only, no stacking.
                Enrollment ends 1 November 2026, 00:00 Berlin.
              </p>
            </div>
            <span className="shrink-0 rounded-full bg-white px-3 py-2 text-xs font-semibold text-teal-700">
              Same features. Founder pricing.
            </span>
          </div>
          <p className="text-petrol-600 mt-6 text-sm leading-6">
            Regular annual billing saves 15%: Enterprise $1,519.80/year and MSP
            $2,539.80/year before extra tenants. Prices are USD, excluding
            applicable tax. Paid trials last 30 days and convert to the selected
            subscription unless canceled. Final details are shown at checkout.
          </p>
          <section
            className="border-mint-100 shadow-card min-w-0 overflow-hidden rounded-2xl border bg-white"
            style={{ marginTop: 42 }}
          >
            <header className="border-mint-100 border-b px-6 py-5">
              <h2
                id="plan-comparison"
                className="text-petrol-950 text-xl font-semibold"
              >
                Compare the plans
              </h2>
            </header>
            <div
              className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-teal-600"
              role="region"
              aria-labelledby="plan-comparison"
              tabIndex={0}
            >
              <table
                aria-labelledby="plan-comparison"
                className="text-petrol-600 [&_tbody_tr]:border-mint-100 [&_thead]:bg-surface [&_thead]:text-petrol-950 w-full min-w-[680px] text-left text-sm leading-6 [&_tbody_tr]:border-t [&_td]:px-6 [&_td]:py-4 [&_th]:px-6 [&_th]:py-4"
              >
                <thead>
                  <tr>
                    <th scope="col">Capability</th>
                    <th scope="col">Hobby</th>
                    <th scope="col">Enterprise</th>
                    <th scope="col">MSP</th>
                  </tr>
                </thead>
                <tbody>
                  {features.map(([feature, ...values]) => (
                    <tr key={feature}>
                      <th scope="row" className="text-petrol-950 font-medium">
                        {feature}
                      </th>
                      {values.map((v, index) => (
                        <td key={index}>{v || "Not included"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <section className="border-mint-100 shadow-card min-w-0 overflow-hidden rounded-2xl border bg-white">
              <div className="flex h-full flex-col items-start p-6 sm:p-7">
                <h2 className="text-petrol-950 text-xl font-semibold">
                  Read-only, with clear boundaries.
                </h2>
                <p style={{ marginTop: 14, color: "var(--color-petrol-600)" }}>
                  Customers explicitly authorize background collection and
                  encrypted history. Microsoft business sign-in confirms
                  identity; invitations and roles control access. Restore and
                  policy deployment are future capabilities.
                </p>
              </div>
            </section>
            <section className="border-mint-100 shadow-card min-w-0 overflow-hidden rounded-2xl border bg-white">
              <div className="flex h-full flex-col items-start p-6 sm:p-7">
                <h2 className="text-petrol-950 text-xl font-semibold">
                  Talk to the people building it.
                </h2>
                <p style={{ marginTop: 14, color: "var(--color-petrol-600)" }}>
                  Need help with onboarding, tenant capacity, or a customer
                  review?
                </p>
                <a
                  href="mailto:support@ugurlabs.com"
                  className={secondaryButton}
                  style={{ marginTop: 20 }}
                >
                  support@ugurlabs.com
                </a>
              </div>
            </section>
          </div>
          <p className="text-petrol-600 mt-6 text-sm leading-6">
            Ugurlabs UG (haftungsbeschränkt) · Fährstraße 217, 40221 Düsseldorf,
            Germany · HRB 113979 (Amtsgericht Düsseldorf) · Managing Director:
            Ugur Koc. Payments are administered through Polar.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
