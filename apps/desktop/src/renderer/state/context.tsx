import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  type Dispatch,
  type ReactNode,
} from "react";
import type {
  AppSettings,
  FullCollectionSummary,
  UpdateStatus,
} from "../../shared/ipc-types";
import { errorMessage, ipc } from "../lib/ipc";
import { createInitialState, persistSidebar, reducer } from "./reducer";
import type { Action, AppState, Screen } from "./types";
import { loadWizardState } from "./wizard-persistence";

export interface AppActions {
  navigate(screen: Screen, familyKey?: string | null): void;
  setSidebar(open: boolean): void;
  refreshAuth(): Promise<void>;
  refreshLicense(): Promise<void>;
  signIn(options?: { consent?: boolean }): Promise<void>;
  signOut(): Promise<void>;
  collect(): Promise<void>;
  cancelCollect(): Promise<void>;
  loadSection(key: string): Promise<void>;
  syncCollection(): Promise<void>;
  saveSettings(settings: AppSettings): Promise<AppSettings>;
  openWizard(): void;
  closeWizard(): void;
  checkForUpdates(): Promise<void>;
}

interface AppContextValue {
  state: AppState;
  dispatch: Dispatch<Action>;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, createInitialState);
  const stateRef = useRef(state);
  stateRef.current = state;

  const actions = useMemo<AppActions>(() => {
    const refreshAuth = async () => {
      const auth = await ipc.authStatus().catch(() => null);
      dispatch({ type: "auth", auth });
    };
    const refreshLicense = async () => {
      const license = await ipc.licenseStatus().catch(() => null);
      dispatch({ type: "license", license });
    };
    const navigate = (screen: Screen, familyKey?: string | null) =>
      dispatch({ type: "navigate", screen, familyKey });
    // Main keeps the collection; this brings the store in line with it, for
    // example after the wizard or after a sign-out made elsewhere. A running
    // collection reports its own result.
    const syncCollection = async () => {
      if (stateRef.current.collection.running) return;
      let last: FullCollectionSummary | null;
      try {
        last = await ipc.collectLast();
      } catch {
        return;
      }
      const current = stateRef.current.collection;
      if (current.running) return;
      if (!last) {
        if (current.summary) dispatch({ type: "resetCollection" });
        return;
      }
      if (current.summary?.collectedAt !== last.collectedAt) {
        dispatch({ type: "collectDone", summary: last, quiet: true });
      }
    };
    return {
      navigate,
      setSidebar(open) {
        persistSidebar(open);
        dispatch({ type: "sidebar", open });
      },
      refreshAuth,
      refreshLicense,
      async signIn(options) {
        try {
          await ipc.signInInteractive(options);
        } finally {
          await Promise.all([refreshAuth(), refreshLicense()]);
        }
      },
      async signOut() {
        await ipc.signOut();
        dispatch({ type: "resetCollection" });
        await Promise.all([refreshAuth(), refreshLicense()]);
      },
      async collect() {
        if (stateRef.current.collection.running) return;
        dispatch({ type: "collectStart" });
        try {
          const summary = await ipc.collectAll();
          dispatch({ type: "collectDone", summary });
        } catch (error) {
          const message = errorMessage(error);
          dispatch({
            type: "collectFailed",
            error: /cancel/i.test(message)
              ? "Collection cancelled. Earlier results are unchanged."
              : message,
          });
        } finally {
          await refreshAuth();
        }
      },
      async cancelCollect() {
        dispatch({ type: "collectCancelling" });
        await ipc.collectCancel().catch(() => undefined);
      },
      async loadSection(key) {
        const result = await ipc.collectSectionItems(key);
        dispatch({ type: "sectionLoaded", result });
      },
      syncCollection,
      async saveSettings(settings) {
        const saved = await ipc.settingsSave(settings);
        dispatch({ type: "settings", settings: saved });
        dispatch({ type: "resetCollection" });
        await Promise.all([refreshAuth(), refreshLicense()]);
        return saved;
      },
      openWizard() {
        dispatch({ type: "wizard", active: true });
      },
      closeWizard() {
        dispatch({ type: "wizard", active: false });
        navigate("overview");
      },
      async checkForUpdates() {
        const update = await ipc.updateCheck().catch(
          (): UpdateStatus => ({
            state: "error",
            message: "Could not check for updates.",
          }),
        );
        dispatch({ type: "update", update });
      },
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const settings = await ipc
        .settingsGet()
        .catch((): AppSettings => ({ clientId: "", tenantId: "organizations" }));
      const [auth, license, appInfo, update] = await Promise.all([
        settings.clientId ? ipc.authStatus().catch(() => null) : null,
        ipc.licenseStatus().catch(() => null),
        ipc.appInfo().catch(() => null),
        ipc.updateStatus().catch((): UpdateStatus => ({ state: "idle" })),
      ]);
      const last = auth?.signedIn ? await ipc.collectLast().catch(() => null) : null;
      if (cancelled) return;
      if (last) dispatch({ type: "collectDone", summary: last, quiet: true });
      dispatch({
        type: "boot",
        settings,
        auth,
        license,
        appInfo,
        update,
        wizardActive: !settings.clientId || loadWizardState() !== null,
      });
    })();
    const unsubscribers = [
      ipc.onCollectProgress((event) =>
        dispatch({ type: "collectProgress", event }),
      ),
      ipc.onLicenseChanged((license) => dispatch({ type: "license", license })),
      ipc.onAuthChanged((auth) => {
        dispatch({ type: "auth", auth });
        void actions.syncCollection();
      }),
      ipc.onUpdateStatus((update) => dispatch({ type: "update", update })),
      ipc.onMenuCommand((command) => {
        const current = stateRef.current;
        if (current.wizardActive && !current.settings?.clientId) return;
        if (current.wizardActive) dispatch({ type: "wizard", active: false });
        dispatch({ type: "navigate", screen: "settings" });
        if (command === "check-updates") void actions.checkForUpdates();
      }),
    ];
    return () => {
      cancelled = true;
      unsubscribers.forEach((unsubscribe) => unsubscribe());
    };
  }, [actions]);

  const value = useMemo(
    () => ({ state, dispatch, actions }),
    [state, actions],
  );
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside AppProvider.");
  return value;
}
