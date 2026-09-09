import {
  type Change,
  type Snapshot,
  type Standard,
  type RuleResult,
} from "./domain";

// Ignore server bookkeeping, never security settings or policy assignments.
const volatile = new Set([
  "@odata.context",
  "@odata.nextLink",
  "@odata.etag",
  "lastModifiedDateTime",
  "createdDateTime",
]);
export function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map(canonical);
    // Only ID-keyed collections have set semantics. Preserve priority/order arrays.
    return value.every(
      (item) =>
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).id === "string",
    )
      ? normalized.sort((a, b) =>
          JSON.stringify(a).localeCompare(JSON.stringify(b)),
        )
      : normalized;
  }
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !volatile.has(key))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
function policies(data: unknown[]) {
  const result = new Map<string, Record<string, unknown>>();
  for (const item of data) {
    const row = object(item);
    if (typeof row.id === "string") result.set(row.id, row);
  }
  return result;
}
export function diffSnapshots(
  before: Snapshot,
  after: Snapshot,
): { changes: Change[]; skipped: string[] } {
  const changes: Change[] = [],
    skipped: string[] = [];
  for (const section of new Set([
    ...Object.keys(before.sections),
    ...Object.keys(after.sections),
  ])) {
    const old = before.sections[section],
      next = after.sections[section];
    if (old?.status !== "complete" || next?.status !== "complete") {
      skipped.push(section);
      continue;
    }
    const left = policies(old.data),
      right = policies(next.data);
    for (const id of new Set([...left.keys(), ...right.keys()])) {
      const a = left.get(id),
        b = right.get(id);
      const common = {
        section,
        policy: id,
        name: String(
          (b?.displayName ??
            b?.name ??
            a?.displayName ??
            a?.name ??
            id) as string,
        ),
      };
      if (!a || !b) {
        changes.push({
          ...common,
          path: "",
          before: a,
          after: b,
          kind: a ? "removed" : "added",
        });
        continue;
      }
      function walk(x: unknown, y: unknown, path: string) {
        if (JSON.stringify(canonical(x)) === JSON.stringify(canonical(y)))
          return;
        if (
          x &&
          y &&
          typeof x === "object" &&
          typeof y === "object" &&
          !Array.isArray(x) &&
          !Array.isArray(y)
        ) {
          for (const key of new Set([...Object.keys(x), ...Object.keys(y)]))
            if (!volatile.has(key))
              walk(
                object(x)[key],
                object(y)[key],
                `${path}/${key.replace(/~/g, "~0").replace(/\//g, "~1")}`,
              );
        } else
          changes.push({
            ...common,
            path,
            before: x,
            after: y,
            kind: "changed",
          });
      }
      walk(a, b, "");
    }
  }
  return { changes, skipped };
}
export function pointer(value: unknown, path: string): unknown {
  if (!path) return value;
  if (!path.startsWith("/")) return undefined;
  return path
    .slice(1)
    .split("/")
    .reduce<unknown>((current, key) => {
      const decoded = key.replace(/~1/g, "/").replace(/~0/g, "~");
      if (["__proto__", "prototype", "constructor"].includes(decoded))
        return undefined;
      return current &&
        typeof current === "object" &&
        Object.hasOwn(current, decoded)
        ? (current as Record<string, unknown>)[decoded]
        : undefined;
    }, value);
}
export function evaluate(snapshot: Snapshot, standard: Standard): RuleResult[] {
  return standard.rules.flatMap<RuleResult>((rule) => {
    const section = snapshot.sections[rule.section];
    if (!section || section.status !== "complete" || !section.data.length)
      return [
        {
          rule: rule.id,
          policy: "",
          status: "unknown" as const,
          severity: rule.severity,
        },
      ];
    return section.data.map((item) => {
      const actual = pointer(item, rule.path);
      const equal =
        JSON.stringify(canonical(actual)) ===
        JSON.stringify(canonical(rule.expected));
      const pass =
        rule.operator === "exists"
          ? actual !== undefined
          : rule.operator === "equals"
            ? equal
            : rule.operator === "notEquals"
              ? !equal
              : typeof actual === "string"
                ? actual.includes(String(rule.expected))
                : Array.isArray(actual) &&
                  actual.some(
                    (x) =>
                      JSON.stringify(canonical(x)) ===
                      JSON.stringify(canonical(rule.expected)),
                  );
      return {
        rule: rule.id,
        policy: String((object(item).id ?? "") as string),
        status:
          actual === undefined && rule.operator !== "exists"
            ? ("unknown" as const)
            : pass
              ? ("pass" as const)
              : ("fail" as const),
        actual,
        severity: rule.severity,
      };
    });
  });
}
