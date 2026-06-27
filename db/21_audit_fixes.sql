-- ============================================================================
-- 21_audit_fixes.sql
--   Edge-case audit fixes (2026-06-26). Idempotent / safe to re-run.
--   Run in the Supabase SQL editor AFTER db/20. Also folded into
--   recreate-schema.sql for fresh builds.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- (1) ads UPDATE column guard.  The `ads_client_edit` RLS policy (db/12) is
--     column-blind, so a client contact with can_edit=true but can_approve=false
--     could PATCH `ads.status='approved'` directly (bypassing set_creative_approval)
--     or move a creative to another set via `set_id`. Mirror the comments guard
--     (db/18): for NON-staff callers, pin id/set_id/created_at always, and pin
--     `status` unless they actually have the approve capability.
-- ----------------------------------------------------------------------------
create or replace function public.tg_ads_client_update_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_staff boolean;
begin
  select public.is_agency_member(c.agency_id)
    into v_is_staff
  from public.creative_sets s
  join public.clients c on c.id = s.client_id
  where s.id = OLD.set_id;

  if v_is_staff is not true then
    -- client contacts may only edit content fields, never re-key the row…
    NEW.id         := OLD.id;
    NEW.set_id     := OLD.set_id;
    NEW.created_at := OLD.created_at;
    -- …and may only change status if they have the approve capability.
    if not public.client_can_approve_set(OLD.set_id) then
      NEW.status := OLD.status;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists ads_client_update_guard on public.ads;
create trigger ads_client_update_guard
  before update on public.ads
  for each row execute function public.tg_ads_client_update_guard();

-- ----------------------------------------------------------------------------
-- (2) tg_notify_comment: don't notify the team about a STAFF member's own
--     comment as if it were client feedback (mirror tg_notify_approval's guard).
-- ----------------------------------------------------------------------------
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

  -- A staff member's own comment isn't "client feedback" — skip the alert.
  if public.is_agency_member(r.agency_id) then
    return NEW;
  end if;

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

-- ----------------------------------------------------------------------------
-- (3) set_contact_primary: clear-other-primaries + set-this-one in ONE
--     transaction, so concurrent "make primary" clicks can't collide on the
--     client_contacts_one_primary_idx partial unique index (db/20). Staff-gated.
-- ----------------------------------------------------------------------------
create or replace function public.set_contact_primary(p_contact_id uuid, p_make boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client uuid;
  v_agency uuid;
begin
  select cc.client_id, c.agency_id
    into v_client, v_agency
  from public.client_contacts cc
  join public.clients c on c.id = cc.client_id
  where cc.id = p_contact_id;

  if v_client is null then
    raise exception 'contact not found';
  end if;
  if not public.is_agency_member(v_agency) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_make then
    update public.client_contacts set is_primary = false
      where client_id = v_client and id <> p_contact_id and is_primary;
    update public.client_contacts set is_primary = true where id = p_contact_id;
  else
    update public.client_contacts set is_primary = false where id = p_contact_id;
  end if;
end;
$$;
grant execute on function public.set_contact_primary(uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- (4) request_access: an unknown review link used to RAISE, letting an anon
--     caller distinguish valid client/set slugs (an enumeration oracle). Return
--     null instead, so an unknown link is indistinguishable from "not on the
--     allowlist". (Body otherwise identical to db/16.)
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
    return null;                         -- unknown link: no slug oracle
  end if;

  if v_role is null then
    insert into public.access_requests (set_id, email, message)
    select v_set_id, lower(trim(p_email)), nullif(trim(p_message), '')
    where not exists (
      select 1 from public.access_requests
      where set_id = v_set_id
        and lower(email) = lower(trim(p_email))
        and status = 'pending'
    );
    return null;
  end if;

  return v_role;
end;
$$;

-- ----------------------------------------------------------------------------
-- (5) staff RPCs: reject the dead 'admin' tier (is_agency_owner never honors it)
--     and raise instead of silently succeeding when the email isn't on the
--     allowlist. (Bodies otherwise identical to db/08.)
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
  if p_role not in ('owner','member') then raise exception 'invalid role'; end if;
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
  if p_role not in ('owner','member') then raise exception 'invalid role'; end if;
  if v_email = 'content@digitalnicheagency.com' then
    raise exception 'cannot change the master account role';
  end if;

  update public.staff_allowlist set role = p_role
    where agency_id = v_agency and email = v_email;
  if not found then raise exception 'no staff member with that email'; end if;

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
  if not found then raise exception 'no staff member with that email'; end if;

  select id into v_uid from auth.users where lower(email) = v_email limit 1;
  if v_uid is not null then
    delete from public.agency_members where agency_id = v_agency and user_id = v_uid;
  end if;
end;
$$;
grant execute on function public.staff_remove(text) to authenticated;
