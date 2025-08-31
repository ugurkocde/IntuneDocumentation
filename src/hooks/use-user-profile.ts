import { useState, useEffect } from "react";
import { useMsal } from "@azure/msal-react";
import { Client } from "@microsoft/microsoft-graph-client";

interface UserProfile {
  displayName: string;
  mail: string;
  userPrincipalName: string;
}

export function useUserProfile() {
  const { instance, accounts } = useMsal();
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUserProfile = async () => {
      if (accounts.length === 0) {
        setUserProfile(null);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const request = {
          scopes: ["User.Read"],
          account: accounts[0],
        };

        const response = await instance.acquireTokenSilent(request);
        
        const client = Client.init({
          authProvider: (done) => {
            done(null, response.accessToken);
          },
        });

        const profile = await client.api("/me").get();
        
        setUserProfile({
          displayName: profile.displayName || profile.userPrincipalName || accounts[0]?.username || "User",
          mail: profile.mail || profile.userPrincipalName,
          userPrincipalName: profile.userPrincipalName,
        });
      } catch (error) {
        console.error("Error fetching user profile:", error);
        setError("Failed to fetch user profile");
        // Fallback to account username
        setUserProfile({
          displayName: accounts[0]?.name || accounts[0]?.username || "User",
          mail: accounts[0]?.username || "",
          userPrincipalName: accounts[0]?.username || "",
        });
      } finally {
        setLoading(false);
      }
    };

    void fetchUserProfile();
  }, [accounts, instance]);

  return { userProfile, loading, error };
}