import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  DESKTOP_GETTING_STARTED_PATH,
  DESKTOP_TRIAL_DAYS,
} from "~/lib/desktop-app";
import type { SiteStats } from "~/lib/site-stats";
import { AuthCta } from "./auth-cta";
import { CONSENT_ROLES } from "./content";
import {
  DesktopDownload,
  OtherPlatforms,
  type Platform,
} from "./desktop-download";
import { DialogTrigger } from "./dialog";
import { buttonStyles } from "./primitives";
import { PERMISSIONS_DIALOG_ID, SECURITY_DIALOG_ID } from "./trust-dialogs";
import reportCover from "../../../public/landing/report-cover.png";
import reportSummary from "../../../public/landing/report-summary.png";

function formatStats(stats: SiteStats) {
  // Fixed locale so server-rendered numbers are stable across requests
  const format = (value: number) => value.toLocaleString("en-US");
  return [
    stats.exportCount > 0 && {
      value: format(stats.exportCount),
      label: "Reports exported",
    },
    stats.tenantCount >= 10 && {
      value: format(stats.tenantCount),
      label: "Organizations",
    },
    stats.mauCount >= 10 && {
      value: format(stats.mauCount),
      label: "Active users this month",
    },
  ].filter((stat): stat is { value: string; label: string } => Boolean(stat));
}

function ReportPreview() {
  return (
    <div className="relative mx-auto aspect-[5/4.4] w-full max-w-[520px]">
      <div
        className="absolute inset-8 rounded-[2.5rem] bg-teal-100/80 blur-2xl"
        aria-hidden="true"
      />
      <Image
        src={reportCover}
        alt="Cover page of a sample Intune documentation report"
        sizes="(min-width: 1024px) 300px, 55vw"
        className="ring-petrol-950/8 shadow-soft absolute top-[8%] left-0 w-[56%] -rotate-3 rounded-lg ring-1"
        priority
      />
      <Image
        src={reportSummary}
        alt="Executive summary page with key metrics, assignment coverage, and potential gaps"
        sizes="(min-width: 1024px) 320px, 60vw"
        className="ring-petrol-950/8 shadow-soft absolute top-0 right-0 w-[60%] rotate-2 rounded-lg ring-1"
        priority
      />
      <p className="text-petrol-700 border-petrol-950/8 shadow-card absolute bottom-0 left-1/2 -translate-x-1/2 rounded-full border bg-white px-4 py-2 text-xs font-semibold whitespace-nowrap">
        Real export from a sample tenant
      </p>
    </div>
  );
}

export function Hero({
  stats,
  platform,
}: {
  stats: SiteStats;
  platform: Platform;
}) {
  const heroStats = formatStats(stats);

  return (
    <section
      id="get-started"
      className="hero-stripes bg-mint-50 relative scroll-mt-24 pt-28 pb-20 sm:pt-32 sm:pb-24 lg:pt-36 lg:pb-28"
    >
      <div className="mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-10 lg:px-10">
        <div className="relative z-10">
          <Link
            href="/desktop"
            className="animate-hero-fade-up border-petrol-950/8 text-petrol-800 mb-6 inline-flex min-h-11 items-center gap-2 rounded-full border bg-white px-4 py-2 text-xs font-semibold transition-colors hover:border-teal-600/30 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
          >
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-bold tracking-wide text-teal-700 uppercase">
              New
            </span>
            Desktop app for MSPs and local-only teams
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <h1 className="animate-hero-fade-up text-petrol-950 max-w-3xl text-[2.5rem] leading-[1.02] font-semibold tracking-[-0.05em] sm:text-[3.4rem] lg:text-[3.7rem]">
            Audit-ready Intune documentation, straight from your tenant.
          </h1>

          <p className="animate-hero-fade-up animation-delay-120 text-petrol-600 mt-6 max-w-xl text-base leading-7 sm:text-lg">
            Export policies, settings, and assignments to PDF or Word, then map
            your configuration to compliance frameworks like ISO 27001, NIST,
            and Essential Eight. Run it on your own machine, or free in the
            browser.
          </p>

          <div className="animate-hero-fade-up animation-delay-240 mt-8">
            <AuthCta leadingAction={<DesktopDownload platform={platform} />} />
            <div className="text-petrol-600 mt-5 max-w-xl space-y-2 text-xs leading-5">
              <p>
                <span className="text-petrol-800 font-semibold">Desktop:</span>{" "}
                {DESKTOP_TRIAL_DAYS} day free trial at checkout (card required),
                using your own Entra app registration.{" "}
                <Link
                  href={DESKTOP_GETTING_STARTED_PATH}
                  className={buttonStyles.textLink}
                >
                  Setup guide
                </Link>
                <OtherPlatforms platform={platform} />
              </p>
              <p>
                <span className="text-petrol-800 font-semibold">Web:</span> free
                and read-only. The first sign-in in your tenant needs a one-time
                approval from {CONSENT_ROLES}.{" "}
                <DialogTrigger
                  dialogId={SECURITY_DIALOG_ID}
                  className={buttonStyles.textLink}
                >
                  How sign-in works
                </DialogTrigger>
                {" / "}
                <DialogTrigger
                  dialogId={PERMISSIONS_DIALOG_ID}
                  className={buttonStyles.textLink}
                >
                  Permissions
                </DialogTrigger>
              </p>
            </div>
          </div>

          {heroStats.length > 0 && (
            <dl className="animate-hero-fade-up animation-delay-360 border-petrol-950/8 mt-10 flex flex-wrap items-center gap-x-10 gap-y-4 border-t pt-7">
              {heroStats.map(({ value, label }) => (
                <div key={label} className="flex flex-col-reverse">
                  <dt className="text-petrol-600 mt-1 text-[10px] font-semibold tracking-[0.14em] uppercase">
                    {label}
                  </dt>
                  <dd className="text-petrol-950 text-3xl font-semibold tracking-[-0.045em] tabular-nums">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        <div className="animate-hero-fade-up animation-delay-240">
          <ReportPreview />
        </div>
      </div>
    </section>
  );
}
