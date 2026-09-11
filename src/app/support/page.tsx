import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";
import { SupportForm } from "~/components/support-form";

export const metadata: Metadata = {
  title: "Contact support",
  description:
    "Get help with Intune Documentation. Send a support request to the Ugurlabs team.",
  alternates: { canonical: "/support" },
};

export default async function SupportPage() {
  const requestHeaders = await headers();
  const publicSite = requestHeaders.get("x-site-mode") === "public";
  if (!publicSite && process.env.PUBLIC_SITE_ORIGIN)
    redirect(new URL("/support", process.env.PUBLIC_SITE_ORIGIN).href);
  const configured =
    publicSite &&
    process.env.RESEND_API_KEY &&
    process.env.SUPPORT_FROM_EMAIL &&
    process.env.SUPPORT_TURNSTILE_SITE_KEY &&
    process.env.SUPPORT_TURNSTILE_SECRET_KEY;
  return (
    <div className="min-h-screen bg-white pt-16">
      <NavigationHeader />
      <main className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
        <p className="mb-4 text-sm font-semibold tracking-widest text-teal-800 uppercase">
          Here to help
        </p>
        <h1 className="text-petrol-950 text-4xl font-bold tracking-tight sm:text-5xl">
          Contact support
        </h1>
        <p className="mt-5 mb-10 max-w-xl text-lg leading-8 text-slate-600">
          Need a hand with Intune Documentation? Tell us what you’re working on
          and where you got stuck.
        </p>
        {configured ? (
          <SupportForm
            siteKey={process.env.SUPPORT_TURNSTILE_SITE_KEY!}
            nonce={requestHeaders.get("x-nonce") ?? undefined}
          />
        ) : (
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-slate-700">
            The support form is currently unavailable. Please email us directly.
          </p>
        )}
        <p className="mt-8 text-sm text-slate-600">
          You can also email{" "}
          <a
            href="mailto:support@ugurlabs.com"
            className="text-teal-800 underline"
          >
            support@ugurlabs.com
          </a>
          .
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
