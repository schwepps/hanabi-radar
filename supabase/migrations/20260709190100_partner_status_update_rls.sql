-- FSC-103 — partners may update `items.status` (mark processed / dismissed).
--
-- FSC-93 deliberately kept `items` read-only for partners (SELECT policy only —
-- "writes stay on service_role/ingestion"). The dashboard now PERSISTS the
-- processed/dismissed action so it survives a reload and is shared across partners
-- (`items.status` is a single shared column, so the action is collective, not
-- per-partner). We reverse that read-only stance narrowly and safely:
--   * a column-scoped GRANT UPDATE (status) — partners can change ONLY `status`,
--     never any other column (a bare `update items set summary=…` stays denied);
--   * an UPDATE policy gated by the existing is_partner() predicate (FSC-93),
--     wrapped as a scalar subquery so it is evaluated once per statement, with a
--     matching WITH CHECK (never `true`);
--   * row-scoped to the DISPLAYED streams (`stream in (signal|opportunity|trend)`),
--     so a partner can only action items the dashboard actually shows. Without this,
--     a partner (or a stolen/XSS'd session driving the public anon key) could
--     pre-dismiss `stream IS NULL`/`noise` rows, which — since classification never
--     writes `status` (FSC-100) — would be born hidden for everyone with no UI to
--     recover them.
-- The `status` enum ('new' | 'processed' | 'dismissed') bounds the allowed values.

grant update (status) on items to authenticated;

create policy items_update_status_partner
  on items
  for update
  to authenticated
  using (
    (select public.is_partner())
    and stream in ('signal', 'opportunity', 'trend')
  )
  with check (
    (select public.is_partner())
    and stream in ('signal', 'opportunity', 'trend')
  );

comment on policy items_update_status_partner on items is
  'FSC-103: active partners may UPDATE status on displayed rows only (column grant limits columns to status; row scope limits to classified streams). Shared workflow — a dismiss/process is collective, not per-partner.';
