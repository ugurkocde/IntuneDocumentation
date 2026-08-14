"use client";

import { Bell, ExternalLink, RefreshCw, Sparkles, X } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  CHANGELOG_ARCHIVE_URL,
  CHANGELOG_SEEN_STORAGE_KEY,
  fetchLatestChangelog,
  formatChangelogDate,
  type ChangelogFeed,
} from "~/lib/changelog";

const FOCUSABLE_ELEMENTS = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE_ELEMENTS),
  ).filter((element) => !element.hasAttribute("hidden"));
}

export function ChangelogBell() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [feed, setFeed] = useState<ChangelogFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setMounted(true), []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const nextFeed = await fetchLatestChangelog();
      setFeed(nextFeed);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (feed) return;

    const idleWindow = window as Window & {
      requestIdleCallback?: typeof window.requestIdleCallback;
      cancelIdleCallback?: typeof window.cancelIdleCallback;
    };
    if (
      typeof idleWindow.requestIdleCallback === "function" &&
      typeof idleWindow.cancelIdleCallback === "function"
    ) {
      const idleId = idleWindow.requestIdleCallback(() => void loadEntries(), {
        timeout: 2500,
      });
      return () => idleWindow.cancelIdleCallback?.(idleId);
    }

    const timeoutId = globalThis.setTimeout(() => void loadEntries(), 1600);
    return () => globalThis.clearTimeout(timeoutId);
  }, [feed, loadEntries]);

  useEffect(() => {
    const latestEntryId = feed?.entries[0]?.id;
    if (!latestEntryId) {
      setHasUnread(false);
      return;
    }

    try {
      if (isOpen) {
        window.localStorage.setItem(CHANGELOG_SEEN_STORAGE_KEY, latestEntryId);
        setHasUnread(false);
      } else {
        setHasUnread(
          window.localStorage.getItem(CHANGELOG_SEEN_STORAGE_KEY) !==
            latestEntryId,
        );
      }
    } catch {
      setHasUnread(false);
    }
  }, [feed, isOpen]);

  const closeDialog = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) return;

    const dialog = dialogRef.current;
    const previouslyFocused = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeDialog();
        return;
      }

      if (event.key !== "Tab" || !dialog) return;
      const focusableElements = getFocusableElements(dialog);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus();
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [closeDialog, isOpen]);

  const openDialog = () => {
    setIsOpen(true);
    if (!feed && !loading) void loadEntries();
  };

  const handleDialogKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Tab" && event.currentTarget === document.activeElement) {
      event.preventDefault();
      getFocusableElements(event.currentTarget)[0]?.focus();
    }
  };

  const panel =
    mounted && isOpen
      ? createPortal(
          <div className="changelog-layer fixed inset-0 flex justify-end">
            <button
              type="button"
              tabIndex={-1}
              aria-hidden="true"
              onClick={closeDialog}
              className="bg-petrol-950/55 absolute inset-0 cursor-default backdrop-blur-[2px]"
            />
            <section
              ref={dialogRef}
              id="product-changelog-dialog"
              role="dialog"
              aria-modal="true"
              aria-labelledby="product-changelog-title"
              aria-describedby="product-changelog-description"
              tabIndex={-1}
              onKeyDown={handleDialogKeyDown}
              className="changelog-sheet border-petrol-950/10 shadow-soft flex h-dvh w-full flex-col overflow-hidden bg-white sm:w-[28rem] sm:border-l"
            >
              <header className="changelog-sheet-header border-petrol-950/8 flex items-start justify-between gap-5 border-b px-5 pb-5 sm:px-7 sm:pb-6">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
                    <Sparkles className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div>
                    <h2
                      id="product-changelog-title"
                      className="text-petrol-950 text-xl font-semibold tracking-[-0.02em]"
                    >
                      What&apos;s New
                    </h2>
                    <p
                      id="product-changelog-description"
                      className="text-petrol-600 mt-1 text-sm leading-5"
                    >
                      Recent Intune Documentation updates
                    </p>
                  </div>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={closeDialog}
                  aria-label="Close product updates"
                  className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </header>

              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-6 sm:px-7">
                {loading && !feed && (
                  <div
                    role="status"
                    aria-label="Loading product updates"
                    className="space-y-6"
                  >
                    {[0, 1, 2].map((item) => (
                      <div key={item} className="space-y-3">
                        <div className="skeleton h-3 w-24 rounded-full" />
                        <div className="skeleton h-5 w-4/5 rounded-full" />
                        <div className="space-y-2">
                          <div className="skeleton h-3 w-full rounded-full" />
                          <div className="skeleton h-3 w-2/3 rounded-full" />
                        </div>
                      </div>
                    ))}
                    <span className="sr-only">Loading updates…</span>
                  </div>
                )}

                {loadError && !feed && (
                  <div
                    className="border-petrol-950/8 bg-mint-50 flex min-h-52 flex-col items-center justify-center rounded-2xl border p-6 text-center"
                    role="status"
                  >
                    <p className="text-petrol-950 font-semibold">
                      Updates are temporarily unavailable
                    </p>
                    <p className="text-petrol-600 mt-2 max-w-xs text-sm leading-6">
                      The rest of Intune Documentation is unaffected. You can
                      retry whenever you&apos;re ready.
                    </p>
                    <button
                      type="button"
                      onClick={() => void loadEntries()}
                      className="border-petrol-950/12 text-petrol-800 hover:bg-mint-100 mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border bg-white px-4 text-sm font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                    >
                      <RefreshCw className="h-4 w-4" aria-hidden="true" />
                      Try again
                    </button>
                  </div>
                )}

                {feed && feed.entries.length === 0 && (
                  <div className="border-petrol-950/8 bg-mint-50 flex min-h-52 flex-col items-center justify-center rounded-2xl border p-6 text-center">
                    <Bell
                      className="h-6 w-6 text-teal-700"
                      aria-hidden="true"
                    />
                    <p className="text-petrol-950 mt-4 font-semibold">
                      No updates published yet
                    </p>
                    <p className="text-petrol-600 mt-2 max-w-xs text-sm leading-6">
                      New product improvements will appear here as they ship.
                    </p>
                  </div>
                )}

                {feed && feed.entries.length > 0 && (
                  <ol className="changelog-entry-list space-y-7">
                    {feed.entries.map((entry) => (
                      <li
                        key={entry.id}
                        className="border-petrol-950/8 border-b pb-7 last:border-0 last:pb-0"
                      >
                        <article id={`change-${entry.id.toLowerCase()}`}>
                          <time
                            dateTime={entry.publishedOn}
                            className="text-petrol-600 text-xs font-semibold tracking-wide"
                          >
                            {formatChangelogDate(entry.publishedOn)}
                          </time>
                          <h3 className="text-petrol-950 mt-2 text-base leading-6 font-semibold break-words">
                            {entry.title}
                          </h3>
                          <p className="text-petrol-600 mt-2 text-sm leading-6 break-words">
                            {entry.summary}
                          </p>
                          {entry.sourceUrl && (
                            <a
                              href={entry.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-teal-700 transition-colors hover:text-teal-600 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
                            >
                              View source
                              <ExternalLink
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </a>
                          )}
                        </article>
                      </li>
                    ))}
                  </ol>
                )}
              </div>

              <footer className="changelog-sheet-footer border-petrol-950/8 border-t bg-white px-5 pt-4 sm:px-7">
                <a
                  href={CHANGELOG_ARCHIVE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-petrol-950 hover:bg-petrol-800 flex min-h-11 w-full items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
                >
                  View All Updates
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </footer>
            </section>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        aria-label={`Open product updates${hasUnread ? ", unread updates available" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls="product-changelog-dialog"
        className="text-petrol-700 hover:text-petrol-950 relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors hover:bg-white focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
      >
        <Bell className="h-5 w-5" aria-hidden="true" />
        {hasUnread && (
          <span
            className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full border-2 border-white bg-teal-600"
            aria-hidden="true"
          />
        )}
      </button>
      {panel}
    </>
  );
}
