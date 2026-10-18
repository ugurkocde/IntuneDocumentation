// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PolicyChange } from "../../../../../src/lib/snapshots/diff";
import type {
  HistoryDiffRequest,
  HistoryDiffView,
  HistoryEntry,
  HistoryStatus,
  ScheduleStatus,
} from "../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  status: vi.fn(),
  setEnabled: vi.fn(),
  list: vi.fn(),
  diff: vi.fn(),
  remove: vi.fn(),
  removeAll: vi.fn(),
  scheduleStatus: vi.fn(),
  setSchedule: vi.fn(),
  changed: { listener: null as null | (() => void) },
  schedule: { listener: null as null | ((status: ScheduleStatus) => void) },
  navigate: vi.fn(),
  state: { current: null as unknown },
}));

vi.mock("../lib/ipc", () => ({
  ipc: {
    historyStatus: mocks.status,
    historySetEnabled: mocks.setEnabled,
    historyList: mocks.list,
    historyDiff: mocks.diff,
    historyDelete: mocks.remove,
    historyDeleteAll: mocks.removeAll,
    historyScheduleStatus: mocks.scheduleStatus,
    historySetSchedule: mocks.setSchedule,
    onScheduleStatus: (listener: (status: ScheduleStatus) => void) => {
      mocks.schedule.listener = listener;
      return () => {
        mocks.schedule.listener = null;
      };
    },
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

vi.mock("../state/context", () => ({
  useApp: () => ({
    state: mocks.state.current,
    dispatch: vi.fn(),
    actions: { navigate: mocks.navigate },
  }),
}));

vi.mock("../components/collection/CollectButton", () => ({
  CollectButton: () => <button type="button">Collect</button>,
}));

const { HistoryScreen, formatDate } = await import("./HistoryScreen");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function appState({ signedIn = true, entitled = true, tenantId = "tenant-1", account = "admin@contoso.com" } = {}) {
  return {
    auth: { signedIn, tenantId: signedIn ? tenantId : null, account },
    license: { entitled },
    collection: { running: false, summary: null },
  };
}

function status(overrides: Partial<HistoryStatus> = {}): HistoryStatus {
  return { enabled: true, available: true, reason: null, count: 0, ...overrides };
}

function schedule(overrides: Partial<ScheduleStatus> = {}): ScheduleStatus {
  return {
    hours: 0,
    state: "off",
    reason: null,
    nextRunAt: null,
    lastRunAt: null,
    lastResult: null,
    lastError: null,
    lastSkippedAt: null,
    lastSkippedReason: null,
    ...overrides,
  };
}

function entry(id: string, collectedAt: string, partial = false): HistoryEntry {
  return { id, collectedAt, items: 120, partial, rulesetVersion: "2026.10.3", bytes: 48_000 };
}

const LATEST = entry("20261018T100000Z-aaaaaaaa", "2026-10-18T10:00:00Z");
const PREVIOUS = entry("20261017T100000Z-bbbbbbbb", "2026-10-17T10:00:00Z", true);
const OLDEST = entry("20261016T100000Z-cccccccc", "2026-10-16T10:00:00Z");

function policy(overrides: Partial<PolicyChange>): PolicyChange {
  return {
    sectionKey: "settingsCatalog",
    sectionLabel: "Settings Catalog",
    familyKey: "settingsCatalog",
    id: "policy-1",
    kind: "changed",
    displayName: "WIN - Baseline - BitLocker",
    settings: [],
    assignments: [],
    settingsTotal: 0,
    assignmentsTotal: 0,
    ...overrides,
  };
}

function view(request: HistoryDiffRequest, overrides: Partial<HistoryDiffView> = {}): HistoryDiffView {
  const policies = [
    policy({
      previousName: "WIN - BitLocker",
      settings: [
        {
          key: "k1",
          name: "Require Device Encryption",
          path: [],
          definitionId: "device_vendor_msft_bitlocker_requiredeviceencryption",
          change: "changed",
          before: "Enabled",
          after: "Disabled",
        },
      ],
      assignments: [
        { change: "added", label: "Group Finance" },
        { change: "removed", label: "All devices" },
      ],
      settingsTotal: 1,
      assignmentsTotal: 2,
    }),
    policy({ id: "policy-2", kind: "added", displayName: "WIN - New policy" }),
    policy({ id: "policy-3", kind: "removed", displayName: "WIN - Old policy" }),
  ];
  const frameworkId = request.frameworkId ?? "nist-800-53-r5";
  return {
    from: PREVIOUS,
    to: LATEST,
    policies,
    totals: {
      policies: 3,
      added: 1,
      removed: 1,
      renamed: 1,
      changed: 1,
      settingChanges: 1,
      assignmentChanges: 2,
      notComparedFamilies: 1,
      notComparedItems: 0,
    },
    notCompared: [{ sectionKey: "compliancePolicies", label: "Compliance policies", reason: "failed", side: "from" }],
    notComparedItems: [],
    controls: {
      fromRuleset: "2026.10.2",
      toRuleset: "2026.10.3",
      rulesetChanged: true,
      frameworks: [
        { id: "nist-800-53-r5", name: "NIST SP 800-53", changed: 1 },
        { id: "iso-27001-2022", name: "ISO/IEC 27001", changed: 0 },
      ],
      frameworkId,
      changes:
        frameworkId === "nist-800-53-r5"
          ? [
              {
                controlId: "SC-28",
                title: "Protection of Information at Rest",
                before: "evidenceFound",
                after: "noEvidence",
                mappingChanged: false,
                causes: [
                  {
                    capabilityId: "windows-disk-encryption",
                    name: "Disk encryption",
                    before: "enforced",
                    after: "noEvidence",
                    evidenceAdded: [],
                    evidenceRemoved: [
                      {
                        policyName: "WIN - Baseline - BitLocker",
                        settingId: "device_vendor_msft_bitlocker_requiredeviceencryption",
                        observedValue: "Enabled",
                        verdict: "enforced",
                        assignment: "assigned",
                      },
                    ],
                    checksChanged: [],
                  },
                ],
              },
            ]
          : [],
      total: frameworkId === "nist-800-53-r5" ? 1 : 0,
    },
    ...overrides,
  };
}

let root: Root | null = null;
let container: HTMLElement;

async function renderScreen() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<HistoryScreen />));
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(() => {
  for (const mock of [
    mocks.status,
    mocks.setEnabled,
    mocks.list,
    mocks.diff,
    mocks.remove,
    mocks.removeAll,
    mocks.scheduleStatus,
    mocks.setSchedule,
    mocks.navigate,
  ])
    mock.mockReset();
  mocks.scheduleStatus.mockResolvedValue(schedule());
  mocks.state.current = appState();
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
});

describe("HistoryScreen", () => {
  it("asks to sign in first", async () => {
    mocks.state.current = appState({ signedIn: false });
    await renderScreen();
    expect(screen.getByText("Sign in to see history")).toBeTruthy();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("asks for a license", async () => {
    mocks.state.current = appState({ entitled: false });
    await renderScreen();
    expect(screen.getByText("History needs an active license")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Open License and account" }));
    expect(mocks.navigate).toHaveBeenCalledWith("license");
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it("explains why history is unavailable without reading it", async () => {
    mocks.status.mockResolvedValue(
      status({ enabled: false, available: false, reason: "Secure storage is not available on this computer." }),
    );
    await renderScreen();
    await settle();
    expect(screen.getByText("History is not available on this computer")).toBeTruthy();
    expect(screen.getByText("Secure storage is not available on this computer.")).toBeTruthy();
    expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
    expect(mocks.list).not.toHaveBeenCalled();
    expect(screen.queryByText("Scheduled collection")).toBeNull();
    expect(mocks.scheduleStatus).not.toHaveBeenCalled();
  });

  it("explains the threat model and turns history on", async () => {
    mocks.status.mockResolvedValue(status({ enabled: false }));
    mocks.list.mockResolvedValue([]);
    mocks.setEnabled.mockResolvedValue(status({ enabled: true }));
    await renderScreen();
    await settle();
    expect(screen.getByText(/stored encrypted on this computer/)).toBeTruthy();
    expect(screen.getByText(/does not protect against software that runs under your own account/)).toBeTruthy();
    expect(screen.getByText("No snapshots yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Collect" })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole("checkbox")));
    expect(mocks.setEnabled).toHaveBeenCalledWith(true);
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Collect" })).toBeTruthy();
  });

  it("waits for a second snapshot before comparing", async () => {
    mocks.status.mockResolvedValue(status({ count: 1 }));
    mocks.list.mockResolvedValue([LATEST]);
    await renderScreen();
    await settle();
    expect(screen.getByText("One snapshot so far")).toBeTruthy();
    expect(mocks.diff).not.toHaveBeenCalled();
  });

  it("compares the previous with the latest snapshot", async () => {
    mocks.status.mockResolvedValue(status({ count: 3 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS, OLDEST]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    await renderScreen();
    await settle();
    expect(mocks.diff).toHaveBeenCalledWith({ fromId: PREVIOUS.id, toId: LATEST.id });
    expect(screen.getAllByText("Partial").length).toBeGreaterThan(0);
    expect(screen.getByText("The earlier snapshot is partial.", { exact: false })).toBeTruthy();

    const changed = screen.getByRole("article", { name: "WIN - Baseline - BitLocker, changed" });
    expect(within(changed).getByText("WIN - BitLocker")).toBeTruthy();
    expect(within(changed).getByText("Enabled")).toBeTruthy();
    expect(within(changed).getByText("Disabled")).toBeTruthy();
    expect(within(changed).getByText("Group Finance")).toBeTruthy();
    expect(screen.getByRole("article", { name: "WIN - New policy, added" })).toBeTruthy();
    expect(screen.getByRole("article", { name: "WIN - Old policy, removed" })).toBeTruthy();
    expect(screen.getByText("Some families were not compared")).toBeTruthy();
    expect(screen.getByText(/collection failed in the earlier snapshot/)).toBeTruthy();

    await act(async () =>
      fireEvent.change(screen.getByLabelText("Earlier snapshot"), { target: { value: OLDEST.id } }),
    );
    await settle();
    expect(mocks.diff).toHaveBeenLastCalledWith({ fromId: OLDEST.id, toId: LATEST.id });
  });

  it("shows control changes with causes and a ruleset warning", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    await renderScreen();
    await settle();
    const policiesTab = screen.getByRole("tab", { name: /Policies/ });
    policiesTab.focus();
    // Arrow keys move between the tabs.
    await act(async () => fireEvent.keyDown(policiesTab, { key: "ArrowRight" }));
    const controlsTab = screen.getByRole("tab", { name: /Controls/ });
    expect(controlsTab.getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(controlsTab);
    expect(screen.getByText("The evidence rules changed between these snapshots")).toBeTruthy();
    const control = screen.getByRole("article", { name: "SC-28 Protection of Information at Rest" });
    expect(within(control).getByText("Configuration evidence")).toBeTruthy();
    expect(within(control).getByText("No recognized evidence")).toBeTruthy();
    expect(within(control).getByText("Disk encryption")).toBeTruthy();
    expect(within(control).getByText("Evidence removed:").parentElement!.textContent).toBe(
      "Evidence removed: WIN - Baseline - BitLocker: device_vendor_msft_bitlocker_requiredeviceencryption: Enabled",
    );

    await act(async () =>
      fireEvent.change(screen.getByLabelText("Framework"), { target: { value: "iso-27001-2022" } }),
    );
    await settle();
    expect(mocks.diff).toHaveBeenLastCalledWith({
      fromId: PREVIOUS.id,
      toId: LATEST.id,
      frameworkId: "iso-27001-2022",
    });
    expect(screen.getByText("No control status changes")).toBeTruthy();
  });

  it("says when the policy list is capped", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => {
      const base = view(request);
      return { ...base, totals: { ...base.totals, policies: 1234 } };
    });
    await renderScreen();
    await settle();
    expect(screen.getByText(/Showing the first 3 of 1,234 changed policies/)).toBeTruthy();
  });

  it("retries a failed comparison", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockRejectedValueOnce(new Error("This snapshot could not be read. Delete it and collect again."));
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    await renderScreen();
    await settle();
    expect(screen.getByRole("alert").textContent).toContain("This snapshot could not be read");
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    await settle();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("WIN - New policy")).toBeTruthy();
  });

  it("retries a failed load", async () => {
    mocks.status.mockRejectedValueOnce(new Error("Sign in before continuing."));
    mocks.status.mockResolvedValue(status());
    mocks.list.mockResolvedValue([]);
    await renderScreen();
    await settle();
    expect(screen.getByText("History could not be loaded")).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
    await settle();
    expect(screen.getByText("No snapshots yet")).toBeTruthy();
  });

  it("deletes a snapshot after confirmation", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    mocks.remove.mockResolvedValue([LATEST]);
    await renderScreen();
    await settle();
    const button = screen.getAllByRole("button", { name: /Delete snapshot of/ })[1]!;
    await act(async () => fireEvent.click(button));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("This cannot be undone");
    expect(mocks.remove).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete snapshot" })));
    await settle();
    expect(mocks.remove).toHaveBeenCalledWith(PREVIOUS.id);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("One snapshot so far")).toBeTruthy();
  });

  it("deletes every snapshot of the tenant", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    mocks.removeAll.mockResolvedValue(status({ count: 0 }));
    await renderScreen();
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete all" })));
    const dialog = screen.getByRole("alertdialog");
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete all" })));
    await settle();
    expect(mocks.removeAll).toHaveBeenCalled();
    expect(screen.getByText("No snapshots yet")).toBeTruthy();
  });

  it("deletes unreadable history as a whole from the unavailable notice", async () => {
    mocks.status.mockResolvedValue(
      status({ available: false, reason: "Secure storage is not available on this computer.", unreadableData: true }),
    );
    mocks.removeAll.mockResolvedValue(
      status({ available: false, reason: "Secure storage is not available on this computer." }),
    );
    await renderScreen();
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Delete all history" })));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Delete all history on this computer?")).toBeTruthy();
    expect(within(dialog).getByText(/Every snapshot of every tenant/)).toBeTruthy();
    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Delete all" })));
    await settle();
    expect(mocks.removeAll).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Delete all history" })).toBeNull();
  });

  it("offers no delete when nothing unreadable is stored", async () => {
    mocks.status.mockResolvedValue(
      status({ available: false, reason: "Secure storage is not available on this computer." }),
    );
    await renderScreen();
    await settle();
    expect(screen.queryByRole("button", { name: "Delete all history" })).toBeNull();
  });

  it("drops the previous account's history at once after an account switch", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    await renderScreen();
    await settle();
    expect(screen.getByRole("button", { name: "Delete all" })).toBeTruthy();
    expect(screen.getByText("WIN - Baseline - BitLocker")).toBeTruthy();
    // The other tenant's status is still loading.
    let resolveStatus!: (value: HistoryStatus) => void;
    mocks.status.mockImplementationOnce(() => new Promise((resolve) => (resolveStatus = resolve)));
    mocks.list.mockResolvedValue([]);
    mocks.state.current = appState({ tenantId: "tenant-2", account: "admin@fabrikam.com" });
    await act(async () => root!.render(<HistoryScreen />));
    expect(screen.getByText("Loading history")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Delete all" })).toBeNull();
    expect(screen.queryByText("WIN - Baseline - BitLocker")).toBeNull();
    await act(async () => resolveStatus(status()));
    await settle();
    expect(screen.getByText("No snapshots yet")).toBeTruthy();
  });

  it("reloads when main saves a snapshot", async () => {
    mocks.status.mockResolvedValue(status());
    mocks.list.mockResolvedValueOnce([]);
    mocks.list.mockResolvedValue([LATEST]);
    await renderScreen();
    await settle();
    expect(screen.getByText("No snapshots yet")).toBeTruthy();
    await act(async () => mocks.changed.listener?.());
    await settle();
    expect(screen.getByText("One snapshot so far")).toBeTruthy();
  });

  it("shows readable setting names and value labels in the control causes", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => {
      const base = view(request);
      const [change] = base.controls.changes;
      if (!change) return base;
      const [cause] = change.causes;
      const labelled = {
        ...cause!,
        evidenceAdded: [
          {
            policyName: "WIN - Baseline - BitLocker",
            settingId: "device_vendor_msft_bitlocker_requiredeviceencryption",
            observedValue: "device_vendor_msft_bitlocker_requiredeviceencryption_0",
            verdict: "disabled" as const,
            assignment: "assigned" as const,
            settingName: "Require Device Encryption",
            valueLabel: "Disabled",
          },
        ],
        evidenceRemoved: [
          {
            ...cause!.evidenceRemoved[0]!,
            observedValue: "device_vendor_msft_bitlocker_requiredeviceencryption_1",
            settingName: "Require Device Encryption",
            valueLabel: "Enabled",
          },
        ],
      };
      return { ...base, controls: { ...base.controls, changes: [{ ...change, causes: [labelled] }] } };
    });
    await renderScreen();
    await settle();
    await act(async () => fireEvent.click(screen.getByRole("tab", { name: /Controls/ })));
    const control = screen.getByRole("article", { name: "SC-28 Protection of Information at Rest" });
    expect(within(control).getByText("Evidence added:").parentElement!.textContent).toBe(
      "Evidence added: WIN - Baseline - BitLocker: Require Device Encryption: Disabled (not enforcing, assigned)",
    );
    expect(within(control).getByText("Evidence removed:").parentElement!.textContent).toBe(
      "Evidence removed: WIN - Baseline - BitLocker: Require Device Encryption: Enabled",
    );
    // The raw ids stay available as tooltips.
    expect(within(control).getByText("Enabled").getAttribute("title")).toBe(
      "device_vendor_msft_bitlocker_requiredeviceencryption_1",
    );
    expect(within(control).getAllByText("Require Device Encryption")[0]!.getAttribute("title")).toBe(
      "device_vendor_msft_bitlocker_requiredeviceencryption",
    );
  });

  it("says that device configuration profiles keep only the evidence properties", async () => {
    mocks.status.mockResolvedValue(status({ count: 2 }));
    mocks.list.mockResolvedValue([LATEST, PREVIOUS]);
    mocks.diff.mockImplementation(async (request: HistoryDiffRequest) => view(request));
    await renderScreen();
    await settle();
    expect(screen.getAllByText(/Device configuration profiles keep only the properties the evidence checks read/))
      .toHaveLength(2);
  });

  describe("scheduled collection", () => {
    it("loads the schedule and changes the interval", async () => {
      mocks.status.mockResolvedValue(status());
      mocks.list.mockResolvedValue([]);
      const nextRunAt = "2026-10-18T22:00:00Z";
      mocks.setSchedule.mockResolvedValue(schedule({ hours: 12, state: "waiting", nextRunAt }));
      await renderScreen();
      await settle();
      expect(mocks.scheduleStatus).toHaveBeenCalled();
      expect(screen.getByText("Scheduled collection")).toBeTruthy();
      const select = screen.getByLabelText("Collect automatically") as HTMLSelectElement;
      expect(select.value).toBe("0");
      expect(select.disabled).toBe(false);
      expect(screen.getByText("Off. Collections run only when you start them.")).toBeTruthy();
      expect(screen.getByText("Every run checks the license first.")).toBeTruthy();
      expect(screen.getByText("If the computer was asleep when a run was due, it runs once after waking.")).toBeTruthy();

      await act(async () => fireEvent.change(select, { target: { value: "12" } }));
      await settle();
      expect(mocks.setSchedule).toHaveBeenCalledWith(12);
      expect(select.value).toBe("12");
      expect(screen.getByText(/Next run/).textContent).toBe(`Next run ${formatDate(nextRunAt)}`);
    });

    it("is disabled while history is off", async () => {
      mocks.status.mockResolvedValue(status({ enabled: false }));
      mocks.list.mockResolvedValue([]);
      await renderScreen();
      await settle();
      const select = screen.getByLabelText("Collect automatically") as HTMLSelectElement;
      expect(select.disabled).toBe(true);
      expect(screen.getByText(/Turn on Keep history first/)).toBeTruthy();
      expect(select.getAttribute("aria-describedby")).toBe(screen.getByText(/Turn on Keep history first/).id);
    });

    it("can still be turned off while paused because history is off", async () => {
      const reason = "Keep history on this computer is off. Turn it on to run scheduled collections.";
      mocks.status.mockResolvedValue(status({ enabled: false }));
      mocks.list.mockResolvedValue([]);
      mocks.scheduleStatus.mockResolvedValue(schedule({ hours: 6, state: "paused", reason }));
      mocks.setSchedule.mockResolvedValue(schedule());
      await renderScreen();
      await settle();
      expect(screen.getByText(reason)).toBeTruthy();
      const select = screen.getByLabelText("Collect automatically") as HTMLSelectElement;
      expect(select.disabled).toBe(false);
      const options = Array.from(select.options);
      expect(options.filter((option) => !option.disabled).map((option) => option.value)).toEqual(["0", "6"]);
      await act(async () => fireEvent.change(select, { target: { value: "0" } }));
      await settle();
      expect(mocks.setSchedule).toHaveBeenCalledWith(0);
      expect(select.disabled).toBe(true);
    });

    it("shows the pause reason, the last result and the last skip", async () => {
      mocks.status.mockResolvedValue(status());
      mocks.list.mockResolvedValue([]);
      mocks.scheduleStatus.mockResolvedValue(
        schedule({
          hours: 24,
          state: "paused",
          reason: "The sign-in expired. Sign in again to resume scheduled collections.",
          lastRunAt: "2026-10-17T08:00:00Z",
          lastResult: "failed",
          lastError: "The network request timed out.",
          lastSkippedAt: "2026-10-16T08:00:00Z",
          lastSkippedReason: "Skipped because a collection was running.",
        }),
      );
      await renderScreen();
      await settle();
      expect(screen.getByText("Paused:").parentElement!.textContent).toBe(
        "Paused: The sign-in expired. Sign in again to resume scheduled collections.",
      );
      expect(screen.getByText(/^Last run/).textContent).toBe(
        `Last run ${formatDate("2026-10-17T08:00:00Z")}: failed: The network request timed out.`,
      );
      expect(screen.getByText(/^Last skipped/).textContent).toBe(
        `Last skipped ${formatDate("2026-10-16T08:00:00Z")}: Skipped because a collection was running.`,
      );
    });

    it("follows live status updates from main", async () => {
      mocks.status.mockResolvedValue(status());
      mocks.list.mockResolvedValue([]);
      mocks.scheduleStatus.mockResolvedValue(schedule({ hours: 6, state: "waiting", nextRunAt: "2026-10-18T16:00:00Z" }));
      await renderScreen();
      await settle();
      expect(screen.getByText(/Next run/)).toBeTruthy();
      await act(async () => mocks.schedule.listener?.(schedule({ hours: 6, state: "running" })));
      expect(screen.getByText("Running now")).toBeTruthy();
      await act(async () =>
        mocks.schedule.listener?.(
          schedule({ hours: 6, state: "waiting", nextRunAt: "2026-10-18T22:00:00Z", lastRunAt: "2026-10-18T16:01:00Z", lastResult: "collected" }),
        ),
      );
      expect(screen.getByText(/^Last run/).textContent).toBe(`Last run ${formatDate("2026-10-18T16:01:00Z")}: collected`);
    });

    it("shows a refused change inline", async () => {
      mocks.status.mockResolvedValue(status());
      mocks.list.mockResolvedValue([]);
      mocks.setSchedule.mockRejectedValue(new Error("Turn on Keep history on this computer first."));
      await renderScreen();
      await settle();
      await act(async () =>
        fireEvent.change(screen.getByLabelText("Collect automatically"), { target: { value: "6" } }),
      );
      await settle();
      expect(screen.getByRole("alert").textContent).toContain("Turn on Keep history on this computer first.");
      expect((screen.getByLabelText("Collect automatically") as HTMLSelectElement).value).toBe("0");
    });

    it("refreshes the schedule after history is turned off", async () => {
      const reason = "Keep history on this computer is off. Turn it on to run scheduled collections.";
      mocks.status.mockResolvedValue(status());
      mocks.list.mockResolvedValue([]);
      mocks.scheduleStatus.mockResolvedValueOnce(schedule({ hours: 6, state: "waiting", nextRunAt: "2026-10-18T16:00:00Z" }));
      mocks.scheduleStatus.mockResolvedValue(schedule({ hours: 6, state: "paused", reason }));
      mocks.setEnabled.mockResolvedValue(status({ enabled: false }));
      await renderScreen();
      await settle();
      expect(screen.getByText(/Next run/)).toBeTruthy();
      await act(async () => fireEvent.click(screen.getByRole("checkbox")));
      await settle();
      expect(mocks.setEnabled).toHaveBeenCalledWith(false);
      expect(mocks.scheduleStatus).toHaveBeenCalledTimes(2);
      expect(screen.getByText(reason)).toBeTruthy();
    });

    it("retries a failed schedule load without hiding history", async () => {
      mocks.status.mockResolvedValue(status());
      mocks.list.mockResolvedValue([]);
      mocks.scheduleStatus.mockRejectedValueOnce(new Error("Sign in before continuing."));
      await renderScreen();
      await settle();
      expect(screen.getByText("The schedule could not be loaded")).toBeTruthy();
      expect(screen.getByText("No snapshots yet")).toBeTruthy();
      await act(async () => fireEvent.click(screen.getByRole("button", { name: "Retry" })));
      await settle();
      expect(screen.getByText("Off. Collections run only when you start them.")).toBeTruthy();
    });
  });
});
