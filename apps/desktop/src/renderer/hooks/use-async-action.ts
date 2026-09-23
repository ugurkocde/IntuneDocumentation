import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage } from "../lib/ipc";

// Tracks one async operation: which one is busy, the last error, and an
// optional success message.
export function useAsyncAction() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(
      id: string,
      action: () => Promise<T>,
      success?: string | ((value: T) => string | null),
    ): Promise<T | undefined> => {
      setBusy(id);
      setError(null);
      setMessage(null);
      try {
        const value = await action();
        if (mounted.current && success) {
          setMessage(typeof success === "function" ? success(value) : success);
        }
        return value;
      } catch (caught) {
        if (mounted.current) setError(errorMessage(caught));
        return undefined;
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setError(null);
    setMessage(null);
  }, []);

  return { busy, error, message, run, reset, setError, setMessage };
}
