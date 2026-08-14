// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChangelogBell } from "../changelog-bell";
import {
  CHANGELOG_SEEN_STORAGE_KEY,
  resetChangelogCacheForTests,
} from "~/lib/changelog";

const feedResponse = {
  product: {
    id: "intunedocumentation",
    name: "Intune Documentation",
    websiteUrl: "https://www.intunedocumentation.com/",
  },
  entries: [
    {
      id: "entry-1",
      title: "A clearer update panel",
      summary: "Recent improvements are now easier to follow.",
      type: "improved",
      publishedOn: "2026-08-14",
      sourceUrl: "https://www.intunedocumentation.com/",
    },
  ],
};

describe("ChangelogBell", () => {
  beforeEach(() => {
    resetChangelogCacheForTests();
    window.localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(feedResponse), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      ),
    );
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("opens accessibly, focuses the close control, and omits type labels", async () => {
    const user = userEvent.setup();
    render(<ChangelogBell />);
    const trigger = screen.getByRole("button", {
      name: "Open product updates",
    });

    await user.click(trigger);

    expect(
      await screen.findByRole("dialog", { name: "What's New" }),
    ).toBeInTheDocument();
    const closeButton = screen.getByRole("button", {
      name: "Close product updates",
    });
    await waitFor(() => expect(closeButton).toHaveFocus());
    expect(screen.getByText("A clearer update panel")).toBeInTheDocument();
    expect(screen.queryByText("Improved")).not.toBeInTheDocument();
    expect(window.localStorage.getItem(CHANGELOG_SEEN_STORAGE_KEY)).toBe(
      "entry-1",
    );
  });

  it("wraps focus within the drawer and restores it after Escape", async () => {
    const user = userEvent.setup();
    render(<ChangelogBell />);
    const trigger = screen.getByRole("button", {
      name: "Open product updates",
    });
    await user.click(trigger);
    const closeButton = await screen.findByRole("button", {
      name: "Close product updates",
    });
    await waitFor(() => expect(closeButton).toHaveFocus());

    await user.tab({ shift: true });
    expect(
      screen.getByRole("link", { name: /view all updates/i }),
    ).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("offers a harmless retry state when the service is unavailable", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(feedResponse), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<ChangelogBell />);

    await user.click(
      screen.getByRole("button", { name: "Open product updates" }),
    );
    expect(
      await screen.findByText("Updates are temporarily unavailable"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(
      await screen.findByText("A clearer update panel"),
    ).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
