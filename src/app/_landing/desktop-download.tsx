import { ArrowRight } from "lucide-react";
import Link from "next/link";
import {
  DESKTOP_DOWNLOADS,
  DESKTOP_PRICING_PATH,
  DESKTOP_TRIAL_DAYS,
} from "~/lib/desktop-app";
import { MacDownloadLinks } from "./mac-download";
import { buttonStyles } from "./primitives";
import { licensedDownloadClass, trackDownload } from "./desktop-shared";

export type Platform = "windows" | "mac" | "other";

export function detectPlatform(userAgent: string): Platform {
  if (/Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)) return "other";
  if (/Windows NT/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  return "other";
}

// Installers only help people who already have a license key, so the direct
// download is a quiet link; new visitors are sent to the trial first.
function LicensedDownload({ platform }: { platform: Platform }) {
  if (platform === "mac") return <MacDownloadLinks />;
  if (platform === "windows") {
    return (
      <p className={licensedDownloadClass}>
        Already licensed?{" "}
        <a
          href={DESKTOP_DOWNLOADS.windows}
          className={`${buttonStyles.textLink} ${trackDownload("windows")}`}
        >
          Download for Windows
        </a>
      </p>
    );
  }
  return null;
}

export function DesktopCallout({ platform }: { platform: Platform }) {
  return (
    <div className="border-petrol-950/8 mt-8 max-w-xl rounded-2xl border bg-white/70 p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-petrol-950 text-sm font-semibold">
            Data must stay on your machines, or many tenants?
          </p>
          <p className="text-petrol-600 mt-1 text-xs leading-5">
            Desktop app for Windows and macOS. {DESKTOP_TRIAL_DAYS} day free
            trial, card required.
          </p>
        </div>
        <Link
          href={DESKTOP_PRICING_PATH}
          className={`${buttonStyles.secondary} shrink-0 bg-white`}
        >
          Try the desktop app
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
      <LicensedDownload platform={platform} />
    </div>
  );
}
