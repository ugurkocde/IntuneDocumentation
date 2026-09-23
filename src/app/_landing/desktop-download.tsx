import { Download } from "lucide-react";
import Link from "next/link";
import { DESKTOP_DOWNLOADS } from "~/lib/desktop-app";
import { buttonStyles } from "./primitives";

export type Platform = "windows" | "mac" | "other";

export function detectPlatform(userAgent: string): Platform {
  if (/Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)) return "other";
  if (/Windows NT/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  return "other";
}

// Plausible tagged-event class names, counted as custom goals
export const trackDownload = (name: string) =>
  `plausible-event-name=Desktop+Download plausible-event-platform=${name}`;

// Browsers cannot reliably tell Apple Silicon from Intel (Safari reports
// Intel on every Mac), so the Mac button defaults to Apple Silicon and the
// Intel build is offered right beside it.
export function DesktopDownload({ platform }: { platform: Platform }) {
  if (platform === "windows") {
    return (
      <a
        href={DESKTOP_DOWNLOADS.windows}
        className={`${buttonStyles.primary} ${trackDownload("windows")}`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download for Windows
      </a>
    );
  }

  if (platform === "mac") {
    return (
      <a
        href={DESKTOP_DOWNLOADS.macArm64}
        className={`${buttonStyles.primary} ${trackDownload("mac-arm64")}`}
      >
        <Download className="h-4 w-4" aria-hidden="true" />
        Download for macOS
      </a>
    );
  }

  return (
    <Link href="/desktop#download" className={buttonStyles.primary}>
      <Download className="h-4 w-4" aria-hidden="true" />
      Desktop app for Windows and macOS
    </Link>
  );
}

// Secondary links under the hero buttons: the builds the primary button did
// not offer.
export function OtherPlatforms({ platform }: { platform: Platform }) {
  const linkClass = buttonStyles.textLink;
  if (platform === "mac") {
    return (
      <>
        <a
          href={DESKTOP_DOWNLOADS.macX64}
          className={`${linkClass} ${trackDownload("mac-x64")}`}
        >
          Intel Mac
        </a>
        {" / "}
        <Link href="/desktop#download" className={linkClass}>
          Windows
        </Link>
      </>
    );
  }
  if (platform === "windows") {
    return (
      <Link href="/desktop#download" className={linkClass}>
        macOS
      </Link>
    );
  }
  return null;
}
