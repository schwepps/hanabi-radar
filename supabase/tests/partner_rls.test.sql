-- pgTAP tests for the FSC-93 partner RLS gating. Run with `pnpm db:test` (local
-- stack must be up). Everything runs inside a rolled-back transaction, so it
-- leaves no residue — same convention as schema.test.sql.
--
-- Role/JWT simulation: fixtures are inserted as the superuser first (authenticated
-- may not, and must not, write auth.users/partners); then `set local role` drives
-- table grants + `to <role>` policy applicability, and set_config(request.jwt.claims,
-- …, true) drives auth.uid() (Supabase resolves it from the `sub` claim). `reset role`
-- returns to the superuser session before switching to a role the current one can't
-- reach. NOTE on assertions: `items` is GRANTED to authenticated, so a non-partner
-- gets an *empty* result (RLS filters); item_sources/sensors/partners are NOT granted,
-- so any non-service role gets 42501 permission-denied — checked before RLS, a stronger
-- guarantee than "0 rows".

begin;
select plan(18);

-- ---------------------------------------------------------------------------
-- Fixtures (as superuser, before any role switch). Ids chosen not to collide
-- with seed.sql (a1…/b1…/d1…) or schema.test.sql (0000…/1111…/2222…).
-- ---------------------------------------------------------------------------
insert into auth.users (id, email) values
  ('e1000000-0000-4000-8000-000000000001', 'partner@rls.test'),
  ('e1000000-0000-4000-8000-000000000002', 'stranger@rls.test'),
  ('e1000000-0000-4000-8000-000000000003', 'inactive@rls.test');

insert into partners (id, active) values
  ('e1000000-0000-4000-8000-000000000001', true),    -- active partner
  ('e1000000-0000-4000-8000-000000000003', false);   -- off-boarded partner

insert into sensors (id, name, email, token_hash) values
  ('aaaa0000-0000-4000-8000-000000000001', 's-rls', 's-rls@rls.test', 'token-hash-rls');

insert into items (id, linkedin_post_id, author_name, url, captured_at) values
  ('cccc0000-0000-4000-8000-000000000001', 'urn:li:activity:rls', 'Author RLS', 'https://x/rls', now());

insert into item_sources (item_id, sensor_id, author_degree) values
  ('cccc0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001', 'second');

-- ---------------------------------------------------------------------------
-- (i) UNAUTHENTICATED (anon): denied at the grant level on every table + RPC.
--     Strongest form of criterion #4 (permission-denied, not just empty).
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok('select 1 from items',            '42501', null, 'anon: items permission denied');
select throws_ok('select 1 from item_sources',     '42501', null, 'anon: item_sources permission denied');
select throws_ok('select 1 from sensors',          '42501', null, 'anon: sensors permission denied');
select throws_ok('select 1 from partners',         '42501', null, 'anon: partners permission denied');
select throws_ok('select public.is_partner()',     '42501', null, 'anon: cannot execute is_partner()');

-- ---------------------------------------------------------------------------
-- (ii) AUTHENTICATED NON-PARTNER: 0 items (RLS filters), everything else denied.
--      Criterion #1 negative + #3.
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select ok(not public.is_partner(),                 'non-partner: is_partner() false');
select is_empty('select 1 from items',             'non-partner: reads zero items');
select throws_ok('select 1 from item_sources', '42501', null, 'non-partner: item_sources denied');
select throws_ok('select 1 from sensors',      '42501', null, 'non-partner: sensors denied');
select throws_ok('select 1 from partners',     '42501', null, 'non-partner: partners denied');

-- ---------------------------------------------------------------------------
-- (iii) AUTHENTICATED PARTNER: sees items; item_sources STILL hidden (FSC-106).
--       Criterion #1 positive + #3.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(public.is_partner(),                     'partner: is_partner() true');
select isnt_empty('select 1 from items',           'partner: reads items');
select throws_ok('select 1 from item_sources', '42501', null, 'partner: item_sources STILL hidden');

-- ---------------------------------------------------------------------------
-- (iii-b) INACTIVE partner is treated as a non-partner (revocation path).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select ok(not public.is_partner(),                 'inactive partner: is_partner() false');
select is_empty('select 1 from items',             'inactive partner: reads zero items');

-- ---------------------------------------------------------------------------
-- Guard: authenticated has SELECT only — no write path via RLS.
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into items (linkedin_post_id, author_name, url, captured_at)
    values ('urn:li:activity:rls-x', 'x', 'https://x/x', now())$$,
  '42501', null, 'authenticated cannot INSERT items (read-only grant)');

-- ---------------------------------------------------------------------------
-- (iv) item_sources + items visible to service_role (RLS bypass) — no regression
--      on the server-side read/ingestion path.
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
select isnt_empty('select 1 from item_sources',    'service_role: reads item_sources (RLS bypass)');
select isnt_empty('select 1 from items',           'service_role: reads items (RLS bypass)');

reset role;
select * from finish();
rollback;
