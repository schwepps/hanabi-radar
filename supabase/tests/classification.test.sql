-- pgTAP tests for FSC-100 classification: the write-path invariants (reusing the
-- existing columns) and the poison-item parking added by migration 20260709180000
-- (classification_attempts + record_classification_failure). Run with `pnpm db:test`
-- (local stack up). Rolled-back transaction, no residue — same convention as the
-- other test files. Ids/linkedin_post_ids are chosen not to collide with seed.sql or
-- the other tests.

begin;
select plan(17);

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser). A sensor for the recapture path, and two items
-- inserted directly to exercise the `stream IS NULL` write guard: one already
-- classified, one still pending.
-- ---------------------------------------------------------------------------
insert into sensors (id, name, email, token_hash) values
  ('c1000000-0000-4000-8000-000000000001', 'cls-s1', 'cls-s1@t.test', 'clshash1');

insert into items (id, linkedin_post_id, author_name, url, captured_at, stream) values
  ('c2000000-0000-4000-8000-000000000001', 'cls-guard-classified',
   'Guard Classified', 'https://x/cls-guard-classified', now(), 'signal');

insert into items (id, linkedin_post_id, author_name, url, captured_at) values
  ('c3000000-0000-4000-8000-000000000001', 'cls-guard-pending',
   'Guard Pending', 'https://x/cls-guard-pending', now());  -- stream defaults NULL

-- Two pending items for the poison-item parking tests (group E).
insert into items (id, linkedin_post_id, author_name, url, captured_at) values
  ('c4000000-0000-4000-8000-000000000001', 'cls-fail-perm',
   'Fail Perm', 'https://x/cls-fail-perm', now()),
  ('c5000000-0000-4000-8000-000000000001', 'cls-fail-trans',
   'Fail Trans', 'https://x/cls-fail-trans', now());

-- One ingest payload element for the recapture item, parameterized by reactions.
create function pg_temp.recpost(p_reactions integer) returns jsonb language sql as $$
  select jsonb_build_object(
    'item', jsonb_build_object(
      'linkedin_post_id', 'cls-rec-1',
      'author_name', 'Marc Lefebvre', 'author_company', 'Initech', 'author_title', 'COO',
      'author_profile_url', null, 'author_type', 'person', 'text', 'refonte',
      'url', 'https://x/cls-rec-1', 'post_type', 'text', 'is_repost', false,
      'original_author_name', null, 'original_author_profile_url', null,
      'media_title', null, 'hashtags', jsonb_build_array('servicenow'),
      'reaction_count', p_reactions, 'comment_count', 0,
      'posted_at', null, 'posted_at_raw', null, 'captured_at', '2026-01-01T00:00:00Z'
    ),
    'source', jsonb_build_object('author_degree', 'none', 'social_proof', null)
  );
$$;

set local role service_role;

-- ===========================================================================
-- (A) `stream IS NULL` write guard — the idempotency/concurrency lock.
-- ===========================================================================
-- Guarded write against an already-classified row must NOT overwrite it.
update items set stream = 'trend'
  where id = 'c2000000-0000-4000-8000-000000000001' and stream is null;
select is(
  (select stream::text from items where id = 'c2000000-0000-4000-8000-000000000001'),
  'signal', 'A: guard leaves an already-classified row untouched');

-- Guarded write against a still-pending row succeeds.
update items set stream = 'trend'
  where id = 'c3000000-0000-4000-8000-000000000001' and stream is null;
select is(
  (select stream::text from items where id = 'c3000000-0000-4000-8000-000000000001'),
  'trend', 'A: guard updates a pending (stream IS NULL) row');

-- ===========================================================================
-- (B) service_role can write the classification columns.
-- ===========================================================================
update items set summary = 'svc classified'
  where id = 'c3000000-0000-4000-8000-000000000001';
select is(
  (select summary from items where id = 'c3000000-0000-4000-8000-000000000001'),
  'svc classified', 'B: service_role can write classification columns');

-- ===========================================================================
-- (C) Preserve-on-recapture — classification survives a later ingest_posts.
-- ===========================================================================
-- Create the item (stream NULL), classify it, then re-capture with more reactions.
create temp table cls_ins1 as select public.ingest_posts(
  'c1000000-0000-4000-8000-000000000001', jsonb_build_array(pg_temp.recpost(10))) as j;

update items set stream = 'opportunity', domains = '{servicenow,pmo}',
  heat = 'hot', summary = 'Refonte ServiceNow, partenaire PMO recherché.'
  where linkedin_post_id = 'cls-rec-1';

create temp table cls_ins2 as select public.ingest_posts(
  'c1000000-0000-4000-8000-000000000001', jsonb_build_array(pg_temp.recpost(99))) as j;

select is((select stream::text from items where linkedin_post_id = 'cls-rec-1'),
  'opportunity', 'C: recapture preserves stream');
select is(
  (select array_to_string(domains, ',') from items where linkedin_post_id = 'cls-rec-1'),
  'servicenow,pmo', 'C: recapture preserves domains');
select is((select summary from items where linkedin_post_id = 'cls-rec-1'),
  'Refonte ServiceNow, partenaire PMO recherché.', 'C: recapture preserves summary');
select is((select reaction_count from items where linkedin_post_id = 'cls-rec-1'),
  99, 'C: recapture still updates non-classification fields (reaction_count)');

-- ===========================================================================
-- (E) record_classification_failure — poison-item parking.
-- ===========================================================================
-- Permanent failure parks the item at the max immediately, recording the reason.
do $$ begin perform public.record_classification_failure(
  'c4000000-0000-4000-8000-000000000001', 'refusal', true, 5); end $$;
select is((select classification_attempts from items
  where id = 'c4000000-0000-4000-8000-000000000001'),
  5, 'E: permanent failure parks attempts at the max');
select is((select classification_error from items
  where id = 'c4000000-0000-4000-8000-000000000001'),
  'refusal', 'E: permanent failure records the reason');

-- Transient failure increments.
do $$ begin perform public.record_classification_failure(
  'c5000000-0000-4000-8000-000000000001', 'timeout', false, 5); end $$;
select is((select classification_attempts from items
  where id = 'c5000000-0000-4000-8000-000000000001'),
  1, 'E: transient failure increments to 1');
do $$ begin perform public.record_classification_failure(
  'c5000000-0000-4000-8000-000000000001', 'timeout', false, 5); end $$;
select is((select classification_attempts from items
  where id = 'c5000000-0000-4000-8000-000000000001'),
  2, 'E: transient failure increments again');

-- A transient failure on an already-parked row stays capped at the max (least()).
do $$ begin perform public.record_classification_failure(
  'c4000000-0000-4000-8000-000000000001', 'timeout', false, 5); end $$;
select is((select classification_attempts from items
  where id = 'c4000000-0000-4000-8000-000000000001'),
  5, 'E: increment is capped at the max');

-- Guarded by stream IS NULL: a no-op on an already-classified row.
do $$ begin perform public.record_classification_failure(
  'c2000000-0000-4000-8000-000000000001', 'refusal', true, 5); end $$;
select is((select classification_attempts from items
  where id = 'c2000000-0000-4000-8000-000000000001'),
  0, 'E: no-op on an already-classified row (stream IS NULL guard)');

-- ===========================================================================
-- (D) Only the writer role may write — anon/authenticated cannot UPDATE items
-- or execute the failure RPC.
-- ===========================================================================
reset role;
set local role authenticated;
select throws_ok(
  $$update items set stream = 'noise' where linkedin_post_id = 'cls-guard-pending'$$,
  '42501', null, 'D: authenticated cannot UPDATE items (SELECT-only grant)');
select throws_ok(
  $$select public.record_classification_failure('c5000000-0000-4000-8000-000000000001'::uuid, 'x', false, 5)$$,
  '42501', null, 'D: authenticated cannot execute record_classification_failure');

reset role;
set local role anon;
select throws_ok(
  $$update items set stream = 'noise' where linkedin_post_id = 'cls-guard-pending'$$,
  '42501', null, 'D: anon cannot UPDATE items');
select throws_ok(
  $$select public.record_classification_failure('c5000000-0000-4000-8000-000000000001'::uuid, 'x', false, 5)$$,
  '42501', null, 'D: anon cannot execute record_classification_failure');

reset role;
select * from finish();
rollback;
