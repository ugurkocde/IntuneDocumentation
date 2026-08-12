"use client";

import { AlertCircle, Clock } from "lucide-react";
import type { ReactNode } from "react";
import type { DashboardConfigurationItem } from "~/components/dashboard/types";

type BadgeVariant = "default" | "info" | "success" | "warning" | "danger";

interface ConfigItemProps {
  item: DashboardConfigurationItem;
  prefix: string;
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  badge?: string;
  badgeVariant?: BadgeVariant;
}

interface ConfigurationSectionProps {
  title: string;
  items: DashboardConfigurationItem[];
  prefix: string;
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  onBulkSelect?: (idsToAdd: string[], idsToRemove: string[]) => void;
  icon?: ReactNode;
}

interface ScriptsSectionProps {
  macOSItems: DashboardConfigurationItem[];
  windowsItems: DashboardConfigurationItem[];
  allMacOSItems?: DashboardConfigurationItem[];
  allWindowsItems?: DashboardConfigurationItem[];
  selectedConfigs: Set<string>;
  onSelectConfig: (id: string) => void;
  onBulkSelect: (idsToAdd: string[], idsToRemove: string[]) => void;
  icon?: ReactNode;
}

const badgeStyles: Record<BadgeVariant, string> = {
  default: "bg-mint-100 text-petrol-700",
  info: "bg-teal-50 text-teal-700",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-700",
};

function ConfigChip({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: BadgeVariant;
}) {
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold ${badgeStyles[variant]}`}
    >
      {children}
    </span>
  );
}

export function ConfigItem({
  item,
  prefix,
  selectedConfigs,
  onSelectConfig,
  badge,
  badgeVariant = "default",
}: ConfigItemProps) {
  const selectionId = `${prefix}-${item.id}`;
  const isSelected = selectedConfigs.has(selectionId);
  const title = item.displayName || item.name || "Unnamed configuration";

  return (
    <div
      className={`hover:bg-mint-50/60 transition-colors [contain-intrinsic-size:1px_80px] [content-visibility:auto] ${
        isSelected ? "bg-teal-50/45" : "bg-white"
      }`}
    >
      <label className="group flex min-h-20 cursor-pointer items-start gap-3 px-4 py-4 sm:px-5">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => onSelectConfig(selectionId)}
          className="checkbox-enhanced mt-0.5 shrink-0"
          aria-label={`Select ${title}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-petrol-950 text-sm font-semibold transition-colors group-hover:text-teal-700">
              {title}
            </p>
            {item.hasFetchError && (
              <span
                className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-700"
                title="Settings unavailable due to API error"
              >
                <AlertCircle className="h-3 w-3" />
                Settings unavailable
              </span>
            )}
            {badge && <ConfigChip variant={badgeVariant}>{badge}</ConfigChip>}
            {item.platformType && (
              <ConfigChip variant="info">{item.platformType}</ConfigChip>
            )}
          </div>

          {item.description && (
            <p className="text-petrol-600 mt-1 line-clamp-2 max-w-4xl text-xs leading-5">
              {item.description}
            </p>
          )}

          {(item.lastModifiedDateTime ||
            item.version ||
            item.technologies ||
            item.fileName) && (
            <div className="text-petrol-600 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px]">
              {item.lastModifiedDateTime && (
                <span className="inline-flex items-center gap-1.5 tabular-nums">
                  <Clock className="h-3 w-3" />
                  {new Date(item.lastModifiedDateTime).toLocaleDateString()}
                </span>
              )}
              {item.version && (
                <span className="font-semibold">v{item.version}</span>
              )}
              {item.technologies && (
                <ConfigChip>{item.technologies}</ConfigChip>
              )}
              {item.fileName && (
                <span className="font-mono">{item.fileName}</span>
              )}
            </div>
          )}
        </div>
      </label>
    </div>
  );
}

export function ConfigurationSection({
  title,
  items,
  prefix,
  selectedConfigs,
  onSelectConfig,
  onBulkSelect,
  icon,
}: ConfigurationSectionProps) {
  const allItemsSelected =
    items.length > 0 &&
    items.every((item) => selectedConfigs.has(`${prefix}-${item.id}`));
  const someItemsSelected =
    items.some((item) => selectedConfigs.has(`${prefix}-${item.id}`)) &&
    !allItemsSelected;

  const handleSelectAllSection = () => {
    if (!onBulkSelect) return;
    const itemIds = items.map((item) => `${prefix}-${item.id}`);
    onBulkSelect(
      allItemsSelected ? [] : itemIds,
      allItemsSelected ? itemIds : [],
    );
  };

  return (
    <section className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
      <div className="border-petrol-950/6 flex min-h-16 items-center gap-3 border-b px-4 py-3 sm:px-5">
        <label className="hover:bg-mint-50 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl">
          <input
            type="checkbox"
            checked={allItemsSelected}
            ref={(input) => {
              if (input) input.indeterminate = someItemsSelected;
            }}
            onChange={handleSelectAllSection}
            className="checkbox-enhanced shrink-0"
            aria-label={`Select all items in ${title}`}
            title={`Select all items in ${title}`}
          />
        </label>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            {icon}
          </span>
        )}
        <h2 className="text-petrol-950 min-w-0 flex-1 text-sm font-semibold sm:text-base">
          {title}
        </h2>
        <span className="bg-mint-100 text-petrol-700 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums">
          {items.length.toLocaleString()}
        </span>
      </div>
      <div className="divide-petrol-950/6 divide-y">
        {items.map((item) => (
          <ConfigItem
            key={item.id}
            item={item}
            prefix={prefix}
            selectedConfigs={selectedConfigs}
            onSelectConfig={onSelectConfig}
          />
        ))}
      </div>
    </section>
  );
}

export function ScriptsSection({
  macOSItems,
  windowsItems,
  allMacOSItems = macOSItems,
  allWindowsItems = windowsItems,
  selectedConfigs,
  onSelectConfig,
  onBulkSelect,
  icon,
}: ScriptsSectionProps) {
  const allScripts = [
    ...allMacOSItems.map((item) => ({ item, prefix: "script-mac" })),
    ...allWindowsItems.map((item) => ({ item, prefix: "script-win" })),
  ];
  const allSelected =
    allScripts.length > 0 &&
    allScripts.every(({ item, prefix }) =>
      selectedConfigs.has(`${prefix}-${item.id}`),
    );
  const someSelected =
    allScripts.some(({ item, prefix }) =>
      selectedConfigs.has(`${prefix}-${item.id}`),
    ) && !allSelected;

  const handleSelectAll = () => {
    const ids = allScripts.map(({ item, prefix }) => `${prefix}-${item.id}`);
    onBulkSelect(allSelected ? [] : ids, allSelected ? ids : []);
  };

  return (
    <section className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white">
      <div className="border-petrol-950/6 flex min-h-16 items-center gap-3 border-b px-4 py-3 sm:px-5">
        <label className="hover:bg-mint-50 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl">
          <input
            type="checkbox"
            checked={allSelected}
            ref={(input) => {
              if (input) input.indeterminate = someSelected;
            }}
            onChange={handleSelectAll}
            className="checkbox-enhanced shrink-0"
            aria-label="Select all scripts"
            title="Select all scripts"
          />
        </label>
        {icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            {icon}
          </span>
        )}
        <h2 className="text-petrol-950 min-w-0 flex-1 text-sm font-semibold sm:text-base">
          Scripts
        </h2>
        <span className="bg-mint-100 text-petrol-700 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums">
          {allScripts.length.toLocaleString()}
        </span>
      </div>
      <div className="divide-petrol-950/6 divide-y">
        {macOSItems.map((item) => (
          <ConfigItem
            key={item.id}
            item={item}
            prefix="script-mac"
            selectedConfigs={selectedConfigs}
            onSelectConfig={onSelectConfig}
            badge="macOS"
          />
        ))}
        {windowsItems.map((item) => (
          <ConfigItem
            key={item.id}
            item={item}
            prefix="script-win"
            selectedConfigs={selectedConfigs}
            onSelectConfig={onSelectConfig}
            badge="Windows"
            badgeVariant="info"
          />
        ))}
      </div>
    </section>
  );
}
