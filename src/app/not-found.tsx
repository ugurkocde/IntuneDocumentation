import type { Metadata } from "next";
import Link from "next/link";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";

export const metadata: Metadata = {
  title: "Page Not Found | Intune Documentation",
  description:
    "The page you are looking for does not exist. Return to the Intune Documentation Generator to create audit-ready PDF reports of your Microsoft Intune configurations.",
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <NavigationHeader />
      <main className="flex flex-1 items-center justify-center px-4 py-24">
        <div className="max-w-md text-center">
          <p className="mb-4 text-7xl font-extrabold text-slate-900">404</p>
          <h1 className="mb-2 text-2xl font-bold text-slate-900">
            Page not found
          </h1>
          <p className="mb-8 text-slate-600">
            The page you are looking for does not exist or has been moved.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-6 py-3 font-semibold text-white transition-colors hover:bg-slate-800"
          >
            Go to Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
