-- ============================================================================
-- 14_reply_notifications.sql
--   Notify the original commenter when someone replies to their comment.
--   Run AFTER 06_notifications.sql. Idempotent / safe to re-run.
--
--   Event: reply -> the comment's author (a client) gets emailed a deep link to
--   the set. Fires for staff replies (the common case: the agency answers a
--   client's feedback). Skipped when the replier IS the original author (no
--   self-notification) or when the author isn't an email address.
-- ============================================================================

create or replace function public.tg_notify_reply()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare r record;
begin
  select cl.agency_id,
         cl.name  as client_name,
         cl.slug  as client_slug,
         s.name   as set_name,
         s.slug   as set_slug,
         a.name   as creative_name,
         cm.author as comment_author
    into r
  from public.comments cm
  join public.ads a            on a.id = cm.ad_id
  join public.creative_sets s  on s.id = a.set_id
  join public.clients cl       on cl.id = s.client_id
  where cm.id = NEW.comment_id;

  -- Only notify the original commenter, only when someone else replied, and
  -- only if the stored author is an email we can actually send to.
  if r.comment_author is null
     or position('@' in r.comment_author) = 0
     or lower(r.comment_author) = lower(NEW.author) then
    return NEW;
  end if;

  perform public.post_notification(jsonb_build_object(
    'type', 'reply',
    'agency_id', r.agency_id,
    'client_name', r.client_name,
    'client_slug', r.client_slug,
    'set_name', r.set_name,
    'set_slug', r.set_slug,
    'creative_name', coalesce(nullif(r.creative_name, ''), 'a creative'),
    'author', NEW.author,
    'recipient_email', r.comment_author,
    'text', NEW.text
  ));
  return NEW;
end;
$$;

drop trigger if exists notify_reply on public.replies;
create trigger notify_reply after insert on public.replies
  for each row execute function public.tg_notify_reply();
