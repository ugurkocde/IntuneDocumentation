import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowRight, Download } from "lucide-react";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import {
  DESKTOP_DOWNLOADS,
  DESKTOP_PORTAL_URL,
  DESKTOP_SETUP_GUIDE_URL,
} from "~/lib/desktop-app";
import { DOCS_URL } from "~/lib/docs";
import {
  fetchCheckoutLicenseKeys,
  type CheckoutKeyResult,
} from "~/lib/desktop-license/checkout-key";
import { CopyValue } from "./copy-value";

// The setup guide lives on the docs site. This route stays because Polar
// returns buyers here with their checkout, and installed desktop apps open it
// from Help. Old #anchors survive the redirect and the docs route maps them.
export const metadata: Metadata = {
  title: "Desktop App Getting Started",
  robots: { index: false, follow: true },
};

const inlineLink =
  "font-semibold text-teal-700 underline decoration-teal-600/35 underline-offset-2";

const downloads = [
  { href: DESKTOP_DOWNLOADS.macArm64, label: "macOS Apple Silicon" },
  { href: DESKTOP_DOWNLOADS.macX64, label: "macOS Intel" },
  { href: DESKTOP_DOWNLOADS.windows, label: "Windows" },
];

function PortalLink() {
  return (
    <a href={DESKTOP_PORTAL_URL} rel="noopener" className={inlineLink}>
      customer portal
    </a>
  );
}

function LicenseKeyStatus({ result }: { result: CheckoutKeyResult }) {
  if (result.status === "ready") {
    return (
      <div className="mt-4">
        <p className="text-petrol-950 text-sm font-semibold">
          Your license key
        </p>
        <div className="mt-2 flex flex-col items-start gap-2">
          {result.keys.map((key) => (
            <CopyValue key={key} value={key} wrap />
          ))}
        </div>
        <p className="text-petrol-700 mt-2 text-sm leading-6">
          You paste it in the last setup step. It is also always available in
          the <PortalLink />.
        </p>
      </div>
    );
  }
  if (result.status === "pending") {
    return (
      <p className="text-petrol-700 mt-1 text-sm leading-6">
        Your license key is being created. Refresh this page in a minute, or
        find it in the <PortalLink />. You paste it in the last setup step.
      </p>
    );
  }
  return (
    <p className="text-petrol-700 mt-1 text-sm leading-6">
      Your license key is in the <PortalLink />. Sign in there with the email
      address you used at checkout. You paste it in the last setup step.
    </p>
  );
}

export default async function DesktopGettingStartedPage({
  searchParams,
}: {
  searchParams: Promise<{
    checkout_id?: string;
    customer_session_token?: string;
  }>;
}) {
  // Polar sends buyers here after checkout with ?checkout_id=... and the
  // buyer's customer portal session, used to show the new license key.
  const { checkout_id: checkoutId, customer_session_token: sessionToken } =
    await searchParams;
  if (!checkoutId) redirect(`${DOCS_URL}/desktop/getting-started`);
  const licenseKey = await fetchCheckoutLicenseKeys(sessionToken);
  return (
    <div className="bg-mint-50 min-h-screen">
      <NavigationHeader />
      <main className="hero-stripes bg-mint-50 pt-28 pb-24 sm:pt-32">
        <div className="mx-auto max-w-2xl px-5 sm:px-8">
          <h1 className="text-petrol-950 text-4xl leading-[1.05] font-semibold tracking-[-0.045em] sm:text-5xl">
            Thank you for your purchase
          </h1>
          <div
            role="status"
            className="border-petrol-950/8 shadow-card mt-8 rounded-2xl border bg-white p-6 sm:p-8"
          >
            <LicenseKeyStatus result={licenseKey} />
            <p className="text-petrol-950 mt-6 text-sm font-semibold">
              Download the app
            </p>
            <div className="mt-3 flex flex-wrap gap-3">
              {downloads.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  <Download className="h-4 w-4" />
                  {item.label}
                </a>
              ))}
            </div>
            <p className="text-petrol-700 mt-4 text-sm leading-6">
              On an MSP plan, create an app registration in each customer
              tenant. The same key covers all of them.
            </p>
          </div>
          <a
            href={DESKTOP_SETUP_GUIDE_URL}
            className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-teal-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-teal-500 focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:outline-none"
          >
            Open the setup guide
            <ArrowRight className="h-4 w-4" />
          </a>
          <p className="text-petrol-600 mt-3 text-sm leading-6">
            About ten minutes from download to your first export.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
