// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pdf: vi.fn(async () => ({ buffer: new Uint8Array([1]), errors: [] })),
  docx: vi.fn(async () => ({ buffer: new Uint8Array([2]), errors: [] })),
  prepareExport: vi.fn(async () => ({ sections: [], fetchErrors: [] })),
  saveFile: vi.fn(async () => "/saved/file"),
}));

vi.mock("../../../../../src/lib/pdf-generator-detailed", () => ({
  generateDetailedPDF: mocks.pdf,
}));
vi.mock("../../../../../src/lib/docx-generator-detailed", () => ({
  generateDetailedDOCX: mocks.docx,
}));
vi.mock("./ipc", () => ({
  ipc: {
    prepareExport: mocks.prepareExport,
    saveFile: mocks.saveFile,
    onExportProgress: () => () => undefined,
  },
  errorMessage: String,
}));

const { runExport } = await import("./export-runner");
const { TENANT_TARGET } = await import("./export-targets");

// The progress view waits for two animation frames before generating.
vi.stubGlobal("requestAnimationFrame", (callback: () => void) => setTimeout(callback, 0));

afterEach(() => {
  mocks.pdf.mockClear();
  mocks.docx.mockClear();
});

describe("runExport", () => {
  it("generates the documentation for the desktop, which keeps every framework", async () => {
    for (const format of ["pdf", "docx"] as const) {
      await runExport(vi.fn(), { format, target: TENANT_TARGET }, () => undefined);
    }
    expect(mocks.pdf).toHaveBeenCalledWith(
      expect.objectContaining({ includeComplianceEvidence: false }),
      { audience: "desktop" },
    );
    expect(mocks.docx).toHaveBeenCalledWith(
      expect.objectContaining({ includeComplianceEvidence: false }),
      { audience: "desktop" },
    );
  });
});
