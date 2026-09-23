"use client";

import { ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { DESKTOP_DOWNLOADS } from "~/lib/desktop-app";
import { buttonStyles } from "./primitives";

// Plausible tagged-event class names, counted as custom goals
export const trackDownload = (name: string) =>
  `plausible-event-name=Desktop+Download plausible-event-platform=${name}`;

export function DesktopPageLink() {
  return (
    <Link href="/desktop#download" className={buttonStyles.primary}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Desktop app for Windows and macOS
    </Link>
  );
}

const macBuilds = [
  {
    href: DESKTOP_DOWNLOADS.macArm64,
    event: "mac-arm64",
    label: "Apple Silicon",
    detail: "Macs with M1 or later",
  },
  {
    href: DESKTOP_DOWNLOADS.macX64,
    event: "mac-x64",
    label: "Intel",
    detail: "Macs with an Intel processor",
  },
];

// Browsers cannot reliably tell Apple Silicon from Intel (Safari reports
// Intel on every Mac), so both builds are offered as equal choices. iPadOS
// Safari also sends a Mac user-agent; touch support gives it away, and those
// visitors get the general desktop link instead of an installer.
export function MacDownload() {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    if (navigator.maxTouchPoints > 1) setIsTablet(true);
  }, []);

  if (isTablet) return <DesktopPageLink />;

  return (
    <details className="group relative">
      <summary
        className={`${buttonStyles.primary} list-none [&::-webkit-details-marker]:hidden`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download for macOS
        <ChevronDown
          className="h-4 w-4 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-petrol-950/8 shadow-soft absolute top-full left-0 z-20 mt-2 w-64 rounded-2xl border bg-white p-2">
        {macBuilds.map(({ href, event, label, detail }) => (
          <a
            key={event}
            href={href}
            className={`hover:bg-mint-50 flex flex-col rounded-xl px-3 py-2.5 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${trackDownload(event)}`}
          >
            <span className="text-petrol-950 text-sm font-semibold">
              {label}
            </span>
            <span className="text-petrol-600 text-xs">{detail}</span>
          </a>
        ))}
      </div>
    </details>
  );
}
