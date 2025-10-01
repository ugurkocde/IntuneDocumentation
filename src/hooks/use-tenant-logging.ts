import { useEffect } from "react";
import { useMsal } from "@azure/msal-react";

export function useTenantLogging(context: string) {
  const { accounts } = useMsal();

  useEffect(() => {
    if (accounts.length > 0) {
      // Get the access token and send to server for logging
      const logTenantAccess = async () => {
        try {
          const account = accounts[0];
          if (!account) return;

          // Send tenant info to server for logging
          await fetch("/api/log-tenant", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              // Include basic auth info for server-side logging
              "Authorization": `Bearer ${account.idToken || ""}`,
            },
            body: JSON.stringify({ context }),
          });
        } catch {
          // Silently fail - logging shouldn't break the app
        }
      };

      void logTenantAccess();
    }
  }, [accounts, context]);
}