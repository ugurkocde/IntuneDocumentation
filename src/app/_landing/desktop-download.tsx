import { Download } from "lucide-react";
import Link from "next/link";
import { DESKTOP_DOWNLOADS } from "~/lib/desktop-app";
import { DesktopPageLink, MacDownload, trackDownload } from "./mac-download";
import { buttonStyles } from "./primitives";

export type Platform = "windows" | "mac" | "other";

export function detectPlatform(userAgent: string): Platform {
  if (/Android|iPhone|iPad|iPod|Windows Phone/i.test(userAgent)) return "other";
  if (/Windows NT/i.test(userAgent)) return "windows";
  if (/Macintosh|Mac OS X/i.test(userAgent)) return "mac";
  return "other";
}

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

  if (platform === "mac") return <MacDownload />;

  return <DesktopPageLink />;
}

// Secondary link under the hero buttons for the platform the primary button
// did not offer.
export function OtherPlatforms({ platform }: { platform: Platform }) {
  if (platform === "other") return null;
  return (
    <>
      {" / "}
      <Link href="/desktop#download" className={buttonStyles.textLink}>
        {platform === "mac" ? "Windows" : "macOS"}
      </Link>
    </>
  );
}
