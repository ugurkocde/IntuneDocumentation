// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { AppSupportChat } from "../app-support-chat";
afterEach(cleanup);
it("loads chat only on demand, from the public origin, without passing app data", () => {
  const { container } = render(
    <AppSupportChat supportOrigin="https://intunedocumentation.com" />,
  );
  expect(container.querySelector("iframe")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open support chat" }));
  const frame = screen.getByTitle("Crisp support chat");
  expect(frame.getAttribute("src")).toBe(
    "https://intunedocumentation.com/support-chat",
  );
  expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
  expect(frame.getAttribute("sandbox")).not.toContain("allow-top-navigation");
  expect(container.querySelector("script")).toBeNull();
});
it("keeps the conversation mounted when closed and reopened", () => {
  render(<AppSupportChat supportOrigin="https://intunedocumentation.com" />);
  fireEvent.click(screen.getByRole("button", { name: "Open support chat" }));
  const frame = screen.getByTitle("Crisp support chat");
  fireEvent.keyDown(window, { key: "Escape" });
  expect(screen.queryByRole("dialog")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Open support chat" }));
  expect(screen.getByTitle("Crisp support chat")).toBe(frame);
});
