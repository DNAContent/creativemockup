-- ============================================================================
-- 10_fix_clients_rls_recursion.sql
--   Fix: "infinite recursion detected in policy for relation clients".
--   Run AFTER 09. Idempotent / safe to re-run.
--
-- Cause: clients.clients_client_read did an inline subquery on client_contacts,
-- whose own policy (client_contacts_staff) subqueries clients → mutual RLS
-- recursion. Fix: evaluate the contact check in a SECURITY DEFINER function
-- (bypasses RLS), so the policies no longer re-enter each other.
-- ============================================================================

create or replace function public.is_client_contact(p_client_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.client_contacts cc
    where cc.client_id = p_client_id
      and lower(cc.email) = public.current_email()
  );
$$;
grant execute on function public.is_client_contact(uuid) to authenticated;

drop policy if exists clients_client_read on public.clients;
create policy clients_client_read on public.clients
  for select to authenticated
  using (public.is_client_contact(id));
