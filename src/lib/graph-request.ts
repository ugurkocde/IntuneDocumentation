function abortReason(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException("Graph collection cancelled", "AbortError");
}

const exhausted = new WeakSet<object>();

// Graph-supplied ids go inside an OData key literal, ('<id>'). Double any
// quote so the id cannot end the literal, then encode it so it stays one path
// segment and cannot add a query string.
export function graphKey(id: unknown): string {
  return encodeURIComponent(String(id).replace(/'/g, "''"));
}

export function graphStatus(error: any): number | undefined {
  const status = error?.statusCode ?? error?.status ?? error?.response?.status;
  return typeof status === "number" && status >= 100 ? status : undefined;
}

export function isTransientGraphError(error: any): boolean {
  if (
    [error?.name, error?.code].some(
      (value) => value === "AbortError" || value === "TimeoutError",
    )
  )
    return false;
  if (error && typeof error === "object" && exhausted.has(error)) return false;
  const status = graphStatus(error);
  return status === undefined
    ? error instanceof TypeError ||
        [
          "TypeError",
          "FetchError",
          "ECONNRESET",
          "ETIMEDOUT",
          "EAI_AGAIN",
        ].includes(error?.code)
    : [408, 429, 500, 502, 503, 504].includes(status);
}

// Graph normally asks for seconds. A longer or hostile Retry-After must not
// hold a request open; the caller's abort signal still bounds the total wait.
export const MAX_RETRY_AFTER_MS = 60_000;

export function retryAfterMs(error: any, now = Date.now()): number | undefined {
  const headers = error?.headers ?? error?.response?.headers;
  const raw =
    headers?.get?.("retry-after") ??
    Object.entries(headers ?? {}).find(
      ([key]) => key.toLowerCase() === "retry-after",
    )?.[1] ??
    error?.retryAfter;
  if (raw === undefined || raw === null) return undefined;
  const value = String(raw).trim();
  const ms = /^\d+(?:\.\d+)?$/.test(value)
    ? Number(value) * 1000
    : Date.parse(value) - now;
  return Number.isFinite(ms)
    ? Math.min(MAX_RETRY_AFTER_MS, Math.max(0, ms))
    : undefined;
}

export function waitForGraph(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortReason(signal));
    const abort = () => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", abort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

export async function retryGraphRequest<T>(
  action: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelay?: number;
    signal?: AbortSignal;
  } = {},
): Promise<T> {
  const attempts = Math.max(1, options.maxAttempts ?? 3);
  for (let attempt = 0; ; attempt++) {
    options.signal?.throwIfAborted();
    try {
      return await action();
    } catch (error) {
      if (attempt + 1 >= attempts || !isTransientGraphError(error)) {
        if (error && typeof error === "object") exhausted.add(error);
        throw error;
      }
      await waitForGraph(
        retryAfterMs(error) ??
          (options.initialDelay ?? 1000) * 2 ** attempt + Math.random() * 250,
        options.signal,
      );
    }
  }
}

// Shared by all families using a client, including requests queued by Promise.all.
export function createGraphLimiter(limit = 6) {
  let active = 0;
  const queue: Array<() => void> = [];
  return async function run<T>(
    action: () => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    signal?.throwIfAborted();
    if (active >= limit)
      await new Promise<void>((resolve, reject) => {
        const ready = () => {
          signal?.removeEventListener("abort", abort);
          resolve();
        };
        const abort = () => {
          const index = queue.indexOf(ready);
          if (index >= 0) queue.splice(index, 1);
          reject(abortReason(signal));
        };
        queue.push(ready);
        signal?.addEventListener("abort", abort, { once: true });
      });
    else active++;
    try {
      signal?.throwIfAborted();
      return await action();
    } finally {
      const next = queue.shift();
      if (next) next();
      else active--;
    }
  };
}
