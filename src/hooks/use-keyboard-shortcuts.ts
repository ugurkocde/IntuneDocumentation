import { useEffect } from "react";

interface KeyboardShortcuts {
  onSelectAll?: () => void;
  onDeselectAll?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
}

export function useKeyboardShortcuts(shortcuts: KeyboardShortcuts, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input field
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable
      ) {
        // Allow Escape in input fields
        if (e.key === "Escape" && shortcuts.onEscape) {
          shortcuts.onEscape();
        }
        return;
      }

      // Ctrl/Cmd + A: Select All
      if ((e.ctrlKey || e.metaKey) && e.key === "a" && shortcuts.onSelectAll) {
        e.preventDefault();
        shortcuts.onSelectAll();
      }

      // Ctrl/Cmd + D: Deselect All
      if ((e.ctrlKey || e.metaKey) && e.key === "d" && shortcuts.onDeselectAll) {
        e.preventDefault();
        shortcuts.onDeselectAll();
      }

      // Ctrl/Cmd + E: Export
      if ((e.ctrlKey || e.metaKey) && e.key === "e" && shortcuts.onExport) {
        e.preventDefault();
        shortcuts.onExport();
      }

      // Ctrl/Cmd + R: Refresh
      if ((e.ctrlKey || e.metaKey) && e.key === "r" && shortcuts.onRefresh) {
        e.preventDefault();
        shortcuts.onRefresh();
      }

      // Ctrl/Cmd + K or /: Focus Search
      if (
        (((e.ctrlKey || e.metaKey) && e.key === "k") || e.key === "/") &&
        shortcuts.onSearch
      ) {
        e.preventDefault();
        shortcuts.onSearch();
      }

      // Escape: Generic escape handler
      if (e.key === "Escape" && shortcuts.onEscape) {
        shortcuts.onEscape();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [shortcuts, enabled]);
}
