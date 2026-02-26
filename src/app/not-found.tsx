import Link from "next/link";
import { NavigationHeader } from "~/components/navigation-header";
import { SiteFooter } from "~/components/site-footer";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      <NavigationHeader />
      <main className="flex-1 flex items-center justify-center px-4 py-24">
        <div className="text-center max-w-md">
          <p className="text-7xl font-extrabold text-slate-900 mb-4">404</p>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Page not found</h1>
          <p className="text-slate-600 mb-8">
            The page you are looking for does not exist or has been moved.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors font-semibold"
          >
            Go to Home
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
