import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

import type { Database } from '@/types/database';
import type { ClaudeParser } from './lib/classify-item';
import { makePendingItem } from './lib/fixtures';
import { runClassificationBatch } from './worker';
import type { PendingItem } from './types';

// --- Fakes -----------------------------------------------------------------

interface FakeOpts {
  pending?: PendingItem[];
  fetchError?: string;
  /** Return [] to simulate a raced 0-row write (skipped) for a given item id. */
  persist?: (id: string) => { data: { id: string }[]; error: null };
  /** Throw from the persist chain for this item id (a rejecting Supabase client). */
  throwOnPersist?: string;
}

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Minimal stand-in for the Supabase client covering exactly what the data layer
 * uses: the fetch chain (`select…is…lt…order…limit`), the guarded update chain
 * (`update…eq…is…select`), and `rpc()` (the failure recorder). `update()` flips the
 * chain into persist mode so the terminal `.select('id')` resolves the write result.
 */
function makeFakeSupabase(opts: FakeOpts): {
  client: SupabaseClient<Database>;
  updates: { id: string; update: unknown }[];
  rpcCalls: RpcCall[];
} {
  const updates: { id: string; update: unknown }[] = [];
  const rpcCalls: RpcCall[] = [];
  const from = () => {
    let isUpdate = false;
    let id = '';
    let update: unknown = null;
    const chain: Record<string, unknown> = {
      select: () => {
        if (isUpdate) {
          if (opts.throwOnPersist === id) {
            throw new Error('supabase client error');
          }
          updates.push({ id, update });
          return Promise.resolve(
            opts.persist ? opts.persist(id) : { data: [{ id }], error: null },
          );
        }
        return chain;
      },
      is: () => chain,
      lt: () => chain,
      order: () => chain,
      limit: () =>
        Promise.resolve(
          opts.fetchError != null
            ? { data: null, error: { message: opts.fetchError } }
            : { data: opts.pending ?? [], error: null },
        ),
      update: (u: unknown) => {
        isUpdate = true;
        update = u;
        return chain;
      },
      eq: (_col: string, val: string) => {
        id = val;
        return chain;
      },
    };
    return chain;
  };
  const rpc = (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    return Promise.resolve({ data: null, error: null });
  };
  return {
    client: { from, rpc } as unknown as SupabaseClient<Database>,
    updates,
    rpcCalls,
  };
}

/** Fake parser routed by the per-item user content (deterministic under concurrency). */
const routingParser: ClaudeParser = {
  async parse(request) {
    const content = request.messages[0].content;
    if (content.includes('BOOM')) {
      throw new Error('boom');
    }
    if (content.includes('REFUSE')) {
      return { stop_reason: 'refusal', text: null };
    }
    return {
      stop_reason: 'end_turn',
      text: JSON.stringify({
        stream: 'opportunity',
        domains: ['pmo'],
        heat: 'hot',
        summary: 'ok',
      }),
    };
  },
};

// --- Tests -----------------------------------------------------------------

describe('runClassificationBatch', () => {
  it('returns all-zero counts when nothing is pending', async () => {
    const { client } = makeFakeSupabase({ pending: [] });
    expect(
      await runClassificationBatch({ supabase: client, parser: routingParser }),
    ).toEqual({
      picked: 0,
      classified: 0,
      prefiltered_noise: 0,
      skipped: 0,
      failed: 0,
    });
  });

  it('propagates a fetch error (so the endpoint 500s) instead of reporting picked=0', async () => {
    const { client } = makeFakeSupabase({ fetchError: 'db down' });
    await expect(
      runClassificationBatch({ supabase: client, parser: routingParser }),
    ).rejects.toThrow(/fetchPendingItems failed/);
  });

  it('tallies each outcome, isolates failures, and records them for parking', async () => {
    const pending = [
      makePendingItem({ id: 'ok', text: 'refonte ServiceNow programme' }),
      makePendingItem({
        id: 'noise',
        text: '3 ans déjà chez Acme, merci à toute l’équipe !',
        hashtags: ['workanniversary'],
      }),
      makePendingItem({
        id: 'refuse',
        text: 'REFUSE transformation programme',
      }),
      makePendingItem({ id: 'raced', text: 'migration cloud programme' }),
      makePendingItem({ id: 'boom', text: 'BOOM projet programme' }),
    ];
    const { client, updates, rpcCalls } = makeFakeSupabase({
      pending,
      persist: (id) =>
        id === 'raced'
          ? { data: [], error: null }
          : { data: [{ id }], error: null },
    });

    const summary = await runClassificationBatch({
      supabase: client,
      parser: routingParser,
    });

    expect(summary).toEqual({
      picked: 5,
      classified: 1, // ok
      prefiltered_noise: 1, // noise (no Claude call)
      skipped: 1, // raced (0-row write)
      failed: 2, // refuse + boom
    });
    // Only the three persisting items hit the DB; refuse/boom leave stream NULL.
    expect(updates.map((u) => u.id).sort()).toEqual(['noise', 'ok', 'raced']);

    // Both failures are recorded so they can be parked. A refusal is permanent; a
    // thrown error is transient.
    expect(rpcCalls.map((c) => c.name)).toEqual([
      'record_classification_failure',
      'record_classification_failure',
    ]);
    const byId = Object.fromEntries(
      rpcCalls.map((c) => [c.args.p_item_id, c.args]),
    );
    expect(byId['refuse']).toMatchObject({
      p_error: 'refusal',
      p_permanent: true,
    });
    expect(byId['boom']).toMatchObject({
      p_error: 'error',
      p_permanent: false,
    });
  });

  it('records an error failure when an unexpected exception is thrown (poison guard)', async () => {
    const pending = [
      makePendingItem({ id: 'kaboom', text: 'refonte ServiceNow programme' }),
    ];
    const { client, rpcCalls } = makeFakeSupabase({
      pending,
      throwOnPersist: 'kaboom',
    });

    const summary = await runClassificationBatch({
      supabase: client,
      parser: routingParser,
    });

    expect(summary).toMatchObject({ picked: 1, failed: 1 });
    const rec = rpcCalls.find((c) => c.args.p_item_id === 'kaboom');
    expect(rec?.name).toBe('record_classification_failure');
    expect(rec?.args).toMatchObject({ p_error: 'error', p_permanent: false });
  });
});
