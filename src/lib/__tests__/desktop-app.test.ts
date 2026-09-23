import { describe, expect, it } from "vitest";
import {
  DESKTOP_GRAPH_PERMISSIONS,
  DESKTOP_INSTALLS_PER_TENANT,
  DESKTOP_OFFLINE_GRACE_DAYS,
  DESKTOP_PLANS,
  formatDesktopPrice,
} from "~/lib/desktop-app";
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

  it("links every plan to a Polar checkout", () => {
    for (const plan of Object.values(DESKTOP_PLANS)) {
      for (const url of Object.values(plan.checkoutUrl)) {
        expect(url).toMatch(/^https:\/\/buy\.polar\.sh\/polar_cl_\w+$/);
      }
    }
  });

  it("formats whole prices without cents and monthly equivalents with cents", () => {
    expect(formatDesktopPrice(99)).toBe("€99");
    expect(formatDesktopPrice(990 / 12)).toBe("€82.50");
    expect(formatDesktopPrice(1990 / 12)).toBe("€165.83");
  });
});
