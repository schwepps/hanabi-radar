-- FSC-89 — Hanabi Radar initial schema.
--
-- One deduplicated LinkedIn post = one `items` row; per-sensor sighting data lives
-- on `item_sources` (SENSITIVE, RLS-protected). Enums, tables, indexes, RLS, the
-- derived-aggregate + updated_at triggers, and documentation comments.
--
-- Source of truth: FSC-89 ticket + CLAUDE.md. English identifiers. All timestamps
-- are timestamptz; uuid PKs default to gen_random_uuid() (core in Postgres 13+).

-- ============================================================================
-- 1) Enums  (English is the source of truth; author_degree is strongest -> weakest)
-- ============================================================================
create type author_type   as enum ('person', 'company');
create type post_type     as enum ('text', 'image', 'multi_image', 'video', 'document', 'poll', 'article');
create type stream        as enum ('signal', 'opportunity', 'trend', 'noise');
create type heat          as enum ('cold', 'warm', 'hot');
create type status        as enum ('new', 'processed', 'dismissed');
create type author_degree as enum ('first', 'second', 'third', 'none');

-- ============================================================================
-- 2) Tables
-- ============================================================================

-- Collective members running the capture extension.
create table sensors (
  id           uuid        primary key default gen_random_uuid(),
  name         text        not null,
  email        text        not null unique,
  token_hash   text        not null unique,   -- HASH of the ingestion token, never the raw token
  consented_at timestamptz,                   -- null = consent not yet recorded (GDPR)
  active       boolean     not null default true
);

-- One deduplicated post. Contains NO per-sensor data (privacy invariant): the
-- warm-intro signals author_degree / social_proof exist only on item_sources.
create table items (
  id                          uuid          primary key default gen_random_uuid(),
  linkedin_post_id            text          not null unique,           -- deduplication key
  author_name                 text          not null,
  author_company              text,
  author_title                text,
  author_profile_url          text,                                    -- stable decision-maker key (nullable: some post types)
  author_type                 author_type   not null default 'person',
  text                        text,                                    -- nullable: image/doc/video posts carry substance elsewhere
  url                         text          not null,                  -- permalink partners click
  post_type                   post_type     not null default 'text',
  is_repost                   boolean       not null default false,
  original_author_name        text,                                    -- set only when is_repost
  original_author_profile_url text,
  media_title                 text,                                    -- carousel/document title, often the real subject
  hashtags                    text[]        not null default '{}',
  reaction_count              integer       not null default 0 check (reaction_count >= 0),
  comment_count               integer       not null default 0 check (comment_count >= 0),
  posted_at                   timestamptz,                             -- app-derived from posted_at_raw + captured_at
  posted_at_raw               text,                                    -- LinkedIn relative string ("2h", "1d")
  captured_at                 timestamptz   not null,                  -- capture time (domain value, not row-insert time)
  seen_count                  integer       not null default 0 check (seen_count >= 0),  -- maintained by the ingestion ticket (FSC-98)
  best_author_degree          author_degree not null default 'none',   -- derived aggregate (trigger below)
  stream                      stream,                                  -- null = not yet classified
  domains                     text[]        not null default '{}',     -- Hanabi taxonomy tags
  account                     text,
  heat                        heat,                                    -- nullable
  summary                     text,
  status                      status        not null default 'new',
  priority                    integer       not null default 0,
  created_at                  timestamptz   not null default now(),
  updated_at                  timestamptz   not null default now()     -- maintained by set_updated_at trigger
);

-- Link item <-> sensor. SENSITIVE (who saw what), RLS-protected, hidden by default.
-- author_degree / social_proof are per-sensor and NEVER stored on items.
create table item_sources (
  item_id       uuid          not null references items(id)   on delete cascade,
  sensor_id     uuid          not null references sensors(id) on delete cascade,
  seen_at       timestamptz   not null default now(),
  author_degree author_degree not null default 'none',
  social_proof  text,
  primary key (item_id, sensor_id)   -- one sighting row per sensor per item (= UNIQUE(item_id, sensor_id))
);

-- ============================================================================
-- 3) Secondary indexes
--    (PK + UNIQUE already index id / linkedin_post_id / email / token_hash /
--     (item_id, sensor_id); FK columns are NOT auto-indexed.)
-- ============================================================================
create index idx_items_status           on items (status);
create index idx_items_stream           on items (stream);
create index idx_items_posted_at        on items (posted_at desc);
create index idx_item_sources_sensor_id on item_sources (sensor_id);  -- FK cascade scan + "items a sensor saw"

-- ============================================================================
-- 4) Row Level Security + grants — deny-by-default (service_role only for now)
--    RLS enabled + zero policies => anon/authenticated get 0 rows (and INSERT
--    errors). REVOKE strips even the non-DML default grants (anon must not TRUNCATE).
--    Partner SELECT + the warm-intro conditional reveal (FSC-106) are deferred to
--    the auth ticket: when added, GRANT the minimal privilege alongside each
--    policy, wrap auth.uid() as (select auth.uid()), and never WITH CHECK (true).
-- ============================================================================
alter table sensors      enable row level security;
alter table items        enable row level security;
alter table item_sources enable row level security;
alter table item_sources force row level security;   -- extra defense on the most sensitive table

revoke all on sensors, items, item_sources from anon, authenticated;

-- service_role is the server's accessor (ingestion, classification, server-side reads)
-- and bypasses RLS. It must still hold table-level DML: tables created by a migration
-- are owned by `postgres`, whose Supabase default privileges grant the API roles only
-- TRUNCATE/REFERENCES/TRIGGER (not SELECT/INSERT/UPDATE/DELETE). Grant it explicitly so
-- access is deterministic locally and on the hosted instance (idempotent no-op elsewhere).
grant select, insert, update, delete on sensors, items, item_sources to service_role;

-- ============================================================================
-- 5) Functions  (all pin search_path per db-patterns; SECURITY INVOKER —
--    service_role is the only writer for now and bypasses RLS.)
-- ============================================================================

-- Touch updated_at on every UPDATE.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Recompute items.best_author_degree for one item = strongest author_degree among
-- its sources, or 'none' if it has none. Uses an explicit strength rank (lower =
-- stronger) rather than min(enum) so it stays correct if the enum is ever
-- reordered. Keep the CASE exhaustive over author_degree (a guard test enforces it).
create or replace function public.recompute_best_author_degree(p_item_id uuid)
returns void
language plpgsql
set search_path = public
as $$
declare
  v_best public.author_degree;
begin
  -- Serialize concurrent recomputes for this item: take the parent items row lock
  -- BEFORE reading its sources. Under READ COMMITTED, a writer that blocks here
  -- re-reads a fresh snapshot once unblocked, so it can't store a stale, understated
  -- aggregate computed from a snapshot that missed a concurrent sibling insert.
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

  v_best := coalesce(v_best, 'none'::public.author_degree);   -- no sources -> 'none' (matches column default)

  update public.items i
     set best_author_degree = v_best
   where i.id = p_item_id
     and i.best_author_degree is distinct from v_best;         -- write only on a real change
end;
$$;

-- Dispatch item_sources DML to the recompute helper. AFTER + FOR EACH ROW: the
-- change is committed to the table and we know the exact affected item_id(s).
create or replace function public.item_sources_maintain_best_degree()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recompute_best_author_degree(new.item_id);

  elsif tg_op = 'UPDATE' then
    if new.author_degree is distinct from old.author_degree
       or new.item_id is distinct from old.item_id then
      perform public.recompute_best_author_degree(new.item_id);
      if new.item_id is distinct from old.item_id then
        perform public.recompute_best_author_degree(old.item_id);   -- reparent: old item lost a source
      end if;
    end if;

  elsif tg_op = 'DELETE' then
    perform public.recompute_best_author_degree(old.item_id);
  end if;

  return null;   -- AFTER trigger: return value is ignored
end;
$$;

-- Functions are deny-by-default too. Postgres grants EXECUTE to PUBLIC on new
-- functions, which would expose recompute_best_author_degree (RETURNS void) as an
-- anon/authenticated PostgREST RPC. Revoke PUBLIC on all three, then re-grant only
-- what the app needs: service_role writes item_sources, whose trigger PERFORMs
-- recompute (a plain call needing EXECUTE) — the two trigger functions themselves
-- fire without an EXECUTE check, so they need no grant.
revoke execute on function public.set_updated_at() from public;
revoke execute on function public.recompute_best_author_degree(uuid) from public;
revoke execute on function public.item_sources_maintain_best_degree() from public;
grant execute on function public.recompute_best_author_degree(uuid) to service_role;

-- ============================================================================
-- 6) Triggers
-- ============================================================================
create trigger set_updated_at
  before update on items
  for each row
  execute function public.set_updated_at();

create trigger item_sources_maintain_best_degree
  after insert or update or delete on item_sources
  for each row
  execute function public.item_sources_maintain_best_degree();

-- ============================================================================
-- 7) Documentation (privacy-sensitive surfaces + derived fields)
-- ============================================================================
comment on table  items is
  'One deduplicated post. Contains NO per-sensor data; author_degree/social_proof live on item_sources only (privacy invariant).';
comment on column items.linkedin_post_id is
  'Deduplication key: the LinkedIn post identifier. UNIQUE.';
comment on column items.best_author_degree is
  'Derived, NON-identifying aggregate: strongest connection degree across all sensors who saw this post. Reveals a warm path exists without revealing which sensor. Maintained by trigger from item_sources.';
comment on column items.seen_count is
  'Number of feeds the post appeared in (virality signal). Maintained by the ingestion pipeline (FSC-98), not by this schema.';
comment on column items.posted_at is
  'Absolute post time, derived server-side from posted_at_raw + captured_at (LinkedIn renders relative timestamps).';

comment on table  item_sources is
  'Per-sensor sighting data (who saw what). SENSITIVE / GDPR personal data. RLS-protected, service_role only; exposed to partners only via the warm-intro reveal (FSC-106).';
comment on column item_sources.author_degree is
  'Sensor''s LinkedIn connection degree to the author. Per-sensor warm-intro signal; NEVER stored on items.';
comment on column item_sources.social_proof is
  'Name behind a warm introduction. Personal data; revealed only via the warm-intro flow (FSC-106).';

comment on column sensors.token_hash is
  'HASH of the sensor ingestion token — never store the raw token.';
