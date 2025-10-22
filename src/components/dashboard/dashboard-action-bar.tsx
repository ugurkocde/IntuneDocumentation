import { Search, X, RefreshCw, Layers, Download, Palette, CheckSquare } from "lucide-react";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";

interface DashboardActionBarProps {
  totalCount: number;
  selectedCount: number;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lastFetched: Date | null;
  onRefresh: () => void;
  isLoading: boolean;
  selectAll: boolean;
  onSelectAll: () => void;
  filteredCount: number;
  showSelectFiltered: boolean;
  onSelectFiltered: () => void;
  onBrandingClick: () => void;
  onExportClick: () => void;
}

export function DashboardActionBar({
  totalCount,
  selectedCount,
  searchQuery,
  onSearchChange,
  lastFetched,
  onRefresh,
  isLoading,
  selectAll,
  onSelectAll,
  filteredCount,
  showSelectFiltered,
  onSelectFiltered,
  onBrandingClick,
  onExportClick,
}: DashboardActionBarProps) {
  return (
    <div className="mb-6 space-y-3">
      {/* Main Header Bar */}
      <Card>
        <CardContent className="py-3 px-6">
          <div className="flex flex-col lg:flex-row lg:items-center gap-4">
            {/* Left: Title and Count */}
            <div className="flex items-center gap-3 flex-shrink-0">
              <Layers className="w-5 h-5 text-slate-500" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-slate-900">Configuration Overview</h2>
              <Badge variant="info" size="sm">
                {totalCount} Total
              </Badge>
            </div>

            {/* Center: Search */}
            <div className="flex-1 max-w-xl">
              <div className="relative">
                <label htmlFor="config-search" className="sr-only">
                  Search configurations
                </label>
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400"
                  aria-hidden="true"
                />
                <input
                  id="config-search"
                  type="text"
                  placeholder="Search configurations by name or description..."
                  value={searchQuery}
                  onChange={(e) => onSearchChange(e.target.value)}
                  className="w-full pl-10 pr-10 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white"
                  aria-label="Search configurations by name or description"
                />
                {searchQuery && (
                  <button
                    onClick={() => onSearchChange("")}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label="Clear search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Spacer */}
            <div className="flex-1 hidden lg:block" />

            {/* Right: Last Updated and Refresh */}
            <div className="flex items-center gap-4 flex-shrink-0 ml-auto">
              {lastFetched && (
                <span className="text-xs text-slate-500 whitespace-nowrap">
                  Last updated: {lastFetched.toLocaleTimeString()}
                </span>
              )}
              <Button
                onClick={onRefresh}
                disabled={isLoading}
                loading={isLoading}
                variant="secondary"
                size="sm"
                className="whitespace-nowrap"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Selection Bar */}
      <div className="bg-white border border-slate-200 rounded-lg px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 cursor-pointer group hover:bg-slate-50 px-2 py-1 rounded transition-colors">
              <input
                type="checkbox"
                checked={selectAll}
                onChange={onSelectAll}
                className="checkbox-enhanced"
                aria-label="Select all configurations"
              />
              <span className="text-sm font-medium text-slate-700 group-hover:text-slate-900">
                Select All
              </span>
            </label>
            {showSelectFiltered && (
              <Button
                onClick={onSelectFiltered}
                variant="ghost"
                size="sm"
                className="px-2 py-1"
                aria-label={`Select all ${filteredCount} filtered configurations`}
              >
                <CheckSquare className="w-4 h-4 mr-2" />
                Select Filtered ({filteredCount})
              </Button>
            )}
          </div>

          <div className="flex gap-2">
            <Button
              onClick={onBrandingClick}
              variant="secondary"
              size="sm"
              className="min-w-[120px]"
            >
              <Palette className="w-4 h-4 mr-2" />
              Branding
            </Button>
            <Button
              onClick={onExportClick}
              disabled={selectedCount === 0}
              variant={selectedCount === 0 ? "ghost" : "primary"}
              size="sm"
              className="min-w-[160px] whitespace-nowrap"
              aria-label={
                selectedCount > 0
                  ? `Export ${selectedCount} selected configurations`
                  : "Export selected configurations"
              }
            >
              <Download className="w-4 h-4 mr-2" />
              {selectedCount > 0 ? `Export (${selectedCount})` : "Export Selected"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
