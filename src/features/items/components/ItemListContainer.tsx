'use client';

import { useEffect, useMemo, useReducer, useRef } from 'react';
import { applyFilters, filterByTab, tallyByStream } from '../lib/filter';
import type { FilterCriteria } from '../lib/filter';
import { initialState, listReducer } from '../lib/reducer';
import { sortItems } from '../lib/sort';
import type { ListItem } from '../types';
import { FilterRail } from './FilterRail';
import { ItemList } from './ItemList';
import { RealtimeBanner } from './RealtimeBanner';
import { ResultCount } from './ResultCount';
import { RevealModal } from './RevealModal';
import { SortControl } from './SortControl';
import { StreamTabs } from './StreamTabs';
import { TopBar } from './TopBar';
import { useListActions } from './useListActions';
import { useLiveFeed } from './useLiveFeed';

interface ItemListContainerProps {
  initialItems: ListItem[];
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The single client state owner. Holds the interaction state (useReducer) and the
 * live item feed (useLiveFeed — server fetch + Supabase Realtime + persisted
 * status), derives the visible list, per-stream counts, filter accounts and the
 * arrival banner from them, then passes value + handler props to the leaves.
 */
export function ItemListContainer({ initialItems }: ItemListContainerProps) {
  const [state, dispatch] = useReducer(listReducer, undefined, initialState);
  const actions = useListActions(dispatch);
  const feed = useLiveFeed(initialItems);
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses the search field (unless typing in a field already).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const active = document.activeElement as HTMLElement | null;
      if (
        active != null &&
        (EDITABLE_TAGS.has(active.tagName) || active.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      searchRef.current?.focus();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  const criteria: FilterCriteria = useMemo(
    () => ({
      domains: state.domains,
      account: state.account,
      dateRange: state.dateRange,
      query: state.query,
    }),
    [state.domains, state.account, state.dateRange, state.query],
  );

  // Filter once, then derive both the per-stream counts and the visible list.
  const filtered = useMemo(
    () => applyFilters(feed.items, criteria),
    [feed.items, criteria],
  );
  const counts = useMemo(() => tallyByStream(filtered), [filtered]);
  const visibleItems = useMemo(
    () => sortItems(filterByTab(filtered, state.tab), state.sort),
    [filtered, state.tab, state.sort],
  );

  // Accounts for the filter rail, derived from the LIVE feed so a realtime arrival
  // from a not-yet-seen account is filterable.
  const accounts = useMemo(
    () =>
      Array.from(
        new Set(
          feed.items
            .map((item) => item.account)
            .filter((account): account is string => account != null),
        ),
      ).sort((a, b) => a.localeCompare(b, 'fr')),
    [feed.items],
  );

  // Processed ids for the card state — single source of truth is items.status.
  const processed = useMemo(
    () => feed.items.filter((item) => item.isProcessed).map((item) => item.id),
    [feed.items],
  );

  // Arrival banner: items that arrived live AND are visible under the current
  // tab/filters (scoped to the current view). Hidden on load — arrivals start empty.
  // "masquer" clears exactly these ids, so live arrivals on other tabs still surface.
  const visibleArrivalIds = useMemo(
    () =>
      visibleItems
        .filter((item) => feed.arrivals.includes(item.id))
        .map((item) => item.id),
    [visibleItems, feed.arrivals],
  );

  const revealItem = useMemo(
    () =>
      state.revealFor == null
        ? null
        : (feed.items.find((item) => item.id === state.revealFor) ?? null),
    [state.revealFor, feed.items],
  );

  return (
    <div className="min-h-svh bg-canvas">
      <TopBar
        query={state.query}
        onQueryChange={actions.setQuery}
        searchRef={searchRef}
      />
      <div className="mx-auto flex w-full max-w-[1360px] items-start">
        <FilterRail
          domains={state.domains}
          onToggleDomain={actions.toggleDomain}
          accounts={accounts}
          account={state.account}
          onAccountChange={actions.setAccount}
          dateRange={state.dateRange}
          onDateRangeChange={actions.setDateRange}
          onReset={actions.reset}
        />
        <main className="min-w-0 flex-1 px-4 pt-6 pb-20 sm:px-7">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StreamTabs
              activeTab={state.tab}
              counts={counts}
              onSelect={actions.setTab}
            />
            <SortControl sort={state.sort} onChange={actions.setSort} />
          </div>
          {visibleArrivalIds.length > 0 && (
            <div className="mb-4">
              <RealtimeBanner
                count={visibleArrivalIds.length}
                onDismiss={() => feed.clearArrivals(visibleArrivalIds)}
              />
            </div>
          )}
          <div className="mb-3">
            <ResultCount count={visibleItems.length} sort={state.sort} />
          </div>
          <ItemList
            items={visibleItems}
            activeTab={state.tab}
            processed={processed}
            onDismiss={feed.dismiss}
            onToggleProcessed={feed.toggleProcessed}
            onReveal={actions.openReveal}
            onReset={actions.reset}
          />
        </main>
      </div>
      {revealItem != null && (
        <RevealModal
          key={revealItem.id}
          item={revealItem}
          onClose={actions.closeReveal}
        />
      )}
    </div>
  );
}
