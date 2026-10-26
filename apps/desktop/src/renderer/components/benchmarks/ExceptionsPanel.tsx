import { Pencil, Plus, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { isActive, isDateOnly, localDate } from "../../../../../../src/lib/benchmarks/exceptions";
import type { BenchmarkException, BenchmarkIdentity } from "../../../shared/ipc-types";
import { useAsyncAction } from "../../hooks/use-async-action";
import {
  exceptionChoiceLabel,
  exceptionChoiceSetting,
  formatDay,
  type ExceptionChoice,
} from "../../lib/benchmarks-view";
import { errorMessage, ipc } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const INPUT =
  "border-petrol-950/12 text-petrol-950 min-h-10 w-full min-w-0 rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:opacity-60";
const LABEL = "text-petrol-800 mb-1.5 block text-[12px] font-semibold";
const INVALID = "border-red-600";

type Field = "setting" | "owner" | "reason" | "expires";
const FIELDS: readonly Field[] = ["setting", "owner", "reason", "expires"];

// Accepted differences for the compared benchmark, version and Level, keyed by
// setting id. Main keeps them in the encrypted per tenant store; onChanged
// compares again so the adjusted headline uses them.
export function ExceptionsPanel({
  identity,
  choices,
  prefill,
  onChanged,
  nameOf,
  onItems,
}: {
  identity: BenchmarkIdentity;
  // Settings whose result is Differs (also Missing), offered in the form.
  choices: readonly ExceptionChoice[];
  // Set by "Add exception" on a result; the nonce repeats the request.
  prefill: { settingId: string; nonce: number } | null;
  onChanged: () => void;
  // The display name of a setting, its id when no definition names it.
  nameOf: (settingId: string) => string;
  // The exceptions as loaded or changed, for the rows of the list.
  onItems?: (items: readonly BenchmarkException[]) => void;
}) {
  const [items, setItems] = useState<BenchmarkException[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [settingId, setSettingId] = useState("");
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [invalid, setInvalid] = useState<Partial<Record<Field, string>>>({});
  const save = useAsyncAction();
  const remove = useAsyncAction();
  const panel = useRef<HTMLElement>(null);
  const ownerInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
  // The exception whose values fill the form, so they are cleared again
  // when another setting is chosen.
  const filledFrom = useRef<string | null>(null);
  const ids = useId();
  const today = localDate();
  const key = JSON.stringify([identity.benchmark, identity.version, identity.level]);

  useEffect(() => {
    const id = ++requestId.current;
    setItems(null);
    setLoadError(null);
    ipc
      .benchmarksExceptions({ action: "list", ...identity })
      .then((list) => {
        if (id === requestId.current) setItems(list);
      })
      .catch((caught) => {
        if (id === requestId.current) setLoadError(errorMessage(caught));
      });
    // identity is represented by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reload]);

  // Nothing is shown on the rows while the list loads or failed to load.
  useEffect(() => {
    onItems?.(items ?? []);
    // onItems is a callback of the parent; items drive this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  useEffect(() => {
    if (!prefill) return;
    setSettingId(prefill.settingId);
    setInvalid({});
    panel.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    ownerInput.current?.focus({ preventScroll: true });
  }, [prefill]);

  // A prefilled setting stays offered even when it no longer differs.
  const options = [
    ...(settingId && !choices.some((choice) => choice.settingId === settingId)
      ? [{ settingId, name: nameOf(settingId), recommendationIds: [], recommendationTitles: [] }]
      : []),
    ...choices,
  ];
  const selected = settingId || options[0]?.settingId || "";
  const chosen = options.find((choice) => choice.settingId === selected);
  const existing = items?.find((item) => item.settingId === selected);

  // Choosing a setting that already has an exception fills the form with
  // it, to change and save as the replacement; choosing another clears it.
  useEffect(() => {
    if (existing && filledFrom.current !== existing.settingId) {
      filledFrom.current = existing.settingId;
      setOwner(existing.owner);
      setReason(existing.reason);
      setExpiresOn(isActive(existing, today) ? existing.expiresOn : "");
    } else if (!existing && filledFrom.current) {
      filledFrom.current = null;
      setOwner("");
      setReason("");
      setExpiresOn("");
    }
    // existing is found by its setting id; today is stable within a render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.settingId]);

  const error = (field: Field) => invalid[field] ?? null;
  const describe = (field: Field, extra?: string) =>
    [extra, invalid[field] ? `${ids}-${field}-error` : undefined].filter(Boolean).join(" ") || undefined;
  const fieldError = (field: Field) =>
    invalid[field] && (
      <p id={`${ids}-${field}-error`} className="mt-1 text-xs text-red-700">
        {invalid[field]}
      </p>
    );

  // Every problem at once, each by its field; the first gets the focus.
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problems: Partial<Record<Field, string>> = {};
    if (!selected) problems.setting = "Choose a setting.";
    if (!owner.trim()) problems.owner = "Enter an owner.";
    if (!reason.trim()) problems.reason = "Enter a reason.";
    if (!isDateOnly(expiresOn)) problems.expires = "Enter an expiry date.";
    else if (expiresOn < today) problems.expires = "The expiry date must be today or later.";
    setInvalid(problems);
    const first = FIELDS.find((field) => problems[field]);
    if (first) {
      document.getElementById(`${ids}-${first}`)?.focus();
      return;
    }
    void save.run("set", async () => {
      const list = await ipc.benchmarksExceptions({
        action: "set",
        ...identity,
        settingId: selected,
        owner: owner.trim(),
        reason: reason.trim(),
        expiresOn,
      });
      setItems(list);
      filledFrom.current = null;
      setSettingId("");
      setOwner("");
      setReason("");
      setExpiresOn("");
      onChanged();
    });
  };

  const removeOne = useCallback(
    (id: string) =>
      void remove.run(id, async () => {
        setItems(await ipc.benchmarksExceptions({ action: "remove", ...identity, settingId: id }));
        onChanged();
      }),
    // identity is represented by key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, onChanged, remove.run],
  );

  return (
    <section
      ref={panel}
      aria-labelledby={`${ids}-title`}
      className="border-petrol-950/6 shadow-card scroll-mt-6 rounded-2xl border bg-white p-5 @xl:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <ShieldOff className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-petrol-600 text-[11px] font-bold tracking-[0.14em] uppercase">Exceptions</p>
          <h2 id={`${ids}-title`} className="text-petrol-950 mt-1 text-base font-semibold tracking-[-0.01em]">
            Accepted differences
          </h2>
          <p className="text-petrol-600 mt-1 max-w-2xl text-xs leading-5">
            An exception accepts a setting that differs until its expiry date, with an owner and a reason. Each
            change compares again, and the headline then shows the rate with exclusions next to the unchanged rate.
          </p>
        </div>
      </div>

      <div className="mt-4">
        {loadError ? (
          <Alert
            tone="danger"
            title="The exceptions could not be loaded"
            action={
              <Button size="sm" variant="secondary" icon={RefreshCw} onClick={() => setReload((value) => value + 1)}>
                Try again
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : items === null ? (
          <p className="text-petrol-600 flex items-center gap-2 text-xs" role="status">
            <Spinner className="h-3.5 w-3.5" /> Loading exceptions
          </p>
        ) : items.length === 0 ? (
          <p className="text-petrol-600 text-xs">No exception is recorded for this benchmark, version and Level.</p>
        ) : (
          <ul className="divide-petrol-950/6 divide-y" aria-label="Exceptions">
            {items.map((item) => {
              const active = isActive(item, today);
              return (
                <li key={item.settingId} className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1 basis-64">
                    {nameOf(item.settingId) !== item.settingId && (
                      <p className="text-petrol-950 text-[13px] leading-5 font-semibold break-words">
                        {nameOf(item.settingId)}
                      </p>
                    )}
                    <code className="selectable text-petrol-700 block font-mono text-[11px] leading-4 break-all">
                      {item.settingId}
                    </code>
                    <p className="text-petrol-700 mt-1 text-xs leading-5 break-words">{item.reason}</p>
                    <p className="text-petrol-600 mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="break-all">Owner: {item.owner}</span>
                      <Badge variant={active ? "info" : "warning"} className="text-[11px]">
                        {active ? `Until ${formatDay(item.expiresOn)}` : `Expired ${formatDay(item.expiresOn)}`}
                      </Badge>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="dangerOutline"
                    icon={Trash2}
                    loading={remove.busy === item.settingId}
                    disabled={Boolean(remove.busy) || save.busy !== null}
                    aria-label={`Remove the exception for ${nameOf(item.settingId)}`}
                    onClick={() => removeOne(item.settingId)}
                  >
                    Remove
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
        {remove.error && (
          <p className="mt-2 text-xs text-red-700" role="alert">
            {remove.error}
          </p>
        )}
      </div>

      {!loadError && (
        <form
          onSubmit={submit}
          className="border-petrol-950/6 mt-5 border-t pt-5"
          aria-label="Add an exception"
          noValidate
        >
          {options.length === 0 ? (
            <p className="text-petrol-600 text-xs">
              No setting differs or is missing in this comparison, so there is nothing to accept.
            </p>
          ) : (
            <>
              <div className="grid gap-3 @3xl:grid-cols-2">
                <div className="min-w-0 @3xl:col-span-2">
                  <label htmlFor={`${ids}-setting`} className={LABEL}>
                    Setting
                  </label>
                  <select
                    id={`${ids}-setting`}
                    value={selected}
                    disabled={save.busy !== null}
                    aria-invalid={error("setting") ? true : undefined}
                    aria-describedby={describe("setting", chosen ? `${ids}-setting-id` : undefined)}
                    onChange={(event) => {
                      setSettingId(event.target.value);
                      // Errors belong to the values of the setting that was chosen.
                      setInvalid({});
                    }}
                    className={`${INPUT} cursor-pointer ${error("setting") ? INVALID : ""}`}
                  >
                    {options.map((choice) => (
                      <option key={choice.settingId} value={choice.settingId} title={choice.settingId}>
                        {exceptionChoiceLabel(choice)}
                      </option>
                    ))}
                  </select>
                  {chosen && (
                    <p id={`${ids}-setting-id`} className="text-petrol-700 selectable mt-1 text-xs break-all">
                      Setting: {exceptionChoiceSetting(chosen)}
                    </p>
                  )}
                  {fieldError("setting")}
                  {existing && (
                    <p className="text-petrol-800 mt-2 rounded-xl border border-teal-600/20 bg-teal-50 px-3 py-2 text-xs leading-5" role="status">
                      This setting already has an exception, {isActive(existing, today) ? "accepted until" : "expired on"}{" "}
                      {formatDay(existing.expiresOn)}. Saving replaces it.
                    </p>
                  )}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${ids}-owner`} className={LABEL}>
                    Owner
                  </label>
                  <input
                    ref={ownerInput}
                    id={`${ids}-owner`}
                    value={owner}
                    maxLength={100}
                    autoComplete="off"
                    disabled={save.busy !== null}
                    aria-invalid={error("owner") ? true : undefined}
                    aria-describedby={describe("owner")}
                    onChange={(event) => setOwner(event.target.value)}
                    className={`${INPUT} ${error("owner") ? INVALID : ""}`}
                  />
                  {fieldError("owner")}
                </div>
                <div className="min-w-0">
                  <label htmlFor={`${ids}-expires`} className={LABEL}>
                    Expires on
                  </label>
                  <input
                    id={`${ids}-expires`}
                    type="date"
                    value={expiresOn}
                    min={today}
                    disabled={save.busy !== null}
                    aria-invalid={error("expires") ? true : undefined}
                    aria-describedby={describe("expires")}
                    onChange={(event) => setExpiresOn(event.target.value)}
                    className={`${INPUT} ${error("expires") ? INVALID : ""}`}
                  />
                  {fieldError("expires")}
                </div>
                <div className="min-w-0 @3xl:col-span-2">
                  <label htmlFor={`${ids}-reason`} className={LABEL}>
                    Reason
                  </label>
                  <textarea
                    id={`${ids}-reason`}
                    value={reason}
                    maxLength={500}
                    rows={2}
                    disabled={save.busy !== null}
                    aria-invalid={error("reason") ? true : undefined}
                    aria-describedby={describe("reason")}
                    onChange={(event) => setReason(event.target.value)}
                    className={`${INPUT} min-h-16 py-2 leading-5 ${error("reason") ? INVALID : ""}`}
                  />
                  {fieldError("reason")}
                </div>
              </div>
              {save.error && (
                <p className="mt-2 text-xs text-red-700" role="alert">
                  {save.error}
                </p>
              )}
              <div className="mt-3">
                <Button
                  type="submit"
                  size="sm"
                  icon={existing ? Pencil : Plus}
                  loading={save.busy !== null}
                  disabled={Boolean(remove.busy)}
                >
                  {existing ? "Replace exception" : "Add exception"}
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
