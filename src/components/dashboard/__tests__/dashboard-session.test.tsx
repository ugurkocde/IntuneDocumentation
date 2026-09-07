// @vitest-environment jsdom
import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "~/app/dashboard/page";
import {
  clearDashboardSession,
  DASHBOARD_SESSION_KEY,
  readDashboardSession,
  saveDashboardSession,
} from "~/lib/dashboard-session-cache";
import {
  sessionScope,
  sessionSnapshot,
} from "~/lib/__tests__/fixtures/dashboard-session";

const auth = vi.hoisted(() => ({
  accounts: [
    {
      homeAccountId: "account-a",
      tenantId: "tenant-a",
      username: "admin@example.test",
    },
  ],
  inProgress: "none",
  instance: {
    acquireTokenSilent: vi.fn(),
    acquireTokenPopup: vi.fn(),
    logoutRedirect: vi.fn(),
  },
}));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const loadingScreenRendered = vi.hoisted(() => vi.fn());
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("~/hooks/use-user-profile", () => ({
  useUserProfile: () => ({ userProfile: null }),
}));
vi.mock("~/hooks/use-tenant-logging", () => ({
  useTenantLogging: () => undefined,
}));
vi.mock("~/components/navigation-header", () => ({
  NavigationHeader: () => null,
}));
vi.mock("~/components/dashboard-loading", () => ({
  DashboardLoading: () => {
    loadingScreenRendered();
    return <div>Loading policies</div>;
  },
}));
vi.mock("~/components/branding-settings-modal", () => ({
  BrandingSettingsModal: () => null,
}));
vi.mock("~/components/export-modal", () => ({ ExportModal: () => null }));
vi.mock("~/components/floating-export-notification", () => ({
  FloatingExportNotification: () => null,
}));
vi.mock("~/components/dashboard/dashboard-sidebar", () => ({
  DashboardSidebar: ({ onSignOut }: any) => (
    <button onClick={onSignOut}>Sign out</button>
  ),
}));
vi.mock("~/components/dashboard/dashboard-content", () => ({
  DashboardContent: ({
    configurations,
    lastFetched,
    onRefresh,
    refreshing,
    refreshError,
    caConsentStatus,
  }: any) => (
    <div>
      <span>
        {configurations.settingsCatalog
          .map((item: any) => item.displayName)
          .join(", ")}
      </span>
      <span>{lastFetched?.toISOString()}</span>
      <span>Consent: {caConsentStatus}</span>
      <button disabled={refreshing} onClick={onRefresh}>
        Refresh data
      </button>
      {refreshError && <p role="alert">{refreshError}</p>}
    </div>
  ),
}));

function collectionResponse(name = "Fresh policy", complete = true) {
  const section = {
    ...sessionSnapshot().configurations.sections[0]!,
    items: [{ id: "new", displayName: name, assignments: [] }],
  };
  const messages = [
    { event: "section", data: { section } },
    ...(complete
      ? [
          {
            event: "complete",
            data: {
              data: {
                collectedAt: "2026-09-07T12:30:00.000Z",
                summary: {
                  totalConfigurations: 1,
                  byType: { settingsCatalog: 1 },
                },
                collectionSkippedFamilies: ["conditionalAccessPolicies"],
              },
            },
          },
        ]
      : []),
  ];
  return new Response(
    messages
      .map(
        ({ event, data }) =>
          `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
      )
      .join(""),
  );
}

describe("dashboard session restore", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(
      Date.parse("2026-09-07T12:30:00.000Z"),
    );
    window.sessionStorage.clear();
    window.localStorage.clear();
    vi.stubGlobal("CompressionStream", undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(collectionResponse()));
    auth.accounts = [
      {
        homeAccountId: "account-a",
        tenantId: "tenant-a",
        username: "admin@example.test",
      },
    ];
    auth.inProgress = "none";
    auth.instance.acquireTokenSilent.mockResolvedValue({
      accessToken: "test-access-token",
    });
    await readDashboardSession(sessionScope);
    await saveDashboardSession(sessionScope, sessionSnapshot());
  });
  afterEach(() => {
    cleanup();
    clearDashboardSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not restart a collection when MSAL acquires a token", async () => {
    const view = render(<DashboardPage />);
    await screen.findByText("Cached policy");
    auth.inProgress = "acquireToken";
    view.rerender(<DashboardPage />);
    auth.inProgress = "none";
    view.rerender(<DashboardPage />);
    expect(screen.getByText("Cached policy")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("silently continues when session storage is full", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    render(<DashboardPage />);
    await screen.findByText("Cached policy");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(await screen.findByText("Fresh policy")).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("restores after a reload without fetching Graph, including Strict Mode", async () => {
    const view = render(
      <StrictMode>
        <DashboardPage />
      </StrictMode>,
    );
    expect(await screen.findByText("Cached policy")).toBeVisible();
    expect(screen.getByText(sessionSnapshot().lastFetched)).toBeVisible();
    view.unmount();
    render(<DashboardPage />);
    expect(await screen.findByText("Cached policy")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(auth.instance.acquireTokenSilent).not.toHaveBeenCalled();
    expect(loadingScreenRendered).not.toHaveBeenCalled();
  });

  it("waits for MSAL to settle before restoring the account snapshot", async () => {
    auth.inProgress = "startup";
    const view = render(<DashboardPage />);
    expect(screen.queryByText("Loading policies")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
    auth.inProgress = "none";
    view.rerender(<DashboardPage />);
    expect(await screen.findByText("Cached policy")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
    expect(loadingScreenRendered).not.toHaveBeenCalled();
  });

  it("shows collection progress when no retained snapshot is available", async () => {
    window.sessionStorage.clear();
    vi.mocked(fetch).mockImplementation(
      () => new Promise(() => { /* Keep collection pending to inspect progress. */ }),
    );
    render(<DashboardPage />);
    expect(await screen.findByText("Loading policies")).toBeVisible();
  });

  it("explicit refresh replaces the snapshot and original collection timestamp", async () => {
    render(<DashboardPage />);
    await screen.findByText("Cached policy");
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(await screen.findByText("Fresh policy")).toBeVisible();
    expect(screen.queryByText("Cached policy")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Refresh data" }),
      ).toBeEnabled(),
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/intune/detailed-configurations-stream",
      expect.objectContaining({ cache: "no-store" }),
    );
    await waitFor(() =>
      expect(window.sessionStorage.getItem(DASHBOARD_SESSION_KEY)).toContain(
        "Fresh policy",
      ),
    );
    expect(window.sessionStorage.getItem(DASHBOARD_SESSION_KEY)).not.toContain(
      "test-access-token",
    );
  });

  it("keeps the previous snapshot when a refresh stream stops partway through", async () => {
    vi.mocked(fetch).mockResolvedValue(
      collectionResponse("Partial replacement", false),
    );
    render(<DashboardPage />);
    await screen.findByText("Cached policy");
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "closed before all collections finished",
    );
    expect(screen.getByText("Cached policy")).toBeVisible();
    expect(screen.queryByText("Partial replacement")).not.toBeInTheDocument();
    expect((await readDashboardSession(sessionScope))?.lastFetched).toBe(
      sessionSnapshot().lastFetched,
    );
  });

  it("does not display the previous tenant snapshot after an account switch", async () => {
    const view = render(<DashboardPage />);
    await screen.findByText("Cached policy");
    auth.accounts = [
      {
        homeAccountId: "account-b",
        tenantId: "tenant-b",
        username: "other@example.test",
      },
    ];
    view.rerender(<DashboardPage />);
    expect(screen.queryByText("Cached policy")).not.toBeInTheDocument();
    expect(await screen.findByText("Fresh policy")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("clears session data before signing out", async () => {
    render(<DashboardPage />);
    await screen.findByText("Cached policy");
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
    expect(window.sessionStorage.getItem(DASHBOARD_SESSION_KEY)).toBeNull();
    expect(auth.instance.logoutRedirect).toHaveBeenCalledOnce();
  });
});
