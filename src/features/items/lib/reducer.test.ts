import { describe, expect, it } from 'vitest';
import { initialState, listReducer } from './reducer';

describe('listReducer', () => {
  it('starts from the documented defaults', () => {
    const state = initialState();
    expect(state.tab).toBe('opportunity');
    expect(state.sort).toBe('reachability');
    expect(state.dateRange).toBe('7d');
    expect(state.account).toBe('all');
    expect(state.domains).toEqual([]);
    expect(state.bannerShown).toBe(true);
  });

  it('toggles a domain on then off', () => {
    const added = listReducer(initialState(), {
      type: 'toggleDomain',
      domain: 'pmo',
    });
    expect(added.domains).toEqual(['pmo']);
    const removed = listReducer(added, { type: 'toggleDomain', domain: 'pmo' });
    expect(removed.domains).toEqual([]);
  });

  it('dismisses items and toggles processed', () => {
    const dismissed = listReducer(initialState(), {
      type: 'dismissItem',
      id: 'x',
    });
    expect(dismissed.dismissed).toEqual(['x']);

    const processed = listReducer(initialState(), {
      type: 'toggleProcessed',
      id: 'x',
    });
    expect(processed.processed).toEqual(['x']);
    expect(
      listReducer(processed, { type: 'toggleProcessed', id: 'x' }).processed,
    ).toEqual([]);
  });

  it('opens and closes the reveal', () => {
    const open = listReducer(initialState(), { type: 'openReveal', id: 'x' });
    expect(open.revealFor).toBe('x');
    expect(listReducer(open, { type: 'closeReveal' }).revealFor).toBeNull();
  });

  it('dismisses the realtime banner', () => {
    expect(
      listReducer(initialState(), { type: 'dismissBanner' }).bannerShown,
    ).toBe(false);
  });

  it('resetFilters clears domains/account/dateRange/query but keeps tab and sort', () => {
    const dirty = {
      ...initialState(),
      tab: 'signal' as const,
      sort: 'date' as const,
      domains: ['pmo', 'gen_ai'],
      account: 'Acme',
      dateRange: '30d' as const,
      query: 'servicenow',
    };
    const reset = listReducer(dirty, { type: 'resetFilters' });
    expect(reset.domains).toEqual([]);
    expect(reset.account).toBe('all');
    expect(reset.dateRange).toBe('7d');
    expect(reset.query).toBe('');
    expect(reset.tab).toBe('signal');
    expect(reset.sort).toBe('date');
  });
});
