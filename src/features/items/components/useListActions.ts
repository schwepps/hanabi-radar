import { useMemo } from 'react';
import type { Dispatch } from 'react';
import type { ListAction } from '../lib/reducer';
import type { DateRange, SortKey, Stream } from '../types';

/**
 * Stable, memoized set of dispatch-bound handlers for the Item List. Extracted
 * from the container to keep it under the size budget; the object is memoized on
 * `dispatch` (itself stable) so consumers get referentially stable callbacks.
 */
export function useListActions(dispatch: Dispatch<ListAction>) {
  return useMemo(
    () => ({
      setQuery: (query: string) => dispatch({ type: 'setQuery', query }),
      setTab: (tab: Stream) => dispatch({ type: 'setTab', tab }),
      setSort: (sort: SortKey) => dispatch({ type: 'setSort', sort }),
      toggleDomain: (domain: string) =>
        dispatch({ type: 'toggleDomain', domain }),
      setAccount: (account: string) =>
        dispatch({ type: 'setAccount', account }),
      setDateRange: (dateRange: DateRange) =>
        dispatch({ type: 'setDateRange', dateRange }),
      openReveal: (id: string) => dispatch({ type: 'openReveal', id }),
      closeReveal: () => dispatch({ type: 'closeReveal' }),
      reset: () => dispatch({ type: 'resetFilters' }),
    }),
    [dispatch],
  );
}
