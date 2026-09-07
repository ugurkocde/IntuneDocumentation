"use client";
import Link from "next/link";
import { useMsal } from "@azure/msal-react";
import {
  InteractionStatus,
  stubbedPublicClientApplication,
} from "@azure/msal-browser";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { loginRequest } from "~/lib/msal-config";

export default function SignInPage() {
  const { instance, accounts, inProgress } = useMsal();
  const started = useRef(false);
  const [error, setError] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (
      instance === stubbedPublicClientApplication ||
      inProgress !== InteractionStatus.None ||
      started.current
    )
      return;
    if (accounts.length) {
      router.replace("/dashboard");
      return;
    }
    started.current = true;
    void instance.loginRedirect(loginRequest).catch(() => setError(true));
  }, [instance, accounts, inProgress, router]);
  return (
    <main className="mx-auto max-w-xl p-12">
      <h1 className="text-2xl font-semibold">
        {error ? "Sign-in could not start" : "Connecting to Microsoft"}
      </h1>
      {error ? (
        <>
          <p>Please try signing in again.</p>
          <Link href="/">Return to sign-in</Link>
        </>
      ) : (
        <p>Please wait while we open Microsoft sign-in.</p>
      )}
    </main>
  );
}
