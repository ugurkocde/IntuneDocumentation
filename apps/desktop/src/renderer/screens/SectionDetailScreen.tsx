import { AlertCircle, Clock, FileText, Search, SearchX, Users, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SectionCount, SectionItemSummary } from "../../shared/ipc-types";
import { CollectButton } from "../components/collection/CollectButton";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { errorMessage } from "../lib/ipc";
import {
  familyMeta,
  friendlyPlatforms,
  friendlyTechnologies,
  friendlyType,
} from "../lib/section-catalog";
import { useApp } from "../state/context";

function assignmentText(item: SectionItemSummary): string | null {
  if (item.assignmentCount === null) return null;
  const parts: string[] = [];
  if (item.assignedToAllUsers) parts.push("All users");
  if (item.assignedToAllDevices) parts.push("All devices");
  if (item.assignmentCount > 0) {
    parts.push(`${item.assignmentCount} ${item.assignmentCount === 1 ? "group" : "groups"}`);
  }
  return parts.length ? `Assigned to ${parts.join(" and ")}` : "Not assigned";
}

function ItemRow({ item }: { item: SectionItemSummary }) {
  const type = friendlyType(item.odataType);
  const platforms = friendlyPlatforms(item.platforms);
  const technologies = friendlyTechnologies(item.technologies);
  const assignment = assignmentText(item);
  return (
    <li className="hover:bg-mint-50/60 px-5 py-4 transition-colors [contain-intrinsic-size:1px_76px] [content-visibility:auto]">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-petrol-950 selectable min-w-0 text-sm font-semibold break-words">{item.displayName}</p>
        {item.hasFetchError && (
          <Badge variant="warning" title="Settings could not be loaded from Microsoft Graph">
            <AlertCircle className="h-3 w-3" aria-hidden="true" />
            Settings unavailable
          </Badge>
        )}
        {platforms.map((platform) => (
          <Badge key={platform} variant="info">
            {platform}
          </Badge>
        ))}
        {technologies.map((technology) => (
          <Badge key={technology}>{technology}</Badge>
        ))}
      </div>
      {item.description && (
        <p className="text-petrol-600 selectable mt-1 line-clamp-2 max-w-4xl text-xs leading-5">{item.description}</p>
      )}
      <div className="text-petrol-600 mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        {type && <span className="font-medium">{type}</span>}
        {item.lastModifiedDateTime && (
          <span className="inline-flex items-center gap-1.5 tabular-nums">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Modified {new Date(item.lastModifiedDateTime).toLocaleDateString()}
          </span>
        )}
        {assignment && (
          <span
            className={`inline-flex items-center gap-1.5 ${assignment === "Not assigned" ? "text-amber-800" : ""}`}
          >
            <Users className="h-3 w-3" aria-hidden="true" />
            {assignment}
          </span>
        )}
      </div>
    </li>
  );
}

function matches(item: SectionItemSummary, query: string): boolean {
  if (!query) return true;
  const haystack = [item.displayName, item.description, friendlyType(item.odataType), item.platforms]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function SectionCard({ section, query }: { section: SectionCount; query: string }) {
  const { state, actions } = useApp();
  const loaded = state.sections[section.key];
  const [error, setError] = useState<string | null>(null);
  const family = familyMeta(section.familyKey);
  const Icon = family?.icon ?? FileText;

  useEffect(() => {
    if (loaded || section.count === 0) return;
    let cancelled = false;
    actions.loadSection(section.key).catch((caught: unknown) => {
      if (!cancelled) setError(errorMessage(caught));
    });
    return () => {
      cancelled = true;
    };
  }, [loaded, section.key, section.count, actions]);

  const items = useMemo(
    () => (loaded ? loaded.items.filter((item) => matches(item, query)) : []),
    [loaded, query],
  );
  if (query && loaded && items.length === 0) return null;

  return (
    <section className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white" aria-label={section.label}>
      <div className="border-petrol-950/6 flex min-h-16 items-center gap-3 border-b px-5 py-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} aria-hidden="true" />
        </span>
        <h2 className="text-petrol-950 min-w-0 flex-1 truncate text-[15px] font-semibold">{section.label}</h2>
        <span className="bg-mint-100 text-petrol-700 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums">
          {query && loaded ? `${items.length} of ${section.count}` : section.count.toLocaleString()}
        </span>
      </div>
      {section.error && (
        <div className="border-petrol-950/6 border-b px-5 py-3">
          <p className="flex items-start gap-2 text-xs leading-5 text-amber-900">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" aria-hidden="true" />
            <span>Microsoft Graph returned incomplete data for this section: {section.error}</span>
          </p>
        </div>
      )}
      {section.count === 0 ? (
        <p className="text-petrol-600 px-5 py-6 text-center text-[13px]">Nothing is configured in this section.</p>
      ) : error ? (
        <div className="p-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : !loaded ? (
        <div className="text-petrol-600 flex items-center gap-2 px-5 py-6 text-[13px]" role="status">
          <Spinner /> Loading items
        </div>
      ) : (
        <ul className="divide-petrol-950/6 divide-y">
          {items.map((item) => (
            <ItemRow key={item.id} item={item} />
          ))}
        </ul>
      )}
    </section>
  );
}

export function SectionDetailScreen() {
  const { state } = useApp();
  const familyKey = state.activeFamilyKey;
  const family = familyMeta(familyKey);
  const [search, setSearch] = useState("");
  useEffect(() => setSearch(""), [familyKey]);
  const summary = state.collection.summary;
  const sections = (summary?.sectionCounts ?? []).filter((section) => section.familyKey === familyKey);
  const total = sections.reduce((sum, section) => sum + section.count, 0);
  const query = search.trim().toLowerCase();

  const loadedMatches = sections.reduce((sum, section) => {
    const loaded = state.sections[section.key];
    return sum + (loaded ? loaded.items.filter((item) => matches(item, query)).length : 0);
  }, 0);
  const allLoaded = sections.every((section) => section.count === 0 || state.sections[section.key]);

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Configurations"
        title={family?.label ?? "Configurations"}
        description={
          summary
            ? `${total.toLocaleString()} ${total === 1 ? "item" : "items"} in ${sections.length} ${sections.length === 1 ? "section" : "sections"}.`
            : undefined
        }
        actions={
          summary && total > 0 ? (
            <div className="relative w-72">
              <Search className="text-petrol-600 pointer-events-none absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2" aria-hidden="true" />
              <label htmlFor="section-search" className="sr-only">
                Search this family
              </label>
              <input
                id="section-search"
                type="search"
                autoComplete="off"
                placeholder={`Search ${family?.label ?? "items"}`}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="border-petrol-950/8 text-petrol-950 placeholder:text-petrol-600/70 min-h-11 w-full rounded-xl border bg-white py-2.5 pr-10 pl-10 text-sm shadow-[0_8px_24px_-22px_rgba(8,47,54,0.45)] transition-[border-color,box-shadow] focus-visible:border-teal-600/40 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : undefined
        }
      />
      <p className="sr-only" aria-live="polite">
        {query && allLoaded ? `${loadedMatches} matching items` : ""}
      </p>
      {!summary ? (
        <EmptyState
          icon={family?.icon ?? FileText}
          title={state.collection.running ? "Collecting your tenant" : "No data collected yet"}
          description={
            state.collection.running
              ? "This family appears here as soon as the collection finishes."
              : `Collect your tenant to browse ${family?.label ?? "this family"}.`
          }
          action={!state.collection.running && <CollectButton showMeta={false} />}
        />
      ) : sections.length === 0 || total === 0 ? (
        <EmptyState
          icon={family?.icon ?? FileText}
          title="Nothing configured here"
          description={`The last collection found nothing in ${family?.label ?? "this family"} for this tenant.`}
        />
      ) : (
        <>
          <div className="space-y-4">
            {sections
              .filter((section) => !query || section.count > 0)
              .map((section) => (
                <SectionCard key={section.key} section={section} query={query} />
              ))}
          </div>
          {query && allLoaded && loadedMatches === 0 && (
            <EmptyState
              compact
              icon={SearchX}
              title="No items match your search"
              description="Try a different name, description or type."
            />
          )}
        </>
      )}
    </div>
  );
}
