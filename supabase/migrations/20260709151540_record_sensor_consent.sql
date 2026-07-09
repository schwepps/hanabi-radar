-- FSC-98 (sensor onboarding, consumed by FSC-111 in the extension repo) —
-- record a sensor's GDPR consent in-product, idempotently and DB-authoritatively.
--
-- Consent is captured from the data subject IN the product (the extension), not only
-- out-of-band at provisioning: sensors are provisioned active with consented_at NULL,
-- and the extension calls POST /api/sensor/consent once during onboarding. After that,
-- /api/ingest's existing consent gate passes.
--
-- Conventions (per db-patterns): search_path pinned; EXECUTE deny-by-default; SECURITY
-- INVOKER — the caller is service_role, which bypasses RLS and holds DML on sensors.

create or replace function public.record_sensor_consent(p_sensor_id uuid)
returns timestamptz
language plpgsql
set search_path = public
as $$
declare
  v_consented_at timestamptz;
begin
  -- Idempotent: record consent only the first time, never overwrite it. The WHERE
  -- guard makes concurrent calls race-safe (only the first matches the NULL).
  update public.sensors
     set consented_at = now()
   where id = p_sensor_id
     and consented_at is null;

  select consented_at into v_consented_at
  from public.sensors
  where id = p_sensor_id;

  return v_consented_at;   -- null only when the sensor id does not exist
end;
$$;

revoke execute on function public.record_sensor_consent(uuid) from public;
grant execute on function public.record_sensor_consent(uuid) to service_role;

comment on function public.record_sensor_consent(uuid) is
  'FSC-98: set sensors.consented_at to now() on first consent (idempotent — never overwrites); returns the effective consent timestamp, or null for an unknown sensor. service_role only.';
