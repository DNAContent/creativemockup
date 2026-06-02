-- ============================================================================
-- 11_comments_all_roles_and_brand.sql
--   Run AFTER 10. Idempotent / safe to re-run.
--
--   1. Let EVERY client tier (viewer+) comment, reply, and resolve/unresolve.
--      (Was: comment/reply ≥ commenter, resolve ≥ approver.) Approve (status)
--      stays ≥ approver and full-row edit stays ≥ editor.
--   2. Add brand defaults on clients (brand_name, brand_logo) that prefill a new
--      creative's brand fields so mockups carry the client's brand automatically.
-- ============================================================================

-- 1. Comments / replies — viewer (rank ≥ 1) can now do all three.
drop policy if exists comments_client_insert on public.comments;
create policy comments_client_insert on public.comments
  for insert to authenticated
  with check (public.client_rank_for_ad(ad_id) >= 1);

drop policy if exists comments_client_resolve on public.comments;
create policy comments_client_resolve on public.comments
  for update to authenticated
  using (public.client_rank_for_ad(ad_id) >= 1)
  with check (public.client_rank_for_ad(ad_id) >= 1);

drop policy if exists replies_client_insert on public.replies;
create policy replies_client_insert on public.replies
  for insert to authenticated
  with check (public.client_rank_for_comment(comment_id) >= 1);

-- 2. Client brand defaults (used to prefill new creatives' brand_name/brand_logo).
alter table public.clients add column if not exists brand_name text;
alter table public.clients add column if not exists brand_logo text;
