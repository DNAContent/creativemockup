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
