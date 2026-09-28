import { Download, FileText } from "lucide-react";
import { DESKTOP_SECURITY_OVERVIEW_PATH } from "~/lib/desktop-app";
import { buttonStyles } from "./primitives";

// Download card for the desktop app's security and architecture overview,
// written for customers who must get the app approved internally.
export function SecurityOverviewCard({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`border-petrol-950/8 shadow-soft rounded-3xl border bg-white p-6 sm:p-8 ${className}`}
    >
      <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
        <div className="flex gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700">
            <FileText className="h-6 w-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-[11px] font-semibold tracking-[0.14em] text-teal-700 uppercase">
              For your security review
            </p>
            <h3 className="text-petrol-950 mt-1 text-lg font-semibold tracking-[-0.02em]">
              Getting the desktop app approved internally?
            </h3>
            <p className="text-petrol-600 mt-2 max-w-2xl text-sm leading-6">
              The app connects through an app registration you create in your
              own Microsoft tenant, so we never get access to it. Share the
              one-page security and architecture overview with your security
              team: it covers every read-only Graph permission and each
              connection the app makes, including what our licensing service
              receives.
            </p>
          </div>
        </div>
        <a
          href={DESKTOP_SECURITY_OVERVIEW_PATH}
          download
          className={`${buttonStyles.primary} plausible-event-name=Security+Overview+Download shrink-0`}
        >
          <Download className="h-4 w-4" aria-hidden="true" />
          Download PDF
        </a>
      </div>
    </div>
  );
}
