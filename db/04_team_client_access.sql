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
