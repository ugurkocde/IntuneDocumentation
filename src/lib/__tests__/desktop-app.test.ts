import { describe, expect, it } from "vitest";
import {
  DESKTOP_GRAPH_PERMISSIONS,
  DESKTOP_INSTALLS_PER_TENANT,
  DESKTOP_OFFLINE_GRACE_DAYS,
  DESKTOP_PLANS,
  formatDesktopPrice,
  type BillingInterval,
} from "~/lib/desktop-app";
import { getDesktopCheckoutUrl } from "~/lib/desktop-checkout";
import { INSTALLS_PER_TENANT } from "~/lib/desktop-license/service";
import { DEFAULT_SCOPES } from "../../../apps/desktop/src/shared/scopes";
import { TOKEN_LIFETIME_SECONDS } from "~/lib/desktop-license/token";

describe("desktop app constants", () => {
  it("lists the same Graph scopes the desktop app requests", () => {
    expect(DESKTOP_GRAPH_PERMISSIONS.map((p) => p.scope)).toEqual(
      DEFAULT_SCOPES,
    );
  });

  it("matches the licensing service limits", () => {
    expect(DESKTOP_INSTALLS_PER_TENANT).toBe(INSTALLS_PER_TENANT);
    expect(DESKTOP_OFFLINE_GRACE_DAYS * 24 * 60 * 60).toBe(
      TOKEN_LIFETIME_SECONDS,
    );
  });

  it("links every plan and interval to its own Polar checkout", () => {
    const intervals: BillingInterval[] = ["monthly", "yearly"];
    const urls = Object.values(DESKTOP_PLANS).flatMap((plan) =>
      intervals.map((interval) => getDesktopCheckoutUrl(plan.id, interval)),
    );
    for (const url of urls) {
      expect(url).toMatch(/^https:\/\/buy\.polar\.sh\/polar_cl_\w+$/);
    }
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("keeps checkout links out of the plan data server pages import", () => {
    expect(JSON.stringify(DESKTOP_PLANS)).not.toMatch(/polar/);
  });

  it("formats whole prices without cents and monthly equivalents with cents", () => {
    expect(formatDesktopPrice(99)).toBe("€99");
    expect(formatDesktopPrice(990 / 12)).toBe("€82.50");
    expect(formatDesktopPrice(1990 / 12)).toBe("€165.83");
  });
});
