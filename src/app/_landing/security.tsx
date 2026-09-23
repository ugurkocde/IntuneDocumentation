import {
  Check,
  Cloud,
  Database,
  FileCheck,
  Lock,
  Monitor,
  ServerOff,
  Shield,
} from "lucide-react";
import { DialogTrigger } from "./dialog";
import { buttonStyles, Section, SectionHeading } from "./primitives";
import { PERMISSIONS_DIALOG_ID, SECURITY_DIALOG_ID } from "./trust-dialogs";

const guarantees = [
  {
    title: "Delegated, read-only permissions",
    desc: "Microsoft Graph scopes that can read your Intune configuration, never change it. No app-only permissions.",
  },
  {
    title: "Sensitive values redacted",
    desc: "Script bodies, passwords, tokens, payloads, QR codes, and configuration-file contents are removed before dashboard display or export.",
  },
  {
    title: "Reports generated in your browser",
    desc: "PDF and Word documents are built on your device and never uploaded to us.",
  },
  {
    title: "Revoke access anytime",
    desc: "Delete the Intune Documentation app from Entra ID enterprise applications to remove consent for your tenant. Signing out only ends your session.",
  },
];

const dataFlow = [
  {
    icon: Cloud,
    tile: "bg-white text-teal-700 border-petrol-950/6 border",
    title: "Microsoft Graph API",
    desc: "Your Intune tenant, delegated read-only access",
  },
  {
    icon: Database,
    tile: "bg-white text-teal-700 border-petrol-950/6 border",
    title: "Transient application processing",
    desc: "Collects, normalizes, and redacts responses without persistent tenant storage",
  },
  {
    icon: Monitor,
    tile: "bg-teal-700 text-white",
    title: "Your browser",
    desc: "Shows collected sections and builds the report locally",
  },
  {
    icon: FileCheck,
    tile: "bg-petrol-950 text-white",
    title: "Your PDF or Word file",
    desc: "Saved directly to your device",
  },
];

export function Security() {
  return (
    <Section id="security" tone="white">
      <div className="grid gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:gap-16">
        <div>
          <SectionHeading
            eyebrow="Security"
            title="Read-only access. No stored tenant data."
            lead="Graph responses pass through our application server only to be collected, normalized, and redacted. Your configuration, access token, and generated documents are never persisted."
          />
          <ul className="mt-8 space-y-4">
            {guarantees.map(({ title, desc }) => (
              <li key={title} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <Check
                    className="h-3.5 w-3.5"
                    strokeWidth={3}
                    aria-hidden="true"
                  />
                </span>
                <div>
                  <p className="text-petrol-950 text-sm font-semibold">
                    {title}
                  </p>
                  <p className="text-petrol-600 mt-0.5 text-sm leading-6">
                    {desc}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap gap-3">
            <DialogTrigger
              dialogId={SECURITY_DIALOG_ID}
              className={buttonStyles.secondary}
            >
              <Shield className="h-4 w-4 text-teal-700" aria-hidden="true" />
              How sign-in works
            </DialogTrigger>
            <DialogTrigger
              dialogId={PERMISSIONS_DIALOG_ID}
              className={buttonStyles.secondary}
            >
              <Lock className="h-4 w-4 text-teal-700" aria-hidden="true" />
              Required permissions
            </DialogTrigger>
          </div>
        </div>

        <div className="border-petrol-950/6 shadow-soft bg-mint-50 rounded-3xl border p-6 sm:p-8">
          <p className="text-petrol-600 text-[10px] font-semibold tracking-[0.14em] uppercase">
            How your data flows
          </p>
          <ol className="mt-6">
            {dataFlow.map(({ icon: Icon, tile, title, desc }, i) => (
              <li key={title}>
                {i > 0 && (
                  <div
                    className="bg-petrol-950/10 ml-[23px] h-7 w-px"
                    aria-hidden="true"
                  />
                )}
                <div className="flex items-center gap-4">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${tile}`}
                  >
                    <Icon
                      className="h-5 w-5"
                      strokeWidth={1.8}
                      aria-hidden="true"
                    />
                  </span>
                  <div>
                    <p className="text-petrol-950 text-sm font-semibold">
                      {title}
                    </p>
                    <p className="text-petrol-600 text-xs leading-5">{desc}</p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
          <div className="border-petrol-950/8 mt-7 flex items-center justify-between gap-3 border-t pt-5">
            <span className="text-petrol-600 flex items-center gap-2 text-sm">
              <ServerOff className="h-4 w-4" aria-hidden="true" />
              Intune configuration storage
            </span>
            <span className="rounded-full bg-teal-50 px-3 py-1 text-[10px] font-bold tracking-wide text-teal-700 uppercase">
              Not used
            </span>
          </div>
        </div>
      </div>
    </Section>
  );
}
