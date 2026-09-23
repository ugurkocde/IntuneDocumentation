"use client";

import type { ReactNode } from "react";
import { cn } from "~/lib/utils";

// Native <dialog> opened with showModal(): the browser handles focus
// containment, Escape, and returning focus to the trigger.
export function DialogTrigger({
  dialogId,
  className,
  children,
}: {
  dialogId: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      className={className}
      onClick={() =>
        (
          document.getElementById(dialogId) as HTMLDialogElement | null
        )?.showModal()
      }
    >
      {children}
    </button>
  );
}

export function Dialog({
  id,
  labelledBy,
  className,
  children,
}: {
  id: string;
  labelledBy: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <dialog
      id={id}
      aria-labelledby={labelledBy}
      // Clicks on the backdrop target the dialog element itself
      onClick={(event) => {
        if (event.target === event.currentTarget) event.currentTarget.close();
      }}
      className={cn(
        "backdrop:bg-petrol-950/70 m-auto max-h-[85svh] w-[calc(100%-2rem)] overflow-y-auto overscroll-contain rounded-3xl bg-white p-0 shadow-2xl backdrop:backdrop-blur-sm",
        className,
      )}
    >
      <div className="p-5 sm:p-7">{children}</div>
    </dialog>
  );
}
