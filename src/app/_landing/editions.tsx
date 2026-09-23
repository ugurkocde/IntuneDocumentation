import {
  ArrowRight,
  Cloud,
  Container,
  EyeOff,
  Github,
  HardDrive,
  KeyRound,
  Laptop,
  RefreshCw,
  Building2,
} from "lucide-react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { DESKTOP_TRIAL_DAYS } from "~/lib/desktop-app";
import { cn } from "~/lib/utils";
import { DESKTOP_STARTING_PRICE, GITHUB_URL } from "./content";
import { buttonStyles, Section, SectionHeading } from "./primitives";

function Edition({
  name,
  price,
  audience,
  points,
  highlighted = false,
  children,
}: {
  name: string;
  price: string;
  audience: string;
  points: Array<{ icon: LucideIcon; text: string }>;
  highlighted?: boolean;
  children: ReactNode;
}) {
  return (
    <article
      className={cn(
        "flex flex-col rounded-3xl border p-6 sm:p-8",
        highlighted
          ? "shadow-soft border-teal-600/20 bg-white"
          : "border-petrol-950/6 bg-white/60",
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-petrol-950 text-xl font-semibold">{name}</h3>
        <p className="text-sm font-semibold text-teal-700">{price}</p>
      </div>
      <p className="text-petrol-600 mt-2 text-sm leading-6">{audience}</p>
      <ul className="mt-6 flex-1 space-y-4">
        {points.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="text-petrol-700 pt-1 text-sm leading-6">
              {text}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">{children}</div>
    </article>
  );
}

export function Editions() {
  return (
    <Section id="editions" tone="mint">
      <SectionHeading
        centered
        eyebrow="Ways to run it"
        title="Hosted, self-hosted, or on your desktop"
        lead="The same documentation engine in every edition. Pick the one that fits where your tenant data is allowed to go."
      />
      <div className="mt-12 grid gap-5 lg:grid-cols-3">
        <Edition
          highlighted
          name="Web"
          price="Free"
          audience="The fastest start. Nothing to install or operate."
          points={[
            { icon: Cloud, text: "Runs at intunedocumentation.com" },
            { icon: RefreshCw, text: "Always on the latest version" },
            { icon: EyeOff, text: "No tenant data stored" },
          ]}
        >
          <a href="#get-started" className={buttonStyles.primary}>
            Start in the browser
          </a>
        </Edition>

        <Edition
          name="Self-hosted"
          price="Free"
          audience="Open source under the Elastic License 2.0."
          points={[
            { icon: Container, text: "One docker compose command" },
            { icon: KeyRound, text: "Your own Entra app registration" },
            { icon: EyeOff, text: "Telemetry disabled by default" },
          ]}
        >
          <a
            href={`${GITHUB_URL}#self-host-with-docker`}
            target="_blank"
            rel="noopener noreferrer"
            className={buttonStyles.secondary}
          >
            <Github className="h-4 w-4" aria-hidden="true" />
            Self-hosting guide
          </a>
        </Edition>

        <Edition
          name="Desktop app"
          price={`From ${DESKTOP_STARTING_PRICE}/mo`}
          audience="For data that must stay on your machines, and for MSPs with many tenants."
          points={[
            {
              icon: Laptop,
              text: "Collects straight from Graph on your device",
            },
            {
              icon: HardDrive,
              text: "Configuration, tokens, and exports never leave your machine",
            },
            { icon: Building2, text: "Multi-tenant plans for MSPs" },
            { icon: KeyRound, text: "Your own Entra app registration" },
          ]}
        >
          <Link href="/desktop" className={buttonStyles.secondary}>
            {DESKTOP_TRIAL_DAYS} day free trial
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Edition>
      </div>
    </Section>
  );
}
