"use client";

import { useEffect, useState } from "react";
import { DESKTOP_DOWNLOADS } from "~/lib/desktop-app";
import { buttonStyles } from "./primitives";
import { licensedDownloadClass, trackDownload } from "./desktop-shared";

// Browsers cannot reliably tell Apple Silicon from Intel (Safari reports
// Intel on every Mac), so both builds are offered as equal choices. iPadOS
// Safari also sends a Mac user-agent; touch support gives it away, and those
// visitors get no installer links.
export function MacDownloadLinks() {
  const [isTablet, setIsTablet] = useState(false);

  useEffect(() => {
    if (navigator.maxTouchPoints > 1) setIsTablet(true);
  }, []);

  if (isTablet) return null;

  return (
    <p className={licensedDownloadClass}>
      Already licensed? Download for{" "}
      <a
        href={DESKTOP_DOWNLOADS.macArm64}
        className={`${buttonStyles.textLink} ${trackDownload("mac-arm64")}`}
      >
        Apple Silicon
      </a>{" "}
      or{" "}
      <a
        href={DESKTOP_DOWNLOADS.macX64}
        className={`${buttonStyles.textLink} ${trackDownload("mac-x64")}`}
      >
        Intel Macs
      </a>
    </p>
  );
}
