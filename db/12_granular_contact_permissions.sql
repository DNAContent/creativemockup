-- ============================================================================
-- 12_granular_contact_permissions.sql
--   Run AFTER 11. Idempotent / safe to re-run.
--
-- Replace the single hierarchical client tier with granular per-capability
-- flags on client_contacts. "View" is implicit (having a contact row = can
-- view); comment / approve / edit are independent booleans. RLS + the approval
-- RPC are repointed from role_rank() to these flags.
-- ============================================================================

alter table public.client_contacts add column if not exists can_comment boolean not null default true;
alter table public.client_contacts add column if not exists can_approve boolean not null default false;
alter table public.client_contacts add column if not exists can_edit    boolean not null default false;

-- One-time migration from the old tier. Guard: only touch rows still at the
-- freshly-added column default (true,false,false) so re-running the bundle never
-- clobbers capabilities that were later customized in the UI.
update public.client_contacts set
  can_comment = (role in ('commenter','approver','editor')),
  can_approve = (role in ('approver','editor')),
  can_edit    = (role = 'editor')
where role is not null
  and can_comment = true and can_approve = false and can_edit = false;

-- ----------------------------------------------------------------------------
-- Capability checks (SECURITY DEFINER; keyed by set, ad, or comment).
-- ----------------------------------------------------------------------------
create or replace function public.client_can_view_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email()
  );
$$;
create or replace function public.client_can_comment_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email() and cc.can_comment
  );
$$;
create or replace function public.client_can_approve_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email() and cc.can_approve
  );
$$;
create or replace function public.client_can_edit_set(p_set_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.client_contacts cc
    join public.creative_sets s on s.client_id = cc.client_id
    where s.id = p_set_id and lower(cc.email) = public.current_email() and cc.can_edit
  );
$$;

-- ad / comment variants (resolve the owning set without RLS, then delegate).
create or replace function public.client_can_view_ad(p_ad_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_view_set((select set_id from public.ads where id = p_ad_id));
$$;
create or replace function public.client_can_comment_ad(p_ad_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_comment_set((select set_id from public.ads where id = p_ad_id));
$$;
create or replace function public.client_can_approve_ad(p_ad_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_approve_set((select set_id from public.ads where id = p_ad_id));
$$;
create or replace function public.client_can_view_comment(p_comment_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_view_ad((select ad_id from public.comments where id = p_comment_id));
$$;
create or replace function public.client_can_comment_comment(p_comment_id uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select public.client_can_comment_ad((select ad_id from public.comments where id = p_comment_id));
$$;

grant execute on function public.client_can_view_set(uuid)        to authenticated;
grant execute on function public.client_can_comment_set(uuid)     to authenticated;
grant execute on function public.client_can_approve_set(uuid)     to authenticated;
grant execute on function public.client_can_edit_set(uuid)        to authenticated;
grant execute on function public.client_can_view_ad(uuid)         to authenticated;
grant execute on function public.client_can_comment_ad(uuid)      to authenticated;
grant execute on function public.client_can_approve_ad(uuid)      to authenticated;
grant execute on function public.client_can_view_comment(uuid)    to authenticated;
grant execute on function public.client_can_comment_comment(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Repoint the client-side RLS policies to the capability checks.
-- ----------------------------------------------------------------------------
drop policy if exists creative_sets_client_read on public.creative_sets;
create policy creative_sets_client_read on public.creative_sets
  for select to authenticated using (public.client_can_view_set(id));

drop policy if exists ads_client_read on public.ads;
create policy ads_client_read on public.ads
  for select to authenticated using (public.client_can_view_set(set_id));

drop policy if exists ads_client_edit on public.ads;
create policy ads_client_edit on public.ads
  for update to authenticated
  using (public.client_can_edit_set(set_id))
  with check (public.client_can_edit_set(set_id));

drop policy if exists comments_client_read on public.comments;
create policy comments_client_read on public.comments
  for select to authenticated using (public.client_can_view_ad(ad_id));

drop policy if exists comments_client_insert on public.comments;
create policy comments_client_insert on public.comments
  for insert to authenticated with check (public.client_can_comment_ad(ad_id));

drop policy if exists comments_client_resolve on public.comments;
create policy comments_client_resolve on public.comments
  for update to authenticated
  using (public.client_can_comment_ad(ad_id))
  with check (public.client_can_comment_ad(ad_id));

drop policy if exists replies_client_read on public.replies;
create policy replies_client_read on public.replies
  for select to authenticated using (public.client_can_view_comment(comment_id));

drop policy if exists replies_client_insert on public.replies;
create policy replies_client_insert on public.replies
  for insert to authenticated with check (public.client_can_comment_comment(comment_id));

-- Approval RPC: approver tier -> can_approve capability.
create or replace function public.set_creative_approval(p_ad_id uuid, p_status text)
returns public.ads
language plpgsql security definer set search_path = public as $$
declare row public.ads;
begin
  if p_status not in ('pending','approved','needs-edits') then
    raise exception 'invalid status %', p_status;
  end if;
  if not public.client_can_approve_ad(p_ad_id)
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
