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
