import { useEffect, useState } from "react";

// The value once it has stopped changing for delayMs. A delay of 0 passes the
// value through at once.
export function useDebouncedValue<T>(value: T, delayMs = 200): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [value, delayMs]);
  return delayMs === 0 ? value : debounced;
}
