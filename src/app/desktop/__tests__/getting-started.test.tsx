import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchCheckoutLicenseKeys } from "~/lib/desktop-license/checkout-key";
import DesktopGettingStartedPage from "../getting-started/page";

class RedirectError extends Error {
  constructor(readonly url: string) {
    super(url);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectError(url);
  },
}));
vi.mock("~/components/navigation-header", () => ({
  NavigationHeader: () => null,
}));
vi.mock("~/components/site-footer", () => ({ SiteFooter: () => null }));
vi.mock("~/lib/desktop-license/checkout-key", () => ({
  fetchCheckoutLicenseKeys: vi.fn(),
}));

afterEach(() => {
  vi.clearAllMocks();
});

function render(params: Record<string, string>) {
  return DesktopGettingStartedPage({ searchParams: Promise.resolve(params) });
}

describe("/desktop/getting-started", () => {
  it("sends plain visits to the docs site, where old anchors are mapped", async () => {
    await expect(render({})).rejects.toMatchObject({
      url: "https://docs.intunedocumentation.com/desktop/getting-started",
    });
    expect(fetchCheckoutLicenseKeys).not.toHaveBeenCalled();
  });

  it("shows the license key after checkout and links to the setup guide", async () => {
    vi.mocked(fetchCheckoutLicenseKeys).mockResolvedValue({
      status: "ready",
      keys: ["TEST-KEY-0000"],
    });
    const html = renderToString(
      await render({
        checkout_id: "checkout",
        customer_session_token: "polar_cst_token",
      }),
    );
    expect(fetchCheckoutLicenseKeys).toHaveBeenCalledWith("polar_cst_token");
    expect(html).toContain("TEST-KEY-0000");
    expect(html).toContain(
      'href="https://docs.intunedocumentation.com/desktop/before-you-start"',
    );
  });
});
