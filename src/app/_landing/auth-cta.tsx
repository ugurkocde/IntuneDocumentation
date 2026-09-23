"use client";

import { useMsal } from "@azure/msal-react";
import { FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useState } from "react";
import { useSiteBoundary } from "~/components/site-boundary-provider";
import { useUserProfile } from "~/hooks/use-user-profile";
import { clearDashboardSession } from "~/lib/dashboard-session-cache";
import { loginRequest, shouldUseRedirectLogin } from "~/lib/msal-config";
import { cn } from "~/lib/utils";
import { buttonStyles } from "./primitives";

// The only interactive part of the hero and closing call to action: Microsoft
// sign-in for visitors, dashboard access for signed-in users.
export function AuthCta({
  inverted = false,
  leadingAction,
  secondaryAction,
}: {
  inverted?: boolean;
  leadingAction?: ReactNode;
  secondaryAction?: ReactNode;
}) {
  const { publicSite, appOrigin } = useSiteBoundary();
  const { instance, accounts } = useMsal();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const [signingIn, setSigningIn] = useState(false);
  const [signInError, setSignInError] = useState<string | null>(null);

  const handleSignIn = async () => {
    if (publicSite) {
      window.location.assign(`${appOrigin}/sign-in`);
      return;
    }
    try {
      setSigningIn(true);
      setSignInError(null);

      if (shouldUseRedirectLogin()) {
        await instance.loginRedirect(loginRequest);
        return;
      }

      await instance.loginPopup(loginRequest);
      router.push("/dashboard");
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error?.errorCode === "popup_window_error") {
        setSignInError(
          "Pop-up was blocked. Please allow pop-ups for this site and try again.",
        );
      } else if (error?.errorCode === "user_cancelled") {
        setSignInError(null);
      } else {
        setSignInError("Sign-in failed. Please try again.");
      }
    } finally {
      setSigningIn(false);
    }
  };

  const handleSignOut = () => {
    clearDashboardSession();
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  if (accounts.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        {!inverted && (
          <p className="text-petrol-950 text-lg">
            Welcome back,{" "}
            <span className="font-semibold">
              {userProfile?.displayName || "User"}
            </span>
          </p>
        )}
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
          {leadingAction}
          <button
            onClick={() => router.push("/dashboard")}
            className={buttonStyles.primary}
            type="button"
          >
            <FileText className="h-4 w-4" />
            Go to Dashboard
          </button>
          {!inverted && (
            <button
              onClick={handleSignOut}
              className={buttonStyles.secondary}
              type="button"
            >
              Sign Out
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        {leadingAction}
        <button
          onClick={handleSignIn}
          disabled={signingIn}
          className={cn(
            "plausible-event-name=Web+Sign+In inline-block min-h-11 rounded-md bg-white transition-[transform,box-shadow,opacity] duration-200 focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none",
            inverted
              ? "focus-visible:ring-offset-petrol-950 ring-1 ring-white/20 focus-visible:ring-teal-500"
              : "ring-petrol-950/10 shadow-card ring-1 focus-visible:ring-teal-600",
            signingIn
              ? "cursor-not-allowed opacity-60"
              : "hover:shadow-soft cursor-pointer hover:-translate-y-0.5",
          )}
          aria-label="Sign in with Microsoft to generate your report"
          type="button"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- official Microsoft sign-in artwork, served as-is */}
          <img
            src="/sign-in-light-mode.svg"
            alt="Sign in with Microsoft"
            width={215}
            height={41}
            decoding="async"
            className="h-auto w-[215px] max-w-full"
          />
        </button>
        {secondaryAction}
      </div>
      {signingIn && (
        <p
          className={cn(
            "text-sm",
            inverted ? "text-white/70" : "text-petrol-600",
          )}
          aria-live="polite"
        >
          Opening Microsoft sign-in…
        </p>
      )}
      {signInError && (
        <p
          className={cn(
            "max-w-xl text-sm",
            inverted
              ? "text-red-200"
              : "rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-red-800",
          )}
          role="alert"
        >
          {signInError}
        </p>
      )}
    </div>
  );
}
