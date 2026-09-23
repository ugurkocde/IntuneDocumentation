import { useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { getIdToken } from "~/lib/id-token";

export function useTenantLogging(context: string) {
  const { instance, accounts } = useMsal();

  useEffect(() => {
    if (accounts.length > 0) {
      // Send the verified ID token to the server for MAU logging
      const logTenantAccess = async () => {
        try {
          const account = accounts[0];
          if (!account) return;

          const idToken = await getIdToken(instance, account);
          if (!idToken) return;

          await fetch("/api/log-tenant", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${idToken}`,
            },
            body: JSON.stringify({ context }),
          });
        } catch {
          // Silently fail - logging shouldn't break the app
        }
      };

      void logTenantAccess();
    }
  }, [instance, accounts, context]);
}
