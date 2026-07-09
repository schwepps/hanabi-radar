import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/env';
import { isPublicPath } from '@/lib/auth/is-public-path';

/**
 * Auth proxy — Next 16's renamed middleware (`proxy` / `export function proxy`).
 * Runs on every matched request to (1) refresh the Supabase session, writing any
 * rotated token back to the browser (the ONLY place that can happen — Server
 * Components can't set cookies), and (2) redirect unauthenticated requests for
 * gated routes to `/login`. The route guard in `page.tsx` is defense-in-depth on
 * top; RLS (FSC-93) is the actual data backstop.
 *
 * Two load-bearing rules from the Supabase SSR guide — do NOT "tidy" them away:
 *   1. Run NO code between `createServerClient` and `getUser()`.
 *   2. Return the same `response` object; only its cookies/headers may be mutated.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  // Anti-cache headers @supabase/ssr passes when it writes session cookies, kept
  // so they can also be applied to the redirect response below (which may carry
  // the same Set-Cookie), not just the pass-through `response`.
  const authHeaders: Record<string, string> = {};

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
        // Anti-cache headers so a CDN/proxy can't serve one user's Set-Cookie to
        // another (matters on the hosted Vercel edge; a no-op locally).
        Object.assign(authHeaders, headers);
        for (const [key, value] of Object.entries(headers)) {
          response.headers.set(key, value);
        }
      },
    },
  });

  // IMPORTANT: keep getUser() immediately after client creation (verified check).
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user == null && !isPublicPath(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    const redirectResponse = NextResponse.redirect(url);
    // Carry over cookies the refresh wrote onto `response` (e.g. cleared stale
    // auth cookies) so the browser and server don't desync on the redirect.
    for (const cookie of response.cookies.getAll()) {
      redirectResponse.cookies.set(cookie);
    }
    // ...and the anti-cache headers, so this redirect (which may carry that same
    // Set-Cookie) is never cached by a CDN/reverse proxy either.
    for (const [key, value] of Object.entries(authHeaders)) {
      redirectResponse.headers.set(key, value);
    }
    return redirectResponse;
  }

  return response;
}

export const config = {
  // Run on every route except `/api/*` (route handlers self-authenticate via a
  // sensor token — FSC-98 — and must answer 401 JSON, not a 307 to /login; skipping
  // them also avoids a wasted getUser() session-refresh on every ingestion POST),
  // Next internals, and static asset files.
  matcher: [
    '/((?!api(?:/|$)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
