-- ============================================================================
-- 15_pin_author_and_atomic_reorder.sql
--   Two hardening fixes. Idempotent / safe to re-run.
--
--   (1) Pin comment/reply author to the authenticated identity.
--       The portal writes comments/replies directly to Postgres and used to
--       trust a client-supplied `author` string — so a logged-in client could
--       post AS anyone (staff or another contact). This BEFORE INSERT trigger
--       overwrites `author` with the caller's JWT email, ignoring whatever the
--       client sent. It runs before the AFTER INSERT notify triggers (06/14),
--       so notifications still see the correct author. Falls back to the row's
--       given value only when there's no JWT (e.g. service_role / SQL editor).
--
--   (2) Atomic creative reorder.
--       reorderCreatives used to UPDATE one row at a time in app code; a partial
--       failure or two concurrent reorders left duplicate/scrambled positions.
--       This RPC writes every position in ONE statement. SECURITY INVOKER so the
--       caller's RLS on `ads` still applies (you can only reorder your own sets).
-- ============================================================================

-- (1) Author pinning ---------------------------------------------------------
create or replace function public.tg_pin_author()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  claims    text := current_setting('request.jwt.claims', true);
  jwt_email text;
begin
  if claims is not null and claims <> '' then
    jwt_email := nullif(claims::jsonb ->> 'email', '');
    if jwt_email is not null then
      new.author := jwt_email;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists pin_author on public.comments;
create trigger pin_author before insert on public.comments
  for each row execute function public.tg_pin_author();

drop trigger if exists pin_author on public.replies;
create trigger pin_author before insert on public.replies
  for each row execute function public.tg_pin_author();

-- (2) Atomic reorder ---------------------------------------------------------
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
