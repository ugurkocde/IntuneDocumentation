// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthStatus, LicenseStatus } from "../../shared/ipc-types";

const mocks = vi.hoisted(() => ({ availability: vi.fn() }));

vi.mock("../lib/ipc", () => ({ ipc: { benchmarksAvailability: mocks.availability } }));

const { useBenchmarksAvailability } = await import("./use-benchmarks-availability");

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dispatch = vi.fn();

function Probe(props: { booted: boolean; auth: AuthStatus | null; license: LicenseStatus | null }) {
  useBenchmarksAvailability(dispatch, props.booted, props.auth, props.license);
  return null;
}

const auth = (account: string): AuthStatus => ({ signedIn: true, account, tenantId: "t1", expiresOn: null });
const license = (entitled: boolean) => ({ entitled }) as LicenseStatus;

let root: Root;
let host: HTMLElement;

async function render(props: Parameters<typeof Probe>[0]) {
  await act(async () => root.render(<Probe {...props} />));
}

beforeEach(() => {
  host = document.createElement("div");
  root = createRoot(host);
  dispatch.mockReset();
  mocks.availability.mockReset();
  mocks.availability.mockResolvedValue({ state: "internal" });
});

afterEach(() => {
  act(() => root.unmount());
});

describe("useBenchmarksAvailability", () => {
  it("asks after boot and again on sign in, account change and licence change", async () => {
    const lic = license(true);
    await render({ booted: false, auth: null, license: lic });
    expect(mocks.availability).not.toHaveBeenCalled();
    await render({ booted: true, auth: null, license: lic });
    expect(mocks.availability).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "benchmarks", availability: "internal" });

    await render({ booted: true, auth: auth("a@synthetic.example"), license: lic });
    expect(mocks.availability).toHaveBeenCalledTimes(2);
    // The same account and licence ask nothing new.
    await render({ booted: true, auth: auth("a@synthetic.example"), license: lic });
    expect(mocks.availability).toHaveBeenCalledTimes(2);
    await render({ booted: true, auth: auth("b@synthetic.example"), license: lic });
    expect(mocks.availability).toHaveBeenCalledTimes(3);

    mocks.availability.mockResolvedValueOnce({ state: "comingSoon" });
    await render({ booted: true, auth: auth("b@synthetic.example"), license: license(false) });
    expect(mocks.availability).toHaveBeenCalledTimes(4);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "benchmarks", availability: "comingSoon" });
  });

  it("treats a failed or unexpected answer as coming soon", async () => {
    mocks.availability.mockRejectedValueOnce(new Error("offline"));
    await render({ booted: true, auth: auth("a@synthetic.example"), license: license(true) });
    expect(dispatch).toHaveBeenLastCalledWith({ type: "benchmarks", availability: "comingSoon" });
    mocks.availability.mockResolvedValueOnce({ state: "licensed" });
    await render({ booted: true, auth: auth("b@synthetic.example"), license: license(true) });
    expect(dispatch).toHaveBeenLastCalledWith({ type: "benchmarks", availability: "comingSoon" });
  });

  it("drops an answer overtaken by a newer question", async () => {
    let first!: (value: { state: string }) => void;
    mocks.availability.mockImplementationOnce(() => new Promise((resolve) => (first = resolve)));
    mocks.availability.mockResolvedValueOnce({ state: "comingSoon" });
    await render({ booted: true, auth: auth("a@synthetic.example"), license: license(true) });
    await render({ booted: true, auth: auth("b@synthetic.example"), license: license(true) });
    await act(async () => first({ state: "internal" }));
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenLastCalledWith({ type: "benchmarks", availability: "comingSoon" });
  });
});
