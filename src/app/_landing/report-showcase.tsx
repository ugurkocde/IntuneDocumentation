import {
  Download,
  EyeOff,
  FileText,
  Layers,
  Palette,
  RefreshCw,
  Users,
} from "lucide-react";
import Image from "next/image";
import { SAMPLE_REPORT_URL } from "./content";
import { buttonStyles, Section, SectionHeading } from "./primitives";
import reportSettings from "../../../public/landing/report-settings.png";
import reportSummary from "../../../public/landing/report-summary.png";

const features = [
  {
    icon: Layers,
    title: "Broad Intune coverage",
    desc: "Core policies plus 36 additional Graph resource collections: apps, updates, enrollment, RBAC, tenant settings, connectors, and more.",
  },
  {
    icon: Users,
    title: "Assignments resolved",
    desc: "Group targets and filters shown by name, with optional device counts by platform.",
  },
  {
    icon: Palette,
    title: "Your branding",
    desc: "Company logo, colors, headers, footers, and confidentiality notices on every page.",
  },
  {
    icon: FileText,
    title: "PDF and Word",
    desc: "Polished documents ready for audits, handovers, and change records.",
  },
  {
    icon: RefreshCw,
    title: "Honest collection status",
    desc: "Partial or failed Graph collections are flagged with endpoint, status, and a permission hint instead of looking empty.",
  },
  {
    icon: EyeOff,
    title: "Secrets redacted",
    desc: "Script bodies, passwords, tokens, and payloads are replaced with [Redacted] before display or export.",
  },
];

export function ReportShowcase() {
  return (
    <Section id="features" tone="dark">
      <div className="grid gap-14 lg:grid-cols-[1fr_0.9fr] lg:items-center">
        <div>
          <SectionHeading
            inverted
            eyebrow="What you get"
            title="A report a reviewer can actually read."
            lead="Every setting with its value and description, grouped by policy, with an executive summary that surfaces unassigned and stale configurations."
          />
          <ul className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, desc }) => (
              <li key={title}>
                <Icon className="h-5 w-5 text-teal-500" aria-hidden="true" />
                <h3 className="mt-3 text-sm font-semibold text-white">
                  {title}
                </h3>
                <p className="mt-1 text-sm leading-6 text-white/70">{desc}</p>
              </li>
            ))}
          </ul>
          <a
            href={SAMPLE_REPORT_URL}
            className={`${buttonStyles.secondaryInverted} mt-10`}
          >
            <Download className="h-4 w-4" />
            Download the full sample report (PDF)
          </a>
        </div>

        <div className="relative mx-auto aspect-[5/5] w-full max-w-[480px]">
          <Image
            src={reportSummary}
            alt="Executive summary page of the sample report"
            sizes="(min-width: 1024px) 290px, 60vw"
            className="absolute top-0 left-0 w-[62%] -rotate-2 rounded-lg shadow-2xl"
          />
          <Image
            src={reportSettings}
            alt="Settings Catalog page listing each setting with its value and description"
            sizes="(min-width: 1024px) 300px, 62vw"
            className="absolute right-0 bottom-0 w-[64%] rotate-2 rounded-lg shadow-2xl"
          />
        </div>
      </div>
    </Section>
  );
}
