-- Partner authentication gating (RLS) for the dashboard feed.
--
-- Adds the partner authorization plane on top of the base schema:
--   * a thin `partners` table keyed 1:1 to auth.users (identity/PII stays in auth.users),
--   * a SECURITY DEFINER predicate is_partner() (the RLS gate AND the "am I a partner?" RPC),
--   * a SELECT grant + policy letting an authenticated *partner* read the shared `items` feed.
--
-- Deliberately UNTOUCHED: item_sources (warm-intro reveal stays hidden,
-- service_role-only) and sensors (ingestion identity is a hashed token verified
-- server-side). service_role keeps bypassing RLS with its base grants, so
-- server-only jobs (ingestion, classification) are unaffected.
--
-- Auth settings (site_url, redirect URLs, providers, signup/confirmation) are NOT schema
-- — they live in supabase/config.toml locally and hosted project settings (criterion 6).
-- This migration changes none of them.

-- ============================================================================
-- 1) partners — thin authorization table (auth.users owns identity/PII)
-- ============================================================================
create table partners (
  id         uuid        primary key references auth.users (id) on delete cascade,
  active     boolean     not null default true,
  created_at timestamptz not null default now()
);

comment on table partners is
  'Authorization plane for the dashboard: an auth user IS a partner iff a row exists here with active=true. Thin by design — email/name stay in auth.users (GDPR minimization, single purge point). on delete cascade ties partner erasure to auth.users deletion.';

-- RLS enabled but NOT forced: is_partner() (SECURITY DEFINER, owned by the table owner)
-- must read this table without re-entering its policies (avoids 42P17 recursion). Zero
-- client-facing policies + revoked grants already make it invisible to anon/authenticated.
alter table partners enable row level security;

revoke all on partners from anon, authenticated;
-- service_role provisions partners server-side. Explicit DML grant required: a
-- migration-created table is owned by postgres, and Supabase default privileges give the
-- API roles only TRUNCATE/REFERENCES/TRIGGER (repo MEMORY: supabase-service-role-grants).
grant select, insert, update, delete on partners to service_role;

-- ============================================================================
-- 2) is_partner() — the RLS gate predicate AND the "am I a partner?" RPC
-- ============================================================================
create or replace function public.is_partner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.partners p
    where p.id = (select auth.uid())
      and p.active
  );
$$;

-- Deny-by-default: Postgres grants EXECUTE to PUBLIC on new functions. Revoke it, then
-- grant only authenticated — the items policy calls it, and the app calls it as an RPC.
-- NOT granted to anon (no anon policy uses it; anon must not probe partner status).
revoke execute on function public.is_partner() from public;
grant  execute on function public.is_partner() to authenticated;

comment on function public.is_partner() is
  'True iff the current authenticated user is an active partner. Only ever checks the caller''s own auth.uid(), so it is safe to expose to authenticated as an RPC. Used by RLS policies wrapped as (select public.is_partner()).';

-- ============================================================================
-- 3) items — authenticated partners may read the shared, non-sensitive feed
-- ============================================================================
-- RLS filters ON TOP of table privileges; without this GRANT the policy is inert
-- (authenticated hits permission-denied before any policy runs). The base schema revoked all from
-- authenticated, so re-grant the minimum: SELECT only (dashboard is read-only; writes stay
-- on service_role/ingestion — no INSERT/UPDATE/DELETE policy, hence no WITH CHECK misuse).
grant select on items to authenticated;

create policy items_select_partner
  on items
  for select
  to authenticated
  using ((select public.is_partner()));

-- item_sources: intentionally UNTOUCHED. Already fully hidden by the base schema (RLS enabled +
--   FORCE, zero policies, granted to service_role only) — an authenticated partner reads
--   zero rows (permission-denied: no grant). The conditional warm-intro reveal comes later.
-- sensors:      intentionally UNTOUCHED. Ingestion identity is a hashed token verified
--   server-side; sensors stay service_role-only, no auth.users linkage, no policy.
