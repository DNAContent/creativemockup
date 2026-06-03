-- ============================================================================
-- 17_carousel.sql
--   Carousel creatives. Idempotent / safe to re-run. Run BEFORE deploying the
--   matching app build (the editor + renderer read these two columns).
--
--   A creative is either a single image/video (the default, unchanged) or a
--   "carousel" of slides. `slides` holds an ordered array of cards, each:
--     { "img": "...", "headline": "...", "description": "...", "cta": "..." }
--   Only feed formats (fb/ig/li) render as a carousel; other formats ignore it.
--   No new RLS — both columns live on `ads` and inherit its policies.
-- ============================================================================
alter table public.ads
  add column if not exists creative_type text not null default 'single'
    check (creative_type in ('single','carousel'));

alter table public.ads
  add column if not exists slides jsonb not null default '[]'::jsonb;
