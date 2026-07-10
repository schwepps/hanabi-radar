-- Sensor GDPR opt-out & erasure.
--
-- The ingestion gate already refuses an inactive sensor (uniform 401), so "no new data
-- after opt-out" holds. This migration adds the two missing halves — a self-serve
-- opt-out and a right-to-erasure — as service_role RPCs the /api/sensor/* routes call,
-- and closes the aggregate reconciliation that opt-out forces:
--
--   deactivate_sensor()  — self-serve opt-out: sets active=false and re-derives the
--                          card aggregate for the sensor's items (see below).
--   erase_sensor()       — right to erasure: deletes the sensor row; its item_sources
--                          links cascade away and the aggregate self-heals via the
--                          existing trigger. items (third-party post content) are kept.
--
-- The card aggregate and the warm-intro reveal must expose the SAME sensors, or the card
-- over-claims a path the reveal hides. That "a counted sighting" predicate now has ONE
-- home — is_counted_sensor() — shared by recompute_best_author_degree, this migration's
-- backfill, and reveal_item_sources (redefined below to route through it).
--
-- Conventions (per db-patterns, matching record_sensor_consent / ingest_posts):
-- search_path pinned; EXECUTE deny-by-default (revoke public, grant service_role);
-- SECURITY INVOKER — the caller is service_role, which bypasses RLS and already holds
-- DML on sensors/items/item_sources.

-- ============================================================================
-- (a0) Single source of truth for "a counted sighting".
-- ============================================================================
-- A sensor's sighting counts toward the card aggregate AND is revealable iff the sensor is
-- active and has consented. Centralising the predicate keeps recompute_best_author_degree,
-- the backfill, and reveal_item_sources from drifting apart — which would break the exact
-- card/reveal equivalence this migration exists to guarantee. IMMUTABLE; references no tables, so
-- the pinned search_path is belt-and-braces (no object names to resolve).
create or replace function public.is_counted_sensor(
  p_active       boolean,
  p_consented_at timestamptz
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select p_active and p_consented_at is not null;
$$;

revoke execute on function public.is_counted_sensor(boolean, timestamptz) from public;
grant  execute on function public.is_counted_sensor(boolean, timestamptz) to service_role;

comment on function public.is_counted_sensor(boolean, timestamptz) is
  'The single definition of a "counted" sighting — the sensor is active AND has consented. Shared by recompute_best_author_degree, the backfill, and reveal_item_sources so the card aggregate and the warm-intro reveal can never diverge.';

-- ============================================================================
-- (a) Make the card aggregate consent/active-aware — the reconciliation.
-- ============================================================================
-- items.best_author_degree / seen_count were aggregated over ALL item_sources rows,
-- while reveal_item_sources shows only active + consented sensors. They could
-- not diverge while ingestion gated every write on active+consent — but a soft opt-out
-- that deactivates a sensor WITHOUT deleting its rows would let the card badge over-claim
-- a warm path the reveal hides. This was deferred to this migration in
-- 20260709222221_reveal_item_sources.sql:31-37; resolve it by counting the SAME
-- population the reveal does. In steady-state ingestion the sensor is always
-- active+consented, so this changes nothing there; it only takes effect after opt-out /
-- consent withdrawal. Body is otherwise identical to the ingestion version (parent FOR
-- UPDATE lock, strength-rank CASE, widened write guard, seen_count fold).
create or replace function public.recompute_best_author_degree(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_best  public.author_degree;
  v_count integer;
begin
  perform 1 from public.items where id = p_item_id for update;

  select s.author_degree
    into v_best
  from public.item_sources s
  join public.sensors sn
    on sn.id = s.sensor_id
   and public.is_counted_sensor(sn.active, sn.consented_at)   -- only counted sightings (a0)
  where s.item_id = p_item_id
  order by case s.author_degree
             when 'first'  then 1
             when 'second' then 2
             when 'third'  then 3
             when 'none'   then 4
           end
  limit 1;

  v_best := coalesce(v_best, 'none'::public.author_degree);   -- no counted sources -> none

  select count(*)
    into v_count
  from public.item_sources s
  join public.sensors sn
    on sn.id = s.sensor_id
   and public.is_counted_sensor(sn.active, sn.consented_at)
  where s.item_id = p_item_id;

  update public.items i
     set best_author_degree = v_best,
         seen_count         = v_count
   where i.id = p_item_id
     and (i.best_author_degree is distinct from v_best
          or i.seen_count is distinct from v_count);   -- write only on a real change
end;
$$;

-- ============================================================================
-- (a2) Route reveal_item_sources through the shared predicate.
-- ============================================================================
-- Behaviour-preserving redefinition of the reveal: the inline
-- `s.active and s.consented_at is not null` filter becomes is_counted_sensor() so the
-- reveal and the card aggregate share ONE definition of a counted sighting. Body is
-- otherwise byte-for-byte the 20260709222221 version (SECURITY DEFINER owned by postgres
-- for BYPASSRLS over FORCE-RLS item_sources; is_partner() gate; never returns sensor_id).
-- CREATE OR REPLACE preserves the existing owner, EXECUTE grant (authenticated), and
-- comment; the partner-RLS reveal tests pin that behaviour is unchanged.
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
    select s.name as sensor_name, src.author_degree, src.social_proof, src.seen_at
    from public.item_sources src
    join public.sensors s
      on s.id = src.sensor_id
     and public.is_counted_sensor(s.active, s.consented_at)   -- shared predicate (a0)
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
    case v.author_degree                                          -- strongest-first
      when 'first'  then 1
      when 'second' then 2
      when 'third'  then 3
      when 'none'   then 4
    end,
    v.seen_at desc,
    v.sensor_name asc;                                            -- deterministic tiebreak (tests)
$$;

-- ============================================================================
-- (b) Self-serve opt-out.
-- ============================================================================
-- Sets active=false (idempotent — an already-inactive sensor stays inactive). Setting a
-- sensor column fires NO item_sources trigger, so the card aggregate would keep counting
-- the sighting; re-derive it explicitly for every item this sensor contributed to. The
-- consent-aware recompute (a) then drops the now-inactive sensor from best_author_degree
-- and seen_count. The sensor row and its item_sources rows are RETAINED (opt-out is
-- reversible-in-principle and is not erasure); ingestion is already refused by the gate.
-- NOTE: there is no trigger on sensors, so this explicit recompute is the ONLY thing that
-- reconciles the aggregate on a lifecycle change. No reactivation path exists today; if one
-- is added, it MUST likewise recompute the sensor's items (or move both into an
-- AFTER UPDATE OF active, consented_at ON sensors trigger).
create or replace function public.deactivate_sensor(p_sensor_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_exists boolean;
begin
  update public.sensors
     set active = false
   where id = p_sensor_id;
  v_exists := found;   -- capture existence now; the statements below clobber FOUND

  -- Lock the affected items up front in the SAME canonical order ingest_posts uses
  -- (linkedin_post_id — see 20260709140057_ingest_posts_and_seen_count.sql:104-109) so a
  -- concurrent opt-out + ingest can't deadlock on the items FOR UPDATE that recompute
  -- takes; recompute then re-locks these already-held rows as a no-op.
  perform 1
  from public.items i
  where i.id in (
    select item_id from public.item_sources where sensor_id = p_sensor_id
  )
  order by i.linkedin_post_id
  for update;

  perform public.recompute_best_author_degree(t.item_id)
  from (
    select distinct item_id
    from public.item_sources
    where sensor_id = p_sensor_id
  ) t;

  return v_exists;   -- false only for an unknown id (the caller resolved it from a token first)
end;
$$;

-- ============================================================================
-- (c) Right to erasure.
-- ============================================================================
-- Deleting the sensor cascades to its item_sources (FK ON DELETE CASCADE), and each
-- cascaded delete fires item_sources_maintain_best_degree -> recompute_best_author_degree,
-- self-healing best_author_degree + seen_count on every affected item. items are NOT
-- deleted: the post is third-party (decision-maker) data, deduplicated across sensors; an
-- item seen only by this sensor simply falls to seen_count=0 / best='none' and stays in
-- the feed.
create or replace function public.erase_sensor(p_sensor_id uuid)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  -- Lock the affected items up front in canonical order (linkedin_post_id) BEFORE the FK
  -- cascade fires the recompute trigger: the cascade deletes item_sources in an
  -- uncontrolled order and each fires recompute's items FOR UPDATE, so pre-locking here
  -- keeps a concurrent erase + ingest deadlock-free (same discipline as ingest_posts).
  perform 1
  from public.items i
  where i.id in (
    select item_id from public.item_sources where sensor_id = p_sensor_id
  )
  order by i.linkedin_post_id
  for update;

  delete from public.sensors where id = p_sensor_id;
  return found;   -- true if a row was deleted, false for an unknown id
end;
$$;

-- Functions are deny-by-default: revoke the implicit PUBLIC EXECUTE, then grant only
-- service_role (the /api/sensor/* routes call these on the service_role client;
-- anon/authenticated must get 42501). recompute_best_author_degree keeps its existing
-- service_role grant across CREATE OR REPLACE (the ACL is preserved).
revoke execute on function public.deactivate_sensor(uuid) from public;
grant  execute on function public.deactivate_sensor(uuid) to service_role;

revoke execute on function public.erase_sensor(uuid) from public;
grant  execute on function public.erase_sensor(uuid) to service_role;

comment on function public.deactivate_sensor(uuid) is
  'Self-serve opt-out: sets sensors.active=false (idempotent) and recomputes the card aggregate for the sensor''s items so the now-inactive sensor is dropped from best_author_degree/seen_count. Retains the sensor + its item_sources rows. Returns false only for an unknown id. service_role only.';
comment on function public.erase_sensor(uuid) is
  'Right to erasure: deletes the sensor row; item_sources links cascade away and the aggregate self-heals via the trigger. items are retained (third-party content). Returns false for an unknown id. service_role only.';

-- ============================================================================
-- (d) Backfill: re-derive only the items the new rule actually changes.
-- ============================================================================
-- The aggregate differs from the old (consent-agnostic) value for exactly the items that
-- carry a sighting from a currently inactive OR unconsented sensor — recompute just those,
-- so a pre-existing opted-out / unconsented sighting is dropped now instead of on the
-- item's next write. Scoping this (vs recomputing every item) avoids touching any item that
-- has no item_sources rows — recompute would reset such a row's seen_count to 0 — and keeps
-- the deploy's FOR UPDATE footprint to the handful of affected items.
select public.recompute_best_author_degree(i.id)
from public.items i
where exists (
  select 1
  from public.item_sources s
  join public.sensors sn on sn.id = s.sensor_id
  where s.item_id = i.id
    and not public.is_counted_sensor(sn.active, sn.consented_at)   -- a non-counted sighting (a0)
);
