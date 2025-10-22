import { useMemo, useCallback } from "react";
import type { IntuneConfigurations, ConfigurationItem } from "~/types/dashboard";

export function useConfigurationOperations(
  configurations: IntuneConfigurations | null,
  searchQuery: string
) {
  // Memoized filter function
  const filterConfigurations = useCallback(
    (items: ConfigurationItem[]) => {
      if (!searchQuery) return items;
      return items.filter((item) => {
        const name = String(item.displayName || item.name || "").toLowerCase();
        const description = String(item.description || "").toLowerCase();
        const query = searchQuery.toLowerCase();
        return name.includes(query) || description.includes(query);
      });
    },
    [searchQuery]
  );

  // Memoized get all config IDs
  const getAllConfigIds = useMemo(() => {
    if (!configurations) return [];
    const ids: string[] = [];

    configurations.settingsCatalog?.forEach((c) => ids.push(`catalog-${c.id}`));
    configurations.deviceConfigurations?.forEach((c) => ids.push(`device-${c.id}`));
    configurations.administrativeTemplates?.forEach((c) => ids.push(`admx-${c.id}`));
    configurations.securityBaselines?.forEach((c) => ids.push(`security-${c.id}`));
    configurations.compliancePolicies?.forEach((c) => ids.push(`compliance-${c.id}`));
    configurations.scripts?.macOS?.forEach((c) => ids.push(`script-mac-${c.id}`));
    configurations.scripts?.windows?.forEach((c) => ids.push(`script-win-${c.id}`));
    configurations.appConfigurations?.forEach((c) => ids.push(`app-${c.id}`));
    configurations.windowsUpdatePolicies?.forEach((c) => ids.push(`update-${c.id}`));
    configurations.enrollmentConfigurations?.forEach((c) => ids.push(`enrollment-${c.id}`));
    configurations.conditionalAccessPolicies?.forEach((c) => ids.push(`ca-${c.id}`));

    return ids;
  }, [configurations]);

  // Memoized get filtered IDs
  const getFilteredIds = useMemo(() => {
    if (!configurations) return [];
    const filteredIds: string[] = [];

    filterConfigurations(configurations.settingsCatalog || []).forEach((c) =>
      filteredIds.push(`catalog-${c.id}`)
    );
    filterConfigurations(configurations.deviceConfigurations || []).forEach((c) =>
      filteredIds.push(`device-${c.id}`)
    );
    filterConfigurations(configurations.administrativeTemplates || []).forEach((c) =>
      filteredIds.push(`admx-${c.id}`)
    );
    filterConfigurations(configurations.securityBaselines || []).forEach((c) =>
      filteredIds.push(`security-${c.id}`)
    );
    filterConfigurations(configurations.compliancePolicies || []).forEach((c) =>
      filteredIds.push(`compliance-${c.id}`)
    );
    filterConfigurations(configurations.scripts?.macOS || []).forEach((c) =>
      filteredIds.push(`script-mac-${c.id}`)
    );
    filterConfigurations(configurations.scripts?.windows || []).forEach((c) =>
      filteredIds.push(`script-win-${c.id}`)
    );
    filterConfigurations(configurations.appConfigurations || []).forEach((c) =>
      filteredIds.push(`app-${c.id}`)
    );
    filterConfigurations(configurations.windowsUpdatePolicies || []).forEach((c) =>
      filteredIds.push(`update-${c.id}`)
    );
    filterConfigurations(configurations.enrollmentConfigurations || []).forEach((c) =>
      filteredIds.push(`enrollment-${c.id}`)
    );
    filterConfigurations(configurations.conditionalAccessPolicies || []).forEach((c) =>
      filteredIds.push(`ca-${c.id}`)
    );

    return filteredIds;
  }, [configurations, filterConfigurations]);

  // Memoized filtered count
  const filteredCount = useMemo(() => getFilteredIds.length, [getFilteredIds]);

  return {
    filterConfigurations,
    getAllConfigIds,
    getFilteredIds,
    filteredCount,
  };
}
