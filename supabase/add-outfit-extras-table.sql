-- ============================================================
--  The Archive — accessories belong to a combination
--
--  Paste this into the Supabase SQL editor and press Run.
--  It is three statements and takes a second.
--
--  Accessories used to be a column on saved_outfits, which meant
--  an outfit could only be dressed if it had been kept first.
--  Putting a hat on something you had not yet decided about was
--  not possible, and the same outfit therefore looked different
--  depending on which page you met it on.
--
--  There are three things you can do to a combination: keep it,
--  hide it, and dress it. The first two were already marks
--  against a combo_key in their own table. This makes the third
--  one match, so the card looks the same wherever it appears.
--
--  Safe to run more than once. The second statement carries the
--  accessories already attached to kept outfits across into the
--  new table, and leaves a combination that has already been
--  carried across alone.
--
--  saved_outfits.extra_ids is left in place and unused rather
--  than dropped — nothing here is thrown away, and an older copy
--  of the app keeps working from it.
-- ============================================================

create table if not exists public.outfit_extras (
  combo_key  text primary key,
  extra_ids  text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Both of the places accessories have lived: the list, and before that a
-- single shoe_id. An outfit kept before either migration ran has only the
-- shoe, so it is carried across here rather than being left behind.
insert into public.outfit_extras (combo_key, extra_ids)
select combo_key,
       case when array_length(extra_ids, 1) > 0 then extra_ids
            else array[shoe_id] end
  from public.saved_outfits
 where array_length(extra_ids, 1) > 0
    or shoe_id is not null
    on conflict (combo_key) do nothing;

alter table public.outfit_extras enable row level security;

drop policy if exists outfit_extras_authenticated_all on public.outfit_extras;
create policy outfit_extras_authenticated_all on public.outfit_extras
  for all to authenticated using (true) with check (true);
