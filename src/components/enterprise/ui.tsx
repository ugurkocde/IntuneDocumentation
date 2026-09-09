"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { X, FolderOpen, ArrowUpRight } from "lucide-react";
export function Badge({ value }: { value: string }) {
  return (
    <span
      className={`ent-badge ${["failed", "error", "critical", "revoked", "disconnected"].includes(value) ? "bad" : ["partial", "pending", "collecting", "open", "trialing", "high", "past_due"].includes(value) ? "warn" : ["archived", "expired", "superseded", "queued"].includes(value) ? "neutral" : ""}`}
    >
      {value.replaceAll("_", " ")}
    </span>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="ent-empty">
      <FolderOpen size={31} strokeWidth={1.3} />
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="ent-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Modal({
  title,
  children,
  close,
}: {
  title: string;
  children: ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog ref={ref} className="ent-dialog" onCancel={close}>
      <header className="ent-card-head">
        <h2>{title}</h2>
        <button className="ent-icon" onClick={close} aria-label="Close dialog">
          <X size={19} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
export function DateLabel({ value }: { value?: string | null }) {
  return (
    <>
      {value
        ? new Date(value).toLocaleString(undefined, {
            dateStyle: "medium",
            timeStyle: "short",
          })
        : "Not yet"}
    </>
  );
}
export function Support() {
  return (
    <a className="ent-button" href="mailto:support@ugurlabs.com">
      Email support <ArrowUpRight size={14} />
    </a>
  );
}
