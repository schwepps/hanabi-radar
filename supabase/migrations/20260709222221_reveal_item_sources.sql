-- Warm-intro conditional source reveal.
--
-- Adds the ONE partner-facing read path into item_sources: a per-item RPC that a
-- signed-in partner calls on demand to see who saw a post and how to reach the
-- author. item_sources stays fully locked at the table level (RLS enabled + FORCE,
-- zero policies, service_role-only) — this migration adds NO table grant/policy, so
-- the earlier schema/RLS guarantees hold: anon/authenticated reading item_sources
-- directly still get 42501 (see supabase/tests/partner_rls.test.sql). This
-- supersedes the deferral notes in 20260708175323_init_schema.sql (§4, §7) and
-- 20260709080954_partner_rls.sql (item_sources "intentionally UNTOUCHED").
--
-- Why SECURITY DEFINER, owned by postgres (load-bearing):
--   item_sources has FORCE ROW LEVEL SECURITY, so even the table owner is subject to
--   RLS unless the role has the BYPASSRLS attribute. On Supabase the `postgres` role
--   has BYPASSRLS (verified via pg_roles.rolbypassrls; the local stack mirrors hosted
--   role globals) — and BYPASSRLS overrides FORCE. So a SECURITY DEFINER function
--   running as its postgres owner reads item_sources deterministically on BOTH local
--   and hosted — the same pattern is_partner() already uses (postgres-owned definer).
--   We do NOT reassign the owner to service_role: it also has BYPASSRLS but lacks
--   CREATE on schema public (so it cannot own a function here), and it is unnecessary.
--
-- Semantics (acceptance criteria + product decisions):
--   * Only active, consented sensors are ever revealed (GDPR opt-out + consent).
--   * "Directly connected" = 1st degree. Members at any degree are connection paths,
--     ordered strongest-first (first > second > third). social_proof is a warm-intro
--     note surfaced ONLY when no member is 1st-degree (a strong direct path makes the
--     softer note redundant); a member with degree 'none' + social_proof is then an
--     alternative introduction path.
--   * Reveal returns no sensor_id — a stable id would let a partner correlate a member
--     across reveals; the name is all a warm intro needs.
--   * Consent reconciliation: items.best_author_degree (the card badge / modal header signal)
--     is the aggregate over ALL item_sources — consent-agnostic and recomputed only on
--     item_sources DML. It cannot diverge from this reveal today (ingestion gates writes on
--     active+consent, and a purge DELETE self-heals via the recompute trigger), but a future
--     soft opt-out that deactivates a sensor while retaining its rows would let the card
--     over-claim a path this reveal filters out. Make recompute_best_author_degree
--     consent-aware (or gate the card on the reveal) when the opt-out work lands.

-- reveal_item_sources runs as its postgres owner and calls is_partner() to authorize the
-- REAL caller: is_partner() reads auth.uid() from the request-JWT GUC, which survives the
-- SECURITY DEFINER role switch, so the gate reflects the signed-in partner — not postgres.
-- postgres owns is_partner(), so no EXECUTE grant is needed to call it.
create or replace function public.reveal_item_sources(p_item_id uuid)
returns table (
  sensor_name   text,
  author_degree public.author_degree,
  social_proof  text,
  seen_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible as (
    -- Active, consented sensors that saw this post (the postgres owner's BYPASSRLS
    -- reads the FORCE-RLS item_sources; sensors is service_role-only, also readable here).
    select s.name as sensor_name, src.author_degree, src.social_proof, src.seen_at
    from public.item_sources src
    join public.sensors s
      on s.id = src.sensor_id
     and s.active
     and s.consented_at is not null
    where src.item_id = p_item_id
  ),
  gate as (
    select
      (select public.is_partner()) as is_partner,                 -- authz on the real caller
      exists (select 1 from visible v where v.author_degree = 'first') as has_first
  )
  select
    v.sensor_name,
    v.author_degree,
    -- Suppress the warm-intro note when a 1st-degree direct path exists.
    case when g.has_first then null else v.social_proof end as social_proof,
    v.seen_at
  from visible v
  cross join gate g
  where g.is_partner                                              -- non-partner -> empty set
    and (
      v.author_degree <> 'none'                                   -- connection path (any degree)
      or (v.social_proof is not null and not g.has_first)         -- social alternative (no 1st-degree)
    )
  order by
    case v.author_degree                                          -- strongest-first (repo convention:
      when 'first'  then 1                                        -- explicit rank, not min(enum) —
      when 'second' then 2                                        -- matches init_schema.sql:152 /
      when 'third'  then 3                                        -- …140057.sql:42)
      when 'none'   then 4
    end,
    v.seen_at desc,
    v.sensor_name asc;                                            -- deterministic tiebreak (tests)
$$;

-- Deny-by-default: Postgres grants EXECUTE to PUBLIC on new functions. Revoke it, then
-- grant only authenticated (the app calls it as the signed-in partner via the anon/cookie
-- client). NOT anon — an unauthenticated visitor must not probe warm paths.
revoke execute on function public.reveal_item_sources(uuid) from public;
grant  execute on function public.reveal_item_sources(uuid) to authenticated;

comment on function public.reveal_item_sources(uuid) is
  'Warm-intro reveal: the ONLY partner-facing read of item_sources. SECURITY DEFINER owned by postgres (BYPASSRLS overrides FORCE) so it can read the RLS-forced item_sources; authorizes the real caller via is_partner() (empty set for non-partners, indistinguishable from "no warm path"). Returns active+consented sensors who saw the post with their degree to the author, strongest-first; social_proof surfaces only when no member is 1st-degree. Never exposes sensor_id.';
