"use client";

import type { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { getMsalInstance } from "~/lib/msal-config";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [msalInstance, setMsalInstance] = useState<
    PublicClientApplication | undefined
  >();

  useEffect(() => {
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
  }, []);

  if (!msalInstance) {
    return <>{children}</>;
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}
