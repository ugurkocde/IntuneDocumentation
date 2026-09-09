import Link from "next/link";
import { Check, ArrowRight, ShieldCheck } from "lucide-react";
import "~/styles/enterprise.css";
export const metadata = {
  title: "Hobby, Enterprise & MSP pricing",
  description:
    "Free Intune documentation, plus paid team workspaces, encrypted configuration history, audit reviews, and MSP customer reporting.",
};
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
    <main className="enterprise">
      <div
        className="ent-content"
        style={{ maxWidth: 1250, paddingTop: 40, paddingBottom: 70 }}
      >
        <div
          className="ent-actions"
          style={{ justifyContent: "space-between", marginBottom: 60 }}
        >
          <Link href="/" className="ent-brand">
            <ShieldCheck size={25} />
            Intune Documentation
          </Link>
          <Link className="ent-button" href={`${origin}/enterprise`}>
            Workspace sign-in
            <ArrowRight size={14} />
          </Link>
        </div>
        <p className="ent-eyebrow">A plan for every stage</p>
        <h1 style={{ maxWidth: 800, fontSize: "clamp(38px,5vw,62px)" }}>
          Start with documentation.
          <br />
          Build a history your team can trust.
        </h1>
        <p
          style={{
            maxWidth: 660,
            color: "var(--muted)",
            margin: "22px 0 38px",
            fontSize: 16,
          }}
        >
          Hobby stays free with every existing feature. Paid workspaces add the
          history, collaboration, and customer oversight that teams need.
        </p>
        <div className="ent-grid">
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
            <section className="ent-card" key={plan.name}>
              <div className="ent-card-body">
                <h2>{plan.name}</h2>
                <p className="ent-price">{plan.price}</p>
                <small>{plan.sub}</small>
                <ul className="ent-feature-list">
                  {plan.items.map((item) => (
                    <li key={item}>
                      <Check size={15} />
                      {item}
                    </li>
                  ))}
                </ul>
                <Link
                  className={`ent-button ${plan.name !== "Hobby" ? "primary" : ""}`}
                  href={plan.href}
                >
                  {plan.cta}
                  <ArrowRight size={14} />
                </Link>
              </div>
            </section>
          ))}
        </div>
        <div className="ent-banner">
          <div>
            <p className="ent-eyebrow">Founders offer</p>
            <h2>50% off for your first 12 paid months.</h2>
            <p>
              Enterprise from $74.50/month. MSP from $124.50/month. Extra
              tenants are also half price. Monthly billing only, no stacking.
              Enrollment ends 1 November 2026, 00:00 Berlin.
            </p>
          </div>
          <span className="ent-badge">Same features. Founder pricing.</span>
        </div>
        <p className="ent-footer-note">
          Regular annual billing saves 15%: Enterprise $1,519.80/year and MSP
          $2,539.80/year before extra tenants. Prices are USD, excluding
          applicable tax. Paid trials last 30 days and convert to the selected
          subscription unless canceled. Final details are shown at checkout.
        </p>
        <section className="ent-card" style={{ marginTop: 42 }}>
          <header className="ent-card-head">
            <h2>Compare the plans</h2>
          </header>
          <div className="ent-table-wrap">
            <table className="ent-table">
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Hobby</th>
                  <th>Enterprise</th>
                  <th>MSP</th>
                </tr>
              </thead>
              <tbody>
                {features.map(([feature, ...values]) => (
                  <tr key={feature}>
                    <td>{feature}</td>
                    {values.map((v, index) => (
                      <td key={index}>{v || "Not included"}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        <div className="ent-split">
          <section className="ent-card">
            <div className="ent-card-body">
              <h2>Read-only, with clear boundaries.</h2>
              <p style={{ marginTop: 14, color: "var(--muted)" }}>
                Customers explicitly authorize background collection and
                encrypted history. Microsoft business sign-in confirms identity;
                invitations and roles control access. Restore and policy
                deployment are future capabilities.
              </p>
            </div>
          </section>
          <section className="ent-card">
            <div className="ent-card-body">
              <h2>Talk to the people building it.</h2>
              <p style={{ marginTop: 14, color: "var(--muted)" }}>
                Need help with onboarding, tenant capacity, or a customer
                review?
              </p>
              <a
                href="mailto:support@ugurlabs.com"
                className="ent-button"
                style={{ marginTop: 20 }}
              >
                support@ugurlabs.com
              </a>
            </div>
          </section>
        </div>
        <p className="ent-footer-note">
          Ugurlabs UG (haftungsbeschränkt) · Fährstraße 217, 40221 Düsseldorf,
          Germany · HRB 113979 (Amtsgericht Düsseldorf) · Managing Director:
          Ugur Koc. Payments are administered through Polar.
        </p>
      </div>
    </main>
  );
}
