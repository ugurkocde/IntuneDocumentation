// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, expect, it, vi } from "vitest";
import { DashboardContent } from "../dashboard-content";
import { collectionSteps } from "~/lib/collection-progress";
import { sessionSnapshot } from "~/lib/__tests__/fixtures/dashboard-session";
vi.mock("../compliance-view", () => ({
  ComplianceView: () => <p>Assessment results</p>,
}));
afterEach(cleanup);
function props() {
  return {
    configurations: sessionSnapshot().configurations,
    activeView: "settingsCatalog" as const,
    searchQuery: "",
    selectedConfigs: new Set<string>(),
    selectAll: false,
    lastFetched: null,
    showTipBanner: false,
    includeCA: false,
    caConsentStatus: "unknown" as const,
    sidebarOpen: true,
    typeStats: [],
    refreshing: true,
    collectionSteps: collectionSteps(false),
    onSearchChange: vi.fn(),
    onRefresh: vi.fn(),
    onDismissTip: vi.fn(),
    onSelectAll: vi.fn(),
    onSelectFiltered: vi.fn(),
    onSelectConfig: vi.fn(),
    onBulkSelect: vi.fn(),
    onToggleFamily: vi.fn(),
    onIncludeCAChange: vi.fn(),
  };
}
it("shows received policies while loading without claiming collection is complete", () => {
  render(<DashboardContent {...props()} />);
  expect(screen.getByText("Cached policy")).toBeVisible();
  expect(screen.getByText("Updating your dashboard")).toBeVisible();
  expect(screen.queryByText("All data loaded")).not.toBeInTheDocument();
  expect(screen.queryByText("100%")).not.toBeInTheDocument();
});
it("shows a loading placeholder instead of an empty-family conclusion", () => {
  render(<DashboardContent {...props()} activeView="deviceConfigurations" />);
  expect(screen.getByText("Loading configurations")).toBeVisible();
  expect(
    screen.queryByText("No configurations are set up in this family"),
  ).not.toBeInTheDocument();
});
it("waits for collection before rendering compliance conclusions or report downloads", () => {
  const view = render(
    <DashboardContent {...props()} activeView="compliance" />,
  );
  expect(screen.getByText("Checking policy evidence")).toBeVisible();
  expect(screen.queryByText("Assessment results")).not.toBeInTheDocument();
  view.rerender(
    <DashboardContent
      {...props()}
      activeView="compliance"
      refreshing={false}
    />,
  );
  expect(screen.getByText("Assessment results")).toBeVisible();
});

it("renders the notification outside dashboard layout and confirms success", async () => {
  const { CollectionStatus } = await import("../collection-status");
  vi.useFakeTimers();
  try {
    const props = {
      steps: collectionSteps(false),
      count: 12,
      retryAvailable: false,
      onRetry: vi.fn(),
    };
    const view = render(<CollectionStatus {...props} loading />);
    const notification = screen.getByRole("region", {
      name: "Collection notification",
    });
    expect(notification.parentElement).toBe(document.body);
    expect(notification).toHaveClass("fixed");
    view.rerender(<CollectionStatus {...props} loading={false} />);
    expect(screen.getByText("Your dashboard is up to date")).toBeVisible();
    const { act } = await import("@testing-library/react");
    void act(() => {
      vi.advanceTimersByTime(6000);
    });
    expect(
      screen.queryByRole("region", { name: "Collection notification" }),
    ).not.toBeInTheDocument();
  } finally {
    vi.useRealTimers();
  }
});
it("keeps incomplete collection visible instead of showing success", async () => {
  const { CollectionStatus } = await import("../collection-status");
  const props = {
    steps: collectionSteps(false),
    count: 12,
    retryAvailable: false,
    onRetry: vi.fn(),
  };
  const view = render(<CollectionStatus {...props} loading />);
  view.rerender(<CollectionStatus {...props} loading={false} incomplete />);
  expect(
    screen.queryByText("Your dashboard is up to date"),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Retry unfinished categories" }),
  ).toBeVisible();
});

it("prioritizes unfinished categories and supports minimizing without hiding progress", async () => {
  const { CollectionStatus } = await import("../collection-status");
  const { fireEvent } = await import("@testing-library/react");
  const steps = collectionSteps(false).map((step, index) => ({
    ...step,
    status: index === 1 ? ("loading" as const) : ("completed" as const),
  }));
  render(
    <CollectionStatus
      steps={steps}
      count={853}
      loading
      retryAvailable={false}
      onRetry={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("list", { name: "Unfinished categories" }),
  ).toHaveTextContent("Settings Catalog");
  expect(screen.getByRole("progressbar")).toHaveAttribute(
    "aria-valuenow",
    "11",
  );
  expect(screen.getByText("Device Configurations")).not.toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Minimize collection details" }),
  );
  expect(screen.getByRole("progressbar")).toBeVisible();
  expect(screen.getByText("Settings Catalog")).not.toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: "Expand collection details" }),
  );
  expect(screen.getByText("Settings Catalog")).toBeVisible();
});
