// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AssessmentScope } from "../../../../../../src/lib/compliance/types";
import type {
  ComplianceFrameworkView,
  ManagementChangesResult,
  ManagementReportChanges,
} from "../../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  changes: vi.fn(),
  navigate: vi.fn(),
  changed: { listener: null as null | (() => void) },
}));

vi.mock("../../lib/ipc", () => ({
  ipc: {
    historyChanges: mocks.changes,
    onHistoryChanged: (listener: () => void) => {
      mocks.changed.listener = listener;
      return () => {
        mocks.changed.listener = null;
      };
    },
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  isMac: false,
}));

vi.mock("../../state/context", () => ({
  useApp: () => ({ state: {}, dispatch: vi.fn(), actions: { navigate: mocks.navigate } }),
}));

const { ManagementPanel } = await import("./ManagementPanel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function selected(generatedAt = "2026-10-18T10:00:00Z"): ComplianceFrameworkView {
  return {
    framework: { id: "nist-800-53-r5", name: "NIST SP 800-53", version: "Rev. 5" },
    controls: [],
    capabilities: [],
    management: {
      frameworkId: "nist-800-53-r5",
      frameworkName: "NIST SP 800-53",
      frameworkVersion: "Rev. 5",
      generatedAt,
      rulesetVersion: "2026.10.3",
      scopeKey: "[null,1,null]",
      metrics: {
        assessable: 10,
        withEvidence: 6,
        coveragePct: 60,
        withoutEvidence: 4,
        conflicting: 0,
        unassignedConfigs: 0,
        outsideIntuneScope: null,
        dataGaps: 0,
        safeguardsTotal: 12,
        safeguardsInPlace: 8,
        safeguardPct: 66,
      },
      nextActions: [],
      controls: {},
      safeguards: {},
      outsideScope: [],
    },
    delta: null,
    baseline: null,
    crosswalk: null,
    crosswalkCis: {},
    unassigned: [],
  } as unknown as ComplianceFrameworkView;
}

function changes(overrides: Partial<ManagementReportChanges> = {}): ManagementReportChanges {
  return {
    since: "2026-10-17T10:00:00Z",
    until: "2026-10-18T10:00:00Z",
    policies: {
      added: 2,
      removed: 1,
      renamed: 1,
      changed: 3,
      settingChanges: 14,
      assignmentChanges: 5,
      notComparedFamilies: 0,
      notComparedItems: 0,
    },
    identity: { compared: 2, changes: 0, notCompared: 0 },
    controls: [
      { id: "SC-28", before: "evidenceFound", after: "partialEvidence" },
      { id: "CM-7(5)", before: null, after: "noEvidence" },
    ],
    improved: 3,
    regressed: 1,
    collectionGaps: { opened: 0, closed: 0 },
    rulesetChanged: false,
    fromRuleset: "2026.10.3",
    toRuleset: "2026.10.3",
    partial: false,
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLElement;

function panel(scope: AssessmentScope = {}, generatedAt?: string) {
  return (
    <ManagementPanel
      selected={selected(generatedAt)}
      request={{ frameworkId: "nist-800-53-r5", scope }}
      blocker={null}
      filter="all"
      onFilterChange={() => undefined}
      onRefresh={() => undefined}
    />
  );
}

async function renderPanel(scope: AssessmentScope = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(panel(scope)));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function block() {
  return screen.getByRole("region", { name: /^Changes since/ });
}

beforeEach(() => {
  mocks.changes.mockReset();
  mocks.navigate.mockReset();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("ManagementPanel changes since the previous collection", () => {
  it("shows a loading line while main compares", async () => {
    mocks.changes.mockReturnValue(new Promise(() => {}));
    await renderPanel();
    expect(mocks.changes).toHaveBeenCalledWith({ frameworkId: "nist-800-53-r5", scope: {} });
    expect(within(block()).getByRole("status").textContent).toContain("Comparing with the previous snapshot");
    // The rest of the panel renders meanwhile.
    expect(screen.getByText("Next actions")).toBeTruthy();
  });

  it("summarizes the changes with control status labels", async () => {
    mocks.changes.mockResolvedValue({ state: "ready", changes: changes() } satisfies ManagementChangesResult);
    await renderPanel();
    await settle();
    const region = block();
    expect(within(region).getByRole("heading").textContent).toMatch(/^Changes since /);
    const counts = within(region).getByLabelText("Configuration changes");
    expect(counts.textContent).toContain("Policies added2");
    expect(counts.textContent).toContain("Setting changes14");
    expect(counts.textContent).toContain("Assignment changes5");
    expect(within(region).getByText("3 measures gained evidence, 1 lost it.")).toBeTruthy();
    const controls = within(region).getByRole("list", { name: "Control status changes" });
    const items = within(controls).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]!.textContent).toBe("SC-28Configuration evidenceSupporting or partial evidence");
    expect(items[1]!.textContent).toBe("CM-7(5)Not mappedNo recognized evidence");
    expect(within(region).getByText("Included in the management report.")).toBeTruthy();
    expect(within(region).queryByText(/evidence rules changed/)).toBeNull();
    expect(within(region).queryByText(/not counted/)).toBeNull();
  });

  it("caps the control list and warns about rulesets and incomplete data", async () => {
    const many = Array.from({ length: 11 }, (_, index) => ({
      id: `AC-${index + 1}`,
      before: "noEvidence" as const,
      after: "evidenceFound" as const,
    }));
    mocks.changes.mockResolvedValue({
      state: "ready",
      changes: changes({
        controls: many,
        rulesetChanged: true,
        fromRuleset: "2026.10.2",
        toRuleset: "2026.10.3",
        partial: true,
        policies: { ...changes().policies, notComparedFamilies: 2, notComparedItems: 1 },
      }),
    });
    await renderPanel();
    await settle();
    const region = block();
    expect(within(within(region).getByRole("list", { name: "Control status changes" })).getAllByRole("listitem"))
      .toHaveLength(8);
    expect(within(region).getByText("and 3 more")).toBeTruthy();
    expect(within(region).getByText(/from ruleset 2026\.10\.2 to 2026\.10\.3/)).toBeTruthy();
    expect(within(region).getByText(/One of the two collections is partial\./).textContent).toBe(
      "One of the two collections is partial. 2 families were not compared. 1 policy was not compared. Changes there are not counted.",
    );
  });

  it("says when nothing changed", async () => {
    mocks.changes.mockResolvedValue({
      state: "ready",
      changes: changes({
        policies: {
          added: 0,
          removed: 0,
          renamed: 0,
          changed: 0,
          settingChanges: 0,
          assignmentChanges: 0,
          notComparedFamilies: 0,
          notComparedItems: 0,
        },
        controls: [],
        improved: 0,
        regressed: 0,
      }),
    });
    await renderPanel();
    await settle();
    const region = block();
    expect(
      within(region).getByText(/No policy, setting, assignment, Entra identity setting or control status changed/),
    ).toBeTruthy();
    expect(within(region).queryByRole("list")).toBeNull();
  });

  const unchanged = {
    added: 0,
    removed: 0,
    renamed: 0,
    changed: 0,
    settingChanges: 0,
    assignmentChanges: 0,
    notComparedFamilies: 0,
    notComparedItems: 0,
  };

  it("lists collection gaps apart from evidence gained or lost", async () => {
    mocks.changes.mockResolvedValue({
      state: "ready",
      changes: changes({
        policies: unchanged,
        controls: [{ id: "IA-2", before: "partialEvidence", after: "notAssessed" }],
        improved: 0,
        regressed: 0,
        collectionGaps: { opened: 1, closed: 2 },
      }),
    });
    await renderPanel();
    await settle();
    const region = block();
    expect(within(region).getByText(/gained evidence/).textContent).toBe("0 measures gained evidence, 0 lost it.");
    expect(within(region).getByText(/Not counted as gained or lost/).textContent).toBe(
      "Not counted as gained or lost: 1 measure could not be fully assessed this time and 2 measures could be assessed again, usually because data was missing from one of the two collections.",
    );
  });

  it("shows no collection gap line without gaps", async () => {
    mocks.changes.mockResolvedValue({ state: "ready", changes: changes() });
    await renderPanel();
    await settle();
    expect(within(block()).queryByText(/Not counted as gained or lost/)).toBeNull();
  });

  it("shows an Entra identity change even when no policy or control changed", async () => {
    mocks.changes.mockResolvedValue({
      state: "ready",
      changes: changes({
        policies: unchanged,
        identity: { compared: 2, changes: 1, notCompared: 0 },
        controls: [],
        improved: 0,
        regressed: 0,
      }),
    });
    await renderPanel();
    await settle();
    const region = block();
    expect(within(region).queryByText(/changed since then/)).toBeNull();
    expect(within(region).getByLabelText("Configuration changes").textContent).toContain("Setting changes0");
    expect(within(region).getByLabelText("Entra identity changes").textContent).toBe(
      "Entra identity setting changes1",
    );
  });

  it("claims nothing about Entra identity settings the collections did not read", async () => {
    mocks.changes.mockResolvedValue({
      state: "ready",
      changes: changes({
        policies: unchanged,
        identity: { compared: 0, changes: 0, notCompared: 1 },
        controls: [],
        improved: 0,
        regressed: 0,
      }),
    });
    await renderPanel();
    await settle();
    const region = block();
    expect(within(region).getByText(/No policy, setting, assignment or control status changed/)).toBeTruthy();
    expect(within(region).queryByText(/Entra identity setting or/)).toBeNull();
    expect(within(region).getByText(/Entra identity policy was not compared/).textContent).toBe(
      "1 Entra identity policy was not compared. Changes there are not counted.",
    );
  });

  it("points to History when there is no earlier snapshot", async () => {
    mocks.changes.mockResolvedValue({ state: "none", reason: "noSnapshot" });
    await renderPanel();
    await settle();
    const region = block();
    expect(within(region).getByRole("heading").textContent).toBe("Changes since the previous collection");
    expect(within(region).getByText(/Turn on Keep history on this computer in History/)).toBeTruthy();
    fireEvent.click(within(region).getByRole("button", { name: "Open History" }));
    expect(mocks.navigate).toHaveBeenCalledWith("history");
  });

  it("explains that changes need the full scope", async () => {
    mocks.changes.mockResolvedValue({ state: "none", reason: "scope" });
    await renderPanel({ platforms: ["windows"] });
    await settle();
    expect(within(block()).getByText(/full scope only: all platforms, Essential Eight maturity level 1/)).toBeTruthy();
  });

  it("says when history is not available", async () => {
    mocks.changes.mockResolvedValue({ state: "none", reason: "unavailable" });
    await renderPanel();
    await settle();
    expect(within(block()).getByText(/History is not available on this computer/)).toBeTruthy();
  });

  it("retries after an error without breaking the panel", async () => {
    mocks.changes.mockRejectedValueOnce(new Error("This snapshot could not be read."));
    mocks.changes.mockResolvedValue({ state: "ready", changes: changes() });
    await renderPanel();
    await settle();
    const region = block();
    expect(within(region).getByRole("alert").textContent).toContain("This snapshot could not be read.");
    expect(screen.getByRole("button", { name: /Export management report/ })).toBeTruthy();
    await act(async () => fireEvent.click(within(region).getByRole("button", { name: "Retry" })));
    await settle();
    expect(within(block()).queryByRole("alert")).toBeNull();
    expect(within(block()).getByText("Included in the management report.")).toBeTruthy();
  });

  it("reloads when history changes or the assessment is regenerated, and ignores stale answers", async () => {
    let resolveFirst: (value: ManagementChangesResult) => void = () => undefined;
    mocks.changes.mockReturnValueOnce(new Promise((resolve) => (resolveFirst = resolve)));
    mocks.changes.mockResolvedValue({ state: "none", reason: "noSnapshot" });
    await renderPanel();
    await act(async () => mocks.changed.listener?.());
    await settle();
    expect(mocks.changes).toHaveBeenCalledTimes(2);
    // The first, slower answer arrives last and is ignored.
    await act(async () => resolveFirst({ state: "ready", changes: changes() }));
    expect(within(block()).getByRole("button", { name: "Open History" })).toBeTruthy();

    await act(async () => root!.render(panel({}, "2026-10-18T12:00:00Z")));
    await settle();
    expect(mocks.changes).toHaveBeenCalledTimes(3);
    // A new request object with the same content does not fetch again.
    await act(async () => root!.render(panel({}, "2026-10-18T12:00:00Z")));
    await settle();
    expect(mocks.changes).toHaveBeenCalledTimes(3);
    await act(async () => root!.render(panel({ essentialEightMaturityLevel: 2 }, "2026-10-18T12:00:00Z")));
    await settle();
    expect(mocks.changes).toHaveBeenCalledTimes(4);
  });
});
