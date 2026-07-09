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

interface ItemListContainerProps {
  initialItems: ListItem[];
  accounts: string[];
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * The single client state owner. Holds the interaction state (useReducer) and
 * derives the visible list, per-stream counts and banner from it, then passes
 * value + handler props to presentational leaves.
 */
export function ItemListContainer({
  initialItems,
  accounts,
}: ItemListContainerProps) {
  const [state, dispatch] = useReducer(listReducer, undefined, initialState);
  const actions = useListActions(dispatch);
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
      dismissed: state.dismissed,
    }),
    [
      state.domains,
      state.account,
      state.dateRange,
      state.query,
      state.dismissed,
    ],
  );

  // Filter once, then derive both the per-stream counts and the visible list.
  const filtered = useMemo(
    () => applyFilters(initialItems, criteria),
    [initialItems, criteria],
  );
  const counts = useMemo(() => tallyByStream(filtered), [filtered]);
  const visibleItems = useMemo(
    () => sortItems(filterByTab(filtered, state.tab), state.sort),
    [filtered, state.tab, state.sort],
  );

  const newCount = useMemo(
    () =>
      visibleItems.filter(
        (item) => item.isNew && !state.processed.includes(item.id),
      ).length,
    [visibleItems, state.processed],
  );
  const isBannerVisible = state.bannerShown && newCount > 0;

  const revealItem = useMemo(
    () =>
      state.revealFor == null
        ? null
        : (initialItems.find((item) => item.id === state.revealFor) ?? null),
    [state.revealFor, initialItems],
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
          {isBannerVisible && (
            <div className="mb-4">
              <RealtimeBanner
                count={newCount}
                onDismiss={actions.dismissBanner}
              />
            </div>
          )}
          <div className="mb-3">
            <ResultCount count={visibleItems.length} sort={state.sort} />
          </div>
          <ItemList
            items={visibleItems}
            activeTab={state.tab}
            processed={state.processed}
            onDismiss={actions.dismissItem}
            onToggleProcessed={actions.toggleProcessed}
            onReveal={actions.openReveal}
            onReset={actions.reset}
          />
        </main>
      </div>
      {revealItem != null && (
        <RevealModal item={revealItem} onClose={actions.closeReveal} />
      )}
    </div>
  );
}
