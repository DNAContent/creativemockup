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
