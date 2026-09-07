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
  const [showSpinner, setShowSpinner] = useState(false);
  const router = useRouter();
  useEffect(() => {
    const timer = setTimeout(() => setShowSpinner(true), 300);
    return () => clearTimeout(timer);
  }, []);
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
    void instance
      .loginRedirect({
        ...loginRequest,
        redirectStartPage: new URL("/dashboard", window.location.origin).href,
      })
      .catch(() => setError(true));
  }, [instance, accounts, inProgress, router]);
  if (!error)
    return (
      <main className="grid min-h-screen place-items-center" aria-busy="true">
        <span role="status" className="sr-only">
          Loading your workspace
        </span>
        {showSpinner && (
          <div
            aria-hidden="true"
            className="h-7 w-7 animate-spin rounded-full border-2 border-teal-700/20 border-t-teal-700 motion-reduce:animate-none"
          />
        )}
      </main>
    );
  return (
    <main className="mx-auto max-w-xl p-12">
      <h1 className="text-2xl font-semibold">Sign-in could not start</h1>
      <p>Please try signing in again.</p>
      <Link href="/">Return to sign-in</Link>
    </main>
  );
}
