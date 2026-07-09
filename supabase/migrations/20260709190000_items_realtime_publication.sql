-- FSC-103 — enable Supabase Realtime for the partner dashboard.
--
-- The dashboard subscribes to postgres_changes (UPDATE) on `items` so a newly
-- classified item appears live: the classification worker sets `stream` on a
-- status='new' row (FSC-100), and that UPDATE must reach connected partners.
-- Realtime only emits changes for tables in the `supabase_realtime` publication;
-- `items` was never added, so no events were delivered. RLS still gates delivery
-- per-subscriber (items_select_partner, FSC-93) — this only turns the stream on.
--
-- No REPLICA IDENTITY change: we read only the NEW row on UPDATE (Postgres logs the
-- full new tuple regardless of replica identity) and never subscribe to DELETE, so
-- the PK-only default identity is sufficient. Written idempotently so `supabase db
-- reset` (which replays every migration) stays safe.

do $$
begin
  -- The publication ships with Supabase (hosted + local); guard anyway for a bare stack.
  -- Create it empty — never `for all tables` (superuser-only and over-broad).
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'items'
  ) then
    alter publication supabase_realtime add table public.items;
  end if;
end
$$;
