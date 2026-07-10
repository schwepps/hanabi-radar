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
select plan(26);

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

-- s-rls is active + consented so FSC-106 reveal includes it; the extra sensors cover
-- the reveal's filters (a 2nd active+consented member, an inactive one, a non-consented one).
insert into sensors (id, name, email, token_hash, active, consented_at) values
  ('aaaa0000-0000-4000-8000-000000000001', 's-rls',       's-rls@rls.test',       'token-hash-rls',   true,  now()),
  ('aaaa0000-0000-4000-8000-000000000002', 's-rls-2',     's-rls-2@rls.test',     'token-hash-rls-2', true,  now()),
  ('aaaa0000-0000-4000-8000-000000000003', 's-inactive',  's-inactive@rls.test',  'token-hash-inact', false, now()),
  ('aaaa0000-0000-4000-8000-000000000004', 's-noconsent', 's-noconsent@rls.test', 'token-hash-nocon', true,  null);

insert into items (id, linkedin_post_id, author_name, url, captured_at) values
  ('cccc0000-0000-4000-8000-000000000001', 'urn:li:activity:rls',  'Author RLS',  'https://x/rls',  now()),
  ('cccc0000-0000-4000-8000-000000000002', 'urn:li:activity:rls2', 'Author RLS2', 'https://x/rls2', now()),
  ('cccc0000-0000-4000-8000-000000000003', 'urn:li:activity:rls3', 'Author RLS3', 'https://x/rls3', now()),
  ('cccc0000-0000-4000-8000-000000000004', 'urn:li:activity:rls4', 'Author RLS4', 'https://x/rls4', now());

insert into item_sources (item_id, sensor_id, author_degree, social_proof) values
  -- item1: one consented 2nd-degree member — the basic reveal case.
  ('cccc0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001', 'second', null),
  -- item2: mixed degrees (third + first) — strongest-first ordering, and notes suppressed
  --        because a 1st-degree direct path exists.
  ('cccc0000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000001', 'third',  'note-third-2'),
  ('cccc0000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000002', 'first',  'note-first-2'),
  -- item3: no 1st-degree member — 2nd-degree path + a none+social alternative, notes surfaced.
  ('cccc0000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000002', 'second', 'note-second-3'),
  ('cccc0000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000001', 'none',   'social-alt-3'),
  -- item4: an inactive AND a non-consented member both at 1st degree (must be excluded), plus a
  --        consented 3rd-degree member. has_first must ignore the filtered members (note NOT suppressed).
  ('cccc0000-0000-4000-8000-000000000004', 'aaaa0000-0000-4000-8000-000000000003', 'first',  'inactive-note'),
  ('cccc0000-0000-4000-8000-000000000004', 'aaaa0000-0000-4000-8000-000000000004', 'first',  'noconsent-note'),
  ('cccc0000-0000-4000-8000-000000000004', 'aaaa0000-0000-4000-8000-000000000002', 'third',  'note-third-4');

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
select throws_ok(
  $$select 1 from reveal_item_sources('cccc0000-0000-4000-8000-000000000001')$$,
  '42501', null, 'anon: cannot execute reveal_item_sources()');

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
select is_empty(
  $$select 1 from reveal_item_sources('cccc0000-0000-4000-8000-000000000001')$$,
  'non-partner: reveal_item_sources returns nothing (gated by is_partner)');

-- ---------------------------------------------------------------------------
-- (iii) AUTHENTICATED PARTNER: sees items; item_sources STILL hidden (FSC-106).
--       Criterion #1 positive + #3.
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select ok(public.is_partner(),                     'partner: is_partner() true');
select isnt_empty('select 1 from items',           'partner: reads items');
select throws_ok('select 1 from item_sources', '42501', null, 'partner: item_sources STILL hidden');

-- FSC-106: the partner-gated reveal is the ONLY read path into item_sources.
select isnt_empty(
  $$select 1 from reveal_item_sources('cccc0000-0000-4000-8000-000000000001')$$,
  'partner: reveal_item_sources returns the sighting');
select results_eq(
  $$select sensor_name, author_degree from reveal_item_sources('cccc0000-0000-4000-8000-000000000001')$$,
  $$values ('s-rls', 'second'::public.author_degree)$$,
  'partner: reveal returns the consented sensor at its degree');
-- Strongest-first (first before third) + notes suppressed when a 1st-degree member exists.
select results_eq(
  $$select sensor_name, author_degree, social_proof
    from reveal_item_sources('cccc0000-0000-4000-8000-000000000002')$$,
  $$values ('s-rls-2', 'first'::public.author_degree, null::text),
           ('s-rls',   'third'::public.author_degree, null::text)$$,
  'partner: reveal orders strongest-first and suppresses notes when a member is 1st-degree');
-- No 1st-degree member → 2nd-degree path + none social alternative, notes surfaced, strongest-first.
select results_eq(
  $$select sensor_name, author_degree, social_proof
    from reveal_item_sources('cccc0000-0000-4000-8000-000000000003')$$,
  $$values ('s-rls-2', 'second'::public.author_degree, 'note-second-3'::text),
           ('s-rls',   'none'::public.author_degree,   'social-alt-3'::text)$$,
  'partner: reveal surfaces the social-proof alternative when no member is 1st-degree');
-- Inactive + non-consented members are never revealed; has_first ignores them (note NOT suppressed).
select results_eq(
  $$select sensor_name, author_degree, social_proof
    from reveal_item_sources('cccc0000-0000-4000-8000-000000000004')$$,
  $$values ('s-rls-2', 'third'::public.author_degree, 'note-third-4'::text)$$,
  'partner: reveal excludes inactive/non-consented members and ignores their degree for suppression');

-- ---------------------------------------------------------------------------
-- (iii-b) INACTIVE partner is treated as a non-partner (revocation path).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  '{"sub":"e1000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select ok(not public.is_partner(),                 'inactive partner: is_partner() false');
select is_empty('select 1 from items',             'inactive partner: reads zero items');
-- FSC-106: the reveal is the ONLY partner-facing read of item_sources — pin that a
-- revoked (inactive) partner gets nothing, distinct from the never-a-partner case above.
select is_empty(
  $$select 1 from reveal_item_sources('cccc0000-0000-4000-8000-000000000001')$$,
  'inactive partner: reveal_item_sources returns nothing (revocation)');

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
