// Comparison result shapes and constants shared with the renderer. No Node
// imports, so the renderer bundle can import values from here.

export const GENERAL_PLATFORM = "Not platform specific";

export type SettingComparison =
  | "different"
  | "missing"
  | "extra"
  | "notComparable"
  | "matching";

export const COMPARISON_ORDER: readonly SettingComparison[] = [
  "different",
  "missing",
  "extra",
  "notComparable",
  "matching",
];

export interface CompareValue {
  // Null when the value is redacted or not kept.
  value: string | null;
  policy: string;
}

export interface CompareRow {
  status: SettingComparison;
  setting: string;
  name: string;
  path: string[];
  // The reference or other tenant, then the current collection.
  expected: CompareValue[];
  actual: CompareValue[];
}

export type ComparisonCounts = Record<SettingComparison, number>;

export interface CompareGroup {
  platform: string;
  family: string;
  familyLabel: string;
  counts: ComparisonCounts;
  rows: CompareRow[];
  // Rows before capping.
  rowsTotal: number;
}

export interface NotComparedSettingsFamily {
  family: string;
  label: string;
  // Which side lacks complete data.
  side: "reference" | "current" | "both";
}

export interface SettingsComparison {
  groups: CompareGroup[];
  totals: ComparisonCounts;
  notCompared: NotComparedSettingsFamily[];
  rulesetChanged: boolean;
}
