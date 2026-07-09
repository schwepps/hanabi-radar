-- FSC-100 — poison-item guard for the classification worker.
--
-- A classification that fails is left `stream IS NULL` and retried on the next tick.
-- Unbounded, a permanently-failing item (a persistent refusal, or output that never
-- parses) is retried forever AND — because the worker drains oldest-captured first —
-- sits at the FRONT of the queue; enough of them would starve newer items and silently
-- stall the feed. This adds an attempt counter so the worker can PARK an item once it
-- reaches the max (the worker's fetch excludes parked rows), bounding wasted Claude
-- spend and keeping the queue moving. Parked rows keep `stream IS NULL` (a classifier
-- failure is not "noise"); an operator can requeue by resetting the counter.
--
-- Conventions (per db-patterns): search_path pinned; EXECUTE deny-by-default; SECURITY
-- INVOKER — the caller is service_role, which bypasses RLS and holds DML on items.
-- The new columns inherit items' existing table-level grants to service_role.

alter table items
  add column classification_attempts integer not null default 0,
  add column classification_error text;

comment on column items.classification_attempts is
  'FSC-100: failed classification attempts. The worker parks an item (stops fetching it) once this reaches the configured max, so a poison item cannot block the FIFO queue.';
comment on column items.classification_error is
  'FSC-100: last classification failure reason (refusal/invalid/max_tokens/rate_limit/timeout/error), for debugging parked items.';

-- Atomic failure recorder: park a permanent failure immediately (jump to the max),
-- otherwise increment (capped at the max). Guarded by `stream IS NULL` so it can never
-- touch an already-classified row (mirrors the classifier's write guard).
create or replace function public.record_classification_failure(
  p_item_id      uuid,
  p_error        text,
  p_permanent    boolean,
  p_max_attempts integer
)
returns void
language sql
set search_path = public
as $$
  update public.items
     set classification_attempts =
           case when p_permanent then p_max_attempts
                else least(classification_attempts + 1, p_max_attempts) end,
         classification_error = p_error
   where id = p_item_id
     and stream is null;
$$;

revoke execute on function public.record_classification_failure(uuid, text, boolean, integer) from public;
grant execute on function public.record_classification_failure(uuid, text, boolean, integer) to service_role;

comment on function public.record_classification_failure(uuid, text, boolean, integer) is
  'FSC-100: record a classification failure on a still-pending item — park permanent failures at the max, otherwise increment (capped). service_role only.';
