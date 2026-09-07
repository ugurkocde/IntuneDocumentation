// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardHeader } from "../dashboard-header";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

it("recommends refreshing after 30 minutes without starting a request", () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:29:00Z"));
  const refresh = vi.fn();
  render(
    <DashboardHeader
      title="Overview"
      searchQuery=""
      lastFetched={new Date("2026-09-07T12:00:00Z")}
      onSearchChange={vi.fn()}
      onRefresh={refresh}
    />,
  );
  expect(screen.getByText("Data collected 29 minutes ago")).toBeVisible();
  expect(screen.queryByText("Refresh recommended")).not.toBeInTheDocument();
  act(() => {
    vi.advanceTimersByTime(60_000);
  });
  expect(screen.getByText("Refresh recommended")).toBeVisible();
  expect(refresh).not.toHaveBeenCalled();
});
