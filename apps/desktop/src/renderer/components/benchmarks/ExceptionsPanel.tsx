import { Plus, RefreshCw, ShieldOff, Trash2 } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { isActive, isDateOnly, localDate } from "../../../../../../src/lib/benchmarks/exceptions";
import type { BenchmarkException, BenchmarkIdentity } from "../../../shared/ipc-types";
import { useAsyncAction } from "../../hooks/use-async-action";
import { errorMessage, ipc } from "../../lib/ipc";
import { Alert } from "../ui/Alert";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Spinner";

const INPUT =
  "border-petrol-950/12 text-petrol-950 min-h-10 w-full min-w-0 rounded-xl border bg-white px-3 text-[13px] focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-60";
const LABEL = "text-petrol-800 mb-1.5 block text-[12px] font-semibold";

// Accepted differences for the compared benchmark, version and Level, keyed by
// setting id. Main keeps them in the encrypted per tenant store; onChanged
// compares again so the adjusted headline uses them.
export function ExceptionsPanel({
  identity,
  settingIds,
  prefill,
  onChanged,
}: {
  identity: BenchmarkIdentity;
  // Setting ids whose result is Differs (also Missing), offered in the form.
  settingIds: readonly string[];
  // Set by "Add exception" on a result; the nonce repeats the request.
  prefill: { settingId: string; nonce: number } | null;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<BenchmarkException[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [settingId, setSettingId] = useState("");
  const [owner, setOwner] = useState("");
  const [reason, setReason] = useState("");
  const [expiresOn, setExpiresOn] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);
  const save = useAsyncAction();
  const remove = useAsyncAction();
  const panel = useRef<HTMLElement>(null);
  const ownerInput = useRef<HTMLInputElement>(null);
  const requestId = useRef(0);
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

  useEffect(() => {
    if (!prefill) return;
    setSettingId(prefill.settingId);
    setInvalid(null);
    panel.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    ownerInput.current?.focus({ preventScroll: true });
  }, [prefill]);

  const choices = [...new Set([...(settingId ? [settingId] : []), ...settingIds])];
  const selected = settingId || choices[0] || "";

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const problem = !selected
      ? "Choose a setting."
      : !owner.trim()
        ? "Enter an owner."
        : !reason.trim()
          ? "Enter a reason."
          : !isDateOnly(expiresOn)
            ? "Enter an expiry date."
            : expiresOn < today
              ? "The expiry date must be today or later."
              : null;
    setInvalid(problem);
    if (problem) return;
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
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.14em] uppercase">Exceptions</p>
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
                    <code className="selectable text-petrol-950 block font-mono text-[11px] leading-4 break-all">
                      {item.settingId}
                    </code>
                    <p className="text-petrol-700 mt-1 text-xs leading-5 break-words">{item.reason}</p>
                    <p className="text-petrol-600 mt-0.5 flex flex-wrap items-center gap-2 text-[11px]">
                      <span className="break-all">Owner: {item.owner}</span>
                      <Badge variant={active ? "info" : "warning"}>
                        {active ? `Until ${item.expiresOn}` : `Expired ${item.expiresOn}`}
                      </Badge>
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="dangerOutline"
                    icon={Trash2}
                    loading={remove.busy === item.settingId}
                    disabled={Boolean(remove.busy) || save.busy !== null}
                    aria-label={`Remove the exception for ${item.settingId}`}
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
          {choices.length === 0 ? (
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
                    onChange={(event) => setSettingId(event.target.value)}
                    className={`${INPUT} cursor-pointer font-mono text-[12px]`}
                  >
                    {choices.map((id) => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
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
                    onChange={(event) => setOwner(event.target.value)}
                    className={INPUT}
                  />
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
                    onChange={(event) => setExpiresOn(event.target.value)}
                    className={INPUT}
                  />
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
                    onChange={(event) => setReason(event.target.value)}
                    className={`${INPUT} min-h-16 py-2 leading-5`}
                  />
                </div>
              </div>
              {(invalid || save.error) && (
                <p className="mt-2 text-xs text-red-700" role="alert">
                  {invalid ?? save.error}
                </p>
              )}
              <div className="mt-3">
                <Button
                  type="submit"
                  size="sm"
                  icon={Plus}
                  loading={save.busy !== null}
                  disabled={Boolean(remove.busy)}
                >
                  Add exception
                </Button>
              </div>
            </>
          )}
        </form>
      )}
    </section>
  );
}
