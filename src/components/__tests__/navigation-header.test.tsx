// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import type { ImgHTMLAttributes } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NavigationHeader } from "../navigation-header";

vi.mock("@azure/msal-react", () => ({
  useMsal: () => ({
    accounts: [],
    instance: {
      loginPopup: vi.fn(),
      loginRedirect: vi.fn(),
      logoutRedirect: vi.fn(),
    },
  }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/image", () => ({
  default: ({
    priority: _priority,
    alt = "",
    ...props
  }: ImgHTMLAttributes<HTMLImageElement> & { priority?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

vi.mock("~/hooks/use-user-profile", () => ({
  useUserProfile: () => ({ userProfile: null }),
}));

vi.mock("~/components/changelog-bell", () => ({
  ChangelogBell: () => (
    <button type="button" aria-label="Open product updates" />
  ),
}));

describe("NavigationHeader", () => {
  afterEach(cleanup);

  it("avoids backdrop-filter compositing and reserves the desktop nav for xl screens", () => {
    render(<NavigationHeader />);

    const header = screen.getByRole("banner");
    const desktopNavigation = screen.getByRole("navigation").parentElement;
    const menuButton = screen.getByRole("button", {
      name: "Toggle navigation menu",
    });

    expect(header).toHaveClass("isolate", "pointer-events-auto");
    expect(header.className).not.toContain("backdrop-blur");
    expect(header.className).not.toContain("backdrop-filter");
    expect(desktopNavigation).toHaveClass("hidden", "xl:flex");
    expect(desktopNavigation).not.toHaveClass("lg:flex");
    expect(menuButton).toHaveClass("xl:hidden");
    expect(menuButton).not.toHaveClass("lg:hidden");
  });

  it("uses 44px touch targets and opens the tablet navigation panel", async () => {
    const user = userEvent.setup();
    render(<NavigationHeader />);

    expect(
      screen.getByRole("link", { name: /Intune Documentation/ }),
    ).toHaveClass("min-h-11");

    const menuButton = screen.getByRole("button", {
      name: "Toggle navigation menu",
    });
    expect(menuButton).toHaveClass("h-11", "w-11");

    await user.click(menuButton);

    const panel = document.getElementById("mobile-navigation");
    expect(panel).toHaveClass("xl:hidden");
    const tabletNavigation = within(panel!);
    expect(
      tabletNavigation.getByRole("button", { name: "Sign in" }),
    ).toHaveClass("min-h-11");
    expect(
      tabletNavigation.getByRole("button", { name: "Get Started" }),
    ).toHaveClass("min-h-11");

    await user.click(tabletNavigation.getByRole("link", { name: "Features" }));

    expect(
      screen.getByRole("button", { name: "Toggle navigation menu" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      document.getElementById("mobile-navigation"),
    ).not.toBeInTheDocument();
  });
});
