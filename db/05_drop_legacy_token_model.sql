-- ============================================================================
-- 05_drop_legacy_token_model.sql
--   Phase 2 of the 2026-05-28 rework. Run AFTER 04_team_client_access.sql.
--   Idempotent / safe to re-run.
--
-- The client portal now authenticates clients via magic link and authorizes
-- them through the client_contacts allowlist + role-tier RLS (04). The old
-- token-based review path (creative_sets.review_token + the anon-callable
-- get_review_set / add_review_comment / add_review_reply / set_ad_approval
-- RPCs) is fully superseded and is removed here so it stops being live
-- attack surface.
-- ============================================================================

-- 1. Drop the retired token RPCs and their internal guard. DROP ... IF EXISTS
--    with the exact signatures, so a re-run (or a DB that never had them) is a
--    no-op. Grants/revokes disappear automatically with the functions.
drop function if exists public.get_review_set(uuid);
drop function if exists public.add_review_comment(uuid, uuid, text, text, text);
drop function if exists public.add_review_reply(uuid, uuid, text, text);
drop function if exists public.set_ad_approval(uuid, uuid, text);
drop function if exists public._ad_in_token_set(uuid, uuid);

-- 2. Drop the unguessable token column + its index — no longer read anywhere.
drop index if exists public.creative_sets_token_idx;
alter table public.creative_sets drop column if exists review_token;
