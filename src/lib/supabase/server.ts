import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';
import type { Database } from '@/types/database';

/**
 * Server-only Supabase client using the service_role key — the schema's
 * designated accessor for server-side reads (see the init migration: "service_role
 * is the server's accessor (ingestion, classification, server-side reads)").
 *
 * The key never reaches the browser: `import 'server-only'` fails the build if
 * this module is pulled into a Client Component, and `env.supabaseServiceRoleKey`
 * throws if it is ever read with `window` defined. Reads must stay limited to the
 * shared, non-sensitive `items` feed — never `item_sources` (RLS-forced, FSC-106).
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
