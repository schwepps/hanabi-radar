-- pgTAP tests for the FSC-89 schema. Run with `pnpm db:test` (local stack must be up).
-- Everything runs inside a rolled-back transaction, so it leaves no residue.

begin;
select plan(12);

-- ---------------------------------------------------------------------------
-- Structure & privacy invariants
-- ---------------------------------------------------------------------------

-- Guard: the strength rank in recompute_best_author_degree() must cover every
-- author_degree label. If someone adds a value without updating the CASE, this fails.
select is(
  (select count(*) from unnest(enum_range(null::author_degree)) e
    where e::text not in ('first', 'second', 'third', 'none'))::bigint,
  0::bigint,
  'every author_degree label is covered by the strength rank'
);

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'items'
      and column_name in ('author_degree', 'social_proof'))::bigint,
  0::bigint,
  'items has NO author_degree/social_proof columns (privacy invariant)'
);

select is(
  (select count(*) from information_schema.columns
    where table_schema = 'public' and table_name = 'item_sources'
      and column_name in ('author_degree', 'social_proof'))::bigint,
  2::bigint,
  'item_sources carries author_degree and social_proof'
);

select ok(
  (select bool_and(relrowsecurity) from pg_class
    where relnamespace = 'public'::regnamespace
      and relname in ('sensors', 'items', 'item_sources')),
  'RLS is enabled on sensors, items and item_sources'
);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------
-- consented_at set: recompute_best_author_degree counts only active+consented sensors
-- (FSC-95), so the derivation cases below use consented sensors.
insert into sensors (id, name, email, token_hash, consented_at) values
  ('00000000-0000-0000-0000-000000000001', 's1', 's1@example.test', 'h1', now()),
  ('00000000-0000-0000-0000-000000000002', 's2', 's2@example.test', 'h2', now());

insert into items (id, linkedin_post_id, author_name, url, captured_at) values
  ('11111111-1111-1111-1111-111111111111', 'urn:li:activity:A', 'Author A', 'https://x/a', now()),
  ('22222222-2222-2222-2222-222222222222', 'urn:li:activity:B', 'Author B', 'https://x/b', now());

-- ---------------------------------------------------------------------------
-- best_author_degree derivation (insert -> strengthen -> weaken -> reparent -> empty)
-- ---------------------------------------------------------------------------
select is(
  (select best_author_degree from items where id = '11111111-1111-1111-1111-111111111111'),
  'none'::author_degree,
  'fresh item with no sources -> none'
);

insert into item_sources (item_id, sensor_id, author_degree) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000001', 'third');
select is(
  (select best_author_degree from items where id = '11111111-1111-1111-1111-111111111111'),
  'third'::author_degree,
  'single third source -> third'
);

insert into item_sources (item_id, sensor_id, author_degree) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000002', 'first');
select is(
  (select best_author_degree from items where id = '11111111-1111-1111-1111-111111111111'),
  'first'::author_degree,
  'a stronger first source wins -> first'
);

delete from item_sources
 where item_id = '11111111-1111-1111-1111-111111111111'
   and sensor_id = '00000000-0000-0000-0000-000000000002';
select is(
  (select best_author_degree from items where id = '11111111-1111-1111-1111-111111111111'),
  'third'::author_degree,
  'removing the first source falls back to third'
);

-- Reparent the remaining 'third' source from item A to item B (exercises OLD.item_id).
update item_sources set item_id = '22222222-2222-2222-2222-222222222222'
 where item_id = '11111111-1111-1111-1111-111111111111';
select is(
  (select best_author_degree from items where id = '11111111-1111-1111-1111-111111111111'),
  'none'::author_degree,
  'reparent empties old item A -> none'
);
select is(
  (select best_author_degree from items where id = '22222222-2222-2222-2222-222222222222'),
  'third'::author_degree,
  'reparent moves the aggregate to item B -> third'
);

delete from item_sources where item_id = '22222222-2222-2222-2222-222222222222';
select is(
  (select best_author_degree from items where id = '22222222-2222-2222-2222-222222222222'),
  'none'::author_degree,
  'deleting the last source -> none'
);

-- ---------------------------------------------------------------------------
-- Deduplication: linkedin_post_id is unique
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into items (linkedin_post_id, author_name, url, captured_at)
    values ('urn:li:activity:A', 'dupe', 'https://x/dupe', now())$$,
  '23505',
  null,
  'a duplicate linkedin_post_id is rejected (unique constraint)'
);

select * from finish();
rollback;
