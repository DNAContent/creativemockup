-- ============================================================================
-- 16_post_launch_hardening.sql
--   Idempotent / safe to re-run. Run BEFORE deploying the matching app build
--   (the per-client dashboard now passes p_client_slug to my_creative_sets).
--
--   (1) reorder_creatives: reject a stale id list (a creative added/removed in
--       another tab) instead of silently leaving gapped/duplicate positions.
--   (2) my_creative_sets: optional p_client_slug filter so the per-client
--       dashboard filters in the DB instead of fetching every set then
--       filtering in JS.
--   (3) request_access: don't insert (and re-notify the team about) a duplicate
--       pending request for the same set+email — stops a repeated-probe spam
--       loop and de-dupes the staff access-request inbox.
-- ============================================================================

-- (1) Atomic reorder + staleness guard ---------------------------------------
create or replace function public.reorder_creatives(
  p_set_id uuid,
  p_ordered_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if coalesce(array_length(p_ordered_ids, 1), 0)
       <> (select count(*) from public.ads where set_id = p_set_id) then
    raise exception 'creative list is out of date — reload'
      using errcode = 'P0001';
  end if;

  update public.ads a
  set position = o.ord
  from (
    select t.id, (t.ord - 1)::int as ord
    from unnest(p_ordered_ids) with ordinality as t(id, ord)
  ) o
  where a.id = o.id and a.set_id = p_set_id;
end;
$$;

grant execute on function public.reorder_creatives(uuid, uuid[]) to authenticated;

-- (2) my_creative_sets with an optional client-slug filter --------------------
-- Drop the old zero-arg version and recreate with a defaulted param so the
-- existing no-arg callers (the /c "all reviews" page) keep working.
drop function if exists public.my_creative_sets();

create or replace function public.my_creative_sets(p_client_slug text default null)
returns table(
  client_name text,
  client_slug text,
  client_logo text,
  set_name    text,
  set_slug    text,
  status      text,
  due_date    date,
  role        text
)
language sql
security definer
stable
set search_path = public
as $$
  select c.name, c.slug, coalesce(c.brand_logo, c.logo_url),
         s.name, s.slug, s.status, s.due_date, cc.role
  from public.client_contacts cc
  join public.clients c       on c.id = cc.client_id
  join public.creative_sets s on s.client_id = c.id
  where lower(cc.email) = public.current_email()
    and (p_client_slug is null or c.slug = p_client_slug)
  order by c.name, s.created_at desc;
$$;
grant execute on function public.my_creative_sets(text) to authenticated;

-- (3) request_access: de-dupe pending requests -------------------------------
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
    -- Only log + notify once per (set, email); repeated probes are no-ops.
    insert into public.access_requests (set_id, email, message)
    select v_set_id, lower(trim(p_email)), nullif(trim(p_message), '')
    where not exists (
      select 1 from public.access_requests
      where set_id = v_set_id
        and lower(email) = lower(trim(p_email))
        and status = 'pending'
    );
    return null;                       -- not allowlisted; request logged (once)
  end if;

  return v_role;                       -- allowlisted; caller may send magic link
end;
$$;
