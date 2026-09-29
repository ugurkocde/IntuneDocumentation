import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { LicenseConnectionIssue } from "../../../shared/ipc-types";
import {
  licenseAllowRule,
  licenseIssueReport,
  licenseIssueText,
} from "../../../shared/license-issues";
import { Alert } from "../ui/Alert";
import { CopyButton } from "../ui/CopyButton";

function Row({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <>
      <dt className="text-petrol-600">{label}</dt>
      <dd
        className={`text-petrol-950 min-w-0 break-all ${mono ? "font-mono text-[11.5px]" : ""}`}
      >
        {value}
      </dd>
    </>
  );
}

// Why the licensing service could not be reached, with the likely cause, what
// to try and the technical details for IT behind a Details button.
export function ConnectionIssueAlert({
  issue,
  tone,
}: {
  issue: LicenseConnectionIssue;
  tone: "danger" | "warning";
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const text = licenseIssueText(issue.cause, issue.endpoint);
  const at = new Date(issue.at);

  return (
    <Alert tone={tone} title={<span className="selectable">{text.title}</span>}>
      <p className="selectable">{text.explanation}</p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="text-petrol-950 hover:bg-petrol-950/5 mt-3 inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-current/15 bg-white px-3 text-[12px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
      >
        {open ? "Hide details" : "Details"}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          id={panelId}
          className="border-petrol-950/8 text-petrol-800 selectable mt-3 rounded-xl border bg-white p-4"
        >
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.12em] uppercase">
            What to try
          </p>
          <ol className="text-petrol-950 marker:text-petrol-600 mt-2 list-decimal space-y-1.5 pl-4 text-[13px] leading-5">
            {text.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>

          <div className="border-petrol-950/8 mt-4 border-t pt-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-petrol-600 text-[10px] font-bold tracking-[0.12em] uppercase">
                Technical details
              </p>
              <CopyButton
                value={licenseIssueReport(issue)}
                label="Copy details"
                showLabel
              />
            </div>
            <dl className="mt-2 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12px] leading-5">
              <Row label="Error code" value={issue.code} mono />
              <Row label="Endpoint" value={issue.endpoint} mono />
              <Row
                label="Allow rule"
                value={licenseAllowRule(issue.endpoint)}
                mono
              />
              <Row
                label="Time"
                value={
                  Number.isNaN(at.getTime())
                    ? issue.at
                    : at.toLocaleString([], {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })
                }
              />
              <Row label="App version" value={issue.appVersion} />
              <Row label="Platform" value={issue.platform} />
            </dl>
          </div>
        </div>
      )}
    </Alert>
  );
}
