// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { stubbedPublicClientApplication } from "@azure/msal-browser";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import SignInPage from "~/app/sign-in/page";
const auth = vi.hoisted(() => ({
  instance: { loginRedirect: vi.fn() } as any,
  accounts: [] as unknown[],
  inProgress: "none",
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
beforeEach(() => {
  auth.instance = { loginRedirect: vi.fn().mockResolvedValue(undefined) };
  auth.accounts = [];
  auth.inProgress = "none";
  vi.clearAllMocks();
});
afterEach(cleanup);
it("waits for a real, settled MSAL instance before redirecting", () => {
  const real = auth.instance;
  auth.instance = stubbedPublicClientApplication;
  const view = render(<SignInPage />);
  auth.instance = real;
  auth.inProgress = "startup";
  view.rerender(<SignInPage />);
  expect(real.loginRedirect).not.toHaveBeenCalled();
  auth.inProgress = "none";
  view.rerender(<SignInPage />);
  expect(real.loginRedirect).toHaveBeenCalledOnce();
  expect(real.loginRedirect).toHaveBeenCalledWith(
    expect.objectContaining({
      redirectStartPage: new URL("/dashboard", window.location.origin).href,
    }),
  );
  expect(screen.queryByRole("heading")).toBeNull();
});
it("restores an authenticated visitor directly to the dashboard", () => {
  auth.accounts = [{}];
  render(<SignInPage />);
  expect(router.replace).toHaveBeenCalledWith("/dashboard");
  expect(auth.instance.loginRedirect).not.toHaveBeenCalled();
});
it("shows a retry route if Microsoft sign-in cannot start", async () => {
  auth.instance.loginRedirect.mockRejectedValue(new Error("offline"));
  render(<SignInPage />);
  await waitFor(() =>
    expect(screen.getByText("Sign-in could not start")).toBeTruthy(),
  );
  expect(
    screen
      .getByRole("link", { name: "Return to sign-in" })
      .getAttribute("href"),
  ).toBe("/");
});
