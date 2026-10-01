import { promises as fs } from "node:fs";
import path from "node:path";
import type { TokenProvider } from "../../../../src/lib/graph-client";
import {
  BASELINE_MAX_BYTES,
  BASELINE_REJECTION_MESSAGES,
  baselineFileName,
  compareBaseline,
  createBaseline,
  parseBaseline,
  serializeBaseline,
} from "../../../../src/lib/compliance/management/baseline";
import type { ManagementReportInput } from "../../../../src/lib/compliance/management/management-report-pdf";
import {
  safeguardPolicies,
  safeguardState,
} from "../../../../src/lib/compliance/management/management-summary";
import {
  CROSSWALK_MAX_BYTES,
  CrosswalkFormatError,
  crosswalkTemplateCsv,
  parseCrosswalkCsv,
} from "../../../../src/lib/compliance/management/crosswalk";
import type {
  BaselineDelta,
  BaselineFile,
  Crosswalk,
  ManagementSummary,
} from "../../../../src/lib/compliance/management/types";
import type { ComplianceAssessment } from "../../../../src/lib/compliance/types";
import type {
  BaselineLoadResult,
  ComplianceFrameworkId,
  ComplianceRequest,
  CrosswalkImportResult,
  ManagementLocale,
} from "../shared/ipc-types";
import {
  baselineDelta,
  complianceAssessment,
  crosswalkCisFor,
  managementSummaryFor,
  tenantLabelOf,
  unassignedConfigs,
  type ManagementContext,
} from "./compliance";

// Management report state: the customer crosswalk and loaded baseline files.
// Both stay in memory for one signed in account and are never written to disk
// by the app; a different owner, sign-out or reset drops them.

interface ManagementState {
  owner: string;
  baselines: Map<string, BaselineFile>;
  crosswalk: { crosswalk: Crosswalk; fileName: string } | null;
}

let state: ManagementState | null = null;
// Bumped by every clear, so a file opened before a sign-out or reset is not
// stored after it.
let generation = 0;

function stateFor(owner: string): ManagementState {
  if (!state || state.owner !== owner) {
    state = { owner, baselines: new Map(), crosswalk: null };
  }
  return state;
}

export function clearManagementState(): void {
  state = null;
  generation += 1;
}

// Captured before the first await; the returned function applies a change
// only if nothing was cleared and no other account took over meanwhile.
function deferredWrite(owner: string) {
  const started = generation;
  return (apply: (current: ManagementState) => void): boolean => {
    if (generation !== started || (state && state.owner !== owner)) {
      return false;
    }
    apply(stateFor(owner));
    return true;
  };
}

const ACCOUNT_CHANGED =
  "The signed in account changed while the file was opened. Open it again.";

/** Shows a file picker; resolves to the chosen path, or null when cancelled. */
export type PickFile = () => Promise<string | null>;

export function managementContext(
  owner: string,
  tenantId: string | null,
): ManagementContext {
  const current = stateFor(owner);
  return {
    tenantId,
    baselines: current.baselines,
    crosswalk: current.crosswalk,
  };
}

export function parseManagementLocale(value: unknown): ManagementLocale {
  if (value !== "en" && value !== "de") {
    throw new Error("The report language must be English or German.");
  }
  return value;
}

type FileText =
  | { ok: true; text: string }
  | { ok: false; reason: "missing" | "tooLarge" };

// The size is checked before the file is read.
async function readSmallText(
  file: string,
  maxBytes: number,
): Promise<FileText> {
  const stat = await fs.stat(file).catch(() => null);
  if (!stat?.isFile()) return { ok: false, reason: "missing" };
  if (stat.size > maxBytes) return { ok: false, reason: "tooLarge" };
  return { ok: true, text: await fs.readFile(file, "utf8") };
}

export async function importCrosswalk(
  owner: string,
  pickFile: PickFile,
): Promise<CrosswalkImportResult> {
  const write = deferredWrite(owner);
  const file = await pickFile();
  if (!file) return { canceled: true };
  const read = await readSmallText(file, CROSSWALK_MAX_BYTES);
  if (!read.ok) {
    return {
      ok: false,
      message:
        read.reason === "tooLarge"
          ? "The crosswalk file is larger than 1 MB."
          : "The crosswalk file could not be read.",
    };
  }
  let crosswalk: Crosswalk;
  try {
    crosswalk = parseCrosswalkCsv(read.text);
  } catch (error) {
    if (error instanceof CrosswalkFormatError) {
      return { ok: false, message: error.message };
    }
    throw error;
  }
  if (crosswalk.rows.length === 0) {
    const first = crosswalk.issues[0];
    return {
      ok: false,
      message: first
        ? `The crosswalk file contains no usable rows. Line ${first.line}: ${first.message}.`
        : "The crosswalk file contains no usable rows.",
    };
  }
  const stored = write((current) => {
    current.crosswalk = { crosswalk, fileName: path.basename(file) };
  });
  if (!stored) return { ok: false, message: ACCOUNT_CHANGED };
  return { ok: true, rows: crosswalk.rows.length, issues: crosswalk.issues };
}

export function clearCrosswalk(owner: string): void {
  stateFor(owner).crosswalk = null;
}

export function crosswalkTemplate(): { fileName: string; bytes: Uint8Array } {
  return {
    fileName: "intunedoc-crosswalk-template.csv",
    bytes: new TextEncoder().encode(crosswalkTemplateCsv()),
  };
}

// Parses a baseline file and checks it against the current summary. Messages
// are the English rejection texts.
export async function acceptBaseline(
  text: string,
  summary: ManagementSummary,
  tenantId: string,
): Promise<
  | { ok: true; file: BaselineFile; delta: BaselineDelta }
  | { ok: false; message: string }
> {
  const parsed = await parseBaseline(text);
  if (!parsed.ok) {
    return {
      ok: false,
      message: BASELINE_REJECTION_MESSAGES[parsed.reason].en,
    };
  }
  const compared = compareBaseline(summary, tenantId, parsed.file);
  if (!compared.ok) {
    return {
      ok: false,
      message: BASELINE_REJECTION_MESSAGES[compared.reason].en,
    };
  }
  return { ok: true, file: parsed.file, delta: compared.delta };
}

function requireTenant(tenantId: string | null): string {
  if (!tenantId) throw new Error("Sign in before continuing.");
  return tenantId;
}

type FrameworkRequest = ComplianceRequest & {
  frameworkId: ComplianceFrameworkId;
};

async function currentSummary(
  owner: string,
  token: TokenProvider,
  request: FrameworkRequest,
) {
  const assessment = await complianceAssessment(owner, token, request.scope);
  return {
    assessment,
    summary: managementSummaryFor(assessment, request.frameworkId),
  };
}

export async function loadBaseline(
  owner: string,
  token: TokenProvider,
  request: FrameworkRequest,
  tenantId: string | null,
  pickFile: PickFile,
): Promise<BaselineLoadResult> {
  const tenant = requireTenant(tenantId);
  const write = deferredWrite(owner);
  const file = await pickFile();
  if (!file) return { canceled: true };
  const read = await readSmallText(file, BASELINE_MAX_BYTES);
  if (!read.ok) {
    return {
      ok: false,
      message:
        read.reason === "tooLarge"
          ? BASELINE_REJECTION_MESSAGES.schema.en
          : "The baseline file could not be read.",
    };
  }
  const { summary } = await currentSummary(owner, token, request);
  const accepted = await acceptBaseline(read.text, summary, tenant);
  if (!accepted.ok) return accepted;
  const stored = write((current) => {
    current.baselines.set(request.frameworkId, accepted.file);
  });
  return stored ? { ok: true } : { ok: false, message: ACCOUNT_CHANGED };
}

export function clearBaseline(
  owner: string,
  frameworkId: ComplianceFrameworkId,
): void {
  stateFor(owner).baselines.delete(frameworkId);
}

export async function baselineExport(
  owner: string,
  token: TokenProvider,
  request: FrameworkRequest,
  tenantId: string | null,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const tenant = requireTenant(tenantId);
  const { summary } = await currentSummary(owner, token, request);
  const label = tenantLabelOf(tenant);
  const file = await createBaseline(
    summary,
    label ? { id: tenant, label } : { id: tenant },
  );
  return {
    fileName: baselineFileName(summary, new Date()),
    bytes: new TextEncoder().encode(serializeBaseline(file)),
  };
}

// The report input for one framework. Safeguards come from the full
// assessment, because the renderer view drops the evidence behind them.
export function managementReportInput(
  assessment: ComplianceAssessment,
  summary: ManagementSummary,
  frameworkId: ComplianceFrameworkId,
  context: ManagementContext,
  locale: ManagementLocale,
): ManagementReportInput {
  const selected = assessment.frameworks.find(
    (framework) => framework.framework.id === frameworkId,
  );
  if (!selected) throw new Error("Unknown compliance framework.");
  const results = new Map(
    assessment.capabilities.map((result) => [result.capability.id, result]),
  );
  const cis = crosswalkCisFor(
    context,
    frameworkId,
    selected.controls.map((control) => control.control.id),
  );
  const delta = baselineDelta(summary, context);
  const tenantLabel = tenantLabelOf(context.tenantId);
  return {
    summary,
    controls: selected.controls.map(({ control, status, capabilityIds }) => ({
      id: control.id,
      title: locale === "de" && control.titleDe ? control.titleDe : control.title,
      status,
      ...(control.aliases ? { aliases: control.aliases } : {}),
      ...(cis[control.id] ? { cis: cis[control.id] } : {}),
      safeguards: [...new Set(capabilityIds)].flatMap((id) => {
        const result = results.get(id);
        return result
          ? [
              {
                capabilityId: id,
                name: result.capability.name,
                state: safeguardState(result),
                policies: safeguardPolicies(result),
              },
            ]
          : [];
      }),
    })),
    unassigned: unassignedConfigs(assessment, frameworkId),
    ...(delta ? { delta } : {}),
    crosswalkLoaded: context.crosswalk !== null,
    disclaimer: assessment.disclaimer,
    ...(tenantLabel ? { tenantLabel } : {}),
    locale,
  };
}

export async function managementReport(
  owner: string,
  token: TokenProvider,
  request: FrameworkRequest,
  locale: ManagementLocale,
  tenantId: string | null,
): Promise<{ fileName: string; bytes: Uint8Array }> {
  const { assessment, summary } = await currentSummary(owner, token, request);
  const input = managementReportInput(
    assessment,
    summary,
    request.frameworkId,
    managementContext(owner, tenantId),
    locale,
  );
  const { generateManagementReportPDF, managementReportFileName } =
    await import(
      "../../../../src/lib/compliance/management/management-report-pdf"
    );
  const bytes = await generateManagementReportPDF(input);
  return {
    fileName: managementReportFileName(
      request.frameworkId,
      locale,
      new Date(),
      input.tenantLabel,
    ),
    bytes,
  };
}

const PORTAL_HOSTS = new Set(["intune.microsoft.com", "entra.microsoft.com"]);

// Next-action links open only https pages of the Intune or Entra admin
// centers, with no credentials or port in the URL. Returns the URL to open.
export function portalLink(input: unknown): string {
  if (typeof input === "string" && input.length <= 2048) {
    try {
      const url = new URL(input);
      if (
        url.protocol === "https:" &&
        PORTAL_HOSTS.has(url.hostname) &&
        !url.username &&
        !url.password &&
        !url.port
      ) {
        return url.href;
      }
    } catch {
      // Falls through to the refusal below.
    }
  }
  throw new Error("Refused to open an unexpected link.");
}
