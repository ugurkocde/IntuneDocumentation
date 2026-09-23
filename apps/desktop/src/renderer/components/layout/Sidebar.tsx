import {
  ChevronDown,
  ChevronRight,
  Download,
  KeyRound,
  LayoutGrid,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Settings,
  ShieldCheck,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAsyncAction } from "../../hooks/use-async-action";
import { ipc, isMac } from "../../lib/ipc";
import { FAMILIES, familyCounts } from "../../lib/section-catalog";
import { useApp } from "../../state/context";
import { busyBlocker, exportBlocker, licenseView } from "../../state/selectors";
import { Spinner } from "../ui/Spinner";

const EXTENDED_KEY = "intunedoc.sidebar.extended";

interface NavButtonProps {
  isOpen: boolean;
  active: boolean;
  icon: LucideIcon;
  label: string;
  count?: number;
  badge?: { text: string; tone: "teal" | "amber" };
  onClick: () => void;
}

function NavButton({ isOpen, active, icon: Icon, label, count, badge, onClick }: NavButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      aria-label={isOpen ? undefined : label}
      title={isOpen ? undefined : label}
      className={`group relative flex min-h-10 w-full cursor-pointer items-center rounded-xl text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
        isOpen ? "gap-3 px-3" : "justify-center px-2"
      } ${active ? "bg-teal-50 text-teal-700" : "text-petrol-600 hover:bg-mint-50 hover:text-petrol-950"}`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} aria-hidden="true" />
      {isOpen ? (
        <>
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{label}</span>
          {badge && (
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                badge.tone === "amber" ? "bg-amber-100 text-amber-800" : "bg-teal-600 text-white"
              }`}
            >
              {badge.text}
            </span>
          )}
          {typeof count === "number" && (
            <span
              className={`min-w-7 rounded-full px-2 py-0.5 text-center text-[10px] font-bold tabular-nums ${
                active ? "bg-white text-teal-700" : "bg-mint-100 text-petrol-700"
              }`}
            >
              {count.toLocaleString()}
            </span>
          )}
        </>
      ) : (
        badge?.tone === "amber" && (
          <span
            className="absolute top-2 right-2 h-2 w-2 rounded-full border border-white bg-amber-500"
            aria-hidden="true"
          />
        )
      )}
    </button>
  );
}

function GroupLabel({ id, isOpen, children }: { id: string; isOpen: boolean; children: string }) {
  return (
    <p
      id={id}
      className={`text-petrol-600 mb-2 px-3 text-[9px] font-bold tracking-[0.14em] uppercase ${isOpen ? "block" : "sr-only"}`}
    >
      {children}
    </p>
  );
}

function UpdateBanner({ isOpen }: { isOpen: boolean }) {
  const { state } = useApp();
  const { update } = state;
  const [installing, setInstalling] = useState(false);
  if (!["available", "downloading", "ready"].includes(update.state)) return null;
  const ready = update.state === "ready";
  const text = ready
    ? `Version ${update.version ?? ""} is ready`
    : `Downloading ${update.version ? `version ${update.version}` : "update"}${
        typeof update.percent === "number" ? ` (${update.percent}%)` : ""
      }`;
  const install = () => {
    setInstalling(true);
    void ipc.updateInstall().finally(() => setInstalling(false));
  };
  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={ready ? install : undefined}
        disabled={!ready}
        title={ready ? "Restart to update" : text}
        aria-label={ready ? "Restart to update" : text}
        className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-50 text-teal-700 enabled:cursor-pointer enabled:hover:bg-teal-100"
      >
        {ready ? <RefreshCw className="h-[18px] w-[18px]" /> : <Spinner />}
      </button>
    );
  }
  return (
    <div
      className="mb-3 flex items-center gap-3 rounded-2xl border border-teal-600/20 bg-teal-50 px-3.5 py-3"
      role="status"
      aria-live="polite"
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
        {ready ? <RefreshCw className="h-4 w-4" aria-hidden="true" /> : <Spinner />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-petrol-950 truncate text-[13px] font-semibold">
          {ready ? "Update ready" : "Update available"}
        </p>
        <p className="text-petrol-600 truncate text-[11px]">{text}</p>
      </div>
      {ready && (
        <button
          type="button"
          onClick={install}
          disabled={installing}
          className="bg-petrol-950 hover:bg-petrol-800 min-h-8 shrink-0 cursor-pointer rounded-lg px-2.5 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          Restart
        </button>
      )}
    </div>
  );
}

export function Sidebar() {
  const { state, actions } = useApp();
  const { sidebarOpen: isOpen, screen, activeFamilyKey, collection, auth } = state;
  const summary = collection.summary;
  const counts = familyCounts(summary?.sectionCounts);
  const affected = new Set(
    [
      ...(summary?.fetchErrors.map((error) => error.familyKey) ?? []),
      ...(summary?.sectionCounts.filter((section) => section.error).map((section) => section.familyKey) ?? []),
    ].filter(Boolean) as string[],
  );
  const core = FAMILIES.filter((family) => family.group === "core");
  const extended = FAMILIES.filter(
    (family) => family.group === "extended" && ((counts[family.key] ?? 0) > 0 || affected.has(family.key)),
  );
  const [showExtended, setShowExtended] = useState(() => {
    try {
      return window.localStorage.getItem(EXTENDED_KEY) === "true";
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (extended.some((family) => family.key === activeFamilyKey)) setShowExtended(true);
  }, [activeFamilyKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleExtended = () =>
    setShowExtended((value) => {
      try {
        window.localStorage.setItem(EXTENDED_KEY, String(!value));
      } catch {
        // Not critical.
      }
      return !value;
    });

  // Fades the bottom edge of the navigation while more items are below it.
  const navRef = useRef<HTMLElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => setMoreBelow(nav.scrollTop + nav.clientHeight < nav.scrollHeight - 1);
    measure();
    nav.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    for (const child of Array.from(nav.children)) observer.observe(child);
    return () => {
      nav.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, [isOpen, showExtended, extended.length]);

  const sign = useAsyncAction();
  // The Get started steps and the account card already offer sign in.
  const hideSignIn = (screen === "overview" && !summary) || screen === "license";
  const exportReason = exportBlocker(state);
  const exportRunning = state.exportState.phase === "running";
  const licenseKind = licenseView(state).kind;
  const licenseNeedsAction = licenseKind === "none" || licenseKind === "offline" || licenseKind === "saved";
  const busy = busyBlocker(state);

  return (
    <aside
      className={`border-petrol-950/6 relative z-30 flex h-full shrink-0 flex-col border-r bg-white transition-[width] duration-300 motion-reduce:transition-none ${
        isOpen ? "w-72" : "w-[4.5rem]"
      }`}
      aria-label="Main navigation"
    >
      {isMac && <div className="drag-region h-10 shrink-0" aria-hidden="true" />}
      <div
        className={`border-petrol-950/6 flex shrink-0 border-b px-4 pb-3.5 ${isMac ? "" : "pt-4"} ${
          isOpen ? "items-center justify-between gap-2" : "flex-col items-center gap-2"
        }`}
      >
        <div className={`flex min-w-0 items-center ${isOpen ? "gap-2.5" : "justify-center"}`}>
          <img src="./logo.svg" alt="" className="h-9 w-9 shrink-0 rounded-[10px]" draggable={false} />
          {isOpen && (
            <div className="min-w-0 leading-tight">
              <p className="text-petrol-950 truncate text-sm font-bold">Intune Documentation</p>
              <p className="text-petrol-600 truncate text-[11px]">Desktop workspace</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => actions.setSidebar(!isOpen)}
          className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
          aria-label={isOpen ? "Collapse sidebar" : "Expand sidebar"}
          title={isOpen ? "Collapse sidebar" : "Expand sidebar"}
        >
          {isOpen ? <PanelLeftClose className="h-5 w-5" /> : <PanelLeftOpen className="h-5 w-5" />}
        </button>
      </div>

      <nav
        ref={navRef}
        className={`scroll-thin relative min-h-0 flex-1 space-y-5 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 ${
          moreBelow ? "[mask-image:linear-gradient(to_bottom,black_calc(100%-2.5rem),transparent)]" : ""
        }`}
      >
        <section aria-labelledby="nav-main">
          <GroupLabel id="nav-main" isOpen={isOpen}>
            Main
          </GroupLabel>
          <div className="space-y-0.5">
            <NavButton
              isOpen={isOpen}
              active={screen === "overview"}
              icon={LayoutGrid}
              label="Overview"
              count={summary?.totalConfigurations}
              onClick={() => actions.navigate("overview")}
            />
            <NavButton
              isOpen={isOpen}
              active={screen === "compliance"}
              icon={ShieldCheck}
              label="Compliance Evidence"
              onClick={() => actions.navigate("compliance")}
            />
          </div>
        </section>

        <section aria-labelledby="nav-configurations">
          <GroupLabel id="nav-configurations" isOpen={isOpen}>
            Configurations
          </GroupLabel>
          <div className="space-y-0.5">
            {core.map((family) => (
              <NavButton
                key={family.key}
                isOpen={isOpen}
                active={screen === "section" && activeFamilyKey === family.key}
                icon={family.icon}
                label={family.label}
                count={summary ? (counts[family.key] ?? 0) : undefined}
                onClick={() => actions.navigate("section", family.key)}
              />
            ))}
            {extended.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={toggleExtended}
                  aria-expanded={showExtended}
                  aria-label={isOpen ? undefined : `More coverage (${extended.length})`}
                  title={isOpen ? undefined : `More coverage (${extended.length})`}
                  className={`text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex min-h-9 w-full cursor-pointer items-center rounded-xl text-left transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
                    isOpen ? "gap-3 px-3" : "justify-center px-2"
                  }`}
                >
                  {showExtended ? (
                    <ChevronDown className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                  ) : (
                    <ChevronRight className="h-[18px] w-[18px] shrink-0" strokeWidth={1.8} />
                  )}
                  {isOpen && <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">More coverage</span>}
                  {isOpen && !showExtended && (
                    <span className="bg-mint-100 text-petrol-700 min-w-7 rounded-full px-2 py-0.5 text-center text-[10px] font-bold tabular-nums">
                      {extended.length}
                    </span>
                  )}
                </button>
                {showExtended &&
                  extended.map((family) => (
                    <NavButton
                      key={family.key}
                      isOpen={isOpen}
                      active={screen === "section" && activeFamilyKey === family.key}
                      icon={family.icon}
                      label={family.label}
                      count={counts[family.key] ?? 0}
                      onClick={() => actions.navigate("section", family.key)}
                    />
                  ))}
              </>
            )}
          </div>
        </section>

        <section aria-labelledby="nav-workspace">
          <GroupLabel id="nav-workspace" isOpen={isOpen}>
            Workspace
          </GroupLabel>
          <div className="space-y-0.5">
            <NavButton
              isOpen={isOpen}
              active={screen === "license"}
              icon={KeyRound}
              label="License and account"
              badge={licenseNeedsAction ? { text: "Set up", tone: "amber" } : undefined}
              onClick={() => actions.navigate("license")}
            />
            <NavButton
              isOpen={isOpen}
              active={screen === "settings"}
              icon={Settings}
              label="Settings"
              onClick={() => actions.navigate("settings")}
            />
          </div>
        </section>
      </nav>

      <div className="border-petrol-950/6 shrink-0 border-t px-3 pt-4 pb-4">
        <UpdateBanner isOpen={isOpen} />
        {isOpen ? (
          <div
            className={`rounded-2xl border p-4 transition-colors short:p-2 ${
              screen === "export" ? "border-teal-600/25 bg-teal-50" : "border-petrol-950/6 bg-mint-50"
            }`}
          >
            <div className="flex items-center gap-2.5 short:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-teal-700">
                {exportRunning ? <Spinner /> : <Download className="h-4 w-4" aria-hidden="true" />}
              </span>
              <div className="min-w-0">
                <p className="text-petrol-950 truncate text-sm font-semibold">Export documentation</p>
                <p className="text-petrol-600 mt-0.5 truncate text-xs tabular-nums">
                  {exportRunning
                    ? `Exporting, ${state.exportState.percent}%`
                    : summary
                      ? `${summary.totalConfigurations.toLocaleString()} configurations ready`
                      : "Nothing collected yet"}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => actions.navigate("export")}
              disabled={Boolean(exportReason) && !exportRunning && state.exportState.phase === "form"}
              title={exportReason ?? undefined}
              className="bg-petrol-950 enabled:hover:bg-petrol-800 disabled:bg-mint-100 disabled:text-petrol-600 mt-3.5 flex min-h-10 short:mt-0 w-full cursor-pointer items-center justify-center rounded-xl px-4 text-[13px] font-semibold text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed"
            >
              {exportRunning
                ? "View progress"
                : state.exportState.phase === "done"
                  ? "View export"
                  : collection.running
                    ? "Available after collection"
                    : "Export"}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => actions.navigate("export")}
            disabled={Boolean(exportReason) && !exportRunning && state.exportState.phase === "form"}
            className="bg-petrol-950 enabled:hover:bg-petrol-800 disabled:bg-mint-100 disabled:text-petrol-600 mx-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-white transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed"
            aria-label="Export documentation"
            title={exportReason ?? "Export documentation"}
          >
            {exportRunning ? <Spinner className="h-[18px] w-[18px] text-white" /> : <Download className="h-[18px] w-[18px]" />}
          </button>
        )}

        {isOpen ? (
          <div className="mt-3 flex items-center gap-2.5 px-1">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700">
              <User className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-petrol-800 truncate text-[13px] font-semibold" title={auth?.account ?? undefined}>
                {auth?.signedIn ? auth.account : "Not signed in"}
              </p>
              <p className="text-petrol-600 truncate text-[11px]">
                {sign.error ? sign.error : auth?.signedIn ? "Signed in" : "Sign in to collect"}
              </p>
            </div>
            {auth?.signedIn ? (
              <button
                type="button"
                onClick={() => void sign.run("out", () => actions.signOut())}
                disabled={Boolean(sign.busy) || Boolean(busy)}
                className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="Sign out"
                title={busy ?? "Sign out"}
              >
                {sign.busy ? <Spinner /> : <LogOut className="h-4 w-4" />}
              </button>
            ) : hideSignIn ? null : (
              <button
                type="button"
                onClick={() => void sign.run("in", () => actions.signIn())}
                disabled={Boolean(sign.busy) || Boolean(busy)}
                title={busy ?? undefined}
                className="bg-petrol-950 hover:bg-petrol-800 inline-flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg px-2.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {sign.busy ? <Spinner className="h-3.5 w-3.5 text-white" /> : <LogIn className="h-3.5 w-3.5" />}
                Sign in
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() =>
              void sign.run(auth?.signedIn ? "out" : "in", () =>
                auth?.signedIn ? actions.signOut() : actions.signIn(),
              )
            }
            disabled={Boolean(sign.busy) || Boolean(busy)}
            className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 mx-auto mt-3 flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none disabled:opacity-40"
            aria-label={auth?.signedIn ? `Sign out ${auth.account ?? ""}` : "Sign in"}
            title={busy ?? (auth?.signedIn ? `Sign out (${auth.account ?? ""})` : "Sign in")}
          >
            {sign.busy ? <Spinner /> : auth?.signedIn ? <LogOut className="h-[18px] w-[18px]" /> : <LogIn className="h-[18px] w-[18px]" />}
          </button>
        )}
      </div>
    </aside>
  );
}
