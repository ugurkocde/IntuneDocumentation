import { Search, Inbox } from "lucide-react";

interface EmptyStateProps {
  type: "search" | "no-data";
  searchQuery?: string;
  onClearSearch?: () => void;
}

export function EmptyState({ type, searchQuery, onClearSearch }: EmptyStateProps) {
  if (type === "search") {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4">
        <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-slate-400" />
        </div>
        <h3 className="text-lg font-semibold text-slate-900 mb-2">No results found</h3>
        <p className="text-sm text-slate-600 text-center max-w-md mb-4">
          No configurations match your search for &quot;{searchQuery}&quot;. Try a different search
          term or clear your filters.
        </p>
        {onClearSearch && (
          <button
            onClick={onClearSearch}
            className="px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer"
          >
            Clear search
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-12 px-4">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
        <Inbox className="w-8 h-8 text-slate-400" />
      </div>
      <h3 className="text-lg font-semibold text-slate-900 mb-2">No configurations found</h3>
      <p className="text-sm text-slate-600 text-center max-w-md">
        This section doesn&apos;t have any configurations yet. Try refreshing or check other
        sections.
      </p>
    </div>
  );
}
