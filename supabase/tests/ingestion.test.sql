-- pgTAP tests for FSC-98 ingestion (ingest_posts RPC + seen_count fold + repost
-- CHECK). Run with `pnpm db:test` (local stack up). Rolled-back transaction, no
-- residue — same convention as schema.test.sql / partner_rls.test.sql.

begin;
select plan(33);

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser). Sensors only — items/item_sources are created by the
-- RPC. Ids chosen not to collide with seed.sql or the other test files.
-- ---------------------------------------------------------------------------
-- consented_at set: recompute_best_author_degree counts only active+consented sensors
-- (FSC-95 consent-aware aggregate) — which is also the real ingest state, since the gate
-- refuses an unconsented sensor.
insert into sensors (id, name, email, token_hash, consented_at) values
  ('f1000000-0000-4000-8000-000000000001', 'ing-s1', 'ing-s1@t.test', 'inghash1', now()),
  ('f1000000-0000-4000-8000-000000000002', 'ing-s2', 'ing-s2@t.test', 'inghash2', now());

-- Build one payload element (item + source) with the fields a test needs.
create function pg_temp.mk(
  p_pid       text,
  p_degree    text,
  p_reactions integer     default 0,
  p_is_repost boolean     default false,
  p_orig      text        default null,
  p_captured  timestamptz default '2026-01-01T00:00:00Z',
  p_posted    timestamptz default null
) returns jsonb language sql as $$
  select jsonb_build_object(
    'item', jsonb_build_object(
      'linkedin_post_id', p_pid,
      'author_name', 'Author ' || p_pid,
      'author_company', null, 'author_title', null, 'author_profile_url', null,
      'author_type', 'person', 'text', 'body', 'url', 'https://x/' || p_pid,
      'post_type', 'text', 'is_repost', p_is_repost,
      'original_author_name', p_orig, 'original_author_profile_url', null,
      'media_title', null, 'hashtags', jsonb_build_array('ai'),
      'reaction_count', p_reactions, 'comment_count', 0,
      'posted_at', p_posted, 'posted_at_raw', null, 'captured_at', p_captured
    ),
    'source', jsonb_build_object('author_degree', p_degree, 'social_proof', 'proof ' || p_pid)
  );
$$;

set local role service_role;

-- ===========================================================================
-- (A) New batch: sensor 1 reports ing-1 (second) and ing-2 (third).
-- ===========================================================================
create temp table res_a as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    pg_temp.mk('ing-1', 'second', 10),
    pg_temp.mk('ing-2', 'third', 0)
  )
) as j;

select is((select j->>'received'    from res_a), '2', 'A: received 2');
select is((select j->>'new_items'   from res_a), '2', 'A: 2 new items');
select is((select j->>'known_items' from res_a), '0', 'A: 0 known items');
select is((select seen_count from items where linkedin_post_id = 'ing-1'),
  1, 'A: ing-1 seen_count = 1');
select is((select best_author_degree from items where linkedin_post_id = 'ing-1'),
  'second'::author_degree, 'A: ing-1 best_author_degree = second');
select is((select seen_count from items where linkedin_post_id = 'ing-2'),
  1, 'A: ing-2 seen_count = 1');
select is(
  (select author_degree from item_sources s
     join items i on i.id = s.item_id
    where i.linkedin_post_id = 'ing-1'),
  'second'::author_degree,
  'A: per-sensor author_degree lands on item_sources');

-- ===========================================================================
-- (B) Same-sensor resend is idempotent; greatest-wins counts; classification
--     and first-capture provenance are preserved; posted_at is backfill-only.
-- ===========================================================================
update items set stream = 'opportunity' where linkedin_post_id = 'ing-1';

create temp table res_b as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    -- lower reactions, later capture, a posted_at to backfill
    pg_temp.mk('ing-1', 'second', 5, false, null, '2026-06-01T00:00:00Z', '2026-05-01T00:00:00Z'),
    pg_temp.mk('ing-2', 'third', 0)
  )
) as j;

select is((select j->>'new_items'   from res_b), '0', 'B: resend adds 0 new');
select is((select j->>'known_items' from res_b), '2', 'B: resend is 2 known');
select is((select seen_count from items where linkedin_post_id = 'ing-1'),
  1, 'B: ing-1 seen_count still 1 (idempotent)');
select is((select reaction_count from items where linkedin_post_id = 'ing-1'),
  10, 'B: reaction_count not regressed by a lower resend (greatest)');
select is((select stream from items where linkedin_post_id = 'ing-1'),
  'opportunity'::stream, 'B: classification preserved on re-ingest');
select is((select captured_at from items where linkedin_post_id = 'ing-1'),
  '2026-01-01T00:00:00Z'::timestamptz, 'B: captured_at kept from first capture');
select is((select posted_at from items where linkedin_post_id = 'ing-1'),
  '2026-05-01T00:00:00Z'::timestamptz, 'B: null posted_at backfilled');

-- Higher resend raises the count; posted_at stays the first non-null value.
create temp table res_b2 as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    pg_temp.mk('ing-1', 'second', 50, false, null, '2026-07-01T00:00:00Z', '2026-04-01T00:00:00Z')
  )
) as j;

select is((select reaction_count from items where linkedin_post_id = 'ing-1'),
  50, 'B: reaction_count raised by a higher resend (greatest)');
select is((select posted_at from items where linkedin_post_id = 'ing-1'),
  '2026-05-01T00:00:00Z'::timestamptz, 'B: posted_at stays first non-null');

-- ===========================================================================
-- (C) A second sensor reporting the same posts bumps seen_count and can
--     strengthen best_author_degree.
-- ===========================================================================
create temp table res_c as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000002',
  jsonb_build_array(
    pg_temp.mk('ing-1', 'first', 0),
    pg_temp.mk('ing-2', 'third', 0)
  )
) as j;

select is((select j->>'known_items' from res_c), '2', 'C: both posts already known');
select is((select seen_count from items where linkedin_post_id = 'ing-1'),
  2, 'C: ing-1 seen_count = 2 (two sensors)');
select is((select best_author_degree from items where linkedin_post_id = 'ing-1'),
  'first'::author_degree, 'C: ing-1 best_author_degree strengthened to first');

-- ===========================================================================
-- (D) Same-degree second sensor: seen_count advances even though
--     best_author_degree is unchanged (widened-guard regression).
-- ===========================================================================
select is((select seen_count from items where linkedin_post_id = 'ing-2'),
  2, 'D: ing-2 seen_count = 2 despite unchanged best degree');
select is((select best_author_degree from items where linkedin_post_id = 'ing-2'),
  'third'::author_degree, 'D: ing-2 best_author_degree unchanged (third)');

-- ===========================================================================
-- (D2) A re-ingest that reports 'none' (this pass didn't observe the degree)
--      must NOT downgrade the sensor's known degree, and a null social_proof
--      must not wipe the stored note.
-- ===========================================================================
create temp table res_d2 as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    jsonb_build_object(
      'item', (pg_temp.mk('ing-1', 'none', 0))->'item',
      'source', jsonb_build_object('author_degree', 'none', 'social_proof', null)
    )
  )
) as j;

select is(
  (select s.author_degree from item_sources s
     join items i on i.id = s.item_id
    where i.linkedin_post_id = 'ing-1'
      and s.sensor_id = 'f1000000-0000-4000-8000-000000000001'),
  'second'::author_degree, 'D2: known degree not downgraded to none');
select is(
  (select best_author_degree from items where linkedin_post_id = 'ing-1'),
  'first'::author_degree, 'D2: best_author_degree unaffected by the none re-capture');
select is(
  (select s.social_proof from item_sources s
     join items i on i.id = s.item_id
    where i.linkedin_post_id = 'ing-1'
      and s.sensor_id = 'f1000000-0000-4000-8000-000000000001'),
  'proof ing-1', 'D2: social_proof not wiped by a null re-capture');

-- ===========================================================================
-- (E) Reposts are stored verbatim: author_* = resharer, original_author_* =
--     original. The read layer swaps; the store must not.
-- ===========================================================================
create temp table res_e as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    pg_temp.mk('ing-rep', 'second', 0, true, 'Antoine Mercier')
  )
) as j;
-- mk sets author_name = 'Author ing-rep' (the resharer) and original -> Antoine.
select is((select original_author_name from items where linkedin_post_id = 'ing-rep'),
  'Antoine Mercier', 'E: original author stored');
select is((select author_name from items where linkedin_post_id = 'ing-rep'),
  'Author ing-rep', 'E: resharer kept as author_name (not swapped)');
select is((select is_repost from items where linkedin_post_id = 'ing-rep'),
  true, 'E: is_repost stored');

-- ===========================================================================
-- (F) Poison pill: a batch with one bad repost (no original author) isolates
--     that post (CHECK violation) while the good post still commits.
-- ===========================================================================
create temp table res_f as
select public.ingest_posts(
  'f1000000-0000-4000-8000-000000000001',
  jsonb_build_array(
    pg_temp.mk('ing-good', 'second', 0),
    pg_temp.mk('ing-bad', 'second', 0, true, null)  -- repost, no original author
  )
) as j;

select is((select j->>'new_items' from res_f), '1', 'F: only the good post is new');
select is((select jsonb_array_length(j->'failed') from res_f), 1,
  'F: exactly one post reported as failed');
select is((select j->'failed'->0->>'linkedin_post_id' from res_f), 'ing-bad',
  'F: the failed post is the bad repost');
select is(
  (select count(*) from items where linkedin_post_id in ('ing-good', 'ing-bad'))::integer,
  1, 'F: good post committed, bad post rolled back');

reset role;

-- ===========================================================================
-- (G) EXECUTE is service_role-only: anon and authenticated get 42501.
-- ===========================================================================
set local role anon;
select throws_ok(
  $$select public.ingest_posts('f1000000-0000-4000-8000-000000000001'::uuid, '[]'::jsonb)$$,
  '42501', null, 'G: anon cannot execute ingest_posts');                         -- (extra)

reset role;
set local role authenticated;
select throws_ok(
  $$select public.ingest_posts('f1000000-0000-4000-8000-000000000001'::uuid, '[]'::jsonb)$$,
  '42501', null, 'G: authenticated cannot execute ingest_posts');               -- (extra)

reset role;
select * from finish();
rollback;
