import {
  Check,
  ChevronRight,
  FileText,
  RotateCw,
  Search,
  SearchX,
  Users,
  X,
} from "lucide-react";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import {
  SEARCH_NEEDS_COLLECTION,
  type SettingSearchHit,
  type SettingsSearchFacet,
  type SettingsSearchResult,
} from "../../shared/ipc-types";
import { CollectButton } from "../components/collection/CollectButton";
import { Header } from "../components/layout/Header";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { CopyButton } from "../components/ui/CopyButton";
import { EmptyState } from "../components/ui/EmptyState";
import { Spinner } from "../components/ui/Spinner";
import { useDebouncedValue } from "../hooks/use-debounced-value";
import { errorMessage, ipc } from "../lib/ipc";
import { familyMeta } from "../lib/section-catalog";
import { useApp } from "../state/context";

export const SEARCH_LIMIT = 200;
const EXAMPLES = ["BitLocker", "firewall", "device_vendor_msft_policy_config"];
// Chips shown per filter before "More".
const CHIP_LIMIT = 8;

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

function matchCount(count: number): string {
  return `${count.toLocaleString()} ${count === 1 ? "match" : "matches"}`;
}

// The query words worth marking; a single character would mark nearly every
// value.
export function highlightPattern(query: string): RegExp | null {
  const words = query
    .split(/\s+/)
    .filter((word) => word.length >= 2)
    .map(escapeRegExp);
  return words.length ? new RegExp(`(${words.join("|")})`, "gi") : null;
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

interface Chip {
  value: string;
  // Null while the counts of the current query are not known.
  count: number | null;
}

function FilterChips({
  legend,
  facets,
  selected,
  label,
  onToggle,
}: {
  legend: string;
  // Null when there is no result to count, for example while searching.
  facets: SettingsSearchFacet[] | null;
  selected: string[];
  label: (value: string) => string;
  onToggle: (value: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  // A selected filter stays visible even when the query no longer matches it.
  // Main sorts the facets by count.
  const values: Chip[] = [
    ...(facets ?? []),
    ...selected
      .filter((value) => !facets?.some((facet) => facet.value === value))
      .map((value) => ({ value, count: facets ? 0 : null })),
  ];
  if (values.length === 0) return null;
  const collapsed = values.filter(
    (chip, index) => index < CHIP_LIMIT || selected.includes(chip.value),
  );
  const more = values.length - collapsed.length;
  const shown = expanded ? values : collapsed;
  return (
    <fieldset className="flex flex-wrap items-center gap-1.5">
      <legend className="text-petrol-600 float-left mr-1.5 text-[10px] font-bold tracking-[0.14em] uppercase">
        {legend}
      </legend>
      {shown.map((chip) => {
        const active = selected.includes(chip.value);
        const text = label(chip.value);
        return (
          <button
            key={chip.value}
            type="button"
            aria-pressed={active}
            aria-label={
              chip.count === null ? text : `${text}, ${matchCount(chip.count)}`
            }
            onClick={() => onToggle(chip.value)}
            className={`inline-flex min-h-8 cursor-pointer items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none ${
              active
                ? "border-teal-600/40 bg-teal-50 text-teal-800"
                : "border-petrol-950/10 text-petrol-700 hover:bg-mint-50 bg-white"
            }`}
          >
            {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {text}
            {chip.count !== null && (
              <span className="text-petrol-600 font-medium tabular-nums">
                {chip.count.toLocaleString()}
              </span>
            )}
          </button>
        );
      })}
      {more > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="min-h-8 cursor-pointer rounded-full px-2.5 text-xs font-semibold text-teal-700 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          {expanded ? "Fewer" : `More (${more.toLocaleString()})`}
        </button>
      )}
    </fieldset>
  );
}

// A long value is clamped to six lines and can be shown in full.
function HitValue({
  value,
  pattern,
}: {
  value: string;
  pattern: RegExp | null;
}) {
  const text = useRef<HTMLParagraphElement>(null);
  const id = useId();
  const [clamped, setClamped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const node = text.current;
    // An expanded value keeps its toggle.
    if (!node || expanded) return;
    const measure = () =>
      setClamped(node.scrollHeight > node.clientHeight + 1);
    if (typeof ResizeObserver === "undefined") {
      measure();
      return;
    }
    // Also measures a row once it scrolls into view and gets a layout.
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [value, expanded]);
  return (
    <>
      <p
        ref={text}
        id={id}
        className={`text-petrol-800 selectable text-[13px] leading-5 break-words whitespace-pre-line ${
          expanded ? "" : "line-clamp-6"
        }`}
      >
        <Highlight text={value} pattern={pattern} />
      </p>
      {clamped && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={id}
          onClick={() => setExpanded(!expanded)}
          className="mt-1 cursor-pointer rounded text-xs font-semibold text-teal-700 hover:underline focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
        >
          {expanded ? "Show less" : "Show full value"}
        </button>
      )}
    </>
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
      <div className="flex min-w-0 items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-petrol-600 text-[10px] font-bold tracking-[0.1em] uppercase md:sr-only">
            Value
          </p>
          <HitValue value={hit.value} pattern={pattern} />
        </div>
        {hit.value && (
          <div className="-my-1.5 -mr-2">
            <CopyButton value={hit.value} label="Copy value" />
          </div>
        )}
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
    <article
      // Scroll margin keeps a focused control clear of the sticky search bar.
      className="border-petrol-950/6 shadow-card overflow-hidden rounded-2xl border bg-white [&_button]:scroll-mt-24"
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
              className="group text-petrol-950 -mx-1.5 inline-flex max-w-[calc(100%+0.75rem)] cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-left text-[15px] font-semibold hover:text-teal-700 focus-visible:ring-2 focus-visible:ring-teal-600 focus-visible:outline-none"
            >
              {/* The chevron follows the last word of a wrapped title. */}
              <span className="min-w-0 break-words">
                <Highlight text={first.policyName} pattern={pattern} />
                <ChevronRight
                  className="ml-1 inline-block h-4 w-4 align-[-3px] transition-transform group-hover:translate-x-0.5"
                  aria-hidden="true"
                />
              </span>
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
    </article>
  );
}

function SearchInput({
  value,
  onChange,
  input,
}: {
  value: string;
  onChange: (value: string) => void;
  input: RefObject<HTMLInputElement | null>;
}) {
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
  const matches = matchCount(result.total);
  if (result.total > result.hits.length) {
    return `Showing ${result.hits.length.toLocaleString()} of ${matches}`;
  }
  return `${matches} in ${policies.toLocaleString()} ${policies === 1 ? "policy" : "policies"}`;
}

type SearchError = "noCollection" | "failed";

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
  const [error, setError] = useState<SearchError | null>(null);
  const [attempt, setAttempt] = useState(0);
  // Typing waits for a pause; clearing the query, by the user or with the
  // collection, applies at once.
  const debounced = useDebouncedValue(query.trim(), query.trim() ? 200 : 0);
  const requestId = useRef(0);
  const input = useRef<HTMLInputElement>(null);

  // Focuses the input when the user opens the screen, not when a collection
  // appears or finishes while it is open.
  useEffect(() => input.current?.focus(), []);

  // A sign-out or tenant switch clears the collection, and with it the
  // search. A new collection keeps it and searches again in place.
  const hasCollection = Boolean(summary);
  const [hadCollection, setHadCollection] = useState(hasCollection);
  if (hadCollection !== hasCollection) {
    setHadCollection(hasCollection);
    if (!hasCollection) {
      setQuery("");
      setFamilies([]);
      setPlatforms([]);
    }
  }

  // Kept in app state so the search survives navigation.
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
    // Earlier results stay, dimmed, until the new ones arrive.
    setLoading(true);
    setError(null);
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
      })
      .catch((caught: unknown) => {
        if (id !== requestId.current) return;
        setError(
          errorMessage(caught) === SEARCH_NEEDS_COLLECTION
            ? "noCollection"
            : "failed",
        );
        setResult(null);
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
  }, [debounced, families, platforms, collectedAt, attempt]);

  const groups = useMemo(
    () => (result ? groupByPolicy(result.hits) : []),
    [result],
  );
  const pattern = useMemo(
    () => highlightPattern(result?.query ?? ""),
    [result],
  );

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
  const clearFilters = () => {
    setFamilies([]);
    setPlatforms([]);
  };
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
  } else if (error === "noCollection") {
    body = (
      <Alert
        tone="warning"
        title="The collection is no longer available"
        action={<CollectButton showMeta={false} />}
      >
        Collect your tenant again to search its settings.
      </Alert>
    );
  } else if (error) {
    body = (
      <Alert
        tone="danger"
        action={
          <Button
            variant="secondary"
            size="sm"
            icon={RotateCw}
            onClick={() => setAttempt((count) => count + 1)}
          >
            Retry
          </Button>
        }
      >
        Search failed. Try again.
      </Alert>
    );
  } else if (!result) {
    body = (
      <div
        className="text-petrol-600 flex items-center gap-2 px-1 py-6 text-[13px]"
        role="status"
      >
        <Spinner /> Searching settings
      </div>
    );
  } else if (result.total === 0) {
    // Family counts ignore the filters, so together they are the matches of
    // the query alone.
    const unfiltered = result.families.reduce(
      (sum, facet) => sum + facet.count,
      0,
    );
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
          !filtered
            ? `Searched ${result.indexedSettings.toLocaleString()} settings. Try fewer words, part of a technical id or a value.`
            : unfiltered > 0
              ? `${unfiltered.toLocaleString()} ${unfiltered === 1 ? "setting matches" : "settings match"} without filters.`
              : "Nothing matches without filters either. Try fewer words, part of a technical id or a value."
        }
        action={
          filtered && (
            <Button variant="secondary" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )
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

  // Selected filters stay visible in every state; counts need a result.
  const facets = result && !error ? result : null;
  const showFilters = filtered || Boolean(facets && facets.families.length > 0);
  // Never announces the count of the previous query.
  const liveText =
    !debounced || error
      ? ""
      : pending
        ? "Searching"
        : result
          ? resultText(result, groups.length)
          : "";

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
        // Stays at the top of long result lists; the shadow in the page
        // color covers results that scroll behind it.
        <div className="sticky top-2 z-20 rounded-xl shadow-[0_0_0_8px_var(--color-mint-50)]">
          <SearchInput value={query} onChange={setQuery} input={input} />
        </div>
      )}
      {summary && (
        <div className="-mt-2 space-y-3">
          {showFilters && (
            <div className="space-y-2">
              <FilterChips
                legend="Family"
                facets={facets?.families ?? null}
                selected={families}
                label={(key) => familyMeta(key)?.label ?? key}
                onToggle={(value) => toggle(families, setFamilies, value)}
              />
              <FilterChips
                legend="Platform"
                facets={facets?.platforms ?? null}
                selected={platforms}
                label={(value) => value}
                onToggle={(value) => toggle(platforms, setPlatforms, value)}
              />
            </div>
          )}
          <div className="flex min-h-5 items-center gap-2 px-1">
            {/* An empty live region keeps its place without leaving a gap. */}
            <p
              className="text-petrol-700 text-xs font-semibold tabular-nums empty:-mr-2"
              aria-live="polite"
            >
              {liveText}
            </p>
            {pending && result && <Spinner className="h-3.5 w-3.5" />}
            {filtered && (
              <button
                type="button"
                onClick={clearFilters}
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
