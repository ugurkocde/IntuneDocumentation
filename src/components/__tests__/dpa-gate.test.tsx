// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DpaGate } from "~/components/dpa-gate";

const auth = vi.hoisted(() => ({
  instance: {} as unknown,
  accounts: [] as unknown[],
  inProgress: "none",
}));
vi.mock("@azure/msal-react", () => ({ useMsal: () => auth }));
vi.mock("~/lib/id-token", () => ({ getIdToken: async () => "id-token" }));

const accountA = { homeAccountId: "a", tenantId: "t1" };
const accountB = { homeAccountId: "b", tenantId: "t1" };
const fetchMock = vi.fn();
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

beforeEach(() => {
  window.localStorage.clear();
  auth.accounts = [accountA];
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async () => json({ accepted: false }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const gate = () => (
  <DpaGate enabled>
    <p>Dashboard</p>
  </DpaGate>
);

it("opens the dashboard after the acceptance is recorded", async () => {
  render(gate());
  fireEvent.click(await screen.findByRole("checkbox"));
  fetchMock.mockImplementation(async () => json({ recorded: true }));
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(await screen.findByText("Dashboard")).toBeTruthy();
});

it("keeps the gate closed when the acceptance is not recorded", async () => {
  render(gate());
  fireEvent.click(await screen.findByRole("checkbox"));
  fetchMock.mockImplementation(async () => json({}, 503));
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText("Dashboard")).toBeNull();
});

it("ignores a late acceptance for a previous account", async () => {
  const view = render(gate());
  fireEvent.click(await screen.findByRole("checkbox"));

  let finishPost: (response: Response) => void = () => undefined;
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => (finishPost = resolve))
      : Promise.resolve(json({ accepted: false })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));

  auth.accounts = [accountB];
  view.rerender(gate());
  await screen.findByRole("checkbox");

  await act(async () => finishPost(json({ recorded: true })));
  await waitFor(() => expect(screen.getByRole("checkbox")).toBeTruthy());
  expect(screen.queryByText("Dashboard")).toBeNull();
  expect(screen.queryByRole("status")).toBeNull();
});

it("asks again in another tenant of the same account", async () => {
  window.localStorage.clear();
  fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
    json(init?.method === "POST" ? { recorded: true } : { accepted: false }),
  );
  const view = render(gate());
  fireEvent.click(await screen.findByRole("checkbox"));
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
  await screen.findByText("Dashboard");

  auth.accounts = [{ homeAccountId: "a", tenantId: "t2" }];
  view.rerender(gate());
  expect(await screen.findByRole("checkbox")).toBeTruthy();
});

it("offers a reload when a newer agreement was deployed", async () => {
  render(gate());
  fireEvent.click(await screen.findByRole("checkbox"));
  fetchMock.mockImplementation(async () => json({}, 409));
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
  expect(await screen.findByRole("button", { name: "Reload" })).toBeTruthy();
  expect(
    screen
      .getByRole("button", { name: "Accept and continue" })
      .hasAttribute("disabled"),
  ).toBe(true);
});

it("gives another account its own prompt while a request is pending", async () => {
  const view = render(gate());
  fireEvent.click(await screen.findByRole("checkbox"));

  const posts: ((response: Response) => void)[] = [];
  fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
    init?.method === "POST"
      ? new Promise<Response>((resolve) => posts.push(resolve))
      : Promise.resolve(json({ accepted: false })),
  );
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
  await screen.findByRole("button", { name: "Saving…" });

  auth.accounts = [accountB];
  view.rerender(gate());
  const checkbox = await screen.findByRole("checkbox");
  // B gives its own consent; nothing carries over from A.
  expect((checkbox as HTMLInputElement).checked).toBe(false);
  fireEvent.click(checkbox);
  fireEvent.click(screen.getByRole("button", { name: "Accept and continue" }));
  await screen.findByRole("button", { name: "Saving…" });

  // A's late response does not end B's submission.
  await act(async () => posts[0]?.(json({ recorded: true })));
  expect(screen.getByRole("button", { name: "Saving…" })).toBeTruthy();
  expect(screen.queryByText("Dashboard")).toBeNull();

  await act(async () => posts[1]?.(json({ recorded: true })));
  expect(await screen.findByText("Dashboard")).toBeTruthy();
});
