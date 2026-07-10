import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/env';
import type { Database } from '@/types/database';

/**
 * Request-scoped, RLS-enforced Supabase client for the signed-in partner.
 *
 * Uses the browser-safe anon key plus the user's session cookies, so queries run
 * as the Postgres `authenticated` role with `auth.uid()` populated — the partner
 * RLS policies decide row visibility. This is the OPPOSITE of
 * `createServerSupabaseClient()` (service_role), which bypasses RLS and must stay
 * on trusted server-only jobs (ingestion, classification, cross-user aggregates).
 *
 * Create a fresh client per request — never module-cache it. Cookie writes throw
 * inside a Server Component (rendering has no response phase); we swallow that,
 * since the proxy (`src/proxy.ts`) is what refreshes and persists the session.
 */
export async function createServerSupabaseAuthClient(): Promise<
  SupabaseClient<Database>
> {
  const cookieStore = await cookies();
  return createServerClient<Database>(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        // @supabase/ssr also passes anti-CDN-cache `headers` here, but this path
        // uses next/headers cookies() with no response object to attach them to.
        // Session writes land on Server Action POST responses, which are never
        // cached; the proxy applies the headers where a response IS available.
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Thrown when called from a Server Component (cookies are read-only
          // there). Safe to ignore: the proxy refreshes the session instead.
        }
      },
    },
  });
}
