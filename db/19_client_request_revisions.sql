-- 19_client_request_revisions.sql
-- ----------------------------------------------------------------------------
-- UX-21/22: client_set_status (db/13) only allowed ('needs_review','approved'),
-- so when a client "sent a set back" the portal had to use `needs_review`
-- ("Needs CLIENT review") — backwards: that status means the agency is waiting
-- on the client, not that the client wants changes. The correct target is
-- `needs_revisions` ("Needs revisions"), which the client previously could
-- never reach.
--
-- This loosens the allow-list to include `needs_revisions`. Purely additive
-- (the old values still work), so it's safe to run before OR after deploying
-- the matching app change. Idempotent. Run after db/13.
-- ----------------------------------------------------------------------------

create or replace function public.client_set_status(p_set_id uuid, p_status text)
returns public.creative_sets
language plpgsql security definer set search_path = public as $$
declare row public.creative_sets;
begin
  if p_status not in ('needs_review','needs_revisions','approved') then
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
