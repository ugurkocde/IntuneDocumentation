'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

const FALLBACK = '/desktop/before-you-start';

/** Anchors of the old one page guide mapped to the page that now holds that section. */
const ANCHORS: Record<string, { path: string; keepHash?: boolean }> = {
  install: { path: '/desktop/install' },
  register: { path: '/desktop/app-registration', keepHash: true },
  platform: { path: '/desktop/app-registration', keepHash: true },
  permissions: { path: '/desktop/app-registration', keepHash: true },
  consent: { path: '/desktop/app-registration', keepHash: true },
  ids: { path: '/desktop/app-registration', keepHash: true },
  'sign-in': { path: '/desktop/sign-in-and-license' },
  license: { path: '/desktop/sign-in-and-license' },
  export: { path: '/desktop/collect' },
  'search-settings': { path: '/desktop/search-settings' },
  'windows-only': { path: '/desktop/select-and-export' },
  'management-report': { path: '/desktop/management-report' },
  troubleshooting: { path: '/help/troubleshooting' },
};

export function resolveLegacyAnchor(hash: string): string {
  const raw = hash.replace(/^#/, '');
  let anchor = raw;
  try {
    anchor = decodeURIComponent(raw);
  } catch {
    // A malformed escape is not one of our anchors; fall through to the default page.
  }
  const target = Object.hasOwn(ANCHORS, anchor) ? ANCHORS[anchor] : undefined;
  if (!target) return FALLBACK;
  return target.keepHash ? `${target.path}#${anchor}` : target.path;
}

export function LegacyRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace(resolveLegacyAnchor(window.location.hash));
  }, [router]);

  return (
    <p className="mt-6 text-sm">
      <Link
        href={FALLBACK}
        className="font-medium text-fd-primary underline underline-offset-4 hover:opacity-80"
      >
        Continue to the desktop app guide
      </Link>
    </p>
  );
}
