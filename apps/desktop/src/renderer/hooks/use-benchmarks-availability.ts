import { useEffect, useRef, type Dispatch } from "react";
import type { AuthStatus, LicenseStatus } from "../../shared/ipc-types";
import { ipc } from "../lib/ipc";
import type { Action } from "../state/types";

// Asks main whether CIS Benchmarks are available once booted and again after
// every sign in, account change and licence change. Main answers "internal"
// only for the signed licence claim; a failed call counts as coming soon, and
// an answer overtaken by a newer question is dropped.
export function useBenchmarksAvailability(
  dispatch: Dispatch<Action>,
  booted: boolean,
  auth: AuthStatus | null,
  license: LicenseStatus | null,
): void {
  const request = useRef(0);
  useEffect(() => {
    if (!booted) return;
    const id = ++request.current;
    void ipc
      .benchmarksAvailability()
      .then((result) => (result?.state === "internal" ? "internal" : "comingSoon"))
      .catch(() => "comingSoon" as const)
      .then((availability) => {
        if (id === request.current) dispatch({ type: "benchmarks", availability });
      });
  }, [dispatch, booted, auth?.signedIn, auth?.account, auth?.tenantId, license]);
}
