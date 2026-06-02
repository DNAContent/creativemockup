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
