import {
  Check,
  ChevronRight,
  FileText,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type {
  SettingSearchHit,
  SettingsSearchFacet,
  SettingsSearchResult,
} from "../../shared/ipc-types";
import { CollectButton } from "../components/collection/CollectButton";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { errorMessage, ipc } from "../lib/ipc";
import { familyMeta } from "../lib/section-catalog";
import { useApp } from "../state/context";

export const SEARCH_LIMIT = 200;
const EXAMPLES = ["BitLocker", "firewall", "device_vendor_msft_policy_config"];

// The last search survives a trip to a policy and back.

function familyLabel(
  hit: Pick<SettingSearchHit, "familyKey" | "sectionLabel">,
): string {
  return familyMeta(hit.familyKey)?.label ?? hit.sectionLabel;
}

function assignmentText(hit: SettingSearchHit): string | null {
  if (hit.assignmentCount === null) return null;
  const parts: string[] = [];
  if (hit.assignedToAllUsers) parts.push("All users");
  if (hit.assignedToAllDevices) parts.push("All devices");
  if (hit.assignmentCount > 0) {
    parts.push(
      `${hit.assignmentCount} ${hit.assignmentCount === 1 ? "group" : "groups"}`,
    );
  }
  return parts.length ? `Assigned to ${parts.join(" and ")}` : "Not assigned";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Marks the query words inside a text.
function Highlight({
  text,
  pattern,
}: {
  text: string;
  pattern: RegExp | null;
}) {
  if (!pattern) return <>{text}</>;
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <mark
            key={index}
            className="text-petrol-950 rounded-[3px] bg-amber-100 px-px"
          >
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

interface PolicyGroup {
  key: string;
  first: SettingSearchHit;
  hits: SettingSearchHit[];
}

// Groups hits by policy in rank order: a policy appears where its best hit
// ranks.
function groupByPolicy(hits: SettingSearchHit[]): PolicyGroup[] {
  const groups = new Map<string, PolicyGroup>();
  for (const hit of hits) {
    const key = `${hit.sectionKey}\u0000${hit.policyId}`;
    const group = groups.get(key);
    if (group) group.hits.push(hit);
    else groups.set(key, { key, first: hit, hits: [hit] });
  }
  return [...groups.values()];
}

function FilterChips({
  legend,
  facets,
  selected,
  label,
  onToggle,
}: {
  legend: string;
  facets: SettingsSearchFacet[];
  selected: string[];
  label: (value: string) => string;
  onToggle: (value: string) => void;
}) {
  // A selected filter stays visible even when the query no longer matches it.
  const values = [
    ...facets,
    ...selected
      .filter((value) => !facets.some((facet) => facet.value === value))
      .map((value) => ({ value, count: 0 })),
  ];
  if (values.length === 0) return null;
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="text-petrol-600 float-left mr-1.5 text-[10px] font-bold tracking-[0.14em] uppercase">
        {legend}
      </legend>
      {values.map((facet) => {
        const active = selected.includes(facet.value);
        return (
          <button
            key={facet.value}
            type="button"
            aria-pressed={active}
            onClick={() => onToggle(facet.value)}
            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
              active
                ? "border-teal-600/40 bg-teal-50 text-teal-800"
                : "border-petrol-950/10 text-petrol-700 hover:bg-mint-50 bg-white"
            }`}
          >
            {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {label(facet.value)}
            <span className="text-petrol-600 font-medium tabular-nums">
              {facet.count.toLocaleString()}
            </span>
          </button>
        );
      })}
    </fieldset>
  );
}

function HitRow({
  hit,
  pattern,
}: {
  hit: SettingSearchHit;
  pattern: RegExp | null;
}) {
  return (
    <li className="grid gap-x-6 gap-y-1.5 px-5 py-3 [contain-intrinsic-size:1px_72px] [content-visibility:auto] md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="min-w-0">
        {hit.path.length > 0 && (
          <p className="text-petrol-600 selectable mb-0.5 text-[11px] leading-4 break-words">
            {hit.path.join(" › ")}
          </p>
        )}
        <p className="text-petrol-950 selectable text-sm leading-5 font-semibold break-words">
          <Highlight text={hit.name} pattern={pattern} />
        </p>
        {hit.definitionId && hit.definitionId !== hit.name && (
          <p className="text-petrol-600 selectable mt-1 font-mono text-[11px] leading-4 break-all">
            <span className="sr-only">Technical id: </span>
            <Highlight text={hit.definitionId} pattern={pattern} />
          </p>
        )}
      </div>
      <div className="min-w-0">
        <p className="text-petrol-600 text-[10px] font-bold tracking-[0.1em] uppercase md:sr-only">
          Value
        </p>
        <p className="text-petrol-800 selectable line-clamp-6 text-[13px] leading-5 break-words whitespace-pre-line">
          <Highlight text={hit.value} pattern={pattern} />
        </p>
      </div>
    </li>
  );
}

function PolicyCard({
  group,
  pattern,
  onOpen,
}: {
  group: PolicyGroup;
  pattern: RegExp | null;
  onOpen: () => void;
}) {
  const { first, hits } = group;
  const Icon = familyMeta(first.familyKey)?.icon ?? FileText;
  const assignment = assignmentText(first);
  const family = familyLabel(first);
  return (
    <section
      className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white"
      aria-label={`${first.policyName}, ${family}`}
    >
      <div className="border-petrol-950/6 flex items-start gap-3 border-b px-5 py-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
          <Icon
            className="h-[18px] w-[18px]"
            strokeWidth={1.8}
            aria-hidden="true"
          />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="min-w-0">
            <button
              type="button"
              onClick={onOpen}
              title={`Open in ${family}`}
              className="group text-petrol-950 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md text-left text-[15px] font-semibold hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              <span className="min-w-0 break-words">
                <Highlight text={first.policyName} pattern={pattern} />
              </span>
              <ChevronRight
                className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden="true"
              />
              <span className="sr-only">, open in {family}</span>
            </button>
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Badge>{family}</Badge>
            {first.platforms.map((platform) => (
              <Badge key={platform} variant="info">
                {platform}
              </Badge>
            ))}
            {assignment && (
              <span
                className={`inline-flex items-center gap-1.5 text-[11px] ${
                  assignment === "Not assigned"
                    ? "text-amber-800"
                    : "text-petrol-600"
                }`}
              >
                <Users className="h-3 w-3" aria-hidden="true" />
                {assignment}
              </span>
            )}
          </div>
        </div>
        <span className="bg-mint-100 text-petrol-700 mt-1 shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold tabular-nums">
          {hits.length.toLocaleString()}{" "}
          {hits.length === 1 ? "setting" : "settings"}
        </span>
      </div>
      <ul className="divide-petrol-950/6 divide-y">
        {hits.map((hit, index) => (
          <HitRow
            key={`${hit.definitionId ?? hit.name}-${index}`}
            hit={hit}
            pattern={pattern}
          />
        ))}
      </ul>
    </section>
  );
}

function SearchInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <div className="relative">
      <Search
        className="text-petrol-600 pointer-events-none absolute top-1/2 left-4 h-[18px] w-[18px] -translate-y-1/2"
        aria-hidden="true"
      />
      <label htmlFor="settings-search" className="sr-only">
        Search settings by name, value or technical id
      </label>
      <input
        ref={input}
        id="settings-search"
        type="search"
        autoComplete="off"
        spellCheck={false}
        // Main searches at most 200 characters.
        maxLength={200}
        placeholder="Search by setting name, value or technical id"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        className="border-petrol-950/8 text-petrol-950 placeholder:text-petrol-600/70 min-h-12 w-full rounded-xl border bg-white py-3 pr-12 pl-11 text-[15px] shadow-[0_8px_24px_-22px_rgba(8,47,54,0.45)] transition-[border-color,box-shadow] focus-visible:border-teal-600/40 focus-visible:ring-2 focus-visible:ring-teal-600/20 focus-visible:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
          className="text-petrol-600 hover:bg-mint-50 hover:text-petrol-950 absolute top-1/2 right-1.5 flex h-9 w-9 -translate-y-1/2 cursor-pointer items-center justify-center rounded-lg"
          aria-label="Clear search"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

function resultText(result: SettingsSearchResult, policies: number): string {
  const matches = `${result.total.toLocaleString()} ${result.total === 1 ? "match" : "matches"}`;
  if (result.total > result.hits.length) {
    return `Showing ${result.hits.length.toLocaleString()} of ${matches}`;
  }
  return `${matches} in ${policies.toLocaleString()} ${policies === 1 ? "policy" : "policies"}`;
}

export function SearchSettingsScreen() {
  const { state, dispatch } = useApp();
  const summary = state.collection.summary;
  const collectedAt = summary?.collectedAt ?? null;
  const [query, setQuery] = useState(state.settingsSearch.query);
  const [families, setFamilies] = useState<string[]>(
    state.settingsSearch.families,
  );
  const [platforms, setPlatforms] = useState<string[]>(
    state.settingsSearch.platforms,
  );
  const [result, setResult] = useState<SettingsSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounced = useDebouncedValue(query.trim(), 200);
  const requestId = useRef(0);

  // Kept in app state so the search survives navigation but is cleared with
  // the collection on sign-out or a tenant switch.
  useEffect(() => {
    dispatch({
      type: "settingsSearch",
      search: { query: debounced, families, platforms },
    });
  }, [debounced, families, platforms, dispatch]);

  useEffect(() => {
    const id = ++requestId.current;
    if (!collectedAt || !debounced) {
      setResult(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    ipc
      .collectSearchSettings({
        query: debounced,
        families,
        platforms,
        limit: SEARCH_LIMIT,
      })
      .then((next) => {
        if (id !== requestId.current) return;
        setResult(next);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        setError(errorMessage(caught));
        setResult(null);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [debounced, families, platforms, collectedAt]);

  const groups = useMemo(
    () => (result ? groupByPolicy(result.hits) : []),
    [result],
  );
  const pattern = useMemo(() => {
    const words = (result?.query ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map(escapeRegExp);
    return words.length ? new RegExp(`(${words.join("|")})`, "gi") : null;
  }, [result]);

  const toggle = (
    list: string[],
    set: (next: string[]) => void,
    value: string,
  ) =>
    set(
      list.includes(value)
        ? list.filter((entry) => entry !== value)
        : [...list, value],
    );
  const openPolicy = (hit: SettingSearchHit) =>
    dispatch({
      type: "navigate",
      screen: "section",
      familyKey: hit.familyKey,
      query: hit.policyName,
    });
  const filtered = families.length > 0 || platforms.length > 0;
  const pending =
    Boolean(debounced) && (loading || debounced !== result?.query);

  let body: ReactNode;
  if (!summary) {
    body = (
      <EmptyState
        icon={Search}
        title={
          state.collection.running
            ? "Collecting your tenant"
            : "Collect your tenant first"
        }
        description={
          state.collection.running
            ? "Search becomes available as soon as the collection finishes."
            : "Search runs offline on the collected configuration, so there is nothing to search yet."
        }
        action={!state.collection.running && <CollectButton showMeta={false} />}
      />
    );
  } else if (!query.trim()) {
    body = (
      <EmptyState
        icon={Search}
        title="Search every collected setting"
        description="Type a setting name, a configured value or a technical id. Every word has to match."
        action={EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            onClick={() => setQuery(example)}
            className="border-petrol-950/10 text-petrol-800 hover:bg-mint-50 min-h-9 cursor-pointer rounded-full border bg-white px-3.5 font-mono text-xs focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
          >
            {example}
          </button>
        ))}
      />
    );
  } else if (error) {
    body = <Alert tone="danger">{error}</Alert>;
  } else if (!result) {
    body = (
      <div className="text-petrol-600 flex items-center gap-2 px-1 py-6 text-[13px]">
        <Spinner /> Searching settings
      </div>
    );
  } else if (result.total === 0) {
    body = (
      <EmptyState
        compact
        icon={SearchX}
        title={
          filtered
            ? "No settings match your search and filters"
            : "No settings match your search"
        }
        description={
          filtered
            ? "Try removing a filter or searching for fewer words."
            : `Searched ${result.indexedSettings.toLocaleString()} settings. Try fewer words, part of a technical id or a value.`
        }
      />
    );
  } else {
    body = (
      <div
        className={`space-y-4 transition-opacity ${pending ? "opacity-60" : ""}`}
        aria-busy={pending}
      >
        {groups.map((group) => (
          <PolicyCard
            key={group.key}
            group={group}
            pattern={pattern}
            onOpen={() => openPolicy(group.first)}
          />
        ))}
        {result.total > result.hits.length && (
          <p className="text-petrol-600 px-1 text-center text-xs">
            Showing the first {result.hits.length.toLocaleString()} of{" "}
            {result.total.toLocaleString()} matches. Add a word or a filter to
            narrow the results.
          </p>
        )}
      </div>
    );
  }

  const showFilters = Boolean(
    summary && result && (result.families.length > 0 || filtered),
  );

  return (
    <div className="space-y-5">
      <Header
        eyebrow="Configurations"
        title="Search settings"
        description={
          summary
            ? "Find a setting by name, value or technical id across every collected policy. Search runs offline on the last collection."
            : "Find a setting by name, value or technical id across every collected policy."
        }
      />
      {summary && (
        <div className="space-y-3">
          <SearchInput value={query} onChange={setQuery} />
          {showFilters && result && (
            <div className="space-y-2">
              <FilterChips
                legend="Family"
                facets={result.families}
                selected={families}
                label={(key) => familyMeta(key)?.label ?? key}
                onToggle={(value) => toggle(families, setFamilies, value)}
              />
              <FilterChips
                legend="Platform"
                facets={result.platforms}
                selected={platforms}
                label={(value) => value}
                onToggle={(value) => toggle(platforms, setPlatforms, value)}
              />
            </div>
          )}
          <div className="flex min-h-5 items-center gap-2 px-1">
            <p
              className="text-petrol-700 text-xs font-semibold tabular-nums"
              aria-live="polite"
            >
              {result && debounced && !error
                ? resultText(result, groups.length)
                : ""}
            </p>
            {pending && result && <Spinner className="h-3.5 w-3.5" />}
            {filtered && (
              <button
                type="button"
                onClick={() => {
                  setFamilies([]);
                  setPlatforms([]);
                }}
                className="text-xs font-semibold text-teal-700 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
      {body}
    </div>
  );
}
