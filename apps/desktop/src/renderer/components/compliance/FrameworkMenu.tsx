import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from "react";
import { FrameworkBadge } from "../../../../../../src/components/dashboard/framework-badge";
import type { ComplianceFrameworkId, ComplianceFrameworkSummary } from "../../../shared/ipc-types";
import { FRAMEWORK_OPTIONS, frameworkOption } from "../../lib/compliance-frameworks";

// Port of the website's framework switcher: a menu button with arrow key,
// Home, End and Escape handling that closes on an outside click.
export function FrameworkMenu({
  selectedId,
  summaries,
  onSelect,
  onShowAll,
  triggerRef,
}: {
  selectedId: ComplianceFrameworkId;
  summaries: ComplianceFrameworkSummary[];
  onSelect: (id: ComplianceFrameworkId) => void;
  onShowAll: () => void;
  triggerRef: Ref<HTMLButtonElement>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const localTrigger = useRef<HTMLButtonElement | null>(null);
  const option = frameworkOption(selectedId);

  const close = () => {
    setOpen(false);
    localTrigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) close();
    };
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    menuRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"][data-selected="true"]')?.focus();
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
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

  return (
    <div ref={menuRef} className="no-drag relative shrink-0">
      <button
        ref={(node) => {
          localTrigger.current = node;
          if (typeof triggerRef === "function") triggerRef(node);
          else if (triggerRef) triggerRef.current = node;
        }}
        type="button"
        aria-label={`Selected framework: ${option?.label ?? selectedId}. Change framework`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="border-petrol-950/10 text-petrol-950 hover:bg-mint-50 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border bg-white py-1.5 pr-3 pl-2 text-[13px] font-semibold shadow-sm transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <FrameworkBadge frameworkId={selectedId} size={24} />
        <span>{option?.shortLabel ?? selectedId}</span>
        <ChevronDown
          className={`text-petrol-600 h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div
          role="menu"
          aria-label="Choose a compliance framework"
          onKeyDown={onMenuKeyDown}
          className="border-petrol-950/10 animate-dialog-in absolute top-[calc(100%+0.5rem)] right-0 z-30 max-h-[min(34rem,calc(100vh-9rem))] w-72 overflow-y-auto rounded-2xl border bg-white p-1.5 shadow-[0_12px_48px_-12px_rgba(8,47,54,0.3)]"
        >
          {FRAMEWORK_OPTIONS.map((framework) => {
            const selected = framework.id === selectedId;
            const summary = summaries.find((item) => item.id === framework.id);
            return (
              <button
                key={framework.id}
                type="button"
                role="menuitem"
                data-selected={selected ? "true" : undefined}
                onClick={() => {
                  onSelect(framework.id);
                  close();
                }}
                className={`flex min-h-12 w-full cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                  selected ? "bg-mint-50 text-petrol-950" : "text-petrol-700 hover:bg-mint-50/70 hover:text-petrol-950"
                }`}
              >
                <FrameworkBadge frameworkId={framework.id} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold">
                    {framework.label}
                    {selected && <span className="sr-only">, currently selected</span>}
                  </span>
                  {summary && <span className="text-petrol-600 mt-0.5 block truncate text-[10px]">{summary.version}</span>}
                </span>
                {selected && <Check className="h-4 w-4 shrink-0 text-teal-700" aria-hidden="true" />}
              </button>
            );
          })}
          <div className="border-petrol-950/8 mt-1 border-t pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onShowAll();
              }}
              className="text-petrol-700 hover:bg-mint-50 hover:text-petrol-950 min-h-11 w-full cursor-pointer rounded-xl px-3 text-left text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              Show all frameworks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
