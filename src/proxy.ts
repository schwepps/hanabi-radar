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
    return redirectResponse;
  }

  return response;
}

export const config = {
  // Run on every route except Next internals and static asset files.
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
