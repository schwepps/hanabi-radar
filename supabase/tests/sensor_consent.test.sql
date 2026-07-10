-- pgTAP tests for record_sensor_consent (sensor onboarding). Run with
-- `pnpm db:test` (local stack up). Rolled-back transaction, no residue.

begin;
select plan(8);

-- Fixtures (as superuser). Ids chosen not to collide with seed.sql or other tests.
--   A: freshly provisioned (consent null)  -> exercises the SET path.
--   B: already consented at a fixed PAST time -> exercises the NON-OVERWRITE guard.
insert into sensors (id, name, email, token_hash, consented_at) values
  ('f2000000-0000-4000-8000-000000000001', 'consent-a', 'consent-a@t.test', 'consenthashA', null),
  ('f2000000-0000-4000-8000-000000000002', 'consent-b', 'consent-b@t.test', 'consenthashB',
   '2020-01-01T00:00:00Z');

select is(
  (select consented_at from sensors where id = 'f2000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'sensor A starts with no recorded consent');

set local role service_role;

-- SET path: A had null consent -> gets a non-null timestamp, recorded on the row.
select isnt(
  public.record_sensor_consent('f2000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'consent on a null sensor returns a timestamp');
select isnt(
  (select consented_at from sensors where id = 'f2000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'consent is recorded on sensor A');

-- NON-OVERWRITE guard: B was consented in 2020. A consent call must return that SAME
-- value and NOT bump it to now(). (Using a fixed past literal rather than comparing two
-- in-transaction calls, whose now() is frozen and would hide a removed guard.)
select is(
  public.record_sensor_consent('f2000000-0000-4000-8000-000000000002'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'consent on an already-consented sensor returns the original timestamp');
select is(
  (select consented_at from sensors where id = 'f2000000-0000-4000-8000-000000000002'),
  '2020-01-01T00:00:00Z'::timestamptz,
  'the original consent timestamp is not overwritten');

-- Unknown sensor id -> null.
select is(
  public.record_sensor_consent('f2000000-0000-4000-8000-0000000000ff'),
  null::timestamptz,
  'an unknown sensor id returns null');

reset role;

-- EXECUTE is service_role-only: anon and authenticated get 42501.
set local role anon;
select throws_ok(
  $$select public.record_sensor_consent('f2000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501', null, 'anon cannot execute record_sensor_consent');

reset role;
set local role authenticated;
select throws_ok(
  $$select public.record_sensor_consent('f2000000-0000-4000-8000-000000000001'::uuid)$$,
  '42501', null, 'authenticated cannot execute record_sensor_consent');

reset role;
select * from finish();
rollback;
