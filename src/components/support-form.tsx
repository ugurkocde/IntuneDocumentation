"use client";

import Script from "next/script";
import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";

type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

export function SupportForm({
  siteKey,
  nonce,
}: {
  siteKey: string;
  nonce?: string;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const submitting = useRef(false);
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const api = () => (window as Window & { turnstile?: Turnstile }).turnstile;

  useEffect(() => {
    const turnstile = api();
    if (!ready || !container.current || !turnstile || sent) return;
    widget.current = turnstile.render(container.current, {
      sitekey: siteKey,
      action: "support",
      callback: (value: string) => {
        setToken(value);
      },
      "expired-callback": () => setToken(""),
      "error-callback": () => {
        setToken("");
        setError(
          "Verification could not load. Try again or email support@ugurlabs.com.",
        );
      },
    });
    return () => {
      if (widget.current !== null) turnstile.remove(widget.current);
      widget.current = null;
    };
  }, [ready, siteKey, sent]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || !token) return;
    submitting.current = true;
    setPending(true);
    setError("");
    const data = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          subject: data.get("subject"),
          message: data.get("message"),
          website: data.get("website"),
          token,
        }),
        signal: AbortSignal.timeout(30000),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || result.success !== true)
        throw new Error(
          result.error ?? "Your request could not be sent. Please try again.",
        );
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.name === "Error"
          ? cause.message
          : "We could not confirm your request was sent. Try again or email support@ugurlabs.com.",
      );
      setToken("");
      if (widget.current !== null) api()?.reset(widget.current);
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  if (sent)
    return (
      <div
        role="status"
        className="rounded-2xl border border-teal-200 bg-teal-50 p-8"
      >
        <h2 className="text-petrol-950 text-xl font-semibold">
          Support request sent
        </h2>
        <p className="mt-3 text-slate-700">
          Thank you for getting in touch. We’ll reply to the email address you
          provided.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-11 items-center font-semibold text-teal-800 underline"
        >
          Back to home
        </Link>
      </div>
    );

  const inputClass =
    "mt-2 w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-base text-slate-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700";
  return (
    <>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        nonce={nonce}
        onReady={() => setReady(true)}
        onError={() =>
          setError(
            "Verification could not load. Please email support@ugurlabs.com.",
          )
        }
      />
      <form onSubmit={submit} className="space-y-6" aria-busy={pending}>
        <fieldset disabled={pending} className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-2">
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="support-name"
            >
              Name
              <input
                id="support-name"
                name="name"
                autoComplete="name"
                required
                maxLength={100}
                className={inputClass}
              />
            </label>
            <label
              className="block text-sm font-semibold text-slate-800"
              htmlFor="support-email"
            >
              Email address
              <input
                id="support-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                className={inputClass}
              />
            </label>
          </div>
          <label
            className="block text-sm font-semibold text-slate-800"
            htmlFor="support-subject"
          >
            Subject
            <input
              id="support-subject"
              name="subject"
              required
              maxLength={160}
              className={inputClass}
            />
          </label>
          <label
            className="block text-sm font-semibold text-slate-800"
            htmlFor="support-message"
          >
            Message
            <textarea
              id="support-message"
              name="message"
              required
              maxLength={10000}
              rows={7}
              aria-describedby="support-message-hint"
              className={inputClass}
            />
          </label>
          <p
            id="support-message-hint"
            className="text-sm leading-6 text-slate-600"
          >
            Describe what happened and what you expected. Please leave out
            passwords, access tokens, and tenant data.
          </p>
          <div hidden aria-hidden="true">
            <label htmlFor="support-website">Website</label>
            <input
              id="support-website"
              name="website"
              tabIndex={-1}
              autoComplete="off"
            />
          </div>
        </fieldset>
        <div ref={container} />
        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}
        <p className="text-sm leading-6 text-slate-600">
          We use your details to respond to your request. Read our{" "}
          <Link href="/privacy-policy" className="text-teal-800 underline">
            privacy policy
          </Link>
          .
        </p>
        <button
          type="submit"
          disabled={pending || !token}
          className="min-h-12 rounded-lg bg-teal-800 px-6 py-3 font-semibold text-white transition-colors hover:bg-teal-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {pending ? "Sending…" : "Send support request"}
        </button>
      </form>
    </>
  );
}
