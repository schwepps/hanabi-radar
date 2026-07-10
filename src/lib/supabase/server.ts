import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';
import type { Database } from '@/types/database';

/**
 * Server-only Supabase client using the service_role key — the schema's
 * designated accessor for trusted server-only jobs (ingestion, classification,
 * cross-user aggregates). It BYPASSES RLS, so it must NEVER read on behalf of a
 * partner: partner dashboard reads go through `createServerSupabaseAuthClient()`
 * (anon key + session cookies, RLS-enforced) instead (FSC-93).
 *
 * The key never reaches the browser: `import 'server-only'` fails the build if
 * this module is pulled into a Client Component, and `env.supabaseServiceRoleKey`
 * throws if it is ever read with `window` defined. Never read `item_sources` here
 * on behalf of a partner: the warm-intro reveal (FSC-106) goes through the
 * `reveal_item_sources` RPC on the auth client — never this service_role client.
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
