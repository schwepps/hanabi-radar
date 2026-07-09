import { createBrowserClient } from '@supabase/ssr';
import { env } from '@/env';
import type { Database } from '@/types/database';

/**
 * Browser-side Supabase client for the signed-in partner. Uses the browser-safe
 * anon key and reads the session from the same cookies `@supabase/ssr` writes
 * (login Server Action + `src/proxy.ts`), so it runs as the Postgres
 * `authenticated` role — Realtime `postgres_changes` are then RLS-filtered per
 * partner (FSC-93). This is the OPPOSITE of `createServerSupabaseClient()`
 * (service_role, server-only), which bypasses RLS and must never reach the browser.
 *
 * `createBrowserClient` de-duplicates its instance internally, so callers may
 * create it freely without opening multiple websockets.
 */
export function createBrowserSupabaseClient() {
  return createBrowserClient<Database>(env.supabaseUrl, env.supabaseAnonKey);
}
