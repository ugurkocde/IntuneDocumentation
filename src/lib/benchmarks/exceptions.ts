/**
 * Accepted exceptions for benchmark results, ported from TenuVault
 * (cis-exceptions.ts). An exception records that an admin accepted a setting
 * that does not match for a bounded time, with an owner and a reason. It is
 * keyed by [benchmark, version, level, settingId] only: no policy names, so
 * nothing from a pack is stored with it. Expired exceptions stay stored but
 * no longer apply.
 */

export type ExceptionLevel = 1 | 2;

export interface BenchmarkException {
  id: string;
  benchmark: string;
  version: string;
  level: ExceptionLevel;
  /** The setting definition id the result row names. */
  settingId: string;
  owner: string;
  reason: string;
  /** Expiry date as YYYY-MM-DD. The exception applies through this date. */
  expiresOn: string;
  /** Creation timestamp as an ISO string. */
  createdAt: string;
}

export type NewBenchmarkException = Omit<
  BenchmarkException,
  "id" | "createdAt"
>;

export const MAX_EXCEPTIONS = 500;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const STORED_FIELDS = new Set([
  "id",
  "benchmark",
  "version",
  "level",
  "settingId",
  "owner",
  "reason",
  "expiresOn",
  "createdAt",
]);
const NEW_FIELDS = new Set([
  "benchmark",
  "version",
  "level",
  "settingId",
  "owner",
  "reason",
  "expiresOn",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function trimmed(value: unknown, field: string, max: number): string {
  if (typeof value !== "string")
    throw new Error(`Exception ${field} must be a string.`);
  const text = [...value.trim()]
    .filter((char) => {
      const code = char.codePointAt(0) ?? 0;
      return code > 31 && (code < 127 || code > 159);
    })
    .join("");
  if (!text) throw new Error(`Exception ${field} must not be empty.`);
  if (text.length > max)
    throw new Error(`Exception ${field} must be at most ${max} characters.`);
  return text;
}

/** True when value is a real calendar date written as YYYY-MM-DD. */
export function isDateOnly(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month! - 1 &&
    date.getUTCDate() === day
  );
}

function fields(
  value: Record<string, unknown>,
  allowed: Set<string>,
  label: string,
): NewBenchmarkException {
  for (const key of Object.keys(value))
    if (!allowed.has(key)) throw new Error(`${label}: unknown field ${key}.`);
  const benchmark = trimmed(value.benchmark, "benchmark", 100);
  const version = trimmed(value.version, "version", 50);
  if (value.level !== 1 && value.level !== 2)
    throw new Error(`${label}: level must be 1 or 2.`);
  const settingId = trimmed(value.settingId, "settingId", 500);
  const owner = trimmed(value.owner, "owner", 100);
  const reason = trimmed(value.reason, "reason", 500);
  if (typeof value.expiresOn !== "string" || !isDateOnly(value.expiresOn))
    throw new Error(`${label}: expiresOn must be a date as YYYY-MM-DD.`);
  return {
    benchmark,
    version,
    level: value.level,
    settingId,
    owner,
    reason,
    expiresOn: value.expiresOn,
  };
}

/** Validates a stored exception list strictly, naming the first problem. */
export function validateExceptions(input: unknown): BenchmarkException[] {
  if (!Array.isArray(input)) throw new Error("Exceptions must be an array.");
  if (input.length > MAX_EXCEPTIONS)
    throw new Error(
      `Exceptions must contain at most ${MAX_EXCEPTIONS} entries.`,
    );
  const seen = new Set<string>();
  return input.map((entry, index) => {
    const label = `Exception ${index + 1}`;
    if (!isRecord(entry)) throw new Error(`${label}: expected an object.`);
    const id = trimmed(entry.id, "id", 100);
    const rest = fields(entry, STORED_FIELDS, label);
    if (
      typeof entry.createdAt !== "string" ||
      !Number.isFinite(Date.parse(entry.createdAt))
    )
      throw new Error(`${label}: createdAt must be an ISO timestamp.`);
    if (seen.has(id)) throw new Error(`${label}: duplicate id ${id}.`);
    seen.add(id);
    return { id, ...rest, createdAt: entry.createdAt };
  });
}

/** Validates the fields for one new exception, without id and createdAt. */
export function validateNewException(input: unknown): NewBenchmarkException {
  if (!isRecord(input)) throw new Error("Exception input must be an object.");
  return fields(input, NEW_FIELDS, "Exception");
}

/** Stable key joining the result identity an exception applies to. */
export function exceptionKey(
  benchmark: string,
  version: string,
  level: ExceptionLevel,
  settingId: string,
): string {
  return JSON.stringify([benchmark, version, level, settingId]);
}

/** An exception is active through its expiry date; today may be a date or an ISO timestamp. */
export function isActive(
  exception: Pick<BenchmarkException, "expiresOn">,
  todayISO: string,
): boolean {
  return exception.expiresOn >= todayISO.slice(0, 10);
}

/**
 * The calendar date of a moment on this device, as YYYY-MM-DD. The expiry
 * date input is local, so today, creation dates and assessment dates are
 * read in local time as well. A value that is already a date stays as it is.
 */
export function localDate(value: string | Date = new Date()): string {
  if (typeof value === "string" && DATE_PATTERN.test(value)) return value;
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime()))
    return typeof value === "string" ? value.slice(0, 10) : "";
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** An exception applies on a date when it was created on or before that date and has not expired by then. */
export function appliesOn(
  exception: Pick<BenchmarkException, "createdAt" | "expiresOn">,
  dateISO: string,
): boolean {
  return (
    localDate(exception.createdAt) <= dateISO && isActive(exception, dateISO)
  );
}
