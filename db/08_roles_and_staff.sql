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
