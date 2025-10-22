import { useReducer, useCallback } from "react";
import type {
  IntuneConfigurations,
  FetchProgress,
  ViewType,
  CAConsentStatus,
} from "~/types/dashboard";

interface DashboardState {
  configurations: IntuneConfigurations | null;
  loading: boolean;
  error: string | null;
  selectedConfigs: Set<string>;
  selectAll: boolean;
  lastFetched: Date | null;
  searchQuery: string;
  showTipBanner: boolean;
  sidebarOpen: boolean;
  activeView: ViewType;
  includeCA: boolean;
  caConsentStatus: CAConsentStatus;
  fetchProgress: FetchProgress;
}

type DashboardAction =
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "SET_CONFIGURATIONS"; payload: IntuneConfigurations }
  | { type: "SET_SELECTED_CONFIGS"; payload: Set<string> }
  | { type: "TOGGLE_SELECT_ALL"; payload: boolean }
  | { type: "SET_LAST_FETCHED"; payload: Date }
  | { type: "SET_SEARCH_QUERY"; payload: string }
  | { type: "SET_SHOW_TIP_BANNER"; payload: boolean }
  | { type: "SET_SIDEBAR_OPEN"; payload: boolean }
  | { type: "SET_ACTIVE_VIEW"; payload: ViewType }
  | { type: "SET_INCLUDE_CA"; payload: boolean }
  | { type: "SET_CA_CONSENT_STATUS"; payload: CAConsentStatus }
  | { type: "SET_FETCH_PROGRESS"; payload: FetchProgress }
  | { type: "UPDATE_FETCH_PROGRESS_STEP"; payload: { stepIndex: number; status: FetchProgress["steps"][0]["status"] } }
  | { type: "RESET_SELECTIONS" };

function dashboardReducer(state: DashboardState, action: DashboardAction): DashboardState {
  switch (action.type) {
    case "SET_LOADING":
      return { ...state, loading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "SET_CONFIGURATIONS":
      return { ...state, configurations: action.payload };

    case "SET_SELECTED_CONFIGS":
      return { ...state, selectedConfigs: action.payload };

    case "TOGGLE_SELECT_ALL":
      return { ...state, selectAll: action.payload };

    case "SET_LAST_FETCHED":
      return { ...state, lastFetched: action.payload };

    case "SET_SEARCH_QUERY":
      return { ...state, searchQuery: action.payload };

    case "SET_SHOW_TIP_BANNER":
      return { ...state, showTipBanner: action.payload };

    case "SET_SIDEBAR_OPEN":
      return { ...state, sidebarOpen: action.payload };

    case "SET_ACTIVE_VIEW":
      return { ...state, activeView: action.payload };

    case "SET_INCLUDE_CA":
      return { ...state, includeCA: action.payload };

    case "SET_CA_CONSENT_STATUS":
      return { ...state, caConsentStatus: action.payload };

    case "SET_FETCH_PROGRESS":
      return { ...state, fetchProgress: action.payload };

    case "UPDATE_FETCH_PROGRESS_STEP": {
      const newSteps = [...state.fetchProgress.steps];
      const step = newSteps[action.payload.stepIndex];
      if (step) {
        newSteps[action.payload.stepIndex] = {
          name: step.name,
          status: action.payload.status,
        };
      }
      return {
        ...state,
        fetchProgress: {
          ...state.fetchProgress,
          steps: newSteps,
          currentStep: action.payload.stepIndex,
        },
      };
    }

    case "RESET_SELECTIONS":
      return { ...state, selectedConfigs: new Set(), selectAll: false };

    default:
      return state;
  }
}

export function useDashboardState() {
  // Load persisted sidebar state
  const initialSidebarOpen =
    typeof window !== "undefined"
      ? localStorage.getItem("dashboard-sidebar-open") !== "false"
      : true;

  // Load persisted CA preference
  const initialIncludeCA =
    typeof window !== "undefined"
      ? localStorage.getItem("include-ca") === "true"
      : false;

  const initialState: DashboardState = {
    configurations: null,
    loading: true,
    error: null,
    selectedConfigs: new Set(),
    selectAll: false,
    lastFetched: null,
    searchQuery: "",
    showTipBanner: true,
    sidebarOpen: initialSidebarOpen,
    activeView: "overview",
    includeCA: initialIncludeCA,
    caConsentStatus: "unknown",
    fetchProgress: {
      steps: [
        { name: "Connecting to Microsoft Graph API", status: "pending" },
        { name: "Fetching Settings Catalog configurations", status: "pending" },
        { name: "Fetching Device Configurations", status: "pending" },
        { name: "Fetching Administrative Templates", status: "pending" },
        { name: "Fetching Security Baselines", status: "pending" },
        { name: "Fetching Compliance Policies", status: "pending" },
        { name: "Fetching Scripts", status: "pending" },
        { name: "Fetching App Configurations", status: "pending" },
        { name: "Fetching Windows Update Policies", status: "pending" },
        { name: "Fetching Enrollment Configurations", status: "pending" },
        { name: "Fetching Conditional Access Policies", status: "pending" },
      ],
      currentStep: 0,
    },
  };

  const [state, dispatch] = useReducer(dashboardReducer, initialState);

  const actions = {
    setLoading: useCallback((loading: boolean) => {
      dispatch({ type: "SET_LOADING", payload: loading });
    }, []),

    setError: useCallback((error: string | null) => {
      dispatch({ type: "SET_ERROR", payload: error });
    }, []),

    setConfigurations: useCallback((configurations: IntuneConfigurations) => {
      dispatch({ type: "SET_CONFIGURATIONS", payload: configurations });
    }, []),

    setSelectedConfigs: useCallback((configs: Set<string>) => {
      dispatch({ type: "SET_SELECTED_CONFIGS", payload: configs });
    }, []),

    toggleSelectAll: useCallback((selectAll: boolean) => {
      dispatch({ type: "TOGGLE_SELECT_ALL", payload: selectAll });
    }, []),

    setLastFetched: useCallback((date: Date) => {
      dispatch({ type: "SET_LAST_FETCHED", payload: date });
    }, []),

    setSearchQuery: useCallback((query: string) => {
      dispatch({ type: "SET_SEARCH_QUERY", payload: query });
    }, []),

    setShowTipBanner: useCallback((show: boolean) => {
      dispatch({ type: "SET_SHOW_TIP_BANNER", payload: show });
    }, []),

    setSidebarOpen: useCallback((open: boolean) => {
      dispatch({ type: "SET_SIDEBAR_OPEN", payload: open });
    }, []),

    setActiveView: useCallback((view: ViewType) => {
      dispatch({ type: "SET_ACTIVE_VIEW", payload: view });
    }, []),

    setIncludeCA: useCallback((include: boolean) => {
      dispatch({ type: "SET_INCLUDE_CA", payload: include });
      if (typeof window !== "undefined") {
        localStorage.setItem("include-ca", String(include));
      }
    }, []),

    setCaConsentStatus: useCallback((status: CAConsentStatus) => {
      dispatch({ type: "SET_CA_CONSENT_STATUS", payload: status });
    }, []),

    setFetchProgress: useCallback((progress: FetchProgress) => {
      dispatch({ type: "SET_FETCH_PROGRESS", payload: progress });
    }, []),

    updateFetchProgressStep: useCallback((stepIndex: number, status: FetchProgress["steps"][0]["status"]) => {
      dispatch({ type: "UPDATE_FETCH_PROGRESS_STEP", payload: { stepIndex, status } });
    }, []),

    resetSelections: useCallback(() => {
      dispatch({ type: "RESET_SELECTIONS" });
    }, []),
  };

  return { state, actions };
}
