"use client";
import { MessageCircle, X, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState } from "react";

export function AppSupportChat({ supportOrigin }: { supportOrigin: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const launcher = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const source = `${supportOrigin}/support-chat`;
  const close = () => {
    setOpen(false);
    launcher.current?.focus();
  };
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      {mounted && (
        <section
          id="app-support-chat"
          role="dialog"
          aria-label="Support chat"
          hidden={!open}
          className="fixed right-4 bottom-24 z-[100] flex h-[min(640px,calc(100dvh-120px))] w-[min(400px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
          style={!open ? { display: "none" } : undefined}
        >
          <header className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-2">
            <span className="font-semibold text-slate-800">Support</span>
            <div className="flex items-center gap-2">
              <a
                href={source}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Open support in a new tab"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              >
                <ExternalLink size={18} />
              </a>
              <button
                ref={closeButton}
                onClick={close}
                aria-label="Close support chat"
                className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
              >
                <X size={20} />
              </button>
            </div>
          </header>
          <iframe
            src={source}
            title="Crisp support chat"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-downloads"
            className="min-h-0 w-full flex-1 border-0"
          />
        </section>
      )}
      <button
        ref={launcher}
        onClick={() => {
          setMounted(true);
          setOpen((value) => !value);
        }}
        aria-label={open ? "Close support chat" : "Open support chat"}
        aria-expanded={open}
        aria-controls={mounted ? "app-support-chat" : undefined}
        className="fixed right-6 bottom-6 z-[100] grid h-14 w-14 place-items-center rounded-full bg-teal-600 text-white shadow-lg transition-colors hover:bg-teal-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-teal-700"
      >
        <MessageCircle size={27} aria-hidden="true" />
      </button>
    </>
  );
}
