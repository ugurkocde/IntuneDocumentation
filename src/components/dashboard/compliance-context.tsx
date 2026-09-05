"use client";

import { useState } from "react";
import type { DetailedExportData } from "~/lib/configuration-analyzer";
import type {
  AssessmentScope,
  ComplianceAssessment,
  CompliancePlatform,
} from "~/lib/compliance/types";
import { createEvidenceManifest } from "~/lib/compliance/manifest";

export function ComplianceContext({
  assessment,
  data,
  scope,
  onScopeChange,
  showRiskLevel,
}: {
  assessment: ComplianceAssessment;
  data: DetailedExportData;
  scope: AssessmentScope;
  onScopeChange: (scope: AssessmentScope) => void;
  showRiskLevel: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const platforms: CompliancePlatform[] = [
    "windows",
    "macos",
    "ios",
    "android",
  ];
  const selected = scope.platforms ?? platforms;
  const incomplete = assessment.collectionCoverage.some(
    (row) => row.status === "incomplete" || row.status === "notCollected",
  );
  async function download() {
    setDownloading(true);
    setError(null);
    try {
      const manifest = await createEvidenceManifest(data, scope);
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(manifest, null, 2)], {
          type: "application/json",
        }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "compliance-evidence.json";
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Could not generate the evidence record. Try again.");
    } finally {
      setDownloading(false);
    }
  }
  return (
    <section
      aria-label="Assessment scope and collection"
      className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-700"
    >
      <fieldset>
        <legend className="font-semibold text-slate-950">
          Platforms in scope
        </legend>
        <p className="mt-1 text-xs">
          Select the platforms included in this assessment. Policy absence does
          not establish that a platform is out of scope. Tenant access policies
          are assessed separately.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          {platforms.map((platform) => (
            <label
              key={platform}
              className="inline-flex min-h-10 items-center gap-2"
            >
              <input
                type="checkbox"
                checked={selected.includes(platform)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...selected, platform]
                    : selected.filter((item) => item !== platform);
                  if (next.length) onScopeChange({ ...scope, platforms: next });
                }}
              />
              {
                {
                  windows: "Windows",
                  macos: "macOS",
                  ios: "iOS / iPadOS",
                  android: "Android",
                  tenant: "Tenant",
                }[platform]
              }
            </label>
          ))}
        </div>
      </fieldset>
      {showRiskLevel && (
        <label className="flex flex-wrap items-center gap-3">
          Def Stan Cyber Risk Profile
          <select
            className="rounded border border-slate-300 p-2"
            value={scope.defStanRiskLevel ?? "all"}
            onChange={(event) =>
              onScopeChange({
                ...scope,
                defStanRiskLevel:
                  event.target.value === "all"
                    ? undefined
                    : (Number(event.target.value) as 0 | 1 | 2 | 3),
              })
            }
          >
            <option value="all">All levels (scope not selected)</option>
            {[0, 1, 2, 3].map((level) => (
              <option key={level} value={level}>
                Level {level}
              </option>
            ))}
          </select>
        </label>
      )}
      {incomplete && (
        <p role="status" className="rounded-lg bg-amber-50 p-3 text-amber-900">
          Collection is incomplete or a relevant source was not collected.
          Missing evidence may reflect unavailable data.
        </p>
      )}
      <p className="text-xs">
        Collected:{" "}
        {assessment.provenance.collectedAt ??
          "Unknown, timestamp absent from this export"}
        . Ruleset: {assessment.provenance.rulesetVersion}. Device state and
        effective access have not been verified.
      </p>
      <details>
        <summary className="cursor-pointer font-semibold">
          Collection and detection coverage
        </summary>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                {[
                  "Policy family",
                  "Collection",
                  "Collected",
                  "With recognized evidence",
                  "Without recognized evidence",
                ].map((label) => (
                  <th key={label} className="p-2">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assessment.collectionCoverage.map((row) => (
                <tr key={row.family} className="border-t border-slate-100">
                  <th scope="row" className="p-2 font-medium">
                    {row.family}
                    {row.errors.map((message) => (
                      <p
                        key={message}
                        className="mt-1 max-w-md font-normal break-words text-amber-800"
                      >
                        {message}
                      </p>
                    ))}
                  </th>
                  <td className="p-2">{row.status}</td>
                  <td className="p-2">{row.collectedPolicies}</td>
                  <td className="p-2">{row.recognizedPolicies}</td>
                  <td className="p-2">{row.unsupportedPolicies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs">
          Without recognized evidence includes unsupported formats, unsupported
          settings and indeterminate values. It does not establish a missing
          protection.
        </p>
      </details>
      <button
        type="button"
        disabled={downloading}
        onClick={() => void download()}
        className="min-h-10 rounded-lg border border-slate-300 px-3 py-2 font-semibold disabled:opacity-50"
      >
        {downloading
          ? "Preparing evidence record..."
          : "Download evidence record (JSON)"}
      </button>
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
