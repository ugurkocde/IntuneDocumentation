"use client";

import dynamic from "next/dynamic";
import { Bell } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHANGELOG_SEEN_STORAGE_KEY,
  fetchLatestChangelog,
  type ChangelogFeed,
} from "~/lib/changelog";

const loadChangelogPanel = () => import("~/components/changelog-panel");

const ChangelogPanel = dynamic(
  () => loadChangelogPanel().then((module) => module.ChangelogPanel),
  { ssr: false },
);

export function ChangelogBell() {
  const [isOpen, setIsOpen] = useState(false);
  const [feed, setFeed] = useState<ChangelogFeed | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

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

  const openDialog = () => {
    setIsOpen(true);
    if (!feed && !loading) void loadEntries();
  };

  const preloadPanel = () => {
    void loadChangelogPanel();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openDialog}
        onFocus={preloadPanel}
        onPointerDown={preloadPanel}
        onPointerEnter={preloadPanel}
        aria-label={`Open product updates${hasUnread ? ", unread updates available" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? "product-changelog-dialog" : undefined}
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

      {isOpen && (
        <ChangelogPanel
          feed={feed}
          loading={loading}
          loadError={loadError}
          onClose={closeDialog}
          onRetry={loadEntries}
          returnFocusRef={triggerRef}
        />
      )}
    </>
  );
}
