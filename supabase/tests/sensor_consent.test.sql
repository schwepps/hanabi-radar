-- pgTAP tests for record_sensor_consent (FSC-98 sensor onboarding). Run with
-- `pnpm db:test` (local stack up). Rolled-back transaction, no residue.

begin;
select plan(7);

-- Fixture (as superuser). Id chosen not to collide with seed.sql or other tests.
insert into sensors (id, name, email, token_hash) values
  ('f2000000-0000-4000-8000-000000000001', 'consent-s1', 'consent-s1@t.test', 'consenthash1');

select is(
  (select consented_at from sensors where id = 'f2000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'a freshly provisioned sensor has no recorded consent');

set local role service_role;

-- First consent: returns a timestamp and records it on the sensor.
create temp table c1 as
select public.record_sensor_consent('f2000000-0000-4000-8000-000000000001') as ts;

select isnt((select ts from c1), null::timestamptz, 'first consent call returns a timestamp');
select isnt(
  (select consented_at from sensors where id = 'f2000000-0000-4000-8000-000000000001'),
  null::timestamptz,
  'consent is recorded on the sensor');

-- Idempotent: a second call returns the SAME timestamp and does not overwrite it.
create temp table c2 as
select public.record_sensor_consent('f2000000-0000-4000-8000-000000000001') as ts;

select is(
  (select ts from c2),
  (select ts from c1),
  'a second consent call is idempotent (same timestamp, not overwritten)');

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
