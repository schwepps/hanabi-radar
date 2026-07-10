-- pgTAP tests for sensor GDPR opt-out & erasure (deactivate_sensor,
-- erase_sensor, and the consent-aware recompute_best_author_degree). Run with
-- `pnpm db:test` (local stack up). Rolled-back transaction, no residue — same
-- convention as sensor_consent.test.sql / ingestion.test.sql.

begin;
select plan(27);

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser). Ids chosen not to collide with seed.sql or other tests.
--   s-opt         : active+consented, will opt out.
--   s-keep        : active+consented, co-sensor that stays (proves the aggregate
--                   falls back to the remaining sensor rather than to 'none').
--   s-erase       : active+consented, will be erased.
--   s-unconsented : active but consent null — must never count toward the aggregate.
-- ---------------------------------------------------------------------------
insert into sensors (id, name, email, token_hash, active, consented_at) values
  ('f3000000-0000-4000-8000-000000000001', 's-opt',         's-opt@t.test',   'lifehash-opt',   true, now()),
  ('f3000000-0000-4000-8000-000000000002', 's-keep',        's-keep@t.test',  'lifehash-keep',  true, now()),
  ('f3000000-0000-4000-8000-000000000003', 's-erase',       's-erase@t.test', 'lifehash-erase', true, now()),
  ('f3000000-0000-4000-8000-000000000004', 's-unconsented', 's-unc@t.test',   'lifehash-unc',   true, null);

insert into items (id, linkedin_post_id, author_name, url, captured_at) values
  ('c3000000-0000-4000-8000-000000000001', 'urn:li:activity:solo-opt',   'A solo-opt',   'https://x/1', now()),
  ('c3000000-0000-4000-8000-000000000002', 'urn:li:activity:shared',     'A shared',     'https://x/2', now()),
  ('c3000000-0000-4000-8000-000000000003', 'urn:li:activity:solo-erase', 'A solo-erase', 'https://x/3', now()),
  ('c3000000-0000-4000-8000-000000000004', 'urn:li:activity:pin',        'A pin',        'https://x/4', now()),
  ('c3000000-0000-4000-8000-000000000005', 'urn:li:activity:shrd-erase', 'A shrd-erase', 'https://x/5', now());

-- Trigger recomputes the aggregate (consent-aware) on each insert.
insert into item_sources (item_id, sensor_id, author_degree) values
  -- solo-opt: seen only by s-opt -> after opt-out it has no counted sources.
  ('c3000000-0000-4000-8000-000000000001', 'f3000000-0000-4000-8000-000000000001', 'first'),
  -- shared: s-opt (first) + s-keep (second) -> after opt-out falls back to s-keep.
  ('c3000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000001', 'first'),
  ('c3000000-0000-4000-8000-000000000002', 'f3000000-0000-4000-8000-000000000002', 'second'),
  -- solo-erase: seen only by s-erase.
  ('c3000000-0000-4000-8000-000000000003', 'f3000000-0000-4000-8000-000000000003', 'first'),
  -- pin: s-keep (third, consented) + s-unconsented (first, NOT consented).
  ('c3000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000002', 'third'),
  ('c3000000-0000-4000-8000-000000000004', 'f3000000-0000-4000-8000-000000000004', 'first'),
  -- shrd-erase: s-erase (first) + s-keep (second) -> after erasing s-erase the cascade
  -- recompute must fall back to the surviving co-sensor, not to 'none'.
  ('c3000000-0000-4000-8000-000000000005', 'f3000000-0000-4000-8000-000000000003', 'first'),
  ('c3000000-0000-4000-8000-000000000005', 'f3000000-0000-4000-8000-000000000002', 'second');

-- ===========================================================================
-- (A) Consent-aware aggregate: a non-consented sensor never counts, even when it
--     holds the strongest degree (the reconciliation, at rest).
-- ===========================================================================
select is((select best_author_degree from items where id = 'c3000000-0000-4000-8000-000000000004'),
  'third'::author_degree, 'A: non-consented first-degree sensor excluded -> best is third');
select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000004'),
  1, 'A: pin seen_count counts only the consented sensor');

set local role service_role;

-- ===========================================================================
-- (B) Opt-out: deactivate_sensor sets active=false and re-derives the aggregate
--     for the sensor's items so it is dropped from the card.
-- ===========================================================================
select ok(public.deactivate_sensor('f3000000-0000-4000-8000-000000000001'),
  'B: deactivate_sensor returns true for a known sensor');
select is((select active from sensors where id = 'f3000000-0000-4000-8000-000000000001'),
  false, 'B: sensor is now inactive');
select is((select best_author_degree from items where id = 'c3000000-0000-4000-8000-000000000001'),
  'none'::author_degree, 'B: item seen only by the opted-out sensor -> best none');
select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000001'),
  0, 'B: that item now has 0 counted sightings');
select is((select best_author_degree from items where id = 'c3000000-0000-4000-8000-000000000002'),
  'second'::author_degree, 'B: shared item falls back to the remaining sensor -> second');
select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000002'),
  1, 'B: shared item seen_count drops to 1');

-- Idempotent: opting out an already-inactive sensor still returns true, stays inactive.
select ok(public.deactivate_sensor('f3000000-0000-4000-8000-000000000001'),
  'B: deactivate_sensor is idempotent on an already-inactive sensor');
select is((select active from sensors where id = 'f3000000-0000-4000-8000-000000000001'),
  false, 'B: sensor remains inactive after the second opt-out');

-- Unknown sensor id -> false (no row updated).
select is(public.deactivate_sensor('f3000000-0000-4000-8000-0000000000ff'),
  false, 'B: deactivate_sensor returns false for an unknown id');

-- ===========================================================================
-- (C) Erasure: erase_sensor deletes the sensor + cascades item_sources; the
--     aggregate self-heals; items are retained.
-- ===========================================================================
select ok(public.erase_sensor('f3000000-0000-4000-8000-000000000003'),
  'C: erase_sensor returns true for a known sensor');
select is((select count(*) from sensors where id = 'f3000000-0000-4000-8000-000000000003')::integer,
  0, 'C: sensor row is deleted');
select is((select count(*) from item_sources where sensor_id = 'f3000000-0000-4000-8000-000000000003')::integer,
  0, 'C: item_sources links cascade away');
select is((select count(*) from items where id = 'c3000000-0000-4000-8000-000000000003')::integer,
  1, 'C: the item itself is retained (third-party content)');
select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000003'),
  0, 'C: the erased sensor''s solo item self-heals to seen_count 0');
select is((select best_author_degree from items where id = 'c3000000-0000-4000-8000-000000000003'),
  'none'::author_degree, 'C: ...and best_author_degree none');
-- Shared item: the cascade recompute falls back to the surviving co-sensor, not 'none'.
select is((select best_author_degree from items where id = 'c3000000-0000-4000-8000-000000000005'),
  'second'::author_degree, 'C: shared item falls back to the surviving co-sensor -> second');
select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000005'),
  1, 'C: shared item seen_count drops to 1 after erase');
select is(public.erase_sensor('f3000000-0000-4000-8000-0000000000ff'),
  false, 'C: erase_sensor returns false for an unknown id');

-- ===========================================================================
-- (E) Backfill scoping: recompute ONLY items with a non-counted (inactive/
--     unconsented) source; a source-less item is NEVER recomputed (recompute
--     would wrongly zero its seen_count — the backfill guard).
-- ===========================================================================
-- A source-less item with a manually-set count (models a seeded aggregate row).
insert into items (id, linkedin_post_id, author_name, url, captured_at, seen_count)
values ('c3000000-0000-4000-8000-000000000006', 'urn:li:activity:srcless', 'A srcless',
        'https://x/6', now(), 7);
-- An item seen only by the non-counted s-unconsented sensor: the insert trigger already
-- set it to 0, so inject a STALE pre-consent-aware count to prove the backfill fixes it.
insert into items (id, linkedin_post_id, author_name, url, captured_at)
values ('c3000000-0000-4000-8000-000000000007', 'urn:li:activity:stale', 'A stale',
        'https://x/7', now());
insert into item_sources (item_id, sensor_id, author_degree)
values ('c3000000-0000-4000-8000-000000000007', 'f3000000-0000-4000-8000-000000000004', 'first');
update items set seen_count = 9, best_author_degree = 'first'
 where id = 'c3000000-0000-4000-8000-000000000007';

-- Run the migration's scoped backfill query verbatim.
select public.recompute_best_author_degree(i.id)
from public.items i
where exists (
  select 1
  from public.item_sources s
  join public.sensors sn on sn.id = s.sensor_id
  where s.item_id = i.id
    and not public.is_counted_sensor(sn.active, sn.consented_at)
);

select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000006'),
  7, 'E: source-less item is NOT recomputed by the scoped backfill (count preserved)');
select is((select seen_count from items where id = 'c3000000-0000-4000-8000-000000000007'),
  0, 'E: item with a non-counted source IS recomputed (stale count corrected to 0)');
select is((select best_author_degree from items where id = 'c3000000-0000-4000-8000-000000000007'),
  'none'::author_degree, 'E: ...and best_author_degree corrected to none');

reset role;

-- ===========================================================================
-- (D) EXECUTE is service_role-only: anon and authenticated get 42501.
-- ===========================================================================
set local role anon;
select throws_ok(
  $$select public.deactivate_sensor('f3000000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', null, 'D: anon cannot execute deactivate_sensor');
select throws_ok(
  $$select public.erase_sensor('f3000000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', null, 'D: anon cannot execute erase_sensor');

reset role;
set local role authenticated;
select throws_ok(
  $$select public.deactivate_sensor('f3000000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', null, 'D: authenticated cannot execute deactivate_sensor');
select throws_ok(
  $$select public.erase_sensor('f3000000-0000-4000-8000-000000000002'::uuid)$$,
  '42501', null, 'D: authenticated cannot execute erase_sensor');

reset role;
select * from finish();
rollback;
