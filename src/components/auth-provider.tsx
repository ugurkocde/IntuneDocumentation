"use client";

import type { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getMsalInstance, getMsalInstanceSync } from "~/lib/msal-config";
import { observeDashboardSession } from "~/lib/dashboard-session-cache";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [msalInstance, setMsalInstance] = useState<
    PublicClientApplication | undefined
  >(() => getMsalInstanceSync());

  useEffect(
    () =>
      observeDashboardSession(() => {
        // Clear this tab's local MSAL cache; only the originating tab performs the
        // identity-provider logout redirect. No tenant data crosses the channel.
        const auth = msalInstance
          ? Promise.resolve(msalInstance)
          : getMsalInstance();
        void auth
          .then((instance) => instance?.clearCache())
          .catch(() => undefined)
          .finally(() => window.location.replace("/"));
      }),
    [msalInstance],
  );

  useEffect(() => {
    if (msalInstance) {
      return;
    }

    let isMounted = true;

    void getMsalInstance()
      .then((instance) => {
        if (isMounted) {
          setMsalInstance(instance);
        }
      })
      .catch((error: unknown) => {
        console.error("Failed to initialize Microsoft authentication:", error);
      });

    return () => {
      isMounted = false;
    };
  }, [msalInstance]);

  if (!msalInstance) {
    return <>{children}</>;
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
