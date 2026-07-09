import type { DateRange, SortKey, Stream } from '../types';

/** Full interaction state for the Item List (see the handoff's State section). */
export interface ListState {
  tab: Stream;
  sort: SortKey;
  domains: string[];
  account: string;
  dateRange: DateRange;
  query: string;
  bannerShown: boolean;
  dismissed: string[];
  processed: string[];
  revealFor: string | null;
}

export type ListAction =
  | { type: 'setTab'; tab: Stream }
  | { type: 'setSort'; sort: SortKey }
  | { type: 'toggleDomain'; domain: string }
  | { type: 'setAccount'; account: string }
  | { type: 'setDateRange'; dateRange: DateRange }
  | { type: 'setQuery'; query: string }
  | { type: 'dismissBanner' }
  | { type: 'dismissItem'; id: string }
  | { type: 'toggleProcessed'; id: string }
  | { type: 'openReveal'; id: string }
  | { type: 'closeReveal' }
  | { type: 'resetFilters' };

export const DEFAULT_TAB: Stream = 'opportunity';
export const DEFAULT_SORT: SortKey = 'reachability';
export const DEFAULT_DATE_RANGE: DateRange = '7d';

export function initialState(): ListState {
  return {
    tab: DEFAULT_TAB,
    sort: DEFAULT_SORT,
    domains: [],
    account: 'all',
    dateRange: DEFAULT_DATE_RANGE,
    query: '',
    bannerShown: true,
    dismissed: [],
    processed: [],
    revealFor: null,
  };
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((entry) => entry !== value)
    : [...list, value];
}

export function listReducer(state: ListState, action: ListAction): ListState {
  switch (action.type) {
    case 'setTab':
      return { ...state, tab: action.tab };
    case 'setSort':
      return { ...state, sort: action.sort };
    case 'toggleDomain':
      return { ...state, domains: toggle(state.domains, action.domain) };
    case 'setAccount':
      return { ...state, account: action.account };
    case 'setDateRange':
      return { ...state, dateRange: action.dateRange };
    case 'setQuery':
      return { ...state, query: action.query };
    case 'dismissBanner':
      return { ...state, bannerShown: false };
    case 'dismissItem':
      return { ...state, dismissed: [...state.dismissed, action.id] };
    case 'toggleProcessed':
      return { ...state, processed: toggle(state.processed, action.id) };
    case 'openReveal':
      return { ...state, revealFor: action.id };
    case 'closeReveal':
      return { ...state, revealFor: null };
    case 'resetFilters':
      return {
        ...state,
        domains: [],
        account: 'all',
        dateRange: DEFAULT_DATE_RANGE,
        query: '',
      };
    default:
      return state;
  }
}
