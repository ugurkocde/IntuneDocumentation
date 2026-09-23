import { ArrowRight } from "lucide-react";
import { AuthCta } from "./auth-cta";
import { SAMPLE_REPORT_URL } from "./content";
import { buttonStyles } from "./primitives";

export function FinalCta() {
  return (
    <section className="bg-white px-5 pb-20 sm:px-8 sm:pb-24 lg:px-10">
      <div className="bg-petrol-950 shadow-soft mx-auto grid max-w-6xl gap-8 rounded-3xl px-6 py-10 text-white sm:px-10 sm:py-12 lg:grid-cols-[1fr_auto] lg:items-center lg:px-14">
        <div>
          <p className="mb-4 text-[11px] font-bold tracking-[0.2em] text-teal-500 uppercase">
            Try it now
          </p>
          <h2 className="max-w-2xl text-3xl font-semibold tracking-[-0.035em] text-white sm:text-4xl">
            Ready to stop documenting Intune by hand?
          </h2>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">
            Sign in with Microsoft and export your first report in minutes.
            Free, read-only, and nothing stored.
          </p>
        </div>
        <AuthCta
          inverted
          secondaryAction={
            <a
              href={SAMPLE_REPORT_URL}
              className={buttonStyles.secondaryInverted}
            >
              Sample report
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </a>
          }
        />
      </div>
    </section>
  );
}
