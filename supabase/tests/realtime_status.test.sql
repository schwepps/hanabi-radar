-- pgTAP tests for FSC-103: `items` in the supabase_realtime publication (so the
-- dashboard receives postgres_changes) and the partner status-UPDATE RLS
-- (items_update_status_partner + the column-scoped grant). Same rolled-back-txn,
-- role/JWT-simulation convention as partner_rls.test.sql — leaves no residue.

begin;
select plan(7);

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser, before any role switch). Ids chosen not to collide
-- with seed.sql / schema.test.sql / partner_rls.test.sql.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('f1000000-0000-4000-8000-000000000001', 'partner@fsc103.test'),
  ('f1000000-0000-4000-8000-000000000002', 'stranger@fsc103.test');

insert into partners (id, active) values
  ('f1000000-0000-4000-8000-000000000001', true);   -- active partner

insert into items (id, linkedin_post_id, author_name, url, captured_at, stream, status)
values
  ('dddd0000-0000-4000-8000-000000000001', 'urn:li:activity:fsc103',
   'Author 103', 'https://x/103', now(), 'signal', 'new'),
  -- Unclassified row (stream IS NULL) — must be out of a partner's UPDATE reach.
  ('dddd0000-0000-4000-8000-000000000002', 'urn:li:activity:fsc103-null',
   'Author Null', 'https://x/null', now(), null, 'new');

-- ---------------------------------------------------------------------------
-- (1) Realtime: items is a member of the supabase_realtime publication.
-- ---------------------------------------------------------------------------
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'items'
  ),
  'items is in the supabase_realtime publication'
);

-- ---------------------------------------------------------------------------
-- (2) Active partner CAN update items.status, and it persists.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$update items set status = 'processed'
    where id = 'dddd0000-0000-4000-8000-000000000001'$$,
  'partner: update items.status succeeds');
select is(
  (select status::text from items
   where id = 'dddd0000-0000-4000-8000-000000000001'),
  'processed',
  'partner: status write persisted');

-- ---------------------------------------------------------------------------
-- (3) Partner CANNOT touch a non-status column — the column grant blocks it.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$update items set summary = 'hax'
    where id = 'dddd0000-0000-4000-8000-000000000001'$$,
  '42501', null, 'partner: cannot update a non-status column');

-- ---------------------------------------------------------------------------
-- (3b) Partner CANNOT status an unclassified (stream IS NULL) row: the row-scoped
--      policy filters it (no error, 0 rows) — closes the pre-dismiss vector.
-- ---------------------------------------------------------------------------
update items set status = 'dismissed'
  where id = 'dddd0000-0000-4000-8000-000000000002';
select is(
  (select status::text from items
   where id = 'dddd0000-0000-4000-8000-000000000002'),
  'new',
  'partner: cannot change status of an unclassified (stream null) row');

-- ---------------------------------------------------------------------------
-- (4) Non-partner UPDATE is a no-op: RLS USING filters the row, no error.
--     (Switch back to the partner to read, since a non-partner sees zero items.)
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
update items set status = 'dismissed'
  where id = 'dddd0000-0000-4000-8000-000000000001';
select set_config('request.jwt.claims',
  '{"sub":"f1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  (select status::text from items
   where id = 'dddd0000-0000-4000-8000-000000000001'),
  'processed',
  'non-partner: status write is a no-op (RLS filtered)');

-- ---------------------------------------------------------------------------
-- (5) anon cannot update at all (no grant).
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok(
  $$update items set status = 'dismissed'
    where id = 'dddd0000-0000-4000-8000-000000000001'$$,
  '42501', null, 'anon: cannot update items');

reset role;
select * from finish();
rollback;
