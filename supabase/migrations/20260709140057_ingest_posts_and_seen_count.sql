-- FSC-98 — Post ingestion RPC + seen_count aggregate + repost integrity.
--
-- Builds on FSC-89 (schema, best_author_degree trigger). Three changes:
--   (a) fold seen_count into the item_sources aggregate recompute (idempotent
--       count(*), race-free under the existing FOR UPDATE lock);
--   (b) a CHECK so a repost can never be stored without its original author
--       (else the read layer surfaces the resharer — the FSC-98 guardrail);
--   (c) ingest_posts(): the atomic batch upsert the endpoint calls as service_role.
--
-- Conventions (per db-patterns): search_path pinned; EXECUTE deny-by-default
-- (revoke public, grant service_role); SECURITY INVOKER — the caller is
-- service_role, which bypasses RLS and already holds DML on items/item_sources.

-- ============================================================================
-- (a) Fold seen_count into the existing best_author_degree recompute.
-- ============================================================================
-- seen_count = number of DISTINCT sensors that reported the post = count(*) of
-- item_sources rows (one row per sensor via the (item_id, sensor_id) PK). It is
-- computed under the SAME parent-row lock the aggregate already takes, so it is
-- race-free and idempotent — a same-sensor resend is an UPDATE, not a new row, so
-- the count holds. NOTE the write guard is WIDENED to fire when EITHER aggregate
-- changes: a second sensor at the SAME degree leaves best_author_degree unchanged,
-- and a guard keyed only on it would silently skip the seen_count bump.
create or replace function public.recompute_best_author_degree(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_best  public.author_degree;
  v_count integer;
begin
  -- Take the parent items row lock BEFORE reading sources (see FSC-89 rationale):
  -- serializes concurrent recomputes so neither aggregate is computed from a stale
  -- snapshot that missed a concurrent sibling insert.
  perform 1 from public.items where id = p_item_id for update;

  select s.author_degree
    into v_best
  from public.item_sources s
  where s.item_id = p_item_id
  order by case s.author_degree
             when 'first'  then 1
             when 'second' then 2
             when 'third'  then 3
             when 'none'   then 4
           end
  limit 1;

  v_best := coalesce(v_best, 'none'::public.author_degree);   -- no sources -> 'none'

  select count(*) into v_count
  from public.item_sources
  where item_id = p_item_id;

  update public.items i
     set best_author_degree = v_best,
         seen_count         = v_count
   where i.id = p_item_id
     and (i.best_author_degree is distinct from v_best
          or i.seen_count is distinct from v_count);   -- write only on a real change
end;
$$;

comment on column public.items.seen_count is
  'Derived: number of distinct sensors that reported this post. Maintained by the item_sources aggregate trigger (FSC-98), idempotent count(*).';

-- ============================================================================
-- (b) A repost MUST carry its original author.
-- ============================================================================
-- The read layer surfaces original_author_name for a repost and falls back to
-- author_name (the RESHARER) when it is null — the exact "never contact the
-- resharer" bug. Backstop it so no writer (RPC, seed, future job) can violate it.
alter table public.items
  add constraint items_repost_has_original_author
  check (not is_repost or original_author_name is not null);

-- ============================================================================
-- (c) Atomic batch ingestion RPC.
-- ============================================================================
-- One transaction; a per-post savepoint (BEGIN ... EXCEPTION) isolates a single bad
-- post so it can't poison the whole batch. Input p_posts = jsonb array of
--   { "item": { ...all item columns... }, "source": { author_degree, social_proof } }.
-- The TS mapper does the field routing, so the per-sensor fields live ONLY under
-- "source": this function structurally cannot write author_degree/social_proof onto
-- items. Dedup (linkedin_post_id), seen_count and best_author_degree are handled by
-- the ON CONFLICT + the item_sources trigger — never set here directly.
create or replace function public.ingest_posts(p_sensor_id uuid, p_posts jsonb)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  elem       jsonb;
  item_json  jsonb;
  src_json   jsonb;
  v_item_id  uuid;
  v_inserted boolean;
  v_received integer := 0;
  v_new      integer := 0;
  v_known    integer := 0;
  v_failed   jsonb   := '[]'::jsonb;
begin
  -- Process in a deterministic order (by linkedin_post_id) so concurrent batches
  -- acquire item row locks in the same order — avoids the deadlock class.
  for elem in
    select t.el
    from jsonb_array_elements(p_posts) as t(el)
    order by t.el->'item'->>'linkedin_post_id'
  loop
    v_received := v_received + 1;
    item_json := elem->'item';
    src_json  := elem->'source';

    begin
      insert into public.items (
        linkedin_post_id, author_name, author_company, author_title,
        author_profile_url, author_type, text, url, post_type, is_repost,
        original_author_name, original_author_profile_url, media_title, hashtags,
        reaction_count, comment_count, posted_at, posted_at_raw, captured_at
      )
      values (
        item_json->>'linkedin_post_id',
        item_json->>'author_name',
        item_json->>'author_company',
        item_json->>'author_title',
        item_json->>'author_profile_url',
        (item_json->>'author_type')::public.author_type,
        item_json->>'text',
        item_json->>'url',
        (item_json->>'post_type')::public.post_type,
        (item_json->>'is_repost')::boolean,
        item_json->>'original_author_name',
        item_json->>'original_author_profile_url',
        item_json->>'media_title',
        coalesce(
          (select array_agg(value) from jsonb_array_elements_text(item_json->'hashtags')),
          '{}'::text[]
        ),
        (item_json->>'reaction_count')::integer,
        (item_json->>'comment_count')::integer,
        nullif(item_json->>'posted_at', '')::timestamptz,
        item_json->>'posted_at_raw',
        (item_json->>'captured_at')::timestamptz
      )
      on conflict (linkedin_post_id) do update set
        -- Volatile engagement: greatest-wins (monotonic; retry / out-of-order safe).
        reaction_count = greatest(public.items.reaction_count, excluded.reaction_count),
        comment_count  = greatest(public.items.comment_count,  excluded.comment_count),
        -- Backfill-only: the FIRST capture is the most accurate; never overwrite a
        -- non-null value (coalesce keeps the existing one).
        posted_at                   = coalesce(public.items.posted_at, excluded.posted_at),
        posted_at_raw               = coalesce(public.items.posted_at_raw, excluded.posted_at_raw),
        author_company              = coalesce(public.items.author_company, excluded.author_company),
        author_title                = coalesce(public.items.author_title, excluded.author_title),
        author_profile_url          = coalesce(public.items.author_profile_url, excluded.author_profile_url),
        media_title                 = coalesce(public.items.media_title, excluded.media_title),
        text                        = coalesce(public.items.text, excluded.text),
        original_author_name        = coalesce(public.items.original_author_name, excluded.original_author_name),
        original_author_profile_url = coalesce(public.items.original_author_profile_url, excluded.original_author_profile_url)
        -- Immutable (omitted): linkedin_post_id, author_name/type, url, post_type,
        -- hashtags, is_repost, captured_at (first-capture provenance), and all
        -- classification/triage columns (stream, domains, account, heat, summary,
        -- status, priority) — so a re-capture never resets the classifier's or a
        -- partner's work. seen_count / best_author_degree are trigger-owned.
      returning id, (xmax = 0) into v_item_id, v_inserted;

      insert into public.item_sources (item_id, sensor_id, author_degree, social_proof, seen_at)
      values (
        v_item_id,
        p_sensor_id,
        coalesce((src_json->>'author_degree')::public.author_degree, 'none'),
        src_json->>'social_proof',
        now()
      )
      on conflict (item_id, sensor_id) do update set
        -- Keep a known degree if THIS capture didn't observe one ('none'), so a
        -- partial re-capture can't silently wipe a warm path; still take a real
        -- new degree (e.g. second -> first once the sensor connects).
        author_degree = case
          when excluded.author_degree = 'none' then public.item_sources.author_degree
          else excluded.author_degree
        end,
        -- Never wipe an existing social-proof note with a null re-capture.
        social_proof  = coalesce(excluded.social_proof, public.item_sources.social_proof),
        seen_at       = excluded.seen_at;

      if v_inserted then
        v_new := v_new + 1;
      else
        v_known := v_known + 1;
      end if;

    exception
      when serialization_failure or deadlock_detected then
        raise;   -- transient: abort the whole batch so the client retries it.
      when others then
        -- Data/constraint error on THIS post: isolate it (savepoint rollback) and
        -- keep the batch going. Good posts still commit atomically. Report the
        -- SQLSTATE code (stable, non-sensitive) — never the raw message, which can
        -- leak DB-internal identifiers across the trust boundary.
        v_failed := v_failed || jsonb_build_object(
          'linkedin_post_id', item_json->>'linkedin_post_id',
          'error', sqlstate
        );
    end;
  end loop;

  return jsonb_build_object(
    'received',    v_received,
    'new_items',   v_new,
    'known_items', v_known,
    'failed',      v_failed
  );
end;
$$;

-- Functions are deny-by-default: revoke the implicit PUBLIC EXECUTE, then grant only
-- service_role (the ingestion caller; anon/authenticated must get 42501).
revoke execute on function public.ingest_posts(uuid, jsonb) from public;
grant execute on function public.ingest_posts(uuid, jsonb) to service_role;

comment on function public.ingest_posts(uuid, jsonb) is
  'FSC-98 atomic batch ingestion: upsert items on linkedin_post_id, upsert item_sources per (item, sensor); dedup + seen_count + best_author_degree maintained by constraints/triggers. Per-post savepoints; service_role only.';
