-- ============================================================
--  Fave levels
--
--  A favourite used to be a live row in saved_outfits (un-hearting
--  soft-deletes it with archived_at). It is now a level:
--    0 = not faved, 1 = Like, 2 = Love, 3 = All-time fave
--
--  Existing faves become level 1; archived rows become 0.
--  Nothing is deleted. Safe to run more than once.
-- ============================================================

alter table public.saved_outfits
  add column if not exists fave_level smallint not null default 1
    check (fave_level between 0 and 3);

alter table public.saved_outfits
  add column if not exists fave_updated_at timestamptz;

update public.saved_outfits
   set fave_updated_at = created_at
 where fave_updated_at is null;

update public.saved_outfits
   set fave_level = 0
 where archived_at is not null;
