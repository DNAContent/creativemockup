
-- schema.sql
-- ============================================================================
-- Ad Mockup Viewer — Multi-client agency tool
-- 01_schema.sql  —  Tables, indexes, triggers
--
-- Run order in the Supabase SQL editor:
--   1. schema.sql                  (this file)
--   2. functions.sql               (membership + agency-creation helpers)
--   3. rls.sql                     (base row-level security policies)
--   4. 04_team_client_access.sql   (magic-link client allowlist + role tiers)
--   5. 05_drop_legacy_token_model.sql (drops the retired token RPCs/column)
--   6. 06_notifications.sql        (Slack/email triggers via pg_net)
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (enabled by default on Supabase, but be explicit)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- agencies  —  the tenant boundary. Every client/set/ad rolls up to one agency.
-- ----------------------------------------------------------------------------
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- agency_members  —  maps Supabase Auth users to an agency. Many users per
-- agency from day one. A user may belong to more than one agency.
-- ----------------------------------------------------------------------------
create table if not exists public.agency_members (
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  primary key (agency_id, user_id)
);
create index if not exists agency_members_user_idx on public.agency_members(user_id);

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  name           text not null,
  logo_url       text,
  slug           text,
  contact_email  text,
  created_at     timestamptz not null default now(),
  unique (agency_id, slug)
);
create index if not exists clients_agency_idx on public.clients(agency_id);

-- ----------------------------------------------------------------------------
-- creative_sets  —  a batch of ads sent to a client for review. Clients reach a
-- set at /c/<client-slug>/<set-slug>; access is gated by the magic-link
-- allowlist (client_contacts) added in 04_team_client_access.sql, which also
-- adds the `slug` column and the current status vocabulary.
-- ----------------------------------------------------------------------------
create table if not exists public.creative_sets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  status        text not null default 'draft'
                  check (status in ('draft','in_review','approved','needs_edits','archived')),
  notes         text,
  due_date      date,
  created_at    timestamptz not null default now()
);
create index if not exists creative_sets_client_idx on public.creative_sets(client_id);

-- ----------------------------------------------------------------------------
-- ads  —  one mockup. Columns mirror the ad object in ad-mockup-viewer.html.
-- JS camelCase -> SQL snake_case mapping (handled in the app layer):
--   brandName->brand_name, brandLogo->brand_logo, desc->description,
--   emailSubject->email_subject, emailPreheader->email_preheader,
--   emailBody->email_body, mediaImg->media_img, mediaVideo->media_video,
--   aspectRatio->aspect_ratio.
-- uploadedURL / uploadedType are intentionally NOT stored — they were local
-- base64/blob URLs, now replaced by Google Drive direct URLs in media_img.
-- ----------------------------------------------------------------------------
create table if not exists public.ads (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references public.creative_sets(id) on delete cascade,
  position        integer not null default 0,
  name            text not null default '',
  format          text not null default 'fb-feed',
  status          text not null default 'pending'
                    check (status in ('pending','approved','needs-edits')),
  brand_name      text not null default '',
  brand_logo      text not null default '',
  copy            text not null default '',
  headline        text not null default '',
  description     text not null default '',
  cta             text not null default '',
  email_subject   text not null default '',
  email_preheader text not null default '',
  email_body      text not null default '',
  media_img       text not null default '',
  media_video     text not null default '',
  aspect_ratio    text not null default '16:9',
  created_at      timestamptz not null default now()
);
create index if not exists ads_set_idx on public.ads(set_id, position);

-- ----------------------------------------------------------------------------
-- comments  —  reviewer feedback on a single ad.
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  ad_id       uuid not null references public.ads(id) on delete cascade,
  author      text not null default 'Client',
  text        text not null,
  target      text not null default 'General'
                check (target in ('General','Copy','Visual','Headline','CTA')),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists comments_ad_idx on public.comments(ad_id);

-- ----------------------------------------------------------------------------
-- replies  —  threaded responses on a comment.
-- ----------------------------------------------------------------------------
create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  author      text not null default 'Agency',
  text        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists replies_comment_idx on public.replies(comment_id);

-- ----------------------------------------------------------------------------
-- Realtime: publish comments + replies so the client portal and the editor
-- see new feedback live. (Supabase ships a publication named supabase_realtime.)
-- ----------------------------------------------------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.comments'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.replies';  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.ads';      exception when duplicate_object then null; end;
end $$;

-- functions.sql
-- ============================================================================
-- 02_functions.sql  —  Core helpers (agency membership + agency creation)
--
-- The client review portal is gated by the magic-link allowlist model in
-- 04_team_client_access.sql (client_contacts + role-tier RLS). The old
-- token-based RPCs that used to live here have been removed; see
-- 05_drop_legacy_token_model.sql to drop them from an already-provisioned DB.
--
-- Run AFTER schema.sql, BEFORE rls.sql.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- is_agency_member(agency) — used by RLS on the authenticated agency side.
-- SECURITY DEFINER so the policy check itself doesn't recurse through RLS on
-- agency_members.
-- ----------------------------------------------------------------------------
create or replace function public.is_agency_member(p_agency_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = p_agency_id and user_id = auth.uid()
  );
$$;

-- create_agency(name) — creates an agency AND adds the caller as owner in one
-- transaction. Needed because a plain INSERT...RETURNING on agencies is blocked
-- by RLS (the caller isn't a member yet at RETURNING time). SECURITY DEFINER
-- sidesteps that ordering problem cleanly.
create or replace function public.create_agency(p_name text)
returns public.agencies
language plpgsql
security definer
set search_path = public
as $$
declare
  ag public.agencies;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'agency name required';
  end if;
  insert into public.agencies (name) values (trim(p_name)) returning * into ag;
  insert into public.agency_members (agency_id, user_id, role)
  values (ag.id, auth.uid(), 'owner');
  return ag;
end;
$$;
grant execute on function public.create_agency(text) to authenticated;

-- rls.sql
-- ============================================================================
-- 03_rls.sql  —  Row-level security
--
-- Model (base layer):
--   * Authenticated agency staff: full read/write on everything scoped to an
--     agency they belong to (via agency_members). Enforced by RLS below.
--   * anon has no table policies and therefore no rows.
--
-- NOTE: 04_team_client_access.sql REPLACES the content-table policies created
-- here (creative_sets/ads/comments/replies) with staff-OR-allowlisted-client
-- versions, and adds policies for client_contacts/access_requests. This file is
-- still required first — 04 drops these by name before recreating them. The
-- magic-link client model lives entirely in 04; there is no anon table access.
--
-- Run AFTER schema.sql and functions.sql, BEFORE 04_team_client_access.sql.
-- ============================================================================

alter table public.agencies       enable row level security;
alter table public.agency_members enable row level security;
alter table public.clients        enable row level security;
alter table public.creative_sets  enable row level security;
alter table public.ads            enable row level security;
alter table public.comments       enable row level security;
alter table public.replies        enable row level security;

-- Clean slate so this file is re-runnable.
do $$
declare p record;
begin
  for p in
    select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('agencies','agency_members','clients','creative_sets','ads','comments','replies')
  loop
    execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- ----------------------------------------------------------------------------
-- agencies — members can see their agency; an authenticated user may create
-- one (they then add themselves as owner; see signup flow / functions).
-- ----------------------------------------------------------------------------
create policy agencies_select on public.agencies
  for select to authenticated
  using (public.is_agency_member(id));

create policy agencies_insert on public.agencies
  for insert to authenticated
  with check (true);

create policy agencies_update on public.agencies
  for update to authenticated
  using (public.is_agency_member(id))
  with check (public.is_agency_member(id));

-- ----------------------------------------------------------------------------
-- agency_members — you can see rows for agencies you belong to. You can insert
-- yourself (used right after creating an agency to claim ownership).
-- ----------------------------------------------------------------------------
create policy agency_members_select on public.agency_members
  for select to authenticated
  using (public.is_agency_member(agency_id));

create policy agency_members_insert_self on public.agency_members
  for insert to authenticated
  with check (user_id = auth.uid());

-- An existing member can add/remove teammates in their agency.
create policy agency_members_insert_team on public.agency_members
  for insert to authenticated
  with check (public.is_agency_member(agency_id));

create policy agency_members_delete on public.agency_members
  for delete to authenticated
  using (public.is_agency_member(agency_id));

-- ----------------------------------------------------------------------------
-- clients — scoped to the owning agency.
-- ----------------------------------------------------------------------------
create policy clients_all on public.clients
  for all to authenticated
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

-- ----------------------------------------------------------------------------
-- creative_sets — scoped through clients -> agency.
-- ----------------------------------------------------------------------------
create policy creative_sets_all on public.creative_sets
  for all to authenticated
  using (exists (
    select 1 from public.clients c
    where c.id = creative_sets.client_id and public.is_agency_member(c.agency_id)
  ))
  with check (exists (
    select 1 from public.clients c
    where c.id = creative_sets.client_id and public.is_agency_member(c.agency_id)
  ));

-- ----------------------------------------------------------------------------
-- ads — scoped through creative_sets -> clients -> agency.
-- ----------------------------------------------------------------------------
create policy ads_all on public.ads
  for all to authenticated
  using (exists (
    select 1 from public.creative_sets s
    join public.clients c on c.id = s.client_id
    where s.id = ads.set_id and public.is_agency_member(c.agency_id)
  ))
  with check (exists (
    select 1 from public.creative_sets s
    join public.clients c on c.id = s.client_id
    where s.id = ads.set_id and public.is_agency_member(c.agency_id)
  ));

-- ----------------------------------------------------------------------------
-- comments — scoped through ads -> ... -> agency. (Clients write via RPC.)
-- ----------------------------------------------------------------------------
create policy comments_all on public.comments
  for all to authenticated
  using (exists (
    select 1 from public.ads a
    join public.creative_sets s on s.id = a.set_id
    join public.clients c on c.id = s.client_id
    where a.id = comments.ad_id and public.is_agency_member(c.agency_id)
  ))
  with check (exists (
    select 1 from public.ads a
    join public.creative_sets s on s.id = a.set_id
    join public.clients c on c.id = s.client_id
    where a.id = comments.ad_id and public.is_agency_member(c.agency_id)
  ));

-- ----------------------------------------------------------------------------
-- replies — scoped through comments -> ads -> ... -> agency.
-- ----------------------------------------------------------------------------
create policy replies_all on public.replies
  for all to authenticated
  using (exists (
    select 1 from public.comments cm
    join public.ads a on a.id = cm.ad_id
    join public.creative_sets s on s.id = a.set_id
    join public.clients c on c.id = s.client_id
    where cm.id = replies.comment_id and public.is_agency_member(c.agency_id)
  ))
  with check (exists (
    select 1 from public.comments cm
    join public.ads a on a.id = cm.ad_id
    join public.creative_sets s on s.id = a.set_id
    join public.clients c on c.id = s.client_id
    where cm.id = replies.comment_id and public.is_agency_member(c.agency_id)
  ));

-- ----------------------------------------------------------------------------
-- NOTE on client-side realtime:
-- The publication includes comments/replies/ads (schema.sql). Postgres Changes
-- are delivered subject to RLS for the subscribing role. Since anon has no
-- table policies, the token client will NOT receive raw realtime rows. The
-- review portal therefore refetches via get_review_set() after it writes, and
-- can poll on an interval. If you later want true push to clients, add a
-- narrow anon SELECT policy gated on a request header carrying the token, or
-- move the portal to a signed JWT minted per token. Left out here to keep the
-- anon surface zero by default.
-- ----------------------------------------------------------------------------

-- 04_team_client_access.sql
-- ============================================================================
-- 04_team_client_access.sql
--   Phase 1 of the 2026-05-28 rework. Run AFTER schema.sql, functions.sql,
--   rls.sql. Idempotent / safe to re-run.
--
-- Brings in:
--   * New creative_sets.status vocabulary (in_progress / needs_review /
--     needs_revisions / approved / archived).
--   * creative_sets.slug for readable client URLs (/c/<client>/<set>).
--   * client_contacts  — per-client allowlist of client emails + permission tier.
--   * access_requests  — unknown emails asking to be let in.
--   * Role helpers + RLS so authenticated CLIENTS (not just staff) can read /
--     comment / approve / edit by permission tier, reusing the same policies.
--
-- NB: the table is still physically named "ads" (renamed only in app code/UI to
-- "creative"). Token RPCs in functions.sql are now superseded by direct RLS and
-- can be dropped once the new client portal ships.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. creative_sets.status — migrate to the new vocabulary.
-- ----------------------------------------------------------------------------
alter table public.creative_sets drop constraint if exists creative_sets_status_check;
alter table public.creative_sets alter column status drop default;

update public.creative_sets set status = case status
  when 'draft'       then 'in_progress'
  when 'in_review'   then 'needs_review'
  when 'needs_edits' then 'needs_revisions'
  else status                        -- 'approved' / 'archived' unchanged
end;

alter table public.creative_sets alter column status set default 'in_progress';
alter table public.creative_sets add constraint creative_sets_status_check
  check (status in ('in_progress','needs_review','needs_revisions','approved','archived'));

-- ----------------------------------------------------------------------------
-- 2. creative_sets.slug — readable URL segment, unique within a client.
-- ----------------------------------------------------------------------------
alter table public.creative_sets add column if not exists slug text;

-- Backfill any nulls from the name (lowercase, hyphenated), de-duping per client.
update public.creative_sets s set slug = base.slug
from (
  select id,
         client_id,
         nullif(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '') as raw,
         row_number() over (
           partition by client_id, nullif(regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'), '')
           order by created_at
         ) as rn
  from public.creative_sets
  where slug is null
) base_raw
join lateral (
  select base_raw.id,
         trim(both '-' from coalesce(base_raw.raw, 'set'))
           || case when base_raw.rn > 1 then '-' || base_raw.rn else '' end as slug
) base on base.id = base_raw.id
where s.id = base_raw.id;

create unique index if not exists creative_sets_client_slug_idx
  on public.creative_sets(client_id, slug);

-- ----------------------------------------------------------------------------
-- 3. client_contacts — the per-client allowlist.
--    role tiers (ascending power): viewer < commenter < approver < editor.
-- ----------------------------------------------------------------------------
create table if not exists public.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references public.clients(id) on delete cascade,
  email       text not null,
  name        text,
  role        text not null default 'commenter'
                check (role in ('viewer','commenter','approver','editor')),
  invited_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);
-- Case-insensitive uniqueness per client. Expression must live in a unique
-- index, not an inline UNIQUE constraint (Postgres rejects functions there).
create unique index if not exists client_contacts_client_email_uidx
  on public.client_contacts(client_id, lower(email));
create index if not exists client_contacts_client_idx on public.client_contacts(client_id);
create index if not exists client_contacts_email_idx  on public.client_contacts(lower(email));

-- ----------------------------------------------------------------------------
-- 4. access_requests — someone whose email isn't on a client's allowlist asked
--    to view a set. Internal team triages these.
-- ----------------------------------------------------------------------------
create table if not exists public.access_requests (
  id          uuid primary key default gen_random_uuid(),
  set_id      uuid not null references public.creative_sets(id) on delete cascade,
  email       text not null,
  message     text,
  status      text not null default 'pending'
                check (status in ('pending','granted','denied')),
  created_at  timestamptz not null default now()
);
create index if not exists access_requests_set_idx on public.access_requests(set_id, status);

-- ----------------------------------------------------------------------------
-- 5. Role helpers. SECURITY DEFINER so they don't recurse through RLS.
--    current_email() reads the verified email from the JWT.
-- ----------------------------------------------------------------------------
create or replace function public.current_email()
returns text language sql stable as $$
  select lower(nullif(auth.jwt() ->> 'email', ''));
$$;

-- Numeric rank of a contact role; 0 = no access.
create or replace function public.role_rank(p_role text)
returns int language sql immutable as $$
  select case p_role
    when 'viewer'    then 1
    when 'commenter' then 2
    when 'approver'  then 3
    when 'editor'    then 4
    else 0 end;
$$;

-- The caller's highest client-contact rank on the client that owns p_set_id.
create or replace function public.client_rank_for_set(p_set_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(max(public.role_rank(cc.role)), 0)
  from public.client_contacts cc
  join public.creative_sets s on s.client_id = cc.client_id
  where s.id = p_set_id
    and lower(cc.email) = public.current_email();
$$;

-- Same, addressed by a creative (ad) id.
create or replace function public.client_rank_for_ad(p_ad_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select public.client_rank_for_set(a.set_id)
  from public.ads a where a.id = p_ad_id;
$$;

-- Same, addressed by a comment id.
create or replace function public.client_rank_for_comment(p_comment_id uuid)
returns int
language sql
security definer
stable
set search_path = public
as $$
  select public.client_rank_for_ad(cm.ad_id)
  from public.comments cm where cm.id = p_comment_id;
$$;

grant execute on function public.current_email()                 to authenticated;
grant execute on function public.role_rank(text)                 to authenticated;
grant execute on function public.client_rank_for_set(uuid)       to authenticated;
grant execute on function public.client_rank_for_ad(uuid)        to authenticated;
grant execute on function public.client_rank_for_comment(uuid)   to authenticated;

-- ----------------------------------------------------------------------------
-- 6. request_access(set_slug, client_slug, email, message) — open RPC for the
--    magic-link gate. Records an access_requests row IF the email isn't already
--    on the allowlist. Returns the contact's role ('viewer'..'editor') when the
--    email IS allowlisted (so the gate knows to send a magic link), else null.
--    SECURITY DEFINER + granted to anon because the caller isn't logged in yet.
-- ----------------------------------------------------------------------------
create or replace function public.request_access(
  p_client_slug text, p_set_slug text, p_email text, p_message text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set_id uuid;
  v_role   text;
begin
  if coalesce(trim(p_email), '') = '' then
    raise exception 'email required';
  end if;

  select s.id, cc.role
    into v_set_id, v_role
  from public.creative_sets s
  join public.clients c on c.id = s.client_id
  left join public.client_contacts cc
    on cc.client_id = c.id and lower(cc.email) = lower(trim(p_email))
  where c.slug = p_client_slug and s.slug = p_set_slug;

  if v_set_id is null then
    raise exception 'unknown review link';
  end if;

  if v_role is null then
    insert into public.access_requests (set_id, email, message)
    values (v_set_id, lower(trim(p_email)), nullif(trim(p_message), ''));
    return null;                       -- not allowlisted; request logged
  end if;

  return v_role;                       -- allowlisted; caller may send magic link
end;
$$;
grant execute on function public.request_access(text,text,text,text) to anon, authenticated;

-- set_creative_approval(ad, status) — lets an APPROVER-tier client (rank >= 3)
-- change only a creative's status, without granting full-row edit (rank 4).
-- SECURITY DEFINER so it can bypass the column-blind RLS update policies.
create or replace function public.set_creative_approval(
  p_ad_id uuid, p_status text
)
returns public.ads
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.ads;
begin
  if p_status not in ('pending','approved','needs-edits') then
    raise exception 'invalid status %', p_status;
  end if;
  if public.client_rank_for_ad(p_ad_id) < 3
     and not exists (
       select 1 from public.ads a
       join public.creative_sets s on s.id = a.set_id
       join public.clients c on c.id = s.client_id
       where a.id = p_ad_id and public.is_agency_member(c.agency_id)
     )
  then
    raise exception 'not authorized to approve' using errcode = '42501';
  end if;
  update public.ads set status = p_status where id = p_ad_id returning * into row;
  return row;
end;
$$;
grant execute on function public.set_creative_approval(uuid,text) to authenticated;

-- ----------------------------------------------------------------------------
-- 7. RLS — enable on the new tables, and REPLACE the content-table policies so
--    they grant access to staff (agency members) OR allowlisted clients by tier.
-- ----------------------------------------------------------------------------
alter table public.client_contacts enable row level security;
alter table public.access_requests enable row level security;

-- Re-runnable: drop the OLD combined policies (from rls.sql) and any policy this
-- file (re)creates, by explicit name, so a re-run doesn't collide. We leave the
-- staff `clients_all` policy from rls.sql in place.
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and policyname in (
        'ads_all','comments_all','replies_all','creative_sets_all',          -- old
        'creative_sets_staff','creative_sets_client_read',
        'ads_staff','ads_client_read','ads_client_edit',
        'comments_staff','comments_client_read','comments_client_insert','comments_client_resolve',
        'replies_staff','replies_client_read','replies_client_insert',
        'client_contacts_staff','client_contacts_self_read',
        'access_requests_staff','clients_client_read'
      )
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

-- clients: a client-contact may read their own client row (name/logo for the
-- portal header). Staff keep full access via clients_all (rls.sql).
-- NB: the contact check MUST go through a SECURITY DEFINER function. An inline
-- subquery on client_contacts would re-enter client_contacts' own policy (which
-- subqueries clients) and recurse — see db/10_fix_clients_rls_recursion.sql.
create or replace function public.is_client_contact(p_client_id uuid)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    where cc.client_id = p_client_id
      and lower(cc.email) = public.current_email()
  );
$$;
grant execute on function public.is_client_contact(uuid) to authenticated;

create policy clients_client_read on public.clients
  for select to authenticated
  using (public.is_client_contact(id));

-- client_contacts / access_requests: staff of the owning agency manage them.
create policy client_contacts_staff on public.client_contacts
  for all to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = client_contacts.client_id and public.is_agency_member(c.agency_id)))
  with check (exists (select 1 from public.clients c
                 where c.id = client_contacts.client_id and public.is_agency_member(c.agency_id)));

-- A client may read their own contact row (to discover their own permission).
create policy client_contacts_self_read on public.client_contacts
  for select to authenticated
  using (lower(email) = public.current_email());

create policy access_requests_staff on public.access_requests
  for all to authenticated
  using (exists (select 1 from public.creative_sets s
                 join public.clients c on c.id = s.client_id
                 where s.id = access_requests.set_id and public.is_agency_member(c.agency_id)))
  with check (exists (select 1 from public.creative_sets s
                 join public.clients c on c.id = s.client_id
                 where s.id = access_requests.set_id and public.is_agency_member(c.agency_id)));

-- creative_sets: staff full access; clients with viewer+ may SELECT.
create policy creative_sets_staff on public.creative_sets
  for all to authenticated
  using (exists (select 1 from public.clients c
                 where c.id = creative_sets.client_id and public.is_agency_member(c.agency_id)))
  with check (exists (select 1 from public.clients c
                 where c.id = creative_sets.client_id and public.is_agency_member(c.agency_id)));
create policy creative_sets_client_read on public.creative_sets
  for select to authenticated
  using (public.client_rank_for_set(id) >= 1);

-- ads (creatives): staff full access; client read (viewer+), client edit (editor).
create policy ads_staff on public.ads
  for all to authenticated
  using (exists (select 1 from public.creative_sets s
                 join public.clients c on c.id = s.client_id
                 where s.id = ads.set_id and public.is_agency_member(c.agency_id)))
  with check (exists (select 1 from public.creative_sets s
                 join public.clients c on c.id = s.client_id
                 where s.id = ads.set_id and public.is_agency_member(c.agency_id)));
create policy ads_client_read on public.ads
  for select to authenticated
  using (public.client_rank_for_set(set_id) >= 1);
create policy ads_client_edit on public.ads
  for update to authenticated
  using (public.client_rank_for_set(set_id) >= 4)
  with check (public.client_rank_for_set(set_id) >= 4);

-- comments: staff full; client read (viewer+), client insert (commenter+),
-- client update e.g. resolve (approver+).
create policy comments_staff on public.comments
  for all to authenticated
  using (exists (select 1 from public.ads a
                 join public.creative_sets s on s.id = a.set_id
                 join public.clients c on c.id = s.client_id
                 where a.id = comments.ad_id and public.is_agency_member(c.agency_id)))
  with check (exists (select 1 from public.ads a
                 join public.creative_sets s on s.id = a.set_id
                 join public.clients c on c.id = s.client_id
                 where a.id = comments.ad_id and public.is_agency_member(c.agency_id)));
create policy comments_client_read on public.comments
  for select to authenticated
  using (public.client_rank_for_ad(ad_id) >= 1);
create policy comments_client_insert on public.comments
  for insert to authenticated
  with check (public.client_rank_for_ad(ad_id) >= 2);
create policy comments_client_resolve on public.comments
  for update to authenticated
  using (public.client_rank_for_ad(ad_id) >= 3)
  with check (public.client_rank_for_ad(ad_id) >= 3);

-- replies: staff full; client read (viewer+), client insert (commenter+).
create policy replies_staff on public.replies
  for all to authenticated
  using (exists (select 1 from public.comments cm
                 join public.ads a on a.id = cm.ad_id
                 join public.creative_sets s on s.id = a.set_id
                 join public.clients c on c.id = s.client_id
                 where cm.id = replies.comment_id and public.is_agency_member(c.agency_id)))
  with check (exists (select 1 from public.comments cm
                 join public.ads a on a.id = cm.ad_id
                 join public.creative_sets s on s.id = a.set_id
                 join public.clients c on c.id = s.client_id
                 where cm.id = replies.comment_id and public.is_agency_member(c.agency_id)));
create policy replies_client_read on public.replies
  for select to authenticated
  using (public.client_rank_for_comment(comment_id) >= 1);
create policy replies_client_insert on public.replies
  for insert to authenticated
  with check (public.client_rank_for_comment(comment_id) >= 2);

-- Realtime already publishes ads/comments/replies (schema.sql). With the client
-- policies above, logged-in clients now receive live rows for their sets too.

-- 05_drop_legacy_token_model.sql
-- ============================================================================
-- 05_drop_legacy_token_model.sql
--   Phase 2 of the 2026-05-28 rework. Run AFTER 04_team_client_access.sql.
--   Idempotent / safe to re-run.
--
-- The client portal now authenticates clients via magic link and authorizes
-- them through the client_contacts allowlist + role-tier RLS (04). The old
-- token-based review path (creative_sets.review_token + the anon-callable
-- get_review_set / add_review_comment / add_review_reply / set_ad_approval
-- RPCs) is fully superseded and is removed here so it stops being live
-- attack surface.
-- ============================================================================

-- 1. Drop the retired token RPCs and their internal guard. DROP ... IF EXISTS
--    with the exact signatures, so a re-run (or a DB that never had them) is a
--    no-op. Grants/revokes disappear automatically with the functions.
drop function if exists public.get_review_set(uuid);
drop function if exists public.add_review_comment(uuid, uuid, text, text, text);
drop function if exists public.add_review_reply(uuid, uuid, text, text);
drop function if exists public.set_ad_approval(uuid, uuid, text);
drop function if exists public._ad_in_token_set(uuid, uuid);

-- 2. Drop the unguessable token column + its index — no longer read anywhere.
drop index if exists public.creative_sets_token_idx;
alter table public.creative_sets drop column if exists review_token;

-- 06_notifications.sql
-- ============================================================================
-- 06_notifications.sql
--   Notifications for client activity. Run AFTER 05_drop_legacy_token_model.sql.
--   Idempotent / safe to re-run.
--
-- Because the client portal writes directly to Postgres (RLS-authorized) rather
-- than through Next server code, notifications are fired from DATABASE TRIGGERS
-- via pg_net: each relevant write POSTs a JSON event to the app's
-- /api/hooks/notify endpoint, which fans out to Slack + email.
--
-- Events:
--   * comment         — a client left feedback                  -> team
--   * access_request  — an unknown email asked for access       -> team
--   * approval        — a client approved a creative            -> team
--   * needs_review    — staff flipped a set to "needs_review"   -> client
--
-- Setup after running this file: point the DB at your app + set a shared secret
--   update public.notify_config
--     set endpoint_url = 'https://YOUR-APP/api/hooks/notify',
--         secret       = 'SOME-LONG-RANDOM-STRING';   -- must match NOTIFY_HOOK_SECRET
-- ============================================================================

create extension if not exists pg_net;

-- ----------------------------------------------------------------------------
-- 1. notify_config — single-row, app-level webhook target + shared secret.
--    RLS on with NO policies: only SECURITY DEFINER functions (and the service
--    role) can read it, so the secret never reaches anon/authenticated clients.
-- ----------------------------------------------------------------------------
create table if not exists public.notify_config (
  id           int primary key default 1 check (id = 1),
  endpoint_url text,
  secret       text
);
insert into public.notify_config (id) values (1) on conflict (id) do nothing;
alter table public.notify_config enable row level security;

-- ----------------------------------------------------------------------------
-- 2. notification_settings — per-agency Slack config (one channel webhook).
-- ----------------------------------------------------------------------------
create table if not exists public.notification_settings (
  agency_id               uuid primary key references public.agencies(id) on delete cascade,
  slack_webhook_url       text,
  slack_enabled           boolean not null default false,
  slack_on_comment        boolean not null default true,
  slack_on_access_request boolean not null default true,
  slack_on_approval       boolean not null default true
);
alter table public.notification_settings enable row level security;

-- ----------------------------------------------------------------------------
-- 3. notification_prefs — per staff member: which events get EMAILED to them.
--    This is the "who internally gets notified" control. Slack is channel-wide
--    (above); email is per-person here.
-- ----------------------------------------------------------------------------
create table if not exists public.notification_prefs (
  agency_id               uuid not null references public.agencies(id) on delete cascade,
  user_id                 uuid not null references auth.users(id) on delete cascade,
  email_on_comment        boolean not null default true,
  email_on_access_request boolean not null default true,
  email_on_approval       boolean not null default false,
  primary key (agency_id, user_id)
);
alter table public.notification_prefs enable row level security;

-- ----------------------------------------------------------------------------
-- 4. RLS — any agency member may read/manage their agency's settings + prefs
--    (so admins can tune who gets notified). Re-runnable: drop by name first.
-- ----------------------------------------------------------------------------
do $$
declare p record;
begin
  for p in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('notification_settings','notification_prefs')
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end $$;

create policy notification_settings_members on public.notification_settings
  for all to authenticated
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

create policy notification_prefs_members on public.notification_prefs
  for all to authenticated
  using (public.is_agency_member(agency_id))
  with check (public.is_agency_member(agency_id));

-- ----------------------------------------------------------------------------
-- 5. Helpers for the settings UI.
--    ensure_notification_prefs — create a default prefs row for every member
--      that lacks one (called when the Team page loads).
--    agency_member_emails — list members' emails so the UI can label the email
--      toggles. SECURITY DEFINER to read auth.users; gated to agency members.
-- ----------------------------------------------------------------------------
create or replace function public.ensure_notification_prefs(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_agency_member(p_agency_id) then
    return;
  end if;
  insert into public.notification_prefs (agency_id, user_id)
  select p_agency_id, m.user_id
  from public.agency_members m
  where m.agency_id = p_agency_id
  on conflict (agency_id, user_id) do nothing;
end;
$$;
grant execute on function public.ensure_notification_prefs(uuid) to authenticated;

create or replace function public.agency_member_emails(p_agency_id uuid)
returns table(user_id uuid, email text)
language sql
security definer
stable
set search_path = public, auth
as $$
  select m.user_id, u.email
  from public.agency_members m
  join auth.users u on u.id = m.user_id
  where m.agency_id = p_agency_id
    and public.is_agency_member(p_agency_id);   -- gate on the CALLER
$$;
grant execute on function public.agency_member_emails(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. post_notification — POST a JSON event to the app. Never lets a delivery
--    failure roll back the originating write (comment/approval/etc).
-- ----------------------------------------------------------------------------
create or replace function public.post_notification(p_payload jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg public.notify_config;
begin
  select * into cfg from public.notify_config where id = 1;
  if cfg.endpoint_url is null or cfg.endpoint_url = '' then
    return;  -- notifications not configured yet; no-op
  end if;
  begin
    perform net.http_post(
      url     := cfg.endpoint_url,
      body    := p_payload,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', coalesce(cfg.secret, '')
      )
    );
  exception when others then
    -- swallow: a notification problem must never break the user's action
    null;
  end;
end;
$$;

-- ----------------------------------------------------------------------------
-- 7. Triggers.
-- ----------------------------------------------------------------------------

-- comment (client feedback) -> team
create or replace function public.tg_notify_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select cl.agency_id, s.name as set_name, s.slug as set_slug,
         cl.name as client_name, cl.slug as client_slug, a.name as creative_name
    into r
  from public.ads a
  join public.creative_sets s on s.id = a.set_id
  join public.clients cl on cl.id = s.client_id
  where a.id = NEW.ad_id;

  perform public.post_notification(jsonb_build_object(
    'type', 'comment',
    'agency_id', r.agency_id,
    'client_name', r.client_name,
    'client_slug', r.client_slug,
    'set_name', r.set_name,
    'set_slug', r.set_slug,
    'creative_name', coalesce(nullif(r.creative_name, ''), 'a creative'),
    'author', NEW.author,
    'target', NEW.target,
    'text', NEW.text
  ));
  return NEW;
end;
$$;
drop trigger if exists notify_comment on public.comments;
create trigger notify_comment after insert on public.comments
  for each row execute function public.tg_notify_comment();

-- access_request (unknown email) -> team
create or replace function public.tg_notify_access_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select cl.agency_id, s.name as set_name, cl.name as client_name
    into r
  from public.creative_sets s
  join public.clients cl on cl.id = s.client_id
  where s.id = NEW.set_id;

  perform public.post_notification(jsonb_build_object(
    'type', 'access_request',
    'agency_id', r.agency_id,
    'client_name', r.client_name,
    'set_name', r.set_name,
    'email', NEW.email,
    'message', NEW.message
  ));
  return NEW;
end;
$$;
drop trigger if exists notify_access_request on public.access_requests;
create trigger notify_access_request after insert on public.access_requests
  for each row execute function public.tg_notify_access_request();

-- approval -> team, but ONLY when a client (not staff) approved.
create or replace function public.tg_notify_approval()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select cl.agency_id, s.name as set_name, cl.name as client_name, NEW.name as creative_name
    into r
  from public.creative_sets s
  join public.clients cl on cl.id = s.client_id
  where s.id = NEW.set_id;

  -- staff approvals don't need to notify the team about themselves
  if public.is_agency_member(r.agency_id) then
    return NEW;
  end if;

  perform public.post_notification(jsonb_build_object(
    'type', 'approval',
    'agency_id', r.agency_id,
    'client_name', r.client_name,
    'set_name', r.set_name,
    'creative_name', coalesce(nullif(r.creative_name, ''), 'a creative'),
    'approver', public.current_email()
  ));
  return NEW;
end;
$$;
drop trigger if exists notify_approval on public.ads;
create trigger notify_approval after update on public.ads
  for each row
  when (old.status is distinct from new.status and new.status = 'approved')
  execute function public.tg_notify_approval();

-- needs_review -> client (allowlisted contacts get the review link by email)
create or replace function public.tg_notify_needs_review()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select cl.agency_id, cl.name as client_name, cl.slug as client_slug
    into r
  from public.clients cl
  where cl.id = NEW.client_id;

  perform public.post_notification(jsonb_build_object(
    'type', 'needs_review',
    'agency_id', r.agency_id,
    'client_id', NEW.client_id,
    'client_name', r.client_name,
    'client_slug', r.client_slug,
    'set_name', NEW.name,
    'set_slug', NEW.slug
  ));
  return NEW;
end;
$$;
drop trigger if exists notify_needs_review on public.creative_sets;
create trigger notify_needs_review after update on public.creative_sets
  for each row
  when (old.status is distinct from new.status and new.status = 'needs_review')
  execute function public.tg_notify_needs_review();

-- 07_single_agency.sql
-- ============================================================================
-- 07_single_agency.sql
--   Single-agency / internal-team mode. Run AFTER 06_notifications.sql.
--   Idempotent / safe to re-run.
--
-- Instead of each user creating their own agency via onboarding, the whole team
-- shares ONE agency. This file seeds that agency and adds join_default_agency(),
-- which the dashboard calls to auto-enroll any signed-in teammate.
-- ============================================================================

-- 1. Seed the single agency (no-op if one already exists).
insert into public.agencies (name)
select 'Digital Niche Agency'
where not exists (select 1 from public.agencies);

-- 2. join_default_agency() — add the calling user to the single agency. The
--    first member to join becomes 'owner', everyone after becomes 'member'.
--    SECURITY DEFINER so a brand-new user (not yet a member, so blocked by RLS
--    from even reading the agency row) can still enroll. Idempotent.
create or replace function public.join_default_agency()
returns public.agencies
language plpgsql
security definer
set search_path = public
as $$
declare
  ag     public.agencies;
  v_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into ag from public.agencies order by created_at limit 1;
  if ag.id is null then
    raise exception 'no agency configured';
  end if;

  if exists (select 1 from public.agency_members where agency_id = ag.id) then
    v_role := 'member';
  else
    v_role := 'owner';
  end if;

  insert into public.agency_members (agency_id, user_id, role)
  values (ag.id, auth.uid(), v_role)
  on conflict (agency_id, user_id) do nothing;

  return ag;
end;
$$;
grant execute on function public.join_default_agency() to authenticated;

-- 08_roles_and_staff.sql
-- ============================================================================
-- 08_roles_and_staff.sql
--   Master/owner + internal-team role model. Run AFTER 07_single_agency.sql.
--   Idempotent / safe to re-run.
--
-- Roles (agency_members.role):
--   owner   — the MASTER. Full content CRUD + manages internal team members.
--   member  — internal team. Full content CRUD (clients/sets/creatives), but
--             cannot manage team members.
-- Clients are NOT agency_members; they live in client_contacts (per-set tiers).
--
-- Access model: only emails on staff_allowlist (plus the hard-coded master
-- email) may enroll, at the role the master assigns. Everyone manages staff
-- through the SECURITY DEFINER RPCs below; the table itself is RLS-locked.
-- ============================================================================

-- The master account. Always enrolled as owner; cannot be removed/demoted.
-- (Kept as a literal so the rule survives even if the row is deleted.)

-- ----------------------------------------------------------------------------
-- 1. Helpers.
-- ----------------------------------------------------------------------------
create or replace function public._default_agency_id()
returns uuid language sql security definer stable set search_path = public as $$
  select id from public.agencies order by created_at limit 1;
$$;
grant execute on function public._default_agency_id() to authenticated;

create or replace function public.is_agency_owner(p_agency_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.agency_members
    where agency_id = p_agency_id and user_id = auth.uid() and role = 'owner'
  );
$$;
grant execute on function public.is_agency_owner(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 2. staff_allowlist — who may join as internal staff, and at what role.
--    RLS on with NO policies: reachable only via the DEFINER RPCs below.
-- ----------------------------------------------------------------------------
create table if not exists public.staff_allowlist (
  id          uuid primary key default gen_random_uuid(),
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  email       text not null,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  unique (agency_id, email)        -- emails are always stored lower-cased
);
alter table public.staff_allowlist enable row level security;

-- Seed the master onto the allowlist as owner (no-op if already present).
insert into public.staff_allowlist (agency_id, email, role)
select a.id, 'content@digitalnicheagency.com', 'owner'
from public.agencies a
where not exists (
  select 1 from public.staff_allowlist sa
  where sa.agency_id = a.id and sa.email = 'content@digitalnicheagency.com'
);

-- ----------------------------------------------------------------------------
-- 3. join_default_agency — allowlist-gated enrollment (replaces the open
--    version from 07). Returns the agency when enrolled, NULL when the caller's
--    email isn't authorized (the app then shows a "no access" screen).
-- ----------------------------------------------------------------------------
create or replace function public.join_default_agency()
returns public.agencies
language plpgsql security definer set search_path = public as $$
declare
  ag     public.agencies;
  v_email text := public.current_email();
  v_role  text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into ag from public.agencies order by created_at limit 1;
  if ag.id is null then
    raise exception 'no agency configured';
  end if;

  if v_email = 'content@digitalnicheagency.com' then
    v_role := 'owner';                 -- master is always owner
  else
    select role into v_role
    from public.staff_allowlist
    where agency_id = ag.id and email = v_email;
  end if;

  if v_role is null then
    return null;                       -- not authorized staff
  end if;

  insert into public.agency_members (agency_id, user_id, role)
  values (ag.id, auth.uid(), v_role)
  on conflict (agency_id, user_id) do update set role = excluded.role;
  return ag;
end;
$$;
grant execute on function public.join_default_agency() to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Staff management RPCs — OWNER ONLY. They keep staff_allowlist and any
--    existing agency_members row in sync (matching the staff email to an
--    auth.users id). The app calls these instead of touching the tables.
-- ----------------------------------------------------------------------------
create or replace function public.staff_add(p_email text, p_role text default 'member')
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_agency uuid := public._default_agency_id();
  v_email  text := lower(trim(p_email));
  v_uid    uuid;
begin
  if not public.is_agency_owner(v_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_role not in ('owner','admin','member') then raise exception 'invalid role'; end if;
  if v_email = '' then raise exception 'email required'; end if;

  insert into public.staff_allowlist (agency_id, email, role)
  values (v_agency, v_email, p_role)
  on conflict (agency_id, email) do update set role = excluded.role;

  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is not null then
    update public.agency_members set role = p_role
      where agency_id = v_agency and user_id = v_uid;
  end if;
end;
$$;
grant execute on function public.staff_add(text, text) to authenticated;

create or replace function public.staff_set_role(p_email text, p_role text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_agency uuid := public._default_agency_id();
  v_email  text := lower(trim(p_email));
  v_uid    uuid;
begin
  if not public.is_agency_owner(v_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if p_role not in ('owner','admin','member') then raise exception 'invalid role'; end if;
  if v_email = 'content@digitalnicheagency.com' then
    raise exception 'cannot change the master account role';
  end if;

  update public.staff_allowlist set role = p_role
    where agency_id = v_agency and email = v_email;
  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is not null then
    update public.agency_members set role = p_role
      where agency_id = v_agency and user_id = v_uid;
  end if;
end;
$$;
grant execute on function public.staff_set_role(text, text) to authenticated;

create or replace function public.staff_remove(p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  v_agency uuid := public._default_agency_id();
  v_email  text := lower(trim(p_email));
  v_uid    uuid;
begin
  if not public.is_agency_owner(v_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_email = 'content@digitalnicheagency.com' then
    raise exception 'cannot remove the master account';
  end if;

  delete from public.staff_allowlist where agency_id = v_agency and email = v_email;
  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is not null then
    delete from public.agency_members where agency_id = v_agency and user_id = v_uid;
  end if;
end;
$$;
grant execute on function public.staff_remove(text) to authenticated;

-- Owner-only listing: each allowlisted staff email, its role, and whether the
-- person has actually signed up yet. Returns nothing to non-owners.
create or replace function public.staff_list()
returns table(email text, role text, joined boolean)
language sql security definer stable set search_path = public, auth as $$
  select sa.email, sa.role,
         exists (
           select 1 from public.agency_members m
           join auth.users u on u.id = m.user_id
           where m.agency_id = sa.agency_id and lower(u.email) = sa.email
         ) as joined
  from public.staff_allowlist sa
  where sa.agency_id = public._default_agency_id()
    and public.is_agency_owner(public._default_agency_id())
  order by sa.role <> 'owner', sa.created_at;
$$;
grant execute on function public.staff_list() to authenticated;

-- ----------------------------------------------------------------------------
-- 5. Lock down agency_members writes. Enrollment + role changes now flow ONLY
--    through the DEFINER RPCs above, so drop the permissive write policies from
--    rls.sql (which let any member insert themselves / teammates at any role).
--    Keep the SELECT policy so staff can read their own membership.
-- ----------------------------------------------------------------------------
drop policy if exists agency_members_insert_self on public.agency_members;
drop policy if exists agency_members_insert_team on public.agency_members;
drop policy if exists agency_members_delete      on public.agency_members;

-- 6. Single-agency hardening: no creating additional agencies via the API.
drop policy if exists agencies_insert on public.agencies;
revoke execute on function public.create_agency(text) from authenticated;

-- 09_client_dashboard.sql
-- ============================================================================
-- 09_client_dashboard.sql
--   Client landing dashboard support. Run AFTER 08_roles_and_staff.sql.
--   Idempotent / safe to re-run.
--
-- my_creative_sets() lists every set the signed-in client (by verified email)
-- can see across all their clients — for the /c landing page. SECURITY DEFINER
-- so a single call can enumerate across clients without per-row RLS probing.
-- ============================================================================

create or replace function public.my_creative_sets()
returns table(
  client_name text,
  client_slug text,
  client_logo text,
  set_name    text,
  set_slug    text,
  status      text,
  due_date    date,
  role        text
)
language sql
security definer
stable
set search_path = public
as $$
  select c.name, c.slug, coalesce(c.brand_logo, c.logo_url),
         s.name, s.slug, s.status, s.due_date, cc.role
  from public.client_contacts cc
  join public.clients c       on c.id = cc.client_id
  join public.creative_sets s on s.client_id = c.id
  where lower(cc.email) = public.current_email()
  order by c.name, s.created_at desc;
$$;
grant execute on function public.my_creative_sets() to authenticated;

-- 10_fix_clients_rls_recursion.sql
-- ============================================================================
-- 10_fix_clients_rls_recursion.sql
--   Fix: "infinite recursion detected in policy for relation clients".
--   Run AFTER 09. Idempotent / safe to re-run.
--
-- Cause: clients.clients_client_read did an inline subquery on client_contacts,
-- whose own policy (client_contacts_staff) subqueries clients → mutual RLS
-- recursion. Fix: evaluate the contact check in a SECURITY DEFINER function
-- (bypasses RLS), so the policies no longer re-enter each other.
-- ============================================================================

create or replace function public.is_client_contact(p_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.client_contacts cc
    where cc.client_id = p_client_id
      and lower(cc.email) = public.current_email()
  );
$$;
grant execute on function public.is_client_contact(uuid) to authenticated;

drop policy if exists clients_client_read on public.clients;
create policy clients_client_read on public.clients
  for select to authenticated
  using (public.is_client_contact(id));

-- 11_comments_all_roles_and_brand.sql
-- ============================================================================
-- 11_comments_all_roles_and_brand.sql
--   Run AFTER 10. Idempotent / safe to re-run.
--
--   1. Let EVERY client tier (viewer+) comment, reply, and resolve/unresolve.
--      (Was: comment/reply ≥ commenter, resolve ≥ approver.) Approve (status)
--      stays ≥ approver and full-row edit stays ≥ editor.
--   2. Add brand defaults on clients (brand_name, brand_logo) that prefill a new
--      creative's brand fields so mockups carry the client's brand automatically.
-- ============================================================================

-- 1. Comments / replies — viewer (rank ≥ 1) can now do all three.
drop policy if exists comments_client_insert on public.comments;
create policy comments_client_insert on public.comments
  for insert to authenticated
  with check (public.client_rank_for_ad(ad_id) >= 1);

drop policy if exists comments_client_resolve on public.comments;
create policy comments_client_resolve on public.comments
  for update to authenticated
  using (public.client_rank_for_ad(ad_id) >= 1)
  with check (public.client_rank_for_ad(ad_id) >= 1);

drop policy if exists replies_client_insert on public.replies;
create policy replies_client_insert on public.replies
  for insert to authenticated
  with check (public.client_rank_for_comment(comment_id) >= 1);

-- 2. Client brand defaults (used to prefill new creatives' brand_name/brand_logo).
alter table public.clients add column if not exists brand_name text;
alter table public.clients add column if not exists brand_logo text;

-- 12_granular_contact_permissions.sql
-- ============================================================================
-- 12_granular_contact_permissions.sql
--   Run AFTER 11. Idempotent / safe to re-run.
--
-- Replace the single hierarchical client tier with granular per-capability
-- flags on client_contacts. "View" is implicit (having a contact row = can
-- view); comment / approve / edit are independent booleans. RLS + the approval
-- RPC are repointed from role_rank() to these flags.
-- ============================================================================

alter table public.client_contacts add column if not exists can_comment boolean not null default true;
alter table public.client_contacts add column if not exists can_approve boolean not null default false;
alter table public.client_contacts add column if not exists can_edit    boolean not null default false;

-- One-time migration from the old tier. Guard: only touch rows still at the
-- freshly-added column default (true,false,false) so re-running the bundle never
-- clobbers capabilities that were later customized in the UI.
update public.client_contacts set
  can_comment = (role in ('commenter','approver','editor')),
  can_approve = (role in ('approver','editor')),
  can_edit    = (role = 'editor')
where role is not null
  and can_comment = true and can_approve = false and can_edit = false;

-- ----------------------------------------------------------------------------
-- Capability checks (SECURITY DEFINER; keyed by set, ad, or comment).
-- ----------------------------------------------------------------------------
create or replace function public.client_can_view_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email()
  );
$$;
create or replace function public.client_can_comment_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email() and cc.can_comment
  );
$$;
create or replace function public.client_can_approve_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email() and cc.can_approve
  );
$$;
create or replace function public.client_can_edit_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email() and cc.can_edit
  );
$$;

-- ad / comment variants (resolve the owning set without RLS, then delegate).
create or replace function public.client_can_view_ad(p_ad_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_view_set((select set_id from public.ads where id = p_ad_id));
$$;
create or replace function public.client_can_comment_ad(p_ad_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_comment_set((select set_id from public.ads where id = p_ad_id));
$$;
create or replace function public.client_can_approve_ad(p_ad_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_approve_set((select set_id from public.ads where id = p_ad_id));
$$;
create or replace function public.client_can_view_comment(p_comment_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_view_ad((select ad_id from public.comments where id = p_comment_id));
$$;
create or replace function public.client_can_comment_comment(p_comment_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_comment_ad((select ad_id from public.comments where id = p_comment_id));
$$;

grant execute on function public.client_can_view_set(uuid)        to authenticated;
grant execute on function public.client_can_comment_set(uuid)     to authenticated;
grant execute on function public.client_can_approve_set(uuid)     to authenticated;
grant execute on function public.client_can_edit_set(uuid)        to authenticated;
grant execute on function public.client_can_view_ad(uuid)         to authenticated;
grant execute on function public.client_can_comment_ad(uuid)      to authenticated;
grant execute on function public.client_can_approve_ad(uuid)      to authenticated;
grant execute on function public.client_can_view_comment(uuid)    to authenticated;
grant execute on function public.client_can_comment_comment(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Repoint the client-side RLS policies to the capability checks.
-- ----------------------------------------------------------------------------
drop policy if exists creative_sets_client_read on public.creative_sets;
create policy creative_sets_client_read on public.creative_sets
  for select to authenticated using (public.client_can_view_set(id));

drop policy if exists ads_client_read on public.ads;
create policy ads_client_read on public.ads
  for select to authenticated using (public.client_can_view_set(set_id));

drop policy if exists ads_client_edit on public.ads;
create policy ads_client_edit on public.ads
  for update to authenticated
  using (public.client_can_edit_set(set_id))
  with check (public.client_can_edit_set(set_id));

drop policy if exists comments_client_read on public.comments;
create policy comments_client_read on public.comments
  for select to authenticated using (public.client_can_view_ad(ad_id));

drop policy if exists comments_client_insert on public.comments;
create policy comments_client_insert on public.comments
  for insert to authenticated with check (public.client_can_comment_ad(ad_id));

drop policy if exists comments_client_resolve on public.comments;
create policy comments_client_resolve on public.comments
  for update to authenticated
  using (public.client_can_comment_ad(ad_id))
  with check (public.client_can_comment_ad(ad_id));

drop policy if exists replies_client_read on public.replies;
create policy replies_client_read on public.replies
  for select to authenticated using (public.client_can_view_comment(comment_id));

drop policy if exists replies_client_insert on public.replies;
create policy replies_client_insert on public.replies
  for insert to authenticated with check (public.client_can_comment_comment(comment_id));

-- Approval RPC: approver tier -> can_approve capability.
create or replace function public.set_creative_approval(p_ad_id uuid, p_status text)
returns public.ads
language plpgsql security definer set search_path = public as $$
declare row public.ads;
begin
  if p_status not in ('pending','approved','needs-edits') then
    raise exception 'invalid status %', p_status;
  end if;
  if not public.client_can_approve_ad(p_ad_id)
     and not exists (
       select 1 from public.ads a
       join public.creative_sets s on s.id = a.set_id
       join public.clients c on c.id = s.client_id
       where a.id = p_ad_id and public.is_agency_member(c.agency_id)
     )
  then
    raise exception 'not authorized to approve' using errcode = '42501';
  end if;
  update public.ads set status = p_status where id = p_ad_id returning * into row;
  return row;
end;
$$;

-- ===== 13_client_set_status.sql =====
-- Let an approver-capable client set a set's overall status from the portal.
-- Clients have no direct UPDATE on creative_sets (only read), so this
-- SECURITY DEFINER RPC is the one sanctioned write path. It restricts clients
-- to the two review outcomes; staff continue to use the full status list via
-- their direct creative_sets UPDATE policy (and may also call this).
--
-- Mirrors set_creative_approval in db/12_granular_contact_permissions.sql.

create or replace function public.client_set_status(p_set_id uuid, p_status text)
returns public.creative_sets
language plpgsql security definer set search_path = public as $$
declare row public.creative_sets;
begin
  if p_status not in ('needs_review','approved') then
    raise exception 'invalid client status %', p_status;
  end if;
  if not public.client_can_approve_set(p_set_id)
     and not exists (
       select 1 from public.creative_sets s
       join public.clients c on c.id = s.client_id
       where s.id = p_set_id and public.is_agency_member(c.agency_id)
     )
  then
    raise exception 'not authorized to set status' using errcode = '42501';
  end if;
  update public.creative_sets set status = p_status
    where id = p_set_id returning * into row;
  return row;
end;
$$;

grant execute on function public.client_set_status(uuid, text) to authenticated;

-- ===== 14_reply_notifications.sql =====
-- ============================================================================
-- 14_reply_notifications.sql
--   Notify the original commenter when someone replies to their comment.
--   Run AFTER 06_notifications.sql. Idempotent / safe to re-run.
--
--   Event: reply -> the comment's author (a client) gets emailed a deep link to
--   the set. Fires for staff replies (the common case: the agency answers a
--   client's feedback). Skipped when the replier IS the original author (no
--   self-notification) or when the author isn't an email address.
-- ============================================================================

create or replace function public.tg_notify_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select cl.agency_id,
         cl.name  as client_name,
         cl.slug  as client_slug,
         s.name   as set_name,
         s.slug   as set_slug,
         a.name   as creative_name,
         cm.author as comment_author
    into r
  from public.comments cm
  join public.ads a            on a.id = cm.ad_id
  join public.creative_sets s  on s.id = a.set_id
  join public.clients cl       on cl.id = s.client_id
  where cm.id = NEW.comment_id;

  -- Only notify the original commenter, only when someone else replied, and
  -- only if the stored author is an email we can actually send to.
  if r.comment_author is null
     or position('@' in r.comment_author) = 0
     or lower(r.comment_author) = lower(NEW.author) then
    return NEW;
  end if;

  perform public.post_notification(jsonb_build_object(
    'type', 'reply',
    'agency_id', r.agency_id,
    'client_name', r.client_name,
    'client_slug', r.client_slug,
    'set_name', r.set_name,
    'set_slug', r.set_slug,
    'creative_name', coalesce(nullif(r.creative_name, ''), 'a creative'),
    'author', NEW.author,
    'recipient_email', r.comment_author,
    'text', NEW.text
  ));
  return NEW;
end;
$$;

drop trigger if exists notify_reply on public.replies;
create trigger notify_reply after insert on public.replies
  for each row execute function public.tg_notify_reply();


-- ===== 15_pin_author_and_atomic_reorder.sql =====
-- ============================================================================
-- 15_pin_author_and_atomic_reorder.sql
--   (1) Pin comment/reply author to the caller's JWT email (BEFORE INSERT), so
--       a client can't post AS someone else. Runs before the notify triggers.
--   (2) Atomic creative reorder RPC (one statement; RLS-scoped, SECURITY INVOKER)
--       replacing the old row-by-row loop that could scramble positions.
-- ============================================================================

create or replace function public.tg_pin_author()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  claims    text := current_setting('request.jwt.claims', true);
  jwt_email text;
begin
  if claims is not null and claims <> '' then
    jwt_email := nullif(claims::jsonb ->> 'email', '');
    if jwt_email is not null then
      new.author := jwt_email;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pin_author on public.comments;
create trigger pin_author before insert on public.comments
  for each row execute function public.tg_pin_author();

drop trigger if exists pin_author on public.replies;
create trigger pin_author before insert on public.replies
  for each row execute function public.tg_pin_author();

create or replace function public.reorder_creatives(
  p_set_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  update public.ads a
  set position = o.ord
  from (
    select t.id, (t.ord - 1)::int as ord
    from unnest(p_ordered_ids) with ordinality as t(id, ord)
  ) o
  where a.id = o.id and a.set_id = p_set_id;
end;
$$;

grant execute on function public.reorder_creatives(uuid, uuid[]) to authenticated;
