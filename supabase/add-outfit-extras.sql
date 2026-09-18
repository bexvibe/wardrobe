-- ============================================================
--  The Archive — accessories on a saved outfit
--
--  Paste this into the Supabase SQL editor and press Run.
--  It is two statements and takes a second.
--
--  Outfits generate from clothes alone. Shoes, hats, jewellery
--  and the rest get put on an outfit you have already kept, by
--  hand. That used to be one shoe_id; this makes it a list, so
--  an outfit can carry as many as it needs.
--
--  Safe to run more than once. The second statement carries any
--  shoes already attached across into the new list, and skips a
--  row that has already been carried across.
--
--  Until you run it the app hides the accessories button, so
--  nothing breaks either way. shoe_id is left in place and
--  unused rather than dropped — nothing here is thrown away.
-- ============================================================

alter table public.saved_outfits
  add column if not exists extra_ids text[] not null default '{}';

update public.saved_outfits
   set extra_ids = array[shoe_id]
 where shoe_id is not null
   and extra_ids = '{}';
