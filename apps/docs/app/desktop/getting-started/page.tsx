import type { Metadata } from 'next';
import { LegacyRedirect } from './legacy-redirect';

export const metadata: Metadata = {
  title: 'Desktop app guide has moved',
  robots: { index: false, follow: true },
  alternates: { canonical: '/desktop/before-you-start' },
};

export default function Page() {
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-24">
      <div className="w-full max-w-md rounded-2xl border bg-fd-card p-8 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-fd-foreground">The desktop app guide has moved</h1>
        <p className="mt-3 text-sm text-fd-muted-foreground">
          The one page guide is now split into shorter pages. Taking you to the right section.
        </p>
        <LegacyRedirect />
      </div>
    </main>
  );
}
