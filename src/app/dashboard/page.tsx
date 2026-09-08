"use client";

import { useMsal } from "@azure/msal-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";
import { graphScopes } from "~/lib/msal-config";
import { useTenantLogging } from "~/hooks/use-tenant-logging";
import { useUserProfile } from "~/hooks/use-user-profile";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import {
  COLLECTION_STEPS,
  collectionSteps,
  stepForFamily,
} from "~/lib/collection-progress";
import { NavigationHeader } from "~/components/navigation-header";
// Settings is now an in-dashboard view; no external link needed here
import {
  FileText,
  LayoutGrid,
  Palette,
  RefreshCw,
  Search,
  Shield,
} from "lucide-react";
import { BrandingSettingsModal } from "~/components/branding-settings-modal";
import { ExportModal, type ExportState } from "~/components/export-modal";
import { FloatingExportNotification } from "~/components/floating-export-notification";
import { useExportHandler } from "~/hooks/use-export-handler";
import type { BrandingOptions } from "~/types/branding";
import { DashboardSidebar } from "~/components/dashboard/dashboard-sidebar";
import { DashboardContent } from "~/components/dashboard/dashboard-content";
import {
  buildDashboardTypeStats,
  type ConfigurationTypeKey,
  type DashboardView,
  type IntuneConfigurations,
} from "~/components/dashboard/types";
import type { ConfigurationSectionData } from "~/lib/configuration-sections";
import {
  clearDashboardSession,
  readDashboardSession,
  saveDashboardSession,
  SNAPSHOT_FRESHNESS_MS,
} from "~/lib/dashboard-session-cache";

const EMPTY_CONFIGURATIONS: IntuneConfigurations = {
  settingsCatalog: [],
  deviceConfigurations: [],
  administrativeTemplates: [],
  securityBaselines: [],
  compliancePolicies: [],
  appProtectionPolicies: [],
  scripts: { windows: [], macOS: [] },
  appConfigurations: [],
  windowsUpdatePolicies: [],
  enrollmentConfigurations: [],
  conditionalAccessPolicies: [],
  sections: [],
  permissionErrors: [],
  fetchErrors: [],
  summary: { totalConfigurations: 0, byType: {} },
};

function mergeConfigurationSection(
  current: IntuneConfigurations | null,
  section: ConfigurationSectionData,
): IntuneConfigurations {
  const base = current || EMPTY_CONFIGURATIONS;
  const sections = base.sections.some(
    (candidate) => candidate.key === section.key,
  )
    ? base.sections.map((candidate) =>
        candidate.key === section.key ? section : candidate,
      )
    : [...base.sections, section];
  const byType = sections.reduce<Record<string, number>>(
    (counts, candidate) => {
      counts[candidate.familyKey] =
        (counts[candidate.familyKey] || 0) + candidate.items.length;
      return counts;
    },
    {},
  );
  const next: IntuneConfigurations = {
    ...base,
    sections,
    fetchErrors: [
      ...(base.fetchErrors || []).filter(
        (error) => error.policyId !== section.key,
      ),
      ...(section.error
        ? [
            {
              policyId: section.key,
              policyName: section.label,
              policyType: section.familyKey,
              familyKey: section.familyKey,
              error: section.error.message,
              errorCode: section.error.errorCode,
              statusCode: section.error.statusCode,
              endpoint: section.endpoint,
              permissionHint: section.permissionHint,
              partial: section.error.partial,
            },
          ]
        : []),
    ],
    summary: {
      totalConfigurations: sections.reduce(
        (total, candidate) => total + candidate.items.length,
        0,
      ),
      byType,
    },
  };

  switch (section.key) {
    case "settingsCatalog":
      next.settingsCatalog = section.items;
      break;
    case "deviceConfigurations":
      next.deviceConfigurations = section.items;
      break;
    case "administrativeTemplates":
      next.administrativeTemplates = section.items;
      break;
    case "securityBaselines":
      next.securityBaselines = section.items;
      break;
    case "compliancePolicies":
      next.compliancePolicies = section.items;
      break;
    case "appProtectionPolicies":
      next.appProtectionPolicies = section.items;
      break;
    case "windowsScripts":
      next.scripts = { ...next.scripts, windows: section.items };
      break;
    case "macOSScripts":
      next.scripts = { ...next.scripts, macOS: section.items };
      break;
    case "appConfigurations":
      next.appConfigurations = section.items;
      break;
    case "windowsUpdatePolicies":
      next.windowsUpdatePolicies = section.items;
      break;
    case "enrollmentConfigurations":
      next.enrollmentConfigurations = section.items;
      break;
    case "conditionalAccessPolicies":
      next.conditionalAccessPolicies = section.items;
      break;
  }
  return next;
}

export default function DashboardPage() {
  const { instance, accounts, inProgress } = useMsal();
  const router = useRouter();
  const { userProfile } = useUserProfile();
  const account = accounts[0];
  const accountKey = account
    ? JSON.stringify([account.homeAccountId, account.tenantId])
    : null;
  const activeAccountKey = useRef(accountKey);
  activeAccountKey.current = accountKey;
  const [dataAccountKey, setDataAccountKey] = useState<string | null>(null);
  const [settledAccountKey, setSettledAccountKey] = useState<
    string | null | undefined
  >(undefined);

  // Log tenant access server-side only
  useTenantLogging("Dashboard-Access");
  const [configurations, setConfigurations] =
    useState<IntuneConfigurations | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrySteps, setRetrySteps] = useState<number[]>([]);
  const [snapshotResolved, setSnapshotResolved] = useState(false);
  const [hasCompletedInitialLoad, setHasCompletedInitialLoad] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedConfigs, setSelectedConfigs] = useState<Set<string>>(
    new Set(),
  );
  const [selectAll, setSelectAll] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);
  const [groupNames, setGroupNames] = useState<Map<string, string> | null>(
    null,
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [showTipBanner, setShowTipBanner] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<DashboardView>("overview");
  const [showBrandingModal, setShowBrandingModal] = useState(false);
  const [includeCA, setIncludeCA] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("include-ca") === "true",
  );
  const [brandingOptions, setBrandingOptions] = useState<
    BrandingOptions | undefined
  >(() => {
    // Load saved branding options from localStorage on mount
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("intune-branding-options");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          console.error("Failed to parse saved branding options:", e);
        }
      }
    }
    return undefined;
  });
  const [caConsentStatus, setCaConsentStatus] = useState<
    "unknown" | "included" | "missing"
  >("unknown");
  const [fetchProgress, setFetchProgress] = useState<{
    steps: {
      name: string;
      status: "pending" | "loading" | "completed" | "error";
      current?: number;
      total?: number;
    }[];
    currentStep: number;
  }>({
    steps: [
      { name: "Connecting to Microsoft Graph API", status: "pending" },
      { name: "Fetching Settings Catalog configurations", status: "pending" },
      { name: "Fetching Device Configurations", status: "pending" },
      { name: "Fetching Administrative Templates", status: "pending" },
      { name: "Fetching Security Baselines", status: "pending" },
      { name: "Fetching Compliance Policies", status: "pending" },
      { name: "Fetching App Protection Policies", status: "pending" },
      { name: "Fetching Scripts", status: "pending" },
      { name: "Fetching App Configurations", status: "pending" },
      { name: "Fetching Windows Update Policies", status: "pending" },
      { name: "Fetching Enrollment Configurations", status: "pending" },
      { name: "Fetching Conditional Access Policies", status: "pending" },
    ],
    currentStep: 0,
  });

  // Export state management
  const [exportState, setExportState] = useState<ExportState>({
    selectedFormat: "pdf-detailed",
    isExporting: false,
    exportComplete: false,
    exportError: null,
    exportErrors: [],
    exportStats: null,
    currentStage: 0,
    overallProgress: 0,
  });
  const [showFloatingNotification, setShowFloatingNotification] =
    useState(false);

  const updateExportState = (partial: Partial<ExportState>) => {
    setExportState((prev) => ({ ...prev, ...partial }));
  };

  // Prevent duplicate fetches on React Strict Mode double-mount
  const isFetchingRef = useRef(false);
  const requestRevision = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const lastCollectionSucceeded = useRef(false);

  useEffect(() => {
    if (inProgress === "none") setSettledAccountKey(accountKey);
  }, [accountKey, inProgress]);

  useEffect(() => {
    // MSAL rehydrates the signed-in account asynchronously after a hard
    // refresh; only treat an empty account list as signed out once MSAL is
    // idle, otherwise the refresh races straight back to the landing page.
    if (settledAccountKey === undefined) return;
    if (!account || !accountKey) {
      setSnapshotResolved(true);
      clearDashboardSession(false);
      router.push("/");
      return;
    }
    let cancelled = false;
    const requests = {
      revision: requestRevision,
      controller: requestController,
      fetching: isFetchingRef,
    };
    setConfigurations(null);
    setLastFetched(null);
    setGroupNames(null);
    setSelectedConfigs(new Set());
    setSelectAll(false);
    setDataAccountKey(null);
    setHasCompletedInitialLoad(false);
    setRetrySteps([]);
    setSnapshotResolved(false);
    setLoading(true);
    setError(null);
    lastCollectionSucceeded.current = false;
    void readDashboardSession({
      accountId: account.homeAccountId,
      tenantId: account.tenantId,
      includeCA,
    }).then((snapshot) => {
      if (cancelled) return;
      setSnapshotResolved(true);
      if (snapshot) {
        setConfigurations(snapshot.configurations);
        setLastFetched(new Date(snapshot.lastFetched));
        setGroupNames(
          snapshot.groupNames === null ? null : new Map(snapshot.groupNames),
        );
        setCaConsentStatus(snapshot.caConsentStatus);
        setDataAccountKey(accountKey);
        setHasCompletedInitialLoad(true);
        setLoading(false);
        lastCollectionSucceeded.current = true;
        setRetrySteps([
          ...new Set(
            (snapshot.configurations.fetchErrors ?? [])
              .map((error) => stepForFamily(error.familyKey ?? ""))
              .filter((index) => index > 0),
          ),
        ]);
        if (
          Date.now() - Date.parse(snapshot.lastFetched) >=
          SNAPSHOT_FRESHNESS_MS
        )
          void fetchConfigurations(
            undefined,
            undefined,
            snapshot.configurations,
          );
      } else void fetchConfigurations();
    });
    return () => {
      cancelled = true;
      requests.revision.current++;
      requests.controller.current?.abort();
      requests.fetching.current = false;
    };
    // Initialize only after auth settles or the account/tenant changes. The
    // explicit settings callback handles collection-option changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settledAccountKey, router]);

  useEffect(() => {
    if (
      loading ||
      !configurations ||
      !lastFetched ||
      !account ||
      dataAccountKey !== accountKey ||
      !lastCollectionSucceeded.current
    )
      return;
    void saveDashboardSession(
      {
        accountId: account.homeAccountId,
        tenantId: account.tenantId,
        includeCA,
      },
      {
        configurations,
        lastFetched: lastFetched.toISOString(),
        groupNames: groupNames ? [...groupNames] : null,
        caConsentStatus,
      },
    );
  }, [
    loading,
    configurations,
    lastFetched,
    groupNames,
    account,
    accountKey,
    dataAccountKey,
    includeCA,
    caConsentStatus,
  ]);

  // Resolve assignment group ids to display names once a fetch settles, so
  // the dashboard and compliance reports show real group names, not GUIDs.
  useEffect(() => {
    if (
      loading ||
      !hasCompletedInitialLoad ||
      !configurations ||
      dataAccountKey !== accountKey
    )
      return;
    if (groupNames !== null) return;

    let cancelled = false;
    void (async () => {
      try {
        const groupIds = new Set<string>();
        for (const section of configurations.sections ?? []) {
          for (const item of section.items) {
            for (const assignment of item.assignments ?? []) {
              const groupId = assignment?.target?.groupId;
              if (typeof groupId === "string" && groupId) {
                groupIds.add(groupId);
              }
            }
            const users = item.conditions?.users;
            for (const id of [
              ...(users?.includeGroups ?? []),
              ...(users?.excludeGroups ?? []),
            ]) {
              if (typeof id === "string" && id) groupIds.add(id);
            }
          }
        }
        if (groupIds.size === 0) {
          if (!cancelled) setGroupNames(new Map());
          return;
        }
        const token = await getAccessToken();
        const { GroupResolver } = await import("~/lib/group-resolver");
        const resolver = new GroupResolver(token);
        const resolved = await resolver.getGroupNames([...groupIds]);
        if (!cancelled) setGroupNames(resolved);
      } catch (error) {
        console.error("Failed to resolve group names:", error);
        if (!cancelled) setGroupNames(new Map());
      }
    })();
    return () => {
      cancelled = true;
    };
    // getAccessToken is stable in behavior but recreated per render; adding it
    // would re-run the resolver on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    loading,
    hasCompletedInitialLoad,
    configurations,
    groupNames,
    accountKey,
    dataAccountKey,
  ]);

  useEffect(() => {
    if (window.innerWidth < 768) {
      setSidebarOpen(false);
    }
  }, []);

  const handleSignOut = () => {
    clearDashboardSession();
    requestRevision.current++;
    requestController.current?.abort();
    void instance.logoutRedirect({
      postLogoutRedirectUri: window.location.origin,
    });
  };

  const getAccessToken = async (extraScopes?: string[]) => {
    if (accounts.length === 0) throw new Error("No authenticated account");

    const request = {
      scopes:
        extraScopes && extraScopes.length > 0
          ? [...graphScopes.scopes, ...extraScopes]
          : [...graphScopes.scopes],
      account: accounts[0],
    } as const;

    try {
      const response = await instance.acquireTokenSilent(request as any);
      return response.accessToken;
    } catch {
      const response = await instance.acquireTokenPopup(request as any);
      return response.accessToken;
    }
  };

  const updateFetchProgress = (
    stepIndex: number,
    status: "pending" | "loading" | "completed" | "error",
  ) => {
    setFetchProgress((prev) => {
      const newSteps = [...prev.steps];
      const step = newSteps[stepIndex];
      if (step) {
        newSteps[stepIndex] = {
          ...step,
          status,
          // A completed step counts as fully processed
          ...(status === "completed" && step.total
            ? { current: step.total }
            : {}),
        };
      }
      return { ...prev, steps: newSteps, currentStep: stepIndex };
    });
  };

  const fetchConfigurations = async (
    caRequested?: boolean,
    retry?: number[],
    restored?: IntuneConfigurations,
  ) => {
    // Prevent concurrent fetches
    if (isFetchingRef.current) {
      console.log("Fetch already in progress, skipping duplicate request");
      return;
    }

    const revision = ++requestRevision.current;
    const controller = new AbortController();
    requestController.current = controller;
    const isCurrent = () =>
      requestRevision.current === revision &&
      activeAccountKey.current === accountKey;
    const previousSnapshot =
      restored ?? (dataAccountKey === accountKey ? configurations : null);
    let pendingConfigurations: IntuneConfigurations =
      retry && previousSnapshot ? previousSnapshot : EMPTY_CONFIGURATIONS;
    const finishedSteps = new Set<number>();
    const failedSteps = new Set<number>();
    let requestedSteps: number[] =
      retry ??
      collectionSteps(caRequested ?? includeCA)
        .map((_, index) => index)
        .filter((index) => index > 0);
    const collectionStart =
      previousSnapshot?.collectedAt ??
      previousSnapshot?.collectionStartedAt ??
      new Date().toISOString();
    let receivedAnySection = false;
    lastCollectionSucceeded.current = false;

    try {
      isFetchingRef.current = true;
      setLoading(true);
      setError(null);

      // Render the shell before the first Graph response; retained data stays visible.
      if (!previousSnapshot) {
        setConfigurations(EMPTY_CONFIGURATIONS);
        setDataAccountKey(accountKey);
      }
      const stepsFor = (withCA: boolean) => collectionSteps(withCA, retry);

      // Step 1: Connect to Graph API (base scopes)
      setFetchProgress({ steps: stepsFor(false), currentStep: 0 });
      updateFetchProgress(0, "loading");
      let accessToken = await getAccessToken();
      if (!isCurrent()) return;
      updateFetchProgress(0, "completed");

      // Optionally include Conditional Access if requested AND token can be acquired silently or via prompt
      let caIncluded = false;
      const wantCA = caRequested ?? includeCA;
      if (wantCA) {
        try {
          accessToken = await getAccessToken(["Policy.Read.All"]);
          caIncluded = true;
        } catch {
          caIncluded = false; // continue without CA
        }
      }

      if (!isCurrent()) return;

      setCaConsentStatus(
        wantCA ? (caIncluded ? "included" : "missing") : "unknown",
      );
      if (retry?.includes(12) && !caIncluded)
        throw new Error(
          "Conditional Access could not be retried because its read permission is unavailable. Check the Conditional Access setting and consent, then retry.",
        );

      // Refresh steps with/without CA and start progress
      setFetchProgress({ steps: stepsFor(caIncluded), currentStep: 0 });
      updateFetchProgress(0, "completed");

      requestedSteps =
        retry ??
        stepsFor(caIncluded)
          .map((_, index) => index)
          .filter((index) => index > 0);
      // Use Server-Sent Events for real-time progress
      // Since EventSource doesn't support Authorization header, we use fetch with streaming
      await new Promise<void>((resolve, reject) => {
        fetch("/api/intune/detailed-configurations-stream", {
          signal: controller.signal,
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Include-Conditional-Access": String(caIncluded),
            ...(retry ? { "X-Collection-Steps": retry.join(",") } : {}),
          },
        })
          .then(async (response) => {
            if (!response.ok) {
              throw new Error("Failed to start configuration stream");
            }

            const reader = response.body?.getReader();
            const decoder = new TextDecoder();

            if (!reader) {
              throw new Error("No response body");
            }

            let buffer = "";
            let receivedComplete = false;

            while (true) {
              const { done, value } = await reader.read();
              if (!isCurrent()) throw new Error("Collection cancelled");

              if (done) {
                if (receivedComplete) {
                  resolve();
                } else {
                  reject(
                    new Error(
                      "The configuration stream closed before all collections finished. The dashboard contains partial data.",
                    ),
                  );
                }
                break;
              }

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split("\n\n");
              buffer = lines.pop() || "";

              for (const line of lines) {
                if (line.startsWith("event:")) {
                  const regex = /event: (\w+)\ndata: (.+)/s;
                  const eventMatch = regex.exec(line);
                  if (eventMatch && eventMatch[2]) {
                    const [, eventType, dataStr] = eventMatch;
                    const data = JSON.parse(dataStr);

                    if (eventType === "progress") {
                      // Update progress based on event
                      if (data.stepIndex !== undefined) {
                        if (data.status === "completed")
                          finishedSteps.add(data.stepIndex);
                        if (data.status === "error")
                          failedSteps.add(data.stepIndex);
                        updateFetchProgress(data.stepIndex, data.status);
                      }

                      // Attach live batch counts so the loading screen can
                      // weight overall progress by real work done
                      if (data.type === "batch-progress") {
                        const stepIndex =
                          data.stepIndex !== undefined
                            ? data.stepIndex
                            : stepsFor(caIncluded).findIndex((s) =>
                                s.name.includes(data.step),
                              );
                        if (stepIndex !== -1 && stepIndex !== undefined) {
                          setFetchProgress((prev) => ({
                            ...prev,
                            steps: prev.steps.map((step, idx) =>
                              idx === stepIndex
                                ? {
                                    ...step,
                                    name: `${data.step} (${data.current}/${data.total})`,
                                    status: "loading",
                                    current: data.current,
                                    total: data.total,
                                  }
                                : step,
                            ),
                          }));
                        }
                      }
                    } else if (eventType === "section" && data.section) {
                      receivedAnySection = true;
                      pendingConfigurations = mergeConfigurationSection(
                        pendingConfigurations,
                        data.section,
                      );
                      setConfigurations((current) =>
                        mergeConfigurationSection(current, data.section),
                      );
                      setDataAccountKey(accountKey);
                    } else if (eventType === "complete") {
                      receivedComplete = true;
                      setHasCompletedInitialLoad(true);
                      setConfigurations({
                        ...pendingConfigurations,
                        collectedAt: retry
                          ? collectionStart
                          : data.data.collectedAt,
                        collectionStartedAt: retry
                          ? previousSnapshot?.collectionStartedAt
                          : data.data.collectionStartedAt,
                        collectionSkippedFamilies:
                          data.data.collectionSkippedFamilies,
                        permissionErrors: [
                          ...(retry
                            ? (previousSnapshot?.permissionErrors ?? []).filter(
                                (error) =>
                                  !retry.some(
                                    (index) =>
                                      COLLECTION_STEPS[index]?.name ===
                                        error.resource ||
                                      (index === 7 &&
                                        error.resource.includes("Scripts")),
                                  ),
                              )
                            : []),
                          ...(data.data.permissionErrors || []),
                        ],
                        fetchErrors: [
                          ...(retry
                            ? (previousSnapshot?.fetchErrors ?? []).filter(
                                (error) =>
                                  !retry.includes(
                                    stepForFamily(error.familyKey ?? ""),
                                  ) && error.policyId !== "stream",
                              )
                            : []),
                          ...(data.data.fetchErrors || []),
                        ],
                        summary:
                          (retry
                            ? pendingConfigurations.summary
                            : data.data.summary) ||
                          pendingConfigurations.summary ||
                          EMPTY_CONFIGURATIONS.summary,
                      });
                      setDataAccountKey(accountKey);
                      setGroupNames(null);
                      const validIds = new Set(
                        pendingConfigurations.sections.flatMap((section) =>
                          section.items.map(
                            (item) => `${section.selectionPrefix}-${item.id}`,
                          ),
                        ),
                      );
                      setSelectedConfigs(
                        (current) =>
                          new Set(
                            [...current].filter((id) => validIds.has(id)),
                          ),
                      );
                      setSelectAll(false);
                      setRetrySteps([
                        ...new Set([
                          ...failedSteps,
                          ...(data.data.fetchErrors ?? [])
                            .map((error: { familyKey?: string }) =>
                              stepForFamily(error.familyKey ?? ""),
                            )
                            .filter((index: number) => index > 0),
                        ]),
                      ]);
                      setLastFetched(
                        new Date(
                          (retry ? collectionStart : data.data.collectedAt) ||
                            Date.now(),
                        ),
                      );
                      lastCollectionSucceeded.current = true;
                      resolve();
                    } else if (eventType === "error") {
                      throw new Error(data.error || "Stream error");
                    }
                  }
                }
              }
            }
          })
          .catch(reject);
      });
    } catch (err) {
      if (!isCurrent()) return;
      setRetrySteps(
        requestedSteps.filter(
          (index) => !finishedSteps.has(index) || failedSteps.has(index),
        ),
      );
      // Mark current step as error
      const currentStep = fetchProgress.currentStep;
      updateFetchProgress(currentStep, "error");
      const message = err instanceof Error ? err.message : "An error occurred";
      setError(message);
      if (configurations || receivedAnySection) {
        setHasCompletedInitialLoad(true);
      }
      setConfigurations((current) =>
        current
          ? {
              ...current,
              collectedAt: undefined,
              collectionStartedAt: collectionStart,
              fetchErrors: [
                ...(current.fetchErrors || []),
                {
                  policyId: "stream",
                  policyName: "Configuration stream",
                  policyType: "Streaming",
                  familyKey: "overview",
                  error: message,
                  partial: true,
                },
              ],
            }
          : current,
      );
      console.error("Error fetching configurations:", err);
    } finally {
      if (isCurrent()) {
        setLoading(false);
        isFetchingRef.current = false;
      }
    }
  };

  const getAllConfigIds = () => {
    if (!configurations) return [];
    return configurations.sections
      .filter(
        (section) =>
          section.familyKey !== "conditionalAccessPolicies" ||
          (includeCA && caConsentStatus === "included"),
      )
      .flatMap((section) =>
        section.items.map((item) => `${section.selectionPrefix}-${item.id}`),
      );
  };

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedConfigs(new Set());
    } else {
      setSelectedConfigs(new Set(getAllConfigIds()));
    }
    setSelectAll(!selectAll);
  };

  const handleSelectFiltered = () => {
    const filteredIds = (configurations?.sections || [])
      .filter(
        (section) =>
          section.familyKey !== "conditionalAccessPolicies" ||
          (includeCA && caConsentStatus === "included"),
      )
      .flatMap((section) =>
        filterConfigurations(section.items).map(
          (item) => `${section.selectionPrefix}-${item.id}`,
        ),
      );

    setSelectedConfigs(new Set(filteredIds));
  };

  const handleSelectConfig = (id: string) => {
    const newSelected = new Set(selectedConfigs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedConfigs(newSelected);
    const allConfigIds = getAllConfigIds();
    setSelectAll(
      allConfigIds.length > 0 &&
        allConfigIds.every((configId) => newSelected.has(configId)),
    );
  };

  const handleBulkSelect = (idsToAdd: string[], idsToRemove: string[]) => {
    const newSelected = new Set(selectedConfigs);
    idsToRemove.forEach((id) => newSelected.delete(id));
    idsToAdd.forEach((id) => newSelected.add(id));
    setSelectedConfigs(newSelected);
    const allConfigIds = getAllConfigIds();
    setSelectAll(
      allConfigIds.length > 0 &&
        allConfigIds.every((configId) => newSelected.has(configId)),
    );
  };

  const handleToggleFamily = (key: ConfigurationTypeKey) => {
    if (!configurations) return;

    const familyIds = configurations.sections
      .filter(
        (section) =>
          section.familyKey === key &&
          (section.familyKey !== "conditionalAccessPolicies" ||
            (includeCA && caConsentStatus === "included")),
      )
      .flatMap((section) =>
        section.items.map((item) => `${section.selectionPrefix}-${item.id}`),
      );
    const allFamilyItemsSelected =
      familyIds.length > 0 && familyIds.every((id) => selectedConfigs.has(id));

    handleBulkSelect(
      allFamilyItemsSelected ? [] : familyIds,
      allFamilyItemsSelected ? familyIds : [],
    );
  };

  // Filter configurations based on search query
  const filterConfigurations = (items: any[]) => {
    if (!searchQuery) return items;
    return items.filter((item) => {
      const name = String(item.displayName || item.name || "").toLowerCase();
      const description = String(item.description || "").toLowerCase();
      const query = searchQuery.toLowerCase();
      return name.includes(query) || description.includes(query);
    });
  };

  // Export handler hook
  const {
    showExportModal,
    setShowExportModal,
    exportConfig,
    handleExport: handleExportWithModal,
  } = useExportHandler({
    configurations,
    selectedConfigs,
    brandingOptions,
    includeCA,
    caConsentStatus,
    getAccessToken,
    onProgress: (progress) => {
      updateExportState({
        currentStage: progress.stage,
        overallProgress: progress.progress,
      });
    },
  });

  // Authentication and local snapshot restoration are not a Graph collection.
  // Keep the first paint quiet until the account and retained data are checked.
  // Never render another account's data while an account switch settles.
  if (
    (!hasCompletedInitialLoad &&
      (!snapshotResolved || settledAccountKey !== accountKey)) ||
    (configurations && dataAccountKey !== accountKey)
  ) {
    return (
      <main className="bg-mint-50 min-h-screen" aria-busy="true">
        <span className="sr-only">Restoring dashboard</span>
      </main>
    );
  }

  // Show sign-in prompt instead of loading UI for unauthenticated users
  // Wait for MSAL to finish initializing before deciding
  if (inProgress === "none" && accounts.length === 0) {
    return (
      <div className="bg-mint-50 min-h-screen pt-16">
        <NavigationHeader />
        <div className="flex min-h-[60vh] items-center justify-center px-4">
          <div className="w-full max-w-lg">
            <Card className="border-petrol-950/6 shadow-soft rounded-3xl">
              <CardContent className="py-10 text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-50">
                  <Shield className="h-8 w-8 text-teal-700" />
                </div>
                <h2 className="text-petrol-950 mb-2 text-xl font-semibold">
                  Intune Documentation dashboard
                </h2>
                <p className="text-petrol-600 mb-6 text-sm">
                  Sign in with your Microsoft account to access your Intune
                  tenant and generate documentation.
                </p>

                <div className="mb-6 grid grid-cols-2 gap-3 text-left">
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <FileText className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        Export to PDF or Word
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Professional audit-ready reports
                      </p>
                    </div>
                  </div>
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <LayoutGrid className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        10+ configuration types
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Policies, profiles, scripts
                      </p>
                    </div>
                  </div>
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <Search className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        Search and filter
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Find configurations quickly
                      </p>
                    </div>
                  </div>
                  <div className="bg-mint-50 flex items-start gap-2 rounded-xl p-3">
                    <Palette className="mt-0.5 h-4 w-4 flex-shrink-0 text-teal-700" />
                    <div>
                      <p className="text-petrol-950 text-xs font-medium">
                        Custom branding
                      </p>
                      <p className="text-petrol-600 text-xs">
                        Logo, colors, headers
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  onClick={() => router.push("/")}
                  variant="primary"
                  className="w-full rounded-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-600"
                >
                  Sign in to get started
                </Button>

                <div className="text-petrol-600 mt-4 flex items-center justify-center gap-4 text-xs">
                  <span className="inline-flex items-center gap-1">
                    <Shield className="h-3 w-3" />
                    Read-only access
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    PDF + Word
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  if (error && !configurations) {
    return (
      <div className="bg-mint-50 flex min-h-screen items-center justify-center px-4">
        <Card className="border-petrol-950/6 shadow-soft w-full max-w-md rounded-3xl">
          <CardContent className="py-12 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50">
              <Shield className="h-8 w-8 text-red-600" />
            </div>
            <h2 className="text-petrol-950 mb-2 text-lg font-semibold">
              Error loading configurations
            </h2>
            <p className="text-petrol-600 mb-6 text-sm">{error}</p>
            <Button
              onClick={() => fetchConfigurations()}
              variant="primary"
              className="rounded-full bg-teal-600 hover:bg-teal-700 focus:ring-teal-600"
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!configurations) {
    return null;
  }

  const typeStats = buildDashboardTypeStats(configurations, selectedConfigs);
  const showConditionalAccess = includeCA && caConsentStatus === "included";

  return (
    <div className="bg-mint-50 min-h-screen">
      <a
        href="#dashboard-content"
        className="bg-petrol-950 sr-only fixed top-3 left-3 z-[60] rounded-full px-4 py-2 text-sm font-semibold text-white focus:not-sr-only focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
      >
        Skip to dashboard content
      </a>
      <div className="flex">
        <DashboardSidebar
          isOpen={sidebarOpen}
          activeView={activeView}
          counts={configurations.summary.byType}
          totalCount={configurations.summary.totalConfigurations}
          selectedCount={selectedConfigs.size}
          collecting={loading}
          affectedFamilyKeys={(configurations.fetchErrors || []).map(
            (fetchError) => fetchError.familyKey || fetchError.policyType,
          )}
          showConditionalAccess={showConditionalAccess}
          userName={userProfile?.displayName || accounts[0]?.username || "User"}
          onToggle={() => setSidebarOpen((current) => !current)}
          onViewChange={setActiveView}
          onOpenBranding={() => setShowBrandingModal(true)}
          onOpenExport={() => {
            if (!loading) setShowExportModal(true);
          }}
          onSignOut={handleSignOut}
        />
        <DashboardContent
          configurations={configurations}
          groupNames={groupNames}
          activeView={activeView}
          searchQuery={searchQuery}
          selectedConfigs={selectedConfigs}
          selectAll={selectAll}
          lastFetched={lastFetched}
          showTipBanner={showTipBanner}
          includeCA={includeCA}
          caConsentStatus={caConsentStatus}
          sidebarOpen={sidebarOpen}
          refreshing={loading}
          collectionSteps={fetchProgress.steps}
          retryAvailable={retrySteps.length > 0}
          onRetry={() => void fetchConfigurations(undefined, retrySteps)}
          refreshError={error}
          typeStats={typeStats}
          onSearchChange={setSearchQuery}
          onRefresh={() => void fetchConfigurations()}
          onDismissTip={() => setShowTipBanner(false)}
          onSelectAll={handleSelectAll}
          onSelectFiltered={handleSelectFiltered}
          onSelectConfig={handleSelectConfig}
          onBulkSelect={handleBulkSelect}
          onToggleFamily={handleToggleFamily}
          onIncludeCAChange={async (next) => {
            if (isFetchingRef.current) return;
            setIncludeCA(next);
            localStorage.setItem("include-ca", String(next));
            if (!next && activeView === "conditionalAccessPolicies") {
              setActiveView("overview");
            }
            await fetchConfigurations(next);
          }}
        />
      </div>
      {/* Branding Settings Modal */}
      <BrandingSettingsModal
        isOpen={showBrandingModal}
        onClose={() => setShowBrandingModal(false)}
        onSave={(options) => {
          console.log("Saving branding options:", options);
          setBrandingOptions(options);
          localStorage.setItem(
            "intune-branding-options",
            JSON.stringify(options),
          );
          setShowBrandingModal(false);
        }}
        currentOptions={brandingOptions}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={showExportModal}
        onClose={() => {
          setShowExportModal(false);
          setShowFloatingNotification(false);
        }}
        onMinimize={() => {
          setShowExportModal(false);
          setShowFloatingNotification(true);
        }}
        onExport={handleExportWithModal}
        config={exportConfig}
        state={exportState}
        onStateChange={updateExportState}
      />

      {/* Floating Export Notification */}
      <FloatingExportNotification
        isVisible={showFloatingNotification && !showExportModal}
        isExporting={exportState.isExporting}
        exportComplete={exportState.exportComplete}
        exportError={exportState.exportError}
        overallProgress={exportState.overallProgress}
        currentStageName={
          [
            "Preparing export data...",
            "Resolving group names...",
            "Fetching device counts...",
            "Generating document...",
            "Starting download...",
          ][exportState.currentStage] ?? "Processing..."
        }
        policyCount={exportConfig.selectedCount}
        hasWarnings={exportState.exportErrors.length > 0}
        onClick={() => {
          setShowExportModal(true);
          setShowFloatingNotification(false);
        }}
        onDismiss={() => {
          setShowFloatingNotification(false);
          // Reset export state if completed
          if (exportState.exportComplete || exportState.exportError) {
            updateExportState({
              selectedFormat: "pdf-detailed",
              isExporting: false,
              exportComplete: false,
              exportError: null,
              exportErrors: [],
              exportStats: null,
              currentStage: 0,
              overallProgress: 0,
            });
          }
        }}
      />
    </div>
  );
}
