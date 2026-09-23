import { Check, FileJson, Loader2 } from "lucide-react";
import type {
  AssessmentScope,
  CompliancePlatform,
} from "../../../../../../src/lib/compliance/types";
import type { ComplianceView } from "../../../shared/ipc-types";
import { Button } from "../ui/Button";

const PLATFORMS: ReadonlyArray<{ id: CompliancePlatform; label: string }> = [
  { id: "windows", label: "Windows" },
  { id: "macos", label: "macOS" },
  { id: "ios", label: "iOS / iPadOS" },
  { id: "android", label: "Android" },
];

const SELECT_CLASS =
  "border-petrol-950/8 text-petrol-950 min-h-10 cursor-pointer rounded-xl border bg-white px-3 text-[13px] font-medium focus-visible:border-teal-600/40 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60";

// Port of the website's ComplianceContext: platform scope, the framework
// specific target level, collection coverage and the JSON evidence record.
export function ScopePanel({
  view,
  scope,
  onScopeChange,
  updating,
  showEssentialEightLevel,
  showRiskLevel,
  record,
}: {
  view: ComplianceView;
  scope: AssessmentScope;
  onScopeChange: (scope: AssessmentScope) => void;
  updating: boolean;
  showEssentialEightLevel: boolean;
  showRiskLevel: boolean;
  record: {
    busy: boolean;
    disabledReason: string | null;
    error: string | null;
    savedPath: string | null;
    onSave: () => void;
  };
}) {
  const selected = scope.platforms ?? PLATFORMS.map((platform) => platform.id);
  const incomplete = view.collectionCoverage.some(
    (row) => row.status === "incomplete" || row.status === "notCollected",
  );
  const caNotCollected = view.collectionCoverage.some(
    (row) => row.family === "conditionalAccessPolicies" && row.status === "notCollected",
  );

  return (
    <section
      aria-label="Assessment scope and collection"
      className="border-petrol-950/6 shadow-card space-y-5 rounded-2xl border bg-white p-5 text-sm text-slate-700 @xl:p-6"
    >
      <fieldset className="relative">
        <legend className="text-petrol-950 text-sm font-semibold">Platforms in scope</legend>
        <span
          role="status"
          aria-live="polite"
          className="text-petrol-600 absolute top-0 right-0 inline-flex items-center gap-1.5 text-xs"
        >
          {updating && (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-700 motion-reduce:animate-none" aria-hidden="true" />
              Updating the assessment
            </>
          )}
        </span>
        <p className="text-petrol-600 mt-1 max-w-3xl text-xs leading-5">
          Select the platforms included in this assessment. Policy absence does not establish that a platform is out
          of scope. Tenant access policies are assessed separately.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {PLATFORMS.map((platform) => {
            const checked = selected.includes(platform.id);
            const last = checked && selected.length === 1;
            return (
              <label
                key={platform.id}
                title={last ? "Keep at least one platform in scope." : undefined}
                className={`relative inline-flex min-h-10 items-center gap-2 rounded-xl border px-3 text-[13px] font-semibold transition-colors focus-within:ring-2 focus-within:ring-teal-600/30 ${
                  checked
                    ? "border-teal-600/30 bg-teal-50 text-teal-800"
                    : "border-petrol-950/10 text-petrol-700 hover:bg-mint-50 bg-white"
                } ${last ? "cursor-not-allowed" : "cursor-pointer"}`}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={checked}
                  disabled={last}
                  onChange={(event) => {
                    const next = event.target.checked
                      ? [...selected, platform.id]
                      : selected.filter((item) => item !== platform.id);
                    if (next.length) onScopeChange({ ...scope, platforms: next });
                  }}
                />
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-[5px] border ${
                    checked ? "border-teal-600 bg-teal-600 text-white" : "border-petrol-950/25 bg-white"
                  }`}
                  aria-hidden="true"
                >
                  {checked && <Check className="h-3 w-3" strokeWidth={3} />}
                </span>
                {platform.label}
              </label>
            );
          })}
        </div>
      </fieldset>

      {showEssentialEightLevel && (
        <div>
          <label className="text-petrol-950 flex flex-wrap items-center gap-3 text-sm font-semibold">
            Essential Eight target maturity level
            <select
              className={SELECT_CLASS}
              value={scope.essentialEightMaturityLevel ?? 1}
              onChange={(event) =>
                onScopeChange({
                  ...scope,
                  essentialEightMaturityLevel: Number(event.target.value) as 1 | 2 | 3,
                })
              }
            >
              {[1, 2, 3].map((level) => (
                <option key={level} value={level}>
                  Maturity Level {level}
                </option>
              ))}
            </select>
          </label>
          <p className="text-petrol-600 mt-2 text-xs leading-5">
            Evidence against the selected target. The tool does not calculate an achieved maturity level. Default
            target: Level 1.
          </p>
        </div>
      )}

      {showRiskLevel && (
        <label className="text-petrol-950 flex flex-wrap items-center gap-3 text-sm font-semibold">
          Def Stan Cyber Risk Profile
          <select
            className={SELECT_CLASS}
            value={scope.defStanRiskLevel ?? "all"}
            onChange={(event) =>
              onScopeChange({
                ...scope,
                defStanRiskLevel:
                  event.target.value === "all" ? undefined : (Number(event.target.value) as 0 | 1 | 2 | 3),
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
        <p role="status" className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-3 text-xs leading-5 text-amber-900">
          Collection is incomplete or a source was not collected. All supported technical checks run against the
          available data. Only checks that need missing data are affected; expand collection coverage below for
          details.
          {caNotCollected && (
            <span className="mt-2 block">
              Conditional Access was not collected. Grant Policy.Read.All to the app registration, sign in again and
              collect the tenant to assess MFA and access requirements.
            </span>
          )}
        </p>
      )}

      <p className="text-petrol-600 text-xs leading-5">
        Collected: {view.collectedAt ? new Date(view.collectedAt).toLocaleString() : "Unknown, timestamp absent from this collection"}.
        Ruleset: {view.rulesetVersion}. Device state and effective access have not been verified.
      </p>

      <details className="group">
        <summary className="text-petrol-950 cursor-pointer text-sm font-semibold">
          Collection and detection coverage
        </summary>
        <div className="border-petrol-950/6 mt-3 overflow-x-auto rounded-xl border">
          <table className="selectable w-full text-left text-xs">
            <thead className="bg-surface text-petrol-700">
              <tr>
                {["Policy family", "Collection", "Collected", "With recognized evidence", "Without recognized evidence"].map(
                  (label) => (
                    <th key={label} scope="col" className="p-2.5 font-semibold">
                      {label}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {view.collectionCoverage.map((row) => (
                <tr key={row.family} className="border-petrol-950/6 border-t">
                  <th scope="row" className="text-petrol-950 p-2.5 font-medium">
                    {row.family}
                    {row.errors.map((message) => (
                      <p key={message} className="mt-1 max-w-md font-normal break-words text-amber-800">
                        {message}
                      </p>
                    ))}
                  </th>
                  <td className="p-2.5">{row.status}</td>
                  <td className="p-2.5 tabular-nums">{row.collectedPolicies}</td>
                  <td className="p-2.5 tabular-nums">{row.recognizedPolicies}</td>
                  <td className="p-2.5 tabular-nums">{row.unsupportedPolicies}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-petrol-600 mt-2 text-xs leading-5">
          Without recognized evidence includes unsupported formats, unsupported settings and indeterminate values. It
          does not establish a missing protection.
        </p>
      </details>

      <div className="border-petrol-950/6 flex flex-wrap items-center gap-3 border-t pt-4">
        <Button
          variant="secondary"
          size="sm"
          icon={FileJson}
          loading={record.busy}
          disabled={Boolean(record.disabledReason)}
          disabledReason={record.disabledReason}
          onClick={record.onSave}
        >
          {record.busy ? "Preparing evidence record" : "Download evidence record (JSON)"}
        </Button>
        <p className="text-petrol-600 min-w-0 flex-1 text-xs" role="status" aria-live="polite">
          {record.error ? (
            <span className="text-red-700">{record.error}</span>
          ) : record.savedPath ? (
            <span className="selectable" title={record.savedPath}>
              Saved to {record.savedPath}
            </span>
          ) : (
            "Machine readable assessment with snapshot and ruleset fingerprints."
          )}
        </p>
      </div>
    </section>
  );
}
