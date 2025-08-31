"use client";

import { MsalProvider } from "@azure/msal-react";
import type { ReactNode } from "react";
import { getMsalInstance } from "~/lib/msal-config";

export function AuthProvider({ children }: { children: ReactNode }) {
  const msalInstance = getMsalInstance();
  
  if (!msalInstance) {
    return <>{children}</>;
  }

  return <MsalProvider instance={msalInstance}>{children}</MsalProvider>;
}