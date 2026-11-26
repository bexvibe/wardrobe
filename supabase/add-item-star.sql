-- ============================================================
--  Starred pieces
--
--  A piece can be starred as one of your favourites. The Outfits
--  page can then be narrowed to outfits made only of starred pieces.
--  Safe to run more than once.
-- ============================================================

alter table public.items
  add column if not exists starred boolean not null default false;
