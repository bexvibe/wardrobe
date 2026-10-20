-- ============================================================
--  The Archive — add a short description to capsules
--
--  Safe to run more than once.
-- ============================================================
alter table public.capsules add column if not exists description text;
