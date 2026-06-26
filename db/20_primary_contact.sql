-- ============================================================================
-- 20_primary_contact.sql
--   Run AFTER 19. Idempotent / safe to re-run.
--
-- Makes client_contacts the single source of truth for "who is this client's
-- person." Adds an `is_primary` flag so one contact per client can be marked
-- primary (shown in the dashboard + client header). The old free-text
-- clients.contact_email field is no longer written or displayed by the app; the
-- column is left in place (harmless) so nothing that still reads it breaks.
-- ============================================================================

alter table public.client_contacts
  add column if not exists is_primary boolean not null default false;

-- At most ONE primary contact per client. Partial unique index so non-primary
-- rows (the common case) are unconstrained.
create unique index if not exists client_contacts_one_primary_idx
  on public.client_contacts(client_id)
  where is_primary;
