// @vitest-environment jsdom
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import type {
  FixAction,
  FixPlan as Plan,
} from "../../../../../../src/lib/benchmarks/fix-plan";
import { FixPlan } from "./FixPlan";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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

const CAUTION =
  "Assigning it as it is would make 1 result that matches now no longer match.";

const condition = {
  findingKey: "L1/0:0",
  settingId: "synthetic_setting_b",
  name: "Synthetic setting B",
  packLevel: 1,
  platforms: "windows10",
  current: "0",
  recommended: "1",
  text: "Change Synthetic setting B in policy Synthetic candidate from 0 to 1 before assigning it.",
} as FixAction["settings"][number];

function plan(actions: FixAction[]): Plan {
  return {
    actions,
    byResult: {},
    advice: {},
    levelConflicts: {},
    withoutAction: 0,
  };
}

const result = {
  level: 1,
  kind: "recommendation",
  id: "1.1",
  key: "L1/1.1",
} as FixAction["results"][number];

describe("FixPlan", () => {
  // A partial assignment that lets no result match on its own still warns
  // that assigning the policy as it is would break a result that matches now.
  it("shows the caution of an assignment whose text does not say it", () => {
    render(
      <FixPlan
        plan={plan([
          {
            id: "a1",
            kind: "assignPolicy",
            settings: [],
            results: [result],
            unlocks: {
              judged: 1,
              matches: 0,
              differs: 0,
              regressions: 1,
              stillOpen: 1,
            },
            conditions: [condition],
            caution: CAUTION,
            text: "Assign policy Synthetic candidate after the changes below.",
          },
        ])}
        active={null}
        onShow={() => undefined}
      />,
    );
    expect(host!.textContent).toContain("Before assigning it");
    expect(host!.textContent).toContain(CAUTION);
    expect(host!.textContent).toContain(condition.text);
  });

  it("does not repeat a caution the step text already states", () => {
    render(
      <FixPlan
        plan={plan([
          {
            id: "a1",
            kind: "assignPolicy",
            settings: [],
            results: [result],
            caution: CAUTION,
            text: `Assign policy Synthetic candidate. ${CAUTION}`,
          },
        ])}
        active={null}
        onShow={() => undefined}
      />,
    );
    expect(host!.textContent!.split(CAUTION)).toHaveLength(2);
    expect(host!.textContent).not.toContain("Before assigning it");
  });

  it("shows the caution of a check without the assignment heading", () => {
    const why =
      "The assignments of policy Synthetic profile could not be read completely.";
    render(
      <FixPlan
        plan={plan([
          {
            id: "a1",
            kind: "checkAssignment",
            settings: [],
            results: [result],
            caution: why,
            text: "Check the assignments of policy Synthetic profile.",
          },
        ])}
        active={null}
        onShow={() => undefined}
      />,
    );
    expect(host!.textContent).toContain(why);
    expect(host!.textContent).not.toContain("Before assigning it");
  });
});
