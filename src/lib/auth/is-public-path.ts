/**
 * Route-access predicate used by the proxy (`src/proxy.ts`). A path is "public"
 * when an unauthenticated request may reach it without being redirected to
 * `/login` — i.e. the login page itself (which also receives its own sign-in
 * Server Action POST). Everything else is gated.
 *
 * Kept pure (no `next/headers`, no Supabase) so it is unit-testable in the Node
 * Vitest env and can't silently start protecting `/login` (a lockout) or leaking
 * a gated route. Exact match, not `startsWith`, so `/login-something` stays gated.
 */
export function isPublicPath(pathname: string): boolean {
  return pathname === '/login';
}
