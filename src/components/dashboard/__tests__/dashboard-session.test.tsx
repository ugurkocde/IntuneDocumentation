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
  DashboardSidebar: ({ onSignOut, showConditionalAccess }: any) => (
    <div>
      <button onClick={onSignOut}>Sign out</button>
      {showConditionalAccess && <span>Conditional Access navigation</span>}
    </div>
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
    retryAvailable,
    loadedResourceCount,
    onRetry,
  }: any) => (
    <div>
      <span>
        {configurations.settingsCatalog
          .map((item: any) => item.displayName)
          .join(", ")}
      </span>
      <span>{lastFetched?.toISOString()}</span>
      <span>Consent: {caConsentStatus}</span>
      <span>Warnings: {configurations.fetchErrors?.length ?? 0}</span>
      <span>Loaded now: {loadedResourceCount}</span>
      <button disabled={refreshing} onClick={onRefresh}>
        Refresh data
      </button>
      {refreshing && <p>Collecting in background</p>}
      {retryAvailable && <button onClick={onRetry}>Retry unfinished</button>}
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
                collectedAt: "2026-09-07T12:29:00.000Z",
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
      Date.parse("2026-09-07T12:29:00.000Z"),
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

  it("opens the dashboard shell while the first collection is pending", async () => {
    window.sessionStorage.clear();
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise(() => {
          /* Keep collection pending to inspect progress. */
        }),
    );
    render(<DashboardPage />);
    expect(await screen.findByText("Collecting in background")).toBeVisible();
    expect(screen.getByRole("button", { name: "Sign out" })).toBeVisible();
    expect(loadingScreenRendered).not.toHaveBeenCalled();
  });

  it("restores stale data immediately and refreshes quietly", async () => {
    vi.mocked(Date.now).mockReturnValue(Date.parse("2026-09-07T12:35:00.000Z"));
    vi.mocked(fetch).mockImplementation(
      () =>
        new Promise(() => {
          /* Keep background refresh pending. */
        }),
    );
    render(<DashboardPage />);
    expect(await screen.findByText("Cached policy")).toBeVisible();
    expect(await screen.findByText("Collecting in background")).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(loadingScreenRendered).not.toHaveBeenCalled();
  });

  it("streams sections before completion and retries only unfinished categories", async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        new ReadableStream({
          start(value) {
            controller = value;
          },
        }),
      ),
    );
    render(<DashboardPage />);
    await screen.findByText("Cached policy");
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    const section = {
      ...sessionSnapshot().configurations.sections[0]!,
      items: [{ id: "new", displayName: "Streamed policy", assignments: [] }],
    };
    controller.enqueue(
      new TextEncoder().encode(
        `event: section\ndata: ${JSON.stringify({ section })}\n\n`,
      ),
    );
    expect(await screen.findByText("Streamed policy")).toBeVisible();
    expect(screen.getByText("Loaded now: 0")).toBeVisible();
    controller.enqueue(
      new TextEncoder().encode(
        `event: progress\ndata: ${JSON.stringify({ stepIndex: 1, status: "completed" })}\n\n`,
      ),
    );
    expect(await screen.findByText("Loaded now: 1")).toBeVisible();
    expect(screen.getByText("Collecting in background")).toBeVisible();
    controller.close();
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "Retry unfinished" }));
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const headers = vi.mocked(fetch).mock.calls[1]![1]!.headers as Record<
      string,
      string
    >;
    expect(headers["X-Collection-Steps"]).toBe("2,3,4,5,6,7,8,9,10,11");
  });

  it("keeps enabled Conditional Access visible and records unavailable access", async () => {
    window.localStorage.setItem("include-ca", "true");
    auth.instance.acquireTokenSilent.mockImplementation(
      async (request: { scopes: string[] }) => {
        if (request.scopes.includes("Policy.Read.All"))
          throw new Error("interaction_required");
        return { accessToken: "test-access-token" };
      },
    );
    auth.instance.acquireTokenPopup.mockRejectedValueOnce(
      new Error("user_cancelled"),
    );
    render(<DashboardPage />);
    expect(
      await screen.findByText("Conditional Access navigation"),
    ).toBeVisible();
    expect(await screen.findByText("Consent: missing")).toBeVisible();
    expect(await screen.findByText("Warnings: 1")).toBeVisible();
    expect(fetch).toHaveBeenCalledWith(
      "/api/intune/detailed-configurations-stream",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Include-Conditional-Access": "false",
        }),
      }),
    );
    expect(
      screen.getByRole("button", { name: "Retry unfinished" }),
    ).toBeVisible();
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

  it("keeps completed sections visible without persisting an interrupted refresh", async () => {
    vi.mocked(fetch).mockResolvedValue(
      collectionResponse("Partial replacement", false),
    );
    render(<DashboardPage />);
    await screen.findByText("Cached policy");
    fireEvent.click(screen.getByRole("button", { name: "Refresh data" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "closed before all collections finished",
    );
    expect(screen.getByText("Partial replacement")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Retry unfinished" }),
    ).toBeVisible();
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
