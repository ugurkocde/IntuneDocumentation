// JSON text of a value with the keys of every object in sorted order, for
// tokens and digests that compare values. The members of a JSON object are
// unordered (RFC 8259), so {"a":1,"b":2} and {"b":2,"a":1} are one value
// and serialize alike; array order, primitive types and values are kept as
// JSON.stringify writes them, so a reordered list or a value of another type
// still serializes differently. A value JSON cannot hold, such as
// undefined, reads "undefined", which no JSON text is.
const isObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export function canonicalJson(value: unknown): string {
  return (
    JSON.stringify(value, (_key, entry: unknown) =>
      isObject(entry)
        ? Object.fromEntries(
            Object.keys(entry)
              .sort()
              .map((key) => [key, entry[key]]),
          )
        : entry,
    ) ?? "undefined"
  );
}
