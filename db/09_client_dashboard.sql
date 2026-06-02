-- ============================================================================
-- 09_client_dashboard.sql
--   Client landing dashboard support. Run AFTER 08_roles_and_staff.sql.
--   Idempotent / safe to re-run.
--
-- my_creative_sets() lists every set the signed-in client (by verified email)
-- can see across all their clients — for the /c landing page. SECURITY DEFINER
-- so a single call can enumerate across clients without per-row RLS probing.
-- ============================================================================

create or replace function public.my_creative_sets()
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
  select c.name, c.slug, c.logo_url,
         s.name, s.slug, s.status, s.due_date, cc.role
  from public.client_contacts cc
  join public.clients c       on c.id = cc.client_id
  join public.creative_sets s on s.client_id = c.id
  where lower(cc.email) = public.current_email()
  order by c.name, s.created_at desc;
$$;
grant execute on function public.my_creative_sets() to authenticated;
