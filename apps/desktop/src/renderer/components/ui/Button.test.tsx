// @vitest-environment jsdom
import { screen } from "@testing-library/dom";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { Button } from "./Button";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;
let host: HTMLDivElement | null = null;

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

function render(node: ReactNode) {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(node));
}

describe("Button", () => {
  // A translucent ring on the button's edge fell below the 3:1 minimum for
  // a focus indicator; every variant gets the solid ring with an offset.
  it("shows a solid focus ring with an offset on every variant", () => {
    const variants = ["primary", "accent", "secondary", "ghost", "danger", "dangerOutline"] as const;
    render(
      <>
        {variants.map((variant) => (
          <Button key={variant} variant={variant}>
            {variant}
          </Button>
        ))}
      </>,
    );
    for (const variant of variants) {
      const classes = screen.getByRole("button", { name: variant }).className.split(/\s+/);
      expect(classes).toContain("focus-visible:ring-2");
      expect(classes).toContain("focus-visible:ring-teal-600");
      expect(classes).toContain("focus-visible:ring-offset-2");
      expect(classes.some((name) => /ring-teal-600\/\d+/.test(name))).toBe(false);
    }
  });
});
