-- ============================================================
--  Shirt over a top
--
--  An outfit can now wear a shirt or blouse over another top. Kept
--  outfits remember it here. Nothing existing changes: rows without
--  one are outfits without one. Safe to run more than once.
-- ============================================================

alter table public.saved_outfits
  add column if not exists overtop_id text references public.items(id) on delete set null;
