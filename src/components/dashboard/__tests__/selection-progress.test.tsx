import {
  Children,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import * as React from "react";
import { describe, expect, it, vi } from "vitest";
import { SelectionProgress } from "../selection-progress";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

interface CheckboxProps {
  checked: boolean;
  className: string;
  "aria-label": string;
  onChange: () => void;
  ref?: (input: HTMLInputElement | null) => void;
}

function findCheckboxes(node: ReactNode): ReactElement<CheckboxProps>[] {
  const checkboxes: ReactElement<CheckboxProps>[] = [];

  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === "input") {
      checkboxes.push(child as ReactElement<CheckboxProps>);
    }
    checkboxes.push(
      ...findCheckboxes((child.props as { children?: ReactNode }).children),
    );
  });

  return checkboxes;
}

describe("SelectionProgress", () => {
  it("renders round category controls that toggle the export family", () => {
    const onToggleFamily = vi.fn();
    const tree = SelectionProgress({
      stats: [
        {
          key: "settingsCatalog",
          label: "Settings Catalog",
          compactLabel: "Settings Catalog",
          total: 143,
          selected: 0,
        },
      ],
      selectedCount: 0,
      totalCount: 143,
      onToggleFamily,
    });
    const [checkbox] = findCheckboxes(tree);

    expect(checkbox).toBeDefined();
    expect(checkbox?.props.checked).toBe(false);
    expect(checkbox?.props.className).toContain("checkbox-enhanced--round");
    expect(checkbox?.props["aria-label"]).toBe(
      "Add all Settings Catalog to the export",
    );

    checkbox?.props.onChange();
    expect(onToggleFamily).toHaveBeenCalledWith("settingsCatalog");
  });

  it("describes a fully selected family as removable from the export", () => {
    const tree = SelectionProgress({
      stats: [
        {
          key: "settingsCatalog",
          label: "Settings Catalog",
          compactLabel: "Settings Catalog",
          total: 143,
          selected: 143,
        },
      ],
      selectedCount: 143,
      totalCount: 143,
      onToggleFamily: vi.fn(),
    });
    const [checkbox] = findCheckboxes(tree);

    expect(checkbox?.props.checked).toBe(true);
    expect(checkbox?.props["aria-label"]).toBe(
      "Remove all Settings Catalog from the export",
    );
  });

  it("marks a partially selected family as indeterminate", () => {
    const tree = SelectionProgress({
      stats: [
        {
          key: "settingsCatalog",
          label: "Settings Catalog",
          compactLabel: "Settings Catalog",
          total: 143,
          selected: 1,
        },
      ],
      selectedCount: 1,
      totalCount: 143,
      onToggleFamily: vi.fn(),
    });
    const [checkbox] = findCheckboxes(tree);
    const input = { indeterminate: false } as HTMLInputElement;

    checkbox?.props.ref?.(input);
    expect(checkbox?.props.checked).toBe(false);
    expect(input.indeterminate).toBe(true);
  });
});
