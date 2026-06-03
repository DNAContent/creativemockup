-- ============================================================================
-- Ad Mockup Viewer — Multi-client agency tool
-- 01_schema.sql  —  Tables, indexes, triggers
--
-- Run order in the Supabase SQL editor:
--   1. schema.sql                  (this file)
--   2. functions.sql               (membership + agency-creation helpers)
--   3. rls.sql                     (base row-level security policies)
--   4. 04_team_client_access.sql   (magic-link client allowlist + role tiers)
--   5. 05_drop_legacy_token_model.sql (drops the retired token RPCs/column)
--   6. 06_notifications.sql        (Slack/email triggers via pg_net)
--
-- Safe to re-run: uses IF NOT EXISTS / CREATE OR REPLACE throughout.
-- ============================================================================

-- gen_random_uuid() lives in pgcrypto (enabled by default on Supabase, but be explicit)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- agencies  —  the tenant boundary. Every client/set/ad rolls up to one agency.
-- ----------------------------------------------------------------------------
create table if not exists public.agencies (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- agency_members  —  maps Supabase Auth users to an agency. Many users per
-- agency from day one. A user may belong to more than one agency.
-- ----------------------------------------------------------------------------
create table if not exists public.agency_members (
  agency_id   uuid not null references public.agencies(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member' check (role in ('owner','admin','member')),
  created_at  timestamptz not null default now(),
  primary key (agency_id, user_id)
);
create index if not exists agency_members_user_idx on public.agency_members(user_id);

-- ----------------------------------------------------------------------------
-- clients
-- ----------------------------------------------------------------------------
create table if not exists public.clients (
  id             uuid primary key default gen_random_uuid(),
  agency_id      uuid not null references public.agencies(id) on delete cascade,
  name           text not null,
  logo_url       text,
  slug           text,
  contact_email  text,
  created_at     timestamptz not null default now(),
  unique (agency_id, slug)
);
create index if not exists clients_agency_idx on public.clients(agency_id);

-- ----------------------------------------------------------------------------
-- creative_sets  —  a batch of ads sent to a client for review. Clients reach a
-- set at /c/<client-slug>/<set-slug>; access is gated by the magic-link
-- allowlist (client_contacts) added in 04_team_client_access.sql, which also
-- adds the `slug` column and the current status vocabulary.
-- ----------------------------------------------------------------------------
create table if not exists public.creative_sets (
  id            uuid primary key default gen_random_uuid(),
  client_id     uuid not null references public.clients(id) on delete cascade,
  name          text not null,
  status        text not null default 'draft'
                  check (status in ('draft','in_review','approved','needs_edits','archived')),
  notes         text,
  due_date      date,
  created_at    timestamptz not null default now()
);
create index if not exists creative_sets_client_idx on public.creative_sets(client_id);

-- ----------------------------------------------------------------------------
-- ads  —  one mockup. Columns mirror the ad object in ad-mockup-viewer.html.
-- JS camelCase -> SQL snake_case mapping (handled in the app layer):
--   brandName->brand_name, brandLogo->brand_logo, desc->description,
--   emailSubject->email_subject, emailPreheader->email_preheader,
--   emailBody->email_body, mediaImg->media_img, mediaVideo->media_video,
--   aspectRatio->aspect_ratio.
-- uploadedURL / uploadedType are intentionally NOT stored — they were local
-- base64/blob URLs, now replaced by Google Drive direct URLs in media_img.
-- ----------------------------------------------------------------------------
create table if not exists public.ads (
  id              uuid primary key default gen_random_uuid(),
  set_id          uuid not null references public.creative_sets(id) on delete cascade,
  position        integer not null default 0,
  name            text not null default '',
  format          text not null default 'fb-feed',
  status          text not null default 'pending'
                    check (status in ('pending','approved','needs-edits')),
  brand_name      text not null default '',
  brand_logo      text not null default '',
  copy            text not null default '',
  headline        text not null default '',
  description     text not null default '',
  cta             text not null default '',
  email_subject   text not null default '',
  email_preheader text not null default '',
  email_body      text not null default '',
  media_img       text not null default '',
  media_video     text not null default '',
  aspect_ratio    text not null default '16:9',
  -- single image/video (default) or a multi-slide carousel (db/17). slides is
  -- an ordered array of { img, headline, description, cta } cards.
  creative_type   text not null default 'single'
                    check (creative_type in ('single','carousel')),
  slides          jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now()
);
create index if not exists ads_set_idx on public.ads(set_id, position);

-- ----------------------------------------------------------------------------
-- comments  —  reviewer feedback on a single ad.
-- ----------------------------------------------------------------------------
create table if not exists public.comments (
  id          uuid primary key default gen_random_uuid(),
  ad_id       uuid not null references public.ads(id) on delete cascade,
  author      text not null default 'Client',
  text        text not null,
  target      text not null default 'General'
                check (target in ('General','Copy','Visual','Headline','CTA')),
  resolved    boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists comments_ad_idx on public.comments(ad_id);

-- ----------------------------------------------------------------------------
-- replies  —  threaded responses on a comment.
-- ----------------------------------------------------------------------------
create table if not exists public.replies (
  id          uuid primary key default gen_random_uuid(),
  comment_id  uuid not null references public.comments(id) on delete cascade,
  author      text not null default 'Agency',
  text        text not null,
  created_at  timestamptz not null default now()
);
create index if not exists replies_comment_idx on public.replies(comment_id);

-- ----------------------------------------------------------------------------
-- Realtime: publish comments + replies so the client portal and the editor
-- see new feedback live. (Supabase ships a publication named supabase_realtime.)
-- ----------------------------------------------------------------------------
do $$
begin
  begin execute 'alter publication supabase_realtime add table public.comments'; exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.replies';  exception when duplicate_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.ads';      exception when duplicate_object then null; end;
end $$;
