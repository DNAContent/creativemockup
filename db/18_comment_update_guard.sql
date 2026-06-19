-- 18_comment_update_guard.sql
-- ----------------------------------------------------------------------------
-- SEC-3 hardening: the client comment-UPDATE RLS policy (comments_client_resolve)
-- is column-blind — Postgres UPDATE policies can't restrict WHICH columns change.
-- A client with the comment capability is only meant to toggle `resolved`, but
-- the policy would also let them overwrite `text`, `author`, `target`, or
-- `ad_id` of ANY comment they can see (staff comments, other clients' comments).
--
-- This BEFORE UPDATE trigger closes that: for non-staff callers it forces every
-- column except `resolved` back to its stored value, so a client UPDATE can only
-- ever flip the resolved flag. Staff (agency members) are unaffected. The
-- application code (a plain `.update({ resolved })`) needs no change.
--
-- Idempotent — safe to re-run. Run in the Supabase SQL editor after db/12.
-- ----------------------------------------------------------------------------

create or replace function public.tg_comment_client_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_staff boolean;
begin
  -- Is the caller an agency member (staff) for the agency that owns this
  -- comment's ad? Resolve ad -> set -> client -> agency.
  select public.is_agency_member(c.agency_id)
    into v_is_staff
  from public.ads a
  join public.creative_sets s on s.id = a.set_id
  join public.clients c       on c.id = s.client_id
  where a.id = OLD.ad_id;

  -- Everyone who is not staff (i.e. client contacts) may change ONLY `resolved`.
  if v_is_staff is not true then
    NEW.text       := OLD.text;
    NEW.author     := OLD.author;
    NEW.target     := OLD.target;
    NEW.ad_id      := OLD.ad_id;
    NEW.created_at := OLD.created_at;
  end if;

  return NEW;
end;
$$;

drop trigger if exists comment_client_update_guard on public.comments;
create trigger comment_client_update_guard
  before update on public.comments
  for each row execute function public.tg_comment_client_update_guard();
