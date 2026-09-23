import { ChevronDown, Download, File, FileText } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import type { ExportFormat } from "../../state/types";

const MENU_WIDTH = 200;
const MENU_HEIGHT = 108;

const FORMATS: Array<{ format: ExportFormat; label: string; spoken: string; icon: typeof FileText }> = [
  { format: "pdf", label: "Export PDF", spoken: "PDF", icon: FileText },
  { format: "docx", label: "Export Word", spoken: "Word document", icon: File },
];

// A menu button offering the PDF and Word exports of one target. Keyboard
// handling follows FrameworkMenu: arrow keys, Home, End, Escape and Tab. The
// menu renders into the body so scrolling lists and cards never clip it.
export function ExportMenu({
  targetName,
  onExport,
  disabledReason,
  triggerLabel = "Export",
  compact = false,
}: {
  // Used in the accessible names, for example "Export Ring 3 as PDF".
  targetName: string;
  onExport: (format: ExportFormat) => void;
  disabledReason: string | null;
  triggerLabel?: string;
  // A quieter trigger for list rows; its text hides below the container
  // breakpoint.
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const disabled = Boolean(disabledReason);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };

  // Below the trigger, or above it when the window has no room below.
  const place = () => {
    if (!trigger.current) return;
    const rect = trigger.current.getBoundingClientRect();
    const right = Math.max(8, window.innerWidth - rect.right);
    setPosition(
      rect.bottom + 6 + MENU_HEIGHT > window.innerHeight - 8
        ? { bottom: window.innerHeight - rect.top + 6, right }
        : { top: rect.bottom + 6, right },
    );
  };

  useLayoutEffect(() => {
    if (open) place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menu.current?.contains(target) || trigger.current?.contains(target)) return;
      close(false);
    };
    // The menu is fixed, so it follows its trigger when the list scrolls.
    document.addEventListener("mousedown", onPointer);
    window.addEventListener("resize", place);
    document.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      window.removeEventListener("resize", place);
      document.removeEventListener("scroll", place, true);
    };
  }, [open]);

  useEffect(() => {
    if (disabled) setOpen(false);
  }, [disabled]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      close(true);
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    const current = items.indexOf(document.activeElement as HTMLButtonElement);
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length;
    items[next]?.focus();
  };

  const button = (
    <button
      ref={trigger}
      type="button"
      disabled={disabled}
      aria-label={`${triggerLabel} ${targetName}`}
      aria-haspopup="menu"
      aria-expanded={open}
      title={compact && !disabled ? `${triggerLabel} ${targetName}` : undefined}
      onClick={() => setOpen((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          setOpen(true);
        }
      }}
      className={`hover:border-petrol-950/20 hover:bg-mint-50 hover:text-petrol-950 inline-flex min-h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl border px-2.5 text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-1 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent ${
        open
          ? "bg-mint-50 border-petrol-950/20 text-petrol-950"
          : compact
            ? "text-petrol-700 border-transparent"
            : "border-petrol-950/10 text-petrol-800 bg-white"
      }`}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span className={compact ? "hidden @3xl:inline" : undefined}>{triggerLabel}</span>
      <ChevronDown
        className={`text-petrol-600 h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
        aria-hidden="true"
      />
    </button>
  );

  return (
    <>
      {disabled ? (
        <span className="inline-flex shrink-0 cursor-not-allowed" title={disabledReason ?? undefined}>
          {button}
        </span>
      ) : (
        button
      )}
      {open &&
        createPortal(
          <div
            ref={menu}
            role="menu"
            aria-label={`Export ${targetName}`}
            onKeyDown={onMenuKeyDown}
            style={{ ...position, width: MENU_WIDTH }}
            className="border-petrol-950/10 animate-dialog-in fixed z-50 rounded-2xl border bg-white p-1.5 shadow-[0_12px_48px_-12px_rgba(8,47,54,0.3)]"
          >
            {FORMATS.map(({ format, label, spoken, icon: Icon }) => (
              <button
                key={format}
                type="button"
                role="menuitem"
                aria-label={`Export ${targetName} as ${spoken}`}
                onClick={() => {
                  close(true);
                  onExport(format);
                }}
                className="text-petrol-800 hover:bg-mint-50 hover:text-petrol-950 flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 text-left text-[13px] font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                <Icon className="h-4 w-4 text-teal-700" aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}
