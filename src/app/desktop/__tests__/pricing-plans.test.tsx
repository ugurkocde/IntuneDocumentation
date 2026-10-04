// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { openDesktopCheckout } from "~/lib/desktop-checkout";
import { PricingPlans } from "../pricing-plans";

vi.mock("~/lib/desktop-checkout", () => ({ openDesktopCheckout: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function planButton(name: string) {
  const card = screen.getByRole("heading", { name }).closest("article")!;
  return within(card).getByRole("button", { name: `Buy ${name}` });
}

describe("PricingPlans", () => {
  it("renders no checkout links in server HTML", () => {
    const html = renderToString(<PricingPlans />);
    expect(html).not.toMatch(/buy\.polar\.sh|polar_cl_|href=/);
    expect(html.match(/<button type="button" class="mt-6/g)).toHaveLength(2);
  });

  it("opens the checkout for the clicked plan and billing interval", async () => {
    const user = userEvent.setup();
    render(<PricingPlans />);

    await user.click(planButton("Pro"));
    expect(openDesktopCheckout).toHaveBeenLastCalledWith("pro", "monthly");

    await user.click(screen.getByRole("button", { name: /Yearly/ }));
    await user.click(planButton("MSP"));
    expect(openDesktopCheckout).toHaveBeenLastCalledWith("msp", "yearly");
  });
});
