// @vitest-environment jsdom
// Renders with the desktop copy of React directly; @testing-library/react
// would bring the web app's copy.
import { fireEvent, screen, within } from "@testing-library/dom";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ComplianceReportProgress, FixPackPreview } from "../../../shared/ipc-types";

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  saveRegister: vi.fn(),
  savePack: vi.fn(),
  saveFixPack: vi.fn(),
  openLastFile: vi.fn(),
  showLastFileInFolder: vi.fn(),
  progress: { current: null as null | ((progress: ComplianceReportProgress) => void) },
}));

vi.mock("../../lib/ipc", () => ({
  ipc: {
    compliancePreviewFixPack: mocks.preview,
    complianceSaveRegister: mocks.saveRegister,
    complianceSaveEvidencePack: mocks.savePack,
    complianceSaveFixPack: mocks.saveFixPack,
    openLastFile: mocks.openLastFile,
    showLastFileInFolder: mocks.showLastFileInFolder,
    onComplianceProgress: (callback: (progress: ComplianceReportProgress) => void) => {
      mocks.progress.current = callback;
      return () => {
        mocks.progress.current = null;
      };
    },
  },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
  isMac: false,
}));

const { ExportsPanel, FIX_PACK_WARNINGS } = await import("./ExportsPanel");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const request = { frameworkId: "iso-27001-2022" as const, scope: { platforms: ["windows" as const] } };

function preview(draftPolicies: number, gaps = 2): FixPackPreview {
  return {
    summary: { draftPolicies, notGeneratable: gaps },
    policies: Array.from({ length: draftPolicies }, (_, index) => ({
      fileName: `0${index + 1}-capability-${index}.json`,
      name: `Intune Documentation fix pack: Capability ${index} (draft, unassigned)`,
      capabilityId: `capability-${index}`,
    })),
    notGeneratable: Array.from({ length: gaps }, (_, index) => ({
      capabilityId: `gap-${index}`,
      name: `Gap capability ${index}`,
      reason: `Reason number ${index}.`,
    })),
  };
}

let root: Root | null = null;
let container: HTMLElement;
const onBusyChange = vi.fn();

async function renderPanel(props: Partial<Parameters<typeof ExportsPanel>[0]> = {}) {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <ExportsPanel
        request={request}
        frameworkLabel="ISO/IEC 27001:2022"
        ready
        blocker={null}
        onBusyChange={onBusyChange}
        {...props}
      />,
    ),
  );
}

function button(name: RegExp | string) {
  return screen.getByRole("button", { name });
}

beforeEach(() => {
  mocks.preview.mockResolvedValue(preview(3, 23));
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  container.remove();
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("ExportsPanel", () => {
  it("shows the fix pack preview with an expandable not generatable list", async () => {
    await renderPanel();
    expect(mocks.preview).toHaveBeenCalledWith(request);
    expect(screen.getByText("3 draft policies, 23 not generatable")).toBeTruthy();
    const list = screen.getByRole("list", { name: "Not generatable capabilities" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(23);
    expect(within(list).getByText("Gap capability 7")).toBeTruthy();
    expect(within(list).getByText(/Reason number 7\./)).toBeTruthy();
    expect(screen.getByText("Not generatable (23)")).toBeTruthy();
    expect(screen.getByText(/check them against your tenant's template/)).toBeTruthy();
  });

  it("does not load the preview while the assessment is out of date", async () => {
    await renderPanel({ ready: false });
    expect(mocks.preview).not.toHaveBeenCalled();
    expect(screen.getByText("Checking which drafts can be generated")).toBeTruthy();
    expect((button(/Fix pack/) as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves the Excel register, reports progress and offers the saved file", async () => {
    let resolve: (path: string | null) => void = () => undefined;
    mocks.saveRegister.mockReturnValue(new Promise((done) => (resolve = done)));
    await renderPanel();
    await act(async () => fireEvent.click(button("Excel (.xlsx)")));
    expect(mocks.saveRegister).toHaveBeenCalledWith(request, "xlsx");
    expect(onBusyChange).toHaveBeenLastCalledWith(true);
    await act(async () => mocks.progress.current?.({ stage: "generating" }));
    expect(screen.getByText("Generating the file")).toBeTruthy();
    // Every other export waits for the running one.
    expect((button("CSV (.csv)") as HTMLButtonElement).disabled).toBe(true);
    expect((button(/Evidence pack/) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => resolve("/Users/admin/Documents/Evidence-Register-ISO.xlsx"));
    expect(onBusyChange).toHaveBeenLastCalledWith(false);
    expect(screen.getByText("Evidence register (Excel) saved: Evidence-Register-ISO.xlsx")).toBeTruthy();
    await act(async () => fireEvent.click(button("Open file")));
    expect(mocks.openLastFile).toHaveBeenCalledWith("/Users/admin/Documents/Evidence-Register-ISO.xlsx");
    await act(async () => fireEvent.click(button("Show in folder")));
    expect(mocks.showLastFileInFolder).toHaveBeenCalledWith("/Users/admin/Documents/Evidence-Register-ISO.xlsx");
  });

  it("says when a save was cancelled and shows errors", async () => {
    mocks.saveRegister.mockResolvedValue(null);
    mocks.savePack.mockRejectedValue(new Error("Collect tenant data first."));
    await renderPanel();
    await act(async () => fireEvent.click(button("CSV (.csv)")));
    expect(mocks.saveRegister).toHaveBeenCalledWith(request, "csv");
    expect(screen.getByText("Save cancelled. Nothing was saved.")).toBeTruthy();
    await act(async () => fireEvent.click(button(/Evidence pack/)));
    expect(mocks.savePack).toHaveBeenCalledWith(request);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The export could not be saved");
    expect(alert.textContent).toContain("Collect tenant data first.");
  });

  it("asks for confirmation with every warning before saving the fix pack", async () => {
    mocks.saveFixPack.mockResolvedValue("C:\\Users\\admin\\Documents\\Draft-Fix-Pack.zip");
    await renderPanel();
    await act(async () => fireEvent.click(button(/Fix pack/)));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("Save the draft fix pack?")).toBeTruthy();
    expect(dialog.textContent).toContain("3 draft policies for ISO/IEC 27001:2022");
    for (const warning of FIX_PACK_WARNINGS) expect(within(dialog).getByText(warning)).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("Cancel");

    await act(async () => fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" })));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.saveFixPack).not.toHaveBeenCalled();

    await act(async () => fireEvent.click(button(/Fix pack/)));
    await act(async () => fireEvent.click(within(screen.getByRole("alertdialog")).getByRole("button", { name: "Save fix pack" })));
    expect(mocks.saveFixPack).toHaveBeenCalledWith(request, true);
    expect(screen.getByText("Draft fix pack saved: Draft-Fix-Pack.zip")).toBeTruthy();
  });

  it("closes the confirmation with Escape", async () => {
    await renderPanel();
    await act(async () => fireEvent.click(button(/Fix pack/)));
    await act(async () => fireEvent.keyDown(window, { key: "Escape" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(mocks.saveFixPack).not.toHaveBeenCalled();
  });

  it("disables the fix pack when nothing can be generated", async () => {
    mocks.preview.mockResolvedValue(preview(0, 4));
    await renderPanel();
    expect(screen.getByText("0 draft policies, 4 not generatable")).toBeTruthy();
    const fixPack = button(/Fix pack/) as HTMLButtonElement;
    expect(fixPack.disabled).toBe(true);
    expect(fixPack.parentElement?.getAttribute("title")).toBe(
      "No draft policy can be generated for this framework and scope.",
    );
  });

  it("offers a retry when the preview fails", async () => {
    mocks.preview.mockRejectedValueOnce(new Error("Sign in before continuing."));
    await renderPanel();
    expect(screen.getByText(/The preview could not be loaded: Sign in before continuing\./)).toBeTruthy();
    await act(async () => fireEvent.click(button("Try again")));
    expect(mocks.preview).toHaveBeenCalledTimes(2);
    expect(screen.getByText("3 draft policies, 23 not generatable")).toBeTruthy();
  });

  it("disables every export behind a blocker", async () => {
    await renderPanel({ blocker: "A report is already being created." });
    expect(screen.getByText("A report is already being created.")).toBeTruthy();
    for (const name of ["Excel (.xlsx)", "CSV (.csv)", /Evidence pack/, /Fix pack/])
      expect((button(name) as HTMLButtonElement).disabled).toBe(true);
  });
});
