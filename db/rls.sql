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
